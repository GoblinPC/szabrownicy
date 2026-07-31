// Cienie rzucane przez obiekty.
//
// Zamiast wmalowywać cień w sprite'a, bierzemy jego sylwetkę, kładziemy ją na
// ziemi i odchylamy w kierunku *od* najbliższego ognia. Dzięki temu ta sama
// beczka rzuca cień w inną stronę przy palenisku, a w inną przy ognisku na placu,
// a wysoki obiekt kładzie dłuższy cień niż niski — bez rysowania czegokolwiek.

const CONTACT_KEY = 'shadow_contact';

/** Miękka plama pod obiektem. Trzyma go przy ziemi nawet tam, gdzie nie sięga ogień. */
export function ensureContactTexture(scene) {
  if (scene.textures.exists(CONTACT_KEY)) return CONTACT_KEY;
  const size = 32;
  const texture = scene.textures.createCanvas(CONTACT_KEY, size, size / 2);
  const ctx = texture.getContext();
  const gradient = ctx.createRadialGradient(size / 2, size / 4, 0, size / 2, size / 4, size / 2);
  gradient.addColorStop(0, 'rgba(0,0,0,0.55)');
  gradient.addColorStop(0.6, 'rgba(0,0,0,0.22)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size / 2);
  texture.refresh();
  texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return CONTACT_KEY;
}

/**
 * Wypadkowy kierunek światła w danym punkcie. Sumujemy wkłady wszystkich lamp
 * ważone siłą i odległością, więc obiekt między dwoma ogniskami rzuca cień
 * w kierunku pośrednim, a nie skacze między nimi.
 */
export function lightAt(lights, x, y, minDistance = 18, outdoorScale = 1) {
  let dx = 0;
  let dy = 0;
  let weight = 0;
  for (const light of lights) {
    const vx = x - light.x;
    const vy = y - light.y;
    const distance = Math.hypot(vx, vy) || 0.001;
    // Lampa tuż obok obiektu siedzi praktycznie w nim — nie ma z czego rzucać
    // cienia, a próba dawała gigantyczną czarną plamę pod ogniskiem.
    if (distance < minDistance || distance > light.radius) continue;
    // Ogień **na dworze przestaje rzucać cień w dzień**. W południe ognisko nie
    // rzuca żadnego widocznego cienia, bo słońce jest o rzędy wielkości jaśniejsze;
    // bez tego beczka przy ognisku miała w samo południe cień odchylony od ognia,
    // a beczka dziesięć kroków dalej od słońca — i od razu było widać, że jeden
    // z nich kłamie.
    //
    // Ognie **pod dachem** zostają na pełnej mocy przez całą dobę, dokładnie tak
    // jak w masce światła: hala jest ciemna niezależnie od pory i to palenisko
    // jest w niej głównym źródłem.
    const skala = light.indoor ? 1 : outdoorScale;
    if (skala <= 0.001) continue;
    const contribution = light.intensity * (1 - distance / light.radius) * skala;
    dx += (vx / distance) * contribution;
    dy += (vy / distance) * contribution;
    weight += contribution;
  }
  return { dx, dy, weight };
}

export class ShadowCaster {
  /**
   * @param building prostokąt budynku. Obiekty stojące w środku **nie dostają
   *   cienia od słońca** — nad nimi jest dach. Bez tego ławki i skrzynie
   *   w karczmie rzucały cień słoneczny przez całą salę, mimo że słońca tam nie
   *   ma, a jedynym światłem są palenisko i pochodnie.
   */
  constructor(scene, lights, building = null) {
    this.scene = scene;
    this.lights = lights;
    this.building = building;
    this.statics = [];
    this.sunDx = 0;
    this.sunDy = 1;
    this.sunPower = 0;
    // Do pierwszego `setNight()` ogień działa pełną mocą — czyli tak jak przed
    // dołożeniem doby. Zero dawałoby jedną klatkę bez cieni przy wejściu do gry.
    this.outdoorFire = 1;
    ensureContactTexture(scene);
  }

  /**
   * Tworzy parę: plamę kontaktową i rzucony cień. Cień to ta sama klatka co
   * obiekt, zaczepiona u stóp, przyciemniona i obrócona przez `refresh`.
   */
  add(x, y, textureKey, frameName, { squash = 0.5, width = 20, ruchomy = false } = {}) {
    const contact = this.scene.add.image(x, y, CONTACT_KEY)
      .setOrigin(0.5, 0.5)
      .setDepth(-60)
      .setDisplaySize(width, width * 0.42)
      .setAlpha(0.6);

    const cast = this.scene.add.image(x, y, textureKey, frameName)
      .setOrigin(0.5, 1)
      .setDepth(-59)
      .setTint(0x000000);

    // Miękka otoczka cienia — ta sama sylwetka, większa i bledsza. Rysowana POD
    // ostrym cieniem, więc razem dają wrażenie przejścia.
    const soft = this.scene.add.image(x, y, textureKey, frameName)
      .setOrigin(0.5, 1)
      .setDepth(-60.5)
      .setTint(0x000000)
      .setAlpha(0);

    // Szerokość zapamiętana, bo steruje nie tylko plamą kontaktową: **duże,
    // jednolite sylwetki dostają słabsze krycie**. Brama i mur to prostokąty,
    // więc ich cień jest prostokątem — im większa jednolita plama, tym bardziej
    // czyta się jako wycięta z papieru. Przy koronie drzewa tego nie widać, bo
    // sama jest nieregularna.
    const shadow = { contact, cast, soft, squash, x, y, width };
    // Cienie obiektów **stojących** trzymamy na liście, bo słońce wędruje i trzeba
    // je odświeżać. Przy dwóch tysiącach roślin robimy to rzadko i tylko w kadrze —
    // co ćwierć sekundy nikt nie zauważy skoku, a co klatkę byłoby to najdroższą
    // rzeczą w grze.
    //
    // **Ruchome tu nie wchodzą.** Gracz, potwory i inni gracze dostają `refresh()`
    // co klatkę z prawdziwą pozycją, więc na liście stojących byli tylko po to,
    // żeby raz na ćwierć sekundy ktoś ustawił ich z powrotem tam, gdzie powstali.
    // Zgłoszone z gry: *czemu te cienie tak mrygają dziwnie*. Właśnie dlatego.
    if (!ruchomy) this.statics.push(shadow);
    this.refresh(shadow, x, y);
    return shadow;
  }

  /**
   * Usuwa cień razem z obiektem, który go rzucał.
   *
   * Cień nie jest sprite'em, tylko **trójką** obrazków (plama kontaktowa, ostra
   * sylwetka i warstwa miękka) plus wpisem na liście odświeżanej przy wędrówce
   * słońca. `destroy()` wołane wprost na tym obiekcie nic by nie zrobiło, a wpis
   * zostałby na liście i `refreshStatics()` sięgałby po zniszczone obrazki.
   *
   * **Ta metoda była w pliku dwa razy.** Druga, uboższa wersja stała niżej
   * i w JavaScripcie to ona wygrywała: kasowała plamę i ostry cień, ale zostawiała
   * warstwę miękką i wpis na liście. Ścięte drzewo zostawiało więc po sobie bladą
   * sylwetkę na ziemi, a `refreshStatics()` co ćwierć sekundy sięgał po zniszczone
   * obrazki. Znalezione przy zmiękczaniu cieni, nie zgłoszone z gry.
   */
  remove(shadow) {
    if (!shadow) return;
    shadow.contact.destroy();
    shadow.cast.destroy();
    shadow.soft?.destroy();
    const i = this.statics.indexOf(shadow);
    if (i >= 0) this.statics.splice(i, 1);
  }

  /** Odświeża cienie stojących obiektów w kadrze. Wołane rzadko, nie co klatkę. */
  refreshStatics(view, margin = 64) {
    for (const shadow of this.statics) {
      if (shadow.x < view.x - margin || shadow.x > view.right + margin
        || shadow.y < view.y - margin || shadow.y > view.bottom + margin) continue;
      this.refresh(shadow, shadow.x, shadow.y);
    }
  }

  /**
   * Kierunek i siła słońca. Ustawiane raz na klatkę przez scenę, z pory dnia.
   *
   * Bez tego **cały świat poza zasięgiem ognisk nie ma cieni** — a to jest cały
   * las. Ogniska stoją wyłącznie w mieście, więc pierwszy las po powiększeniu
   * mapy stał w płaskim, bezcieniowym świetle i wyglądał jak wycinanka.
   * Użytkownik zgłosił to od razu i miał rację.
   */
  setSun(angle, power) {
    this.sunDx = Math.cos(angle);
    this.sunDy = Math.sin(angle);
    this.sunPower = power;
  }

  /**
   * Ile mocy zostaje ogniom na dworze. Ta sama liczba, która steruje maską
   * światła — jedno źródło prawdy, więc cień nie może się rozjechać z blaskiem.
   *
   * @param night `darkness(phase)`: 0 w południe, 1 w nocy
   */
  setNight(night) {
    // Kwadrat, bo cień ma znikać **szybciej** niż sam blask ognia. Płomień widać
    // po ciepłym odcieniu na murze jeszcze długo po wschodzie; jego cienia nie
    // widać już zaraz po nim.
    this.outdoorFire = night * night;
  }

  refresh(shadow, x, y) {
    const { cast, contact } = shadow;
    // Pozycja zapisywana **w cieniu**, nie tylko w obrazkach. Bez tego `shadow.x`
    // zostawało tym z chwili utworzenia, a to po nim `refreshStatics()` poznaje,
    // czy cień jest w kadrze — i to nim ustawiało go z powrotem.
    shadow.x = x;
    shadow.y = y;
    contact.setPosition(x, y);
    // Plama kontaktowa jest **zawsze**: to ona przykleja obiekt do ziemi i to
    // ona jest tym „ambient occlusion", którego brakowało. Rzucony cień może
    // zniknąć w nocy, plama nie.
    //
    // To ona odpowiada za „widzę, że coś tu stoi" pod drzewem i pod skrzynią,
    // więc mocniejsza niż rzucony cień. Wcześniejsze 0,5 gubiło się na ciemnej
    // ziemi, na której leży większość obiektów w lesie.
    contact.setAlpha(0.66 + 0.18 * (this.sunPower ?? 0));

    // Pod dachem ogień świeci pełną mocą niezależnie od pory — tak samo jak
    // w masce światła.
    const podDachem = this.building
      && x >= this.building.x && x <= this.building.x + this.building.w
      && y >= this.building.y && y <= this.building.y + this.building.h;

    let { dx, dy, weight } = lightAt(this.lights, x, y, 18, podDachem ? 1 : (this.outdoorFire ?? 1));
    // Poza zasięgiem ognia rządzi słońce. Dokładamy je zawsze **poza budynkiem**:
    // obiekt przy ognisku ma cień od ognia, a dziesięć kroków dalej płynnie od
    // słońca. Pod dachem słońca nie ma i cień idzie wyłącznie od ognia.
    if (this.sunPower > 0 && !podDachem) {
      dx += this.sunDx * this.sunPower;
      dy += this.sunDy * this.sunPower;
      weight += this.sunPower;
    }

    const length = Math.hypot(dx, dy);
    if (weight < 0.06 || length < 0.001) {
      cast.setVisible(false);
      shadow.soft?.setVisible(false);
      return;
    }
    cast.setVisible(true);
    cast.setPosition(x, y);
    // Sprite rośnie w górę od punktu zaczepienia; obrót kładzie tę oś na kierunku
    // ucieczki od światła, a skala Y spłaszcza go do płaszczyzny ziemi.
    cast.rotation = Math.atan2(dx / length, -(dy / length));
    cast.scaleY = shadow.squash;
    // Krycie zależne od tego, jak duża jest sylwetka.
    //
    // Zgłoszone z gry: *ciemny prostokąt kanciasty jak Minecraft* przy bramie.
    // Cień rzucany to sylwetka obiektu położona na ziemi, więc obiekt o sylwetce
    // prostokątnej daje prostokąt — i nic tego nie zmieni poza samą sylwetką.
    // Da się natomiast zmienić to, **jak bardzo się on narzuca**: duża jednolita
    // plama przy tym samym kryciu co mała czyta się dwa razy mocniej.
    //
    // Liczby po zgłoszeniu z gry: *cienie są trochę za słabe, nie widzę ich pod
    // drzewami i skrzyniami*. Pierwsza wersja zmiękczania ścinała je z trzech
    // stron naraz — sufit krycia 0,3, kara za dużą sylwetkę aż o trzecią i do
    // tego wygaszanie ku końcowi. Drzewo, czyli największa sylwetka w grze,
    // wychodziło z tego z kryciem 0,2 rozmytym do zera. **Zmiękczenie ma dotyczyć
    // krawędzi, nie tego, czy cień w ogóle widać**: przy podstawie ma być mocny.
    const duże = Math.max(0, Math.min(1, ((shadow.width ?? 20) - 14) / 20));
    const krycie = Math.min(0.46, 0.1 + weight * 0.4) * (1 - 0.16 * duże);

    // Półcień rosnący z odległością od podstawy — **bez dokładania warstw**.
    //
    // Prawdziwy cień jest ostry przy stopach i rozmywa się im dalej od nich.
    // Bez shaderów nie da się rozmyć obrazka, ale da się nim sterować krycie
    // w każdym rogu osobno (`setAlpha(gl, gp, dl, dp)`). Sprite jest zaczepiony
    // u stóp i obrócony tak, że jego **góra to koniec cienia**, więc wystarczy
    // przygasić dwa górne rogi: przy podstawie zostaje pełne krycie, na końcu
    // prawie nic. Kosztuje to zero dodatkowych rysunków.
    // Najpierw krycie jednolite, potem rogi. Krycie w rogach liczy **wyłącznie
    // WebGL**; awaryjny renderer Canvas bierze wartość jednolitą, a ta bez tego
    // wywołania zostałaby na jedynce z chwili utworzenia obrazka — czyli cienie
    // wyszłyby czarne na płasko.
    cast.setAlpha(krycie);
    cast.setAlpha(krycie * 0.28, krycie * 0.28, krycie, krycie);

    if (shadow.soft) {
      // Warstwa miękka idzie **odwrotnie**: przy stopach jej nie ma, a rozlewa się
      // dopiero na końcu. Razem z gasnącym ostrym cieniem daje to przejście od
      // twardej sylwetki pod obiektem do szerokiej, bladej plamy w oddali — czyli
      // dokładnie to, co robi półcień. Jedna warstwa o stałym kryciu (tak było
      // wcześniej) tylko pogrubiała prostokąt.
      shadow.soft.setVisible(true);
      shadow.soft.setPosition(x, y);
      shadow.soft.rotation = cast.rotation;
      shadow.soft.scaleX = 1.5;
      shadow.soft.scaleY = shadow.squash * 1.45;
      shadow.soft.setAlpha(krycie * 0.5, krycie * 0.5, krycie * 0.1, krycie * 0.1);
    }
  }

  setFrame(shadow, frameName, flipX) {
    shadow.cast.setFrame(frameName);
    shadow.cast.setFlipX(flipX);
    shadow.soft?.setFrame(frameName);
    shadow.soft?.setFlipX(flipX);
  }

}
