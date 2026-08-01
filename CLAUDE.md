# Szabrownicy — Kuźnia

Przeglądarkowa gra 2D w rzucie 3/4 z góry, podpięta docelowo pod sklep GoblinPC.
**Cała grafika i cały dźwięk powstają programistycznie** — w repozytorium nie ma
ani jednego rysunku czy pliku audio zrobionego ręcznie albo pobranego.

Obecny zakres to **lobby**: wspólny świat, po którym gracze biegają, widzą się
nawzajem i rozmawiają dymkami nad głowami. Świat ma się rozrastać **po kolei**,
bez budowania wszystkiego naraz.

**Jedna wielka otwarta mapa, jak w Tibii — bez portali i bez teleportów.**
Decyzja z 2026-07-30, zastępuje wcześniejszy pomysł osobnych stref za portalami.
Kuźnia, las, skalisko i wszystko dalej mają leżeć na tej samej mapie i dawać się
przejść na piechotę. Jeśli jedna ciągła mapa okaże się problemem technicznym,
dopuszczalne jest **szybkie przeładowanie na przejściach** — ale nie teleport
i nie osobne światy. Stojące na placu słupki portali są więc **zaszłością**
i zejdą z mapy.

To osobny, nowy projekt. Nie jest kontynuacją `C:\Users\Goblin\Documents\Nibylandia`.
Pierwotnie miała to być gra typu extraction; ten prototyp leży w `legacy/`
i posłuży jako pierwsza minigierka za portalem.

## Jak pracujemy

- Rozmawiamy **po polsku**. Użytkownik (Goblin) nie rysuje grafik ani nie babra
  się w edytorach — kod, grafikę, dźwięk i decyzje techniczne robi Claude.
- **Małymi krokami.** Claude dodaje jeden element, użytkownik testuje na żywo
  w przeglądarce, poprawiamy, dopiero potem następny. Nie budować kilku rzeczy
  naraz „na zapas".
- Użytkownik lubi być pytany o kierunek (`AskUserQuestion`) przed dużą decyzją,
  ale ufa osądowi Claude'a co do wykonalności i tempa.
- **Nie zgadywać po cichu.** Jeśli coś powstało bez obejrzenia efektu (np.
  współrzędne obiektów liczone z siatki kafli), trzeba to powiedzieć wprost.
  Sporo dotychczasowych błędów wzięło się dokładnie stąd.
- Przy grafice: wygenerować podgląd do `docs/preview/` i **obejrzeć go
  narzędziem Read**, zanim się powie, że coś jest gotowe.
- **Nie budować własnych sprawdzianów na zapas.** Ustalone 2026-07-31, uwaga
  użytkownika wprost: *te twoje testy zabierają dużo tokenów*. Doraźny skrypt
  i oglądanie obrazka kosztują realnie, więc mają być **wyjątkiem, nie odruchem**:
  - jeśli sprawdzenie sprowadza się do „czy w grze to wygląda dobrze" —
    **powiedzieć użytkownikowi, co ma kliknąć**, i czekać. On i tak siedzi
    w przeglądarce, a jego ocena jest lepsza od podglądu;
  - jeśli coś naprawdę wymaga policzenia, dopisać test do `npm run sprawdz`
    (zostaje na zawsze, kosztuje raz) zamiast pisać skrypt jednorazowy;
  - podgląd generować wtedy, gdy powstaje **nowy rysunek**, którego użytkownik
    nie zobaczy inaczej niż wchodząc w konkretne miejsce mapy.
- **Grafiki nie oszczędzać.** Generowanie jest tu tanie: dziesięć zwierząt
  z animacjami albo pakiet ozdób powstaje w kilka minut, więc gdy coś da się
  poprawić albo dołożyć hurtem — robić to, nie pytając. Szczegóły robią cały
  klimat i to jest najmocniejsza strona tego projektu.
  **Ale:** tanie jest *rysowanie*, nie *ocenianie*. Prawie każda partia wymaga
  podglądu i poprawek — obrys ucha, ucięte drzewce i kałuże wzięły po dwa–trzy
  podejścia. Planować więc czas na oglądanie, a nie na samo generowanie.

## Uruchamianie

```bash
npm --prefix server install   # tylko raz
node server/src/index.js      # http://localhost:8080
npm run art                   # regeneracja całej grafiki
```

Serwer deweloperski obserwuje `client/` i **sam przeładowuje przeglądarkę** po
każdym zapisie pliku — także po `npm run art`, bo grafika ląduje w `client/assets/gen/`.

## Układ repozytorium

```
tools/art/          generatory grafiki (Node, zero zależności)
client/
  index.html        kanwa + panel suwaków głośności
  assets/gen/       WYGENEROWANE png/xml/json — commitowane, nie edytować ręcznie
  src/
    main.js         start Phasera
    scenes/         Boot, Forge, Hud
    world/forge.js  definicja mapy, świateł, dźwięków otoczenia
    render/         lighting.js, shadows.js, bubble.js (kształt dymka czatu)
    audio/          waveforms, tracker, songs, ambience, sfx, audio
    ui/             mixer.js, login.js, chat.js — zwykły HTML nad kanwą
server/src/index.js serwer statyczny + przeładowywanie na żywo
legacy/             stary prototyp ekstrakcji — baza pod pierwszą minigierkę
docs/DESIGN.md      projekt całości
docs/preview/       arkusze kontrolne generowane przez `npm run art`
```

## Grafika — zasady

Kafel 16×16, postać 16×27, perspektywa 3/4, mapa 48×36 kafli, kamera w zoomie
całkowitym 2–4×. Phaser 3.80 z CDN, `pixelArt: true`, bez kroku budowania.

- **Paleta jest zamknięta** (`tools/art/palette.js`). Każdy piksel pochodzi
  z nazwanej rampy: soot, stone, wood, earth, iron, ember, goblin, foliage, night.
- **Obrys to najciemniejszy odcień materiału, nigdy czysta czerń.** To jedna
  reguła, dzięki której elementy z różnych plików wyglądają jak jeden świat.
- **Brud i osad rysować półprzezroczyście**, nie kryjącymi pikselami. Kryjąca
  sadza czyta się z daleka jako rozsypany żwir — ten błąd popełniono dwa razy.
- Losowość zawsze przez `makeRng(seedFrom(nazwa))`, żeby regeneracja nie
  zmieniała świata bez powodu.
- Cieni **nie wmalowywać w sprite'y** — rzuca je silnik.

### Podłoże jest warstwowe, nie „albo/albo"

Ustalone 2026-07-31, po tym jak użytkownik nazwał problem wprost: *za mało
zaokrągleń, wszystko kanciaste, warstwy kończą się jedna przy drugiej*.

Pod całym światem leży **ziemia**. Trawa, droga i skała to `surfaceOverlay()`
z `tools/art/tiles.js` — osobna warstwa rysowana na wierzchu, o własnym obłym
kształcie, która **nachodzi** na ziemię zamiast do niej przylegać.

Poprzedni układ wybierał jeden kafel na pole (`n > 0.68 ? ziemia : trawa`)
i dokładał pasek zębów na styku. To nie mogło zadziałać: twardy próg na ciągłym
szumie daje binarną granicę, a siatka tnie ją na schodki co 16 px. **Nic
dorysowanego po tej decyzji tego nie odwraca**, bo podłoże już zadeklarowało się
jako kwadrat.

- **Siatka nakładek jest przesunięta o pół kafla.** Komórka dotyka czterech pól
  świata, po jednym na róg, a kształt bierze się z tego, ile z nich jest danym
  materiałem: **piętnaście układów** zamiast czterdziestu siedmiu autokafli.
  Obłe narożniki wychodzą z konstrukcji, nie z rysowania ich po jednym.
- **Wartość liczona dwuliniowo z czterech rogów.** Dwie sąsiednie komórki dzielą
  dwa rogi, więc wzdłuż wspólnej krawędzi liczą to samo — kształty schodzą się
  bez szwu, choć każdy powstał osobno. To jest cały powód przesunięcia siatki.
- **Szum krawędzi musi mieć okres będący wielokrotnością kafla**, bo inaczej
  ząbek urywa się na granicy komórki i wraca prosty szew. Dziś **cztery kafle**,
  czyli szesnaście faz wybieranych z pozycji komórki. Przy dwóch kaflach długa
  prosta granica — skalna ściana miasta — dostawała rząd jednakowych garbów.
  `PHASES` w `tiles.js` i `phase` w `buildOverlay()` muszą się zgadzać.
- **Kolejność warstw:** ziemia → trawa → droga → skała. Droga przecina trawę,
  bo ludzie ją wydeptali; skała przecina jedno i drugie, bo była pierwsza.
- `tiles` zostaje **niezmienione** i dalej jest jedyną prawdą o tym, po czym
  gracz chodzi. Krok na polu `grass_1` brzmi jak trawa niezależnie od tego, ile
  trawy narysowała nakładka w tym rogu.

**Kafel musi mieć własny kształt, nie sam szum.** Ziemia, trawa i skała powstają
przez `blotches()` — plamy o promieniu kilku pikseli — a dopiero potem przez
`speckle()`. Szum pojedynczymi pikselami jest fakturą, nie formą: przy zoomie
2-4x uśrednia się w płaską plamę koloru, a dwa pola jednorodnego szumu o różnej
średniej barwie stykają się **idealnie prostą linią**, którą oko czyta od razu.

**Ziemi ma być dużo wariantów** (dziś dwanaście, `DIRT_VARIANTS`). Leży pod całym
światem, więc jej powtarzalność widać najbardziej ze wszystkiego — przy czterech
kaflach plamy układały się w czytelny ukośny rytm na całym placu. Trawa, droga
i skała tego problemu nie mają: każda z ich 240 komórek ma osobno losowaną
powierzchnię. Wariant bazy wybiera **hasz pozycji**, nie `(x + y) % n` — ten
ostatni układa kafle w ukośne pasy.

**Mur bez czoła to nie mur, tylko kamienna podłoga.** Reguła z kuźni (`wall_top`
+ `wall_face`) obowiązuje też skalną granicę miasta. Skała była samą koroną
oglądaną z góry i pas szeroki na trzy kafle czytał się jako jasny kamienny plac —
użytkownik nazwał to wprost: *to nie jest obiekt imitujący 3d*. Dziś każda bryła
skały, pod którą nie ma skały, dostaje `rock_face_lo`, a rząd nad nią
`rock_face_hi`, plus `rock_scree` z cieniem na ziemi.

- Czoło ma **dwa kafle wysokości**. Przy jednym korona zostawała dwukafelkowym
  płaskim pasem i dalej dominowała nad ścianką.
- Czoło rysują **nieregularne bryły i krótkie rysy**, nie pionowe pasy o stałej
  wysokości rozdzielone ciągłymi kreskami. Ta pierwsza wersja czytała się jako
  **ostrokół**: równy rytm pionowych linii to znak rozpoznawczy palisady.
- Warga korony jest **rozsypana, nie ciągła** — pełna jasna kreska na całą długość
  muru czyta się jako listwa przybita do ściany.
- Boki skały kantuje `stone 1`, nie `stone 0`. Ciemniejsza wersja robiła przy
  bramie dwa czarne pasy w miejscu ościeży i przejście wyglądało jak dziura
  wycięta w tle.

**Znana niedoróbka:** cień kontaktowy trawy i skały jest ucinany, gdy krawędź
wypadnie w ostatnich pikselach komórki. Widać to sporadycznie jako brakujący
cień pod pojedynczym fragmentem obrysu.

### Pułapki, które już kosztowały czas

- Sprite postaci ma 27 pikseli wysokości, bo grzebień hełmu sięga 4 piksele nad
  czaszkę, a podskok w biegu podnosi ją o kolejny. Przy 24 ucinało czapkę.
- Nogi postaci **nie reagują na `bodyY`** — tułów się kołysze, stopy stoją.
- Widok z boku ma **własną sylwetkę czaszki** (`PROFILE_SPANS`), z wysuniętym
  nosem i uchem przy tyle głowy. Symetryczna czaszka z jednym dorysowanym okiem
  czyta się jako twarz z przodu, której brakuje drugiego oka.
- Płomień musi mieć `depth` większy niż obiekt, na którym płonie — inaczej
  palenisko zasłania własny ogień.
- Otwór w kaflach muru musi się pokrywać **co do piksela** z prześwitem
  w rysunku bramy (dziś: 2 kafle = 32 px).
- Pnie drzew trzymać wewnątrz skalnej granicy (`y < 544`, `x` w 60–706).
- Pochodnia ma krótki trzonek i wspornik wbity w mur. Długi kij czytał się jak
  włócznia postawiona przy ścianie.
- **Po przesunięciu miasta o `CITY_OX`/`CITY_OY` trzeba przejrzeć wszystkie pętle
  i kadry, nie tylko rysowanie mapy.** `buildDecals()` została na `x < CITY_W`,
  `y < CITY_H` i przez to dekorowała lewy górny róg **wielkiej mapy** — w 97%
  litą skałę. W całym świecie powstawało sześć dekali i dwie kępki trawy zamiast
  stu czterdziestu i tysiąca pięciuset, kuźnia nie dostawała ani jednej plamy
  sadzy, a plac ani jednej kałuży. Na ekranie wygląda to jak „grafika jest słaba",
  nie jak „mechanizm nie działa" — wyszło dopiero z **policzenia** ich po
  wygenerowaniu świata. Ten sam błąd miały kadry `preview_doba.js`
  i `preview_world.js`: osiem kratek jednakowej skały w ośmiu porach dnia.
  **Podgląd, który nie pokazuje sceny, jest gorszy niż żaden, bo wygląda na
  działający.**

## Oświetlenie i cienie

`client/src/render/lighting.js` — maska światła rysowana co klatkę na małym
płótnie 2D (1 piksel maski = 2 piksele świata) i rozciągana na widok kamery
w trybie mnożenia. Kolor otoczenia zależy od miejsca: wnętrze hali ciepły mrok
`[122, 96, 84]`, plac barwa nieba o danej porze doby. Migotanie to suma dwóch
niewspółmiernych sinusoid, więc ogień nie łapie słyszalnego rytmu.

`client/src/render/shadows.js` — cień to sylwetka obiektu położona na ziemi
i odchylona **w kierunku od najbliższego ognia**, plus miękka plama kontaktowa.
Dwie reguły wyniesione z błędów:

- obiekty, które **same świecą** (ognisko, palenisko, pochodnie, portale), mają
  `noShadow: true` — inaczej rzucają pod siebie wielką czarną plamę;
- `lightAt` pomija lampy bliższe niż 18 px, bo takie siedzą wewnątrz obiektu.

**Zmiękczanie cieni (2026-07-31).** Krycie ustawiane **osobno w każdym rogu**
sprite'a (`setAlpha(gl, gp, dl, dp)`, wyłącznie WebGL — dlatego przed nim idzie
zwykłe `setAlpha`): ostry cień gaśnie ku końcowi, a warstwa miękka odwrotnie,
przy stopach jej nie ma. Razem dają półcień bez ani jednego dodatkowego rysunku.
Duże jednolite sylwetki dostają słabsze krycie. **Zmiękczenie dotyczy krawędzi,
nie tego, czy cień widać** — pierwsza wersja ścinała je z trzech stron naraz
i drzewo wychodziło z kryciem 0,2 rozmytym do zera.

**Dwa błędy znalezione przy okazji, oba starsze:**

- `add()` wrzucał na listę cieni **stojących** także gracza, potwory i innych
  graczy, a `refresh()` nie zapisywał pozycji w cieniu — więc przelot po stojących
  co 250 ms ustawiał je na jedną klatkę tam, gdzie powstały. Cztery mrugnięcia
  na sekundę na każdej ruchomej postaci. Ruchome oznaczać `ruchomy: true`.
- `remove()` był zdefiniowany **dwa razy** i wygrywała gorsza wersja: nie zdejmowała
  wpisu z listy ani nie kasowała warstwy miękkiej. Ścięte drzewo zostawiało po
  sobie bladą sylwetkę cienia.

**Siatka maski musi być przyciągnięta do świata, nie do kamery.** Jeden piksel
maski to dwa piksele świata, więc jej granica może wypaść tylko na parzystym
odstępie od początku maski. Gdy początek stoi na ułamkowej pozycji kamery,
krawędź muru ląduje raz przed licem, raz za nim — i wzdłuż ścian biegnie pasek
grubości piksela, raz jasny, raz ciemny, przeskakujący przy każdym ruchu.
Początek zaokrąglać do wielokrotności `RESOLUTION`.

**Rozmycie granicy widoczności idzie do wnętrza — także o jeden piksel maski.**
Maska jest rozciągana filtrem liniowym (miękkie plamy ognia są tego warte), więc
na każdej granicy powstaje przejście szerokie na dwa piksele świata. Cięcie
dokładnie po licu muru wypuszcza połowę tego przejścia **na zewnątrz** i za murem
świeci pasek szerokości piksela.

**Znana wada:** granica między ciepłym wnętrzem a chłodnym placem to na razie
ostry prostokąt. Przy bramie widać szew — do rozmycia.

## Doba

`client/src/world/daylight.js` — wspólny dla klienta i serwera, tak samo jak
fizyka ruchu. **Zegar prowadzi serwer** i wysyła w migawce pole `d` (ułamek doby);
klient posuwa go między migawkami sam, bo dwadzieścia skoków na sekundę widać jako
drganie światła. Wysyłamy **czas, nie policzony kolor** — jedna liczba zamiast
trzech, a przeliczyć i tak musi klient.

- Doba trwa **16 minut**. Przy dobie godzinnej nikt nie zobaczy nocy w trakcie
  sesji, przy pięciu minutach światło miga jak stroboskop.
- `FOLLOW_REAL_CLOCK = false` — świadomie. Świat jest wspólny, więc gracze z różnych
  stref widzieliby o tej samej chwili inną porę dnia; grywa się wieczorami, więc
  prawie każda sesja wypadałaby w nocy; i przede wszystkim znika rytm, o który
  chodziło. Przełącznik zostaje, reszta kodu liczy z ułamka doby.
- `darkness(phase)` (0 w południe, 1 w nocy) to **jedna liczba, po której mają się
  sterować wszystkie nocne rzeczy** — świetliki, ćmy, głośniejsze cykanie. Liczona
  z jasności nieba, więc nie da się jej rozjechać z kolorem.
- Punktem odniesienia dla palety jest `[86, 100, 140]` — dawny stały kolor placu.
  Wypada między zmierzchem a nocą: gra przez cały czas wyglądała na „po zachodzie".
- W dzień przygasają **pochodnie na dworze** (`TORCH_DAY`) i **winieta**
  (`VIGNETTE_DAY`). Ognie pod dachem zostają na pełnej mocy — hala jest ciemna całą
  dobę, a przygaszone palenisko robiło z niej płaską szarość.
- **Suwaki pory dnia i pogody pod `F1`** (`client/src/ui/testpanel.js`) — do oglądania
  świateł bez czekania. Przestawiają **wyłącznie widok u siebie**, zegar i pogodę dalej
  prowadzi serwer; guzik „auto" oddaje sterowanie. Nie ma tu czego oszukiwać, bo nocne
  potwory i głód i tak będzie liczył serwer, dla którego te suwaki nie istnieją.

## Pogoda

`client/src/world/weather.js` — na razie sam deszcz. Wspólny dla obu stron jak
`daylight.js`, ale z innego powodu: siła opadu jest **funkcją czasu**, więc nie ma
żadnego stanu do trzymania ani do zapisania, a restart serwera nie przestawia pogody
w środku ulewy. Serwer i tak wysyła wynik w migawce (`r`) — o pogodzie rozstrzyga on.

- Blok pogody trwa **90 sekund**, między blokami przechodzimy gładko, więc deszcz
  narasta i cichnie zamiast włączać się jak przełącznik.
- `DRY = 0.82` wygląda na przesadę i nie jest nią: deszcz rozlewa się na bloki
  sąsiednie, więc jeden mokry moczy też pół suchego z każdej strony. Przy 0,62
  wychodziło **55% czasu z opadem** — deszcz był stanem normalnym. Zmierzone
  rozkładem po całej dobie, nie na oko; dziś 71% sucho, 16% mży, 10% pada, 4% ulewa.
  **Po zmianie tej stałej zmierzyć ponownie**, bo intuicja tu myli.
- `client/src/render/rain.js` — krople **nad maską światła** (w ulewie deszcz widać
  najlepiej, a pod maską zniknąłby razem z placem w nocy), pryśnięcia **pod maską**
  (żeby ogień je podświetlał). Bez pryśnięć krople przelatują przez obraz jak tapeta
  puszczona przed kamerą i widać, że nic nie dotyka świata.
- Kolor: `overcast()` w `lighting.js` robi **dwie rzeczy naraz** — przygasza i zabiera
  nasycenie. Samo przygaszenie wygląda jak wieczór, nie jak chmury.
- Dźwięk: dwie warstwy szumu jak przy wietrze i z tego samego powodu. Syk wysokich
  sam brzmi jak szum radia; ścianę wody robi dopiero warstwa niska, rosnąca z kwadratem
  siły opadu — mżawka to prawie sam syk.

## Świetliki i ćmy

`client/src/render/critters.js`. Obie rzeczy są **czystą dekoracją i istnieją tylko
u gracza** — serwer o nich nie wie i nie musi, bo nie da się w nie uderzyć. Gęstość
obu bierze się z `darkness(phase)`, żeby nie dało się doprowadzić do świetlików
w południe przez zapomniany drugi próg.

- **Świetlik to cztery piksele krzyża i jeden rdzenia, przy szczycie 0,5 alfy.**
  Pierwsza wersja miała `fillCircle` o promieniu 3,5 px — Phaser wygładza okręgi, więc
  przy `pixelArt: true` wychodziła gładka kulka obok świata z twardych pikseli
  i z daleka czytało się to jako **mrygające kółka**, nie owady. Odrzucone przez
  użytkownika i słusznie.
- Świetliki trzymają się drzew (65% podejść), a nie rozsypują równo po placu — rój
  czyta się jako coś żywego dopiero wtedy, gdy ma się czego trzymać.
- Reguła „tylko nad trawą" brzmiała ładnie i była bezużyteczna: trawy jest **68 kafli**
  i to w dwóch zaułkach za kuźnią. Miejsce do lądowania sprawdzamy siatką kolizji,
  a nie `surfaceAt` — ta nazywa ziemią wszystko, czego nie zna, także skałę.
- Świetliki idą **nad maską światła** (mają świecić własnym światłem), więc w hali
  trzeba je wyłączyć ręcznie, bo przeświecałyby przez ścianę. Ćmy idą **pod maskę**
  i znikają razem z placem za darmo.

Dwie rzeczy wyszły dopiero z podglądu i obie były niewidoczne w liczbach: **południe
było za ciemne**, bo winieta pełną mocą zjadała jasność dodaną przez niebo, a pierwsza
wersja nocy schodziła tak nisko, że plac przestawał być czytelny. Obie poprawki wzięły
się z arkusza, na którym obok pór doby stoi ten sam kadr **bez światła**.

Trzecia rzecz wyszła dopiero z gry: **wieczór był ściśnięty**. Zachód wypadał na 0,76
doby, czyli o 18:00 świat był już pomarańczowy. Punkty kluczowe rozłożono na nowo —
dzień trzyma pełne światło do ~17:45, złota godzina wypada koło 20:00, właściwy zachód
koło 21:00. Przy dobie 16-minutowej łatwo o taki błąd, bo różnica „18:00 czy 20:00" to
w czasie rzeczywistym dwadzieścia sekund.

## Mgła

`client/src/render/fog.js` — warstwa nad podłożem, najgęstsza tuż przed wschodem
i w trakcie (`fogByPhase`), rozchodząca się w ciągu poranka. Podnosi się **po
deszczu**, nie w jego trakcie: ślad opadu rośnie od razu, opada wolno. Dochodzi
wolna zmienność z zegara bezwzględnego (`fogMood`), żeby dwa świty z rzędu nie
były identyczne — liczona jak pogoda, więc bez stanu i identyczna u wszystkich.

Trzy pułapki, wszystkie zapłacone dzisiaj:

- **Gradient na płótnie powstaje w bieżącym układzie współrzędnych.** Zbudowanie
  go na `(cx, cy)` przed `translate(cx, cy)` kładzie go faktycznie na `(2cx, 2cy)`,
  czyli poza rysowaną plamą — cały kłąb dostaje ostatni przystanek gradientu,
  a ten ma krycie zero. **Tekstura wychodzi pusta**, a obiekty mają poprawne
  pozycje i krycie, więc wygląda to jak awaria rysowania, nie jak błąd rysunku.
  Trzy poprawki poszły w rzeczy, które nie były zepsute, zanim to wyszło.
- **`tileSprite` z teksturą z `createCanvas` potrafi nie narysować nic.**
  Powtarzane wypełnienie idzie w WebGL-u z tekstury zawijanej sprzętowo. Warstwy
  powtarzalne robić **siatką zwykłych obrazków** — tak jak cienie.
- Mgła idzie **pod maskę światła** (odwrotnie niż krople deszczu): ma ciemnieć
  w nocy i łapać ciepły kant przy ogniu. Pod dachem jej nie ma.

## Dźwięk

Wszystko syntezowane przez WebAudio, zero plików. Układ powstaje dopiero przy
pierwszym geście użytkownika (wymóg przeglądarek).

- `waveforms.js` — instrumenty jako **jeden cykl fali o długości 64 próbek**,
  zapętlony; wysokość dźwięku bierze się z prędkości odtwarzania. Aliasing jest
  zamierzony, to on daje amigowy charakter.
- `tracker.js` — odtwarzacz modułów. Wiersze planowane z wyprzedzeniem na zegarze
  karty dźwiękowej, nie na timerze JS. Obsługuje arpeggio, vibrato oraz atak
  i wybrzmienie ustawiane osobno dla każdego kanału.
- `songs.js` — utwór jako dane. **Zasady, których trzeba się trzymać:** motyw
  musi mieć co najmniej dwie różne długości nut i dwie różne wysokości; wraca
  nad kolejnymi akordami z wysokościami do nich dopasowanymi; bas gra ostinato,
  nie trzyma jednego dźwięku. Bez tego wychodzi „przytrzymywanie klawisza" —
  pierwsza wersja tak właśnie brzmiała i została odrzucona.
- `ambience.js` — ogień (ciągły pomruk + trzaski w losowych odstępach), wiatr
  (dwie warstwy + podmuchy) oraz rzadkie pojedyncze odgłosy zależne od strefy:
  stygnące żelazo, skrzypienie belek, kapanie, dalekie kucie, łańcuch studni.
- `sfx.js` — kroki. Różnicę między kamieniem, deskami, ziemią i trawą robi
  częstotliwość filtra i długość wybrzmienia, nie osobne próbki.

**Miks wystrojony ze słuchu przez użytkownika — nie zmieniać bez pytania:**
suwaki muzyka 34%, otoczenie 44%, kroki 67%, wszystko 75%. Pułapy szyn
`{ master: 1.0, music: 0.35, ambience: 1.0, sfx: 3.0 }`. Zmiana pułapów wymaga
podniesienia `SETTINGS_VERSION`, bo inaczej zapisane u graczy ustawienia zaczną
znaczyć co innego.

Dwie rzeczy wyniesione z błędów: filtr ścinający wysokie tony wisi **wyłącznie
na muzyce** (na sumie dusił trzaski i krople), a szum wymaga wyraźnie wyższego
wzmocnienia niż ton, bo jego energia rozkłada się na całe pasmo zamiast skupiać
w jednej częstotliwości.

Sterowanie: `M` cisza, `N` sama muzyka, suwaki w prawym górnym rogu.

## Interfejs — rzeczy wyniesione z błędów

- **Panel przyrządów jest pod `K`**, nie tylko pod `F1`. Na MacBooku rząd funkcyjny
  należy do systemu i `F1` do gry nie dochodzi — panel z suwakami pory dnia,
  pogody i mgły był przez to **nieosiągalny**, mimo że istniał. Backtick odpadł:
  na Macu z polskim układem nie ma go pod ręką.
- Panel przyjmuje też stan **z adresu strony**: `?mgla=1&pora=0.24`. To jedyny
  sposób ustawienia świata bez klikania, czyli jedyny nadający się do zrzutu
  ekranu z przeglądarki uruchomionej z wiersza poleceń.
- **Paski HUD:** wypełnienie rysować dwa piksele **pod** brzeg ramki. Rysunek
  ramki ma brzeg pięciopikselowy, a cięcie 9-slice stoi na 6 — wypełnienie
  liczone od cięcia zostawiało dookoła przezroczysty pierścień, przez który
  widać świat.
- **Trzy paski mają jeden rozmiar i żadnych liczb.** Wcześniej życie było większe
  od reszty, a w środku miało `74/100`. Decyzja użytkownika i dobra: trzy paski
  tej samej wielkości czytają się jako jeden przyrząd, a liczba w jednym z nich
  robi z niego wyjątek.

## Ruch i patrzenie

Sylwetka postaci idzie **za ruchem**, celowanie zostaje **przy myszy**. Biegnąc
w lewo wolno walnąć w prawo — postać wykona przy tym obrót, zamiast biec całą
drogę odwrócona. Obrót w stronę ciosu trwa dokładnie tyle, co cios (zamrożony
`atkFacing`). W bezruchu **nic nie obraca postaci**: zostaje zwrócona tam, dokąd
biegła albo gdzie uderzyła. Odsyłanie jej wtedy do kursora dawało obrót na każde
drgnięcie myszy przy postaci stojącej w miejscu.

## Jaka to ma być gra

Ustalone 2026-07-30. **To ma być gra trudna, a każdy system ma boleć.** Główna
inspiracja to Tibia. Zasada nadrzędna, z której wynika reszta:

> Jeśli mechanika nie zmienia decyzji gracza, to jej nie ma — choćby była w kodzie.

Wzorzec **negatywny** podany wprost przez użytkownika: głód w Ruście. Jest, a
wszyscy mają go w nosie, bo trudno od niego umrzeć i prawie nic nie odbiera.

- **Życie nie regeneruje się samo. Nigdy.** Leczą mikstury (kupione albo zrobione),
  łóżko we własnym pokoju i jedzenie. Wszystko kosztuje. Pierwsza wersja miała
  powolne odnawianie poza walką — **usunięte tego samego dnia**, bo przy
  samoleczeniu żadna rana nie jest decyzją.
- **Brak jedzenia zabija.** Jedzenie jest trudne: trzeba polować albo kupić.
- **Śmierć wyrzuca niesione rzeczy** i musi mieć **karę na czas**. Bez kary
  pojawia się najprostsze nadużycie świata: odłożyć wszystko do skrzyni, zabić
  się dla odnowienia i lecieć dalej. Dlatego odrodzenie daje dziś **połowę życia**,
  a nie pełne — to zaślepka do czasu, aż będzie co gubić.
- **Ekwipunek zdobywa się długo.** Zbroja ze skóry to nie pięć saren, tylko żmudny
  kawałek rozgrywki — chodzi o to, żeby cieszyć się nawet skórzanym hełmem i **bać
  się jego straty**.
- **Kuźnia jest strefą bezpieczną**, reszta świata nie.
- Na później: **system czaszek przy PvP** (PK jak w Tibii i Hurtworldzie).

### Plecak: siatka z kształtami, jak w Tarkovie

Ustalone 2026-07-30. **Miejsce w plecaku jest zasobem**, a nie licznikiem sztuk.

- Plecak to **siatka kwadratów**. Każdy przedmiot zajmuje prostokąt o własnym
  kształcie: moneta 1×1, mikstura 1×2, włócznia 1×5, zbroja 2×3.
- Przedmioty **da się obracać** i trzeba je układać. To jest część rozgrywki,
  nie utrudnienie interfejsu: decyzja „co zostawiam" ma zapadać na łupie, a nie
  w tabelce.
- **Po trupie zostaje worek**, jeśli coś niósł. Otwierasz go i przekładasz do
  siebie tyle, ile się zmieści — czyli przy pełnym plecaku trzeba wybierać, stojąc
  nad ciałem, w otwartym świecie. To jest właśnie ta scena, dla której warto było
  odłożyć „trupa leżącego przez trzy sekundy".

**Właścicielem zawartości jest serwer.** Klient rysuje i prosi o przełożenie;
o tym, czy przedmiot zmieścił się w siatce i czy w ogóle był, rozstrzyga serwer.
Przy grze, w której łupi się innych graczy, nie ma innej możliwości.

Interfejs po stronie HTML nad kanwą — tak jak czat, logowanie i suwaki. Przeciąganie,
trafianie w kratkę i klawiatura działają wtedy za darmo, a ikony biorą się z tego
samego atlasu co reszta grafiki.

**Kolejność:** najpierw muszą istnieć przedmioty i coś, z czego się je zdobywa.
Plecak zbudowany przed nimi jest pustą siatką, której nie da się przetestować.

**Stan na 2026-07-31: mechanika działa, wygląd nie.** Siatka, kształty, obracanie,
wyrzucanie i rozstrzyganie po stronie serwera są zrobione (`world/items.js`,
`ui/backpack.js`). Panel jest jednak zwykłym pudełkiem z CSS — użytkownik zgłosił
to od razu:

> miało to być bardziej z pikseli zbudowany plecak i miał wyglądać jak plecak,
> albo jak worek, a w środku sloty

Do poprawienia: **panel ma być narysowany**, tak jak reszta gry — worek albo
plecak z klapą, szwami i rzemieniami, wygenerowany w `tools/art/`, a kratki mają
siedzieć **w nim**, nie zamiast niego. Ramka z `border: 1px solid` i tło
`rgba(...)` to jedyne miejsce w grze, w którym coś nie pochodzi z zamkniętej
palety i widać to natychmiast. Sama siatka i mechanika zostają — to zmiana skóry,
nie zasad.

**Uwaga na potem:** interfejs w HTML nie zwalnia z rysowania. Czat i suwaki mogły
być zwykłymi kontrolkami, bo to przyrządy; plecak jest **przedmiotem w świecie**,
na który patrzy się dłużej niż na cokolwiek poza samą postacią.

### Pokój w karczmie zamiast baz

Pomysł użytkownika i **przyjmuję go jako obowiązujący**, bo rozwiązuje problem,
który inaczej blokował całą resztę: bazy w otwartym świecie wymagają własności,
uprawnień i obrony pod nieobecność właściciela, a przy dwóch graczach online baza
to szopa, na którą nikt nie przyjdzie.

Zamiast tego: **każdy ma pokój w karczmie, w tym samym miejscu**. Po wejściu ładuje
się jego własny — skrzynia, łóżko (odpoczynek), później ogródek do hodowli roślin
na mikstury i jedzenie. Za złoto u karczmarza **powiększa się pokój** i to odblokowuje
kolejne budowle.

Technicznie to wnętrze ładowane przy wejściu, czyli dokładnie ten przypadek, który
CLAUDE.md już dopuszcza: szybkie przeładowanie na przejściu, nie teleport i nie
osobny świat.

## Stan i co dalej

**Działa i jest wdrożone** na `mp.szabrownicy.goblinpc.pl`, wpięte w guzik GRAJ
na goblinpc.pl (`app/gra/page.tsx` w repo `goblin-shop` — iframe na tę subdomenę):

- mapa kuźni i placu, ruch z bezwładnością i kolizjami, kamera, oświetlenie
  z migotaniem, cienie od ognia, cząstki, muzyka, ambient, kroki, suwaki głośności,
- **multiplayer**: serwer autorytatywny, przewidywanie ruchu u klienta,
  interpolacja innych graczy, plakietki z nickami,
- **logowanie na nick i hasło**, konta trwałe, zastrzeżone nicki, odznaka admina,
- **drewniana karczma**: bale, deski, wrota, gont, dach znikający po wejściu,
- **ograniczona widoczność**: z hali nie widać placu i odwrotnie,
- **okna z klinem widoczności** — ile widać przez okno, zależy od tego, gdzie stoisz,
- **czat z dymkami** nad głowami, log ostatnich wiadomości i **tabela graczy pod TAB-em**,
- panel diagnostyczny pod `F1` (wersja klienta, fps, ping, korekta pozycji).

## Konta i logowanie

Wejście to nick i hasło, bez maila. Wolny nick zakłada konto, zajęty wymaga hasła.

- `server/src/accounts.js` — hasła solone i haszowane `scrypt` z wbudowanego
  `crypto`. **Musi zostać asynchroniczne**: wersja synchroniczna blokuje pętlę
  świata na kilkadziesiąt ms przy każdym logowaniu i wszyscy gracze przystają.
- Ten sam komunikat dla złego hasła i nieistniejącego konta, `timingSafeEqual`,
  zapis przez plik tymczasowy i `rename`.
- **Zastrzeżone nicki** (`Goblin`, `GoblinPC`, `Admin`, `Obsluga`…) — porównanie
  po formie znormalizowanej, więc `G0blin` i `g-o-b-l-i-n` też są zablokowane.
  Konta na nich zakłada wyłącznie `server/src/admin.js` z konsoli serwera.
- **Konto właściciela:** nick `Goblin`, odznaka admina. Hasło ustawione
  narzędziem konsolowym — do zmiany przez `node server/src/admin.js haslo Goblin <nowe>`.
- Odznaka admina (gwiazdka + pomarańczowa plakietka) leci **z serwera** w opisie
  gracza. Nick da się wpisać, koloru plakietki nie — o to chodzi.
- Dane logowania klient trzyma tylko w pamięci, żeby po zerwaniu sieci wrócić
  bez pytania o hasło. W `localStorage` siedzi wyłącznie nick, do podpowiedzi.

## Sieć

Serwer jest autorytatywny: klient wysyła **wyłącznie wciśnięte klawisze**, pozycję
liczy serwer. Docelowo to survival PvP z rajdami, więc jest o co oszukiwać.

- `client/src/world/movement.js` — fizyka ruchu, **jedyna kopia**, importowana
  przez klienta i serwer. Dwie kopie zaczęłyby się rozjeżdżać i gracz widziałby
  szarpanie przy każdej korekcie.
- Wejście to komendy `[seq, maska klawiszy, ms]`, wysyłane 30 razy na sekundę
  paczkami. Klient przewiduje ruch u siebie, a po migawce ustawia się na pozycji
  z serwera i **odtwarza** komendy jeszcze niepotwierdzone.
- Serwer tyka 20 Hz. Zapas czasu symulacji na gracza to 1,15× czasu rzeczywistego —
  to blokuje przyspieszanie postaci przez zawyżanie `dt` w przerobionym kliencie.
- Innych graczy pokazujemy 100 ms w przeszłości i interpolujemy między migawkami.
- Ograniczniki: rozmiar wiadomości, liczba na sekundę, timeout na przedstawienie
  się, heartbeat zrywający martwe połączenia.
- Tożsamość: token z `localStorage` → nick i wariant w `server/data/players.json`.

**Postać: jeden goblin, świadomie.** Próba zrobienia ludzkich sylwetek (jasna
i ciemna karnacja, fryzury, warstwowe ubranie) została **odrzucona i usunięta**.
Powód wart zapamiętania: postacie budowane z metryki — `rect()` na głowę, tułów
i nogi — wyglądają jak sklejone prostokąty. Goblin wychodzi dobrze dokładnie
dlatego, że jego sylwetka jest **wypisana ręcznie**, wiersz po wierszu
(`PROFILE_SPANS`, uszy stawiane pikselami, brew, kieł). Jeśli wybór wyglądu
kiedyś wróci, ma powstać przez rysowanie znak po znaku (`Canvas.fromAscii`),
nie przez parametryzowanie prostokątów. I dopiero wtedy, gdy będzie po co —
czyli przy ekwipunku widocznym na postaci.

## Widoczność i okna

`client/src/render/lighting.js` — przygaszanie liczone na **osobnym płótnie**:
najpierw zaciemniamy wszystko, potem *wycinamy* to, co widać. Rysując wprost na
maskę dawało się tylko dokładać ciemność, nie odejmować jej wybiórczo.

- Rozmycie krawędzi budynku idzie **do wnętrza**. Wersja rozszerzająca prostokąt
  na zewnątrz odsłaniała pas trawy za ścianą — pas między ścianą a skałą ma dwa
  kafle, a rozmycie miało 30 px, więc nigdy nie gasł.
- Test „czy jestem w środku" pyta o `BUILDING_PX` (obrys murów), **nie** o `ROOF_PX`
  (rysunek dachu, krótszy o dwa kafle). Pomylenie ich dawało próg widoczności
  przesunięty trzy kratki w głąb hali.
- **Okna:** `WINDOWS` w `world/forge.js` to lista odcinków otworu w pikselach.
  Klin widoczności liczy się od gracza przez oba końce odcinka — ta sama geometria
  co przy rzucaniu cienia, tylko odwrócona. Otwór jest rozszerzany o 10 px na
  stronę: uczciwy klin z okna szerokiego na kilkanaście pikseli jest bezużyteczny.
  Opis okna to czysta geometria, więc **ten sam mechanizm obsłuży okna w domkach
  graczy**, gdy dojdzie budowanie.
- Klin nie zatrzymuje się na przeszkodach i liczy się od stóp, nie od oczu.
  Świadomy skrót — do poprawy tylko jeśli będzie widać.

## Czat i tabela graczy

Enter otwiera pole, Enter wysyła, Escape zamyka. TAB przytrzymany pokazuje listę
graczy ze strefą, w której stoją. `M`, `N`, `F1` i TAB milczą, gdy kursor jest
w polu tekstowym.

- **Protokołu czatu nie było**, mimo że `docs/DESIGN.md` go opisuje — ten plik jest
  projektem całości, nie stanem kodu. Doszły `chat` w obie strony i `system`
  (wejścia i wyjścia graczy).
- **Sanityzacja po stronie serwera** (`cleanChat`): znaki sterujące, znaczniki
  kierunku pisma i niewidzialne wypełniacze na spację, zwinięcie białych znaków,
  obcięcie do 120 znaków. Odstęp 1,5 s liczy serwer — cicho odrzuca; klient pilnuje
  tego samego i to on tłumaczy graczowi, dlaczego wiadomość nie wyszła.
- Serwer rozgłasza wiadomość **także do autora**. Bez tego każdy widziałby swój
  dymek w innej chwili niż pozostali.
- **Kształt dymka to `client/src/render/bubble.js`** — sama geometria, lista
  prostokątów, bez Phasera i bez płótna. Tego samego pliku używa gra i generator
  podglądu, więc podgląd nie może pokazać czegoś innego, niż widzi gracz.
- Pole do pisania to `<input>` (`client/src/ui/chat.js`), nie napis w Phaserze —
  za darmo daje polskie znaki, wklejanie i klawiatury mobilne. Zamknięte jest
  zdejmowane z drzewa dokumentu; ukryte, ale zaznaczone, zjadałoby klawisze ruchu.

### Pułapki, które już kosztowały czas

- **Obrys dymka musi być z sadzy (`soot 0`), nie z najciemniejszego drewna.**
  `wood 0` to `#2a1d15`, a ciepły mrok wnętrza kuźni `#2a1c14` — obrys po prostu
  znikał w hali. Widać to było tylko na podglądzie z dwoma tłami.
- **Klawisz trzymany w chwili otwarcia czatu nigdy nie dostaje `keyup`**, bo pole
  tekstowe zatrzymuje zdarzenia, żeby litery nie sterowały postacią. Bez
  `resetKeys()` przy wyjściu z pisania postać sama ruszała w stronę, w którą szła
  przed otwarciem czatu.
- **Cienki obrys i mały ogonek czytają się jako okienko interfejsu, nie mowa.**
  Pierwsza wersja miała 1 px ramki i 5-pikselowy trójkąt w kolorze tła i została
  odrzucona. Dziś: obrys 2 px, narożniki ścięte po 2 px, ogonek schodkowy.
- Własna plakietka musi mieć **prawdziwy numer gracza z serwera**. Przy zastępniku
  (było tam zero) własna wiadomość wracała z numerem, którego nie ma na liście
  plakietek, i autor jako jedyny nie widział swojego dymka.
- Kolejność rysowania dymka: **najpierw cały obrys, potem całe wypełnienie.**
  Rysowane po kolei „ramka i tło dymka, ramka i tło ogonka" zostawia ciemną kreskę
  dokładnie w miejscu połączenia.

## Narzędzia do sprawdzania (używać, nie zgadywać)

Kilka błędów w układzie mapy dało się zauważyć dopiero w grze. Stąd:

- `node tools/art/preview_world.js [x0 y0 x1 y1] [--bez-dachu]` — render wycinka
  mapy do `docs/preview/swiat.png`, dokładnie tak jak widzi gracz. Stawia też
  postać przy murze, żeby było widać, czy dach nie wchodzi jej na głowę.
- `node tools/art/preview_doba.js [--bez-dachu] [--deszcz]` — ten sam kadr o kilku porach doby
  do `docs/preview/doba.png`, plus **ten sam kadr bez światła** jako pierwsza kratka.
  Ta jedna kratka jest tu najważniejsza: bez niej nie da się odróżnić „południe jest
  za ciemne" od „ziemia po prostu ma ciemną teksturę". Stałe bierze z `daylight.js`
  i `lighting.js`, więc nie pokaże czegoś innego niż gra; reimplementowane jest samo
  składanie maski, bo płótna 2D przeglądarki w Node nie ma. `--deszcz` pokazuje **samo
  przygaszenie i wypranie koloru** — padających kropli tu nie ma i być nie może,
  rysuje je Phaser wprost na kanwę gry.
- `node tools/art/preview_podloze.js` — warstwa nakładkowa do `docs/preview/podloze.png`:
  komplet piętnastu układów rogów, łata terenu złożona z nich **i ten sam kadr
  starym sposobem** (kafel trawy albo kafel ziemi). Ta trzecia kratka jest tu
  najważniejsza — bez niej nie da się odróżnić „nowe jest obłe" od „nowe jest tak
  samo kanciaste, tylko inaczej pokolorowane".
- `node tools/art/preview_bubble.js` — arkusz dymków czatu do `docs/preview/dymek.png`,
  na dwóch tłach: ciepły mrok hali i chłodna trawa placu. Geometria pochodzi
  z `client/src/render/bubble.js`, czyli z kodu gry. **Dwa tła są tu po coś** —
  to na nich wyszło, że obrys zlewa się z podłogą kuźni.
- `npm run art` produkuje arkusze kontrolne w `docs/preview/`. **Obejrzeć je
  narzędziem Read przed powiedzeniem, że gotowe.**
- Panel `F1` w grze: wersja klienta, fps, najdłuższa klatka, trzy źródła czasu,
  ping, korekta pozycji. Powstał po awarii, w której „postać laguje" okazało się
  wygładzaniem czasu w Phaserze, a nie problemem sieci.

## Stan na koniec 2026-07-30

### Świat

**Mapa 160×120 kafli**, miasto na środku, trzy bramy (południe, zachód, wschód)
ze słupami. Za murami teren generowany warstwami wg `docs/TEREN.md`: biomy →
drogi z bram → obiekty przez `scatter()` z wymuszonym minimalnym odstępem.
Las ma polany, krzaki i kwiaty. Miasto jest **strefą bezpieczną** (`CITY_PX`),
poza nią PvP.

**Miasto ma własny układ współrzędnych** (`CITY_OX`/`CITY_OY`) i wchodzi na wielką
mapę w całości. Nie przeliczać wpisanych na sztywno liczb kuźni — przesunięcie
jest w jednym miejscu.

### Żyje

Doba 16 min, pogoda z deszczem, **cienie od słońca wędrujące przez dobę** plus od
ognia, wiatr w roślinności (własne tempo każdej rośliny), pyłki, motyle, ptaki,
świetliki i ćmy po zmroku, trawa gnąca się pod nogami.

### Walka

Celowanie myszką (8 kierunków rysunku, trafienie pod dokładnym kątem), łańcuch
trzech ciosów, **trzy ładunki uniku**, życie bez samoleczenia, śmierć natychmiastowa
z odrodzeniem w hali na połowie życia, PvP ze strefą bezpieczną.

**Pierwsze zwierzę: dzik.** Cztery stany, każdy widoczny z zewnątrz — włóczy się,
staje i czerwienieje (zapowiedź), szarżuje po prostej bez skrętu, po chybieniu
odpoczywa. Wciągnięcie go na drzewo kończy szarżę i ogłusza. To jest **wzorzec dla
wszystkich przyszłych stworów**.

### Gotowe na serwerze, brak strony klienta

`nodes.js` + `chopNodes()` w `game.js`: drzewa i głazy mają punkty życia, wypadają
z nich rzeczy, odrastają. **Klient jeszcze tego nie rysuje** — brakuje przewracania
drzewa, etapów pękania skały i rzeczy leżących na ziemi.

## Kolejka zgłoszona 2026-07-31 wieczorem

Cztery rzeczy zgłoszone jedna po drugiej, wszystkie o tym samym: **ekwipunek jest
listą rzeczy, a nie wyposażeniem postaci**.

1. **Pasek narzędzi na dole HUD-u.** Zgłoszone wprost: *nie da się używać siekiery
   jako siekiery, tylko włócznia zbiera drewno i kamienie*. Przyczyna jest
   w `game.js`: `hasTool(player.bag, ...)` pyta, czy narzędzie **leży w plecaku**,
   a nie czy gracz je trzyma. Kto ma siekierę w plecaku, ten ścina drzewo czymkolwiek
   — a że w ręce widać broń, wygląda to jakby zbierała włócznia. Pasek narzędzi
   rozwiązuje to u źródła: liczy się to, co w wybranym gnieździe.
2. **Ekwipunek postaci** — gniazda na zbroję, hełm, broń. Dopiero wtedy skórzany
   hełm jest czymś, co się **nosi**, a nie kolejnym prostokątem w siatce.
3. **Ekran pomocy** — sterowanie i zasady w jednym miejscu.
4. ~~**Plecak ma wyglądać jak worek.**~~ **Próbowane 2026-07-31 i ODRZUCONE.**
   Panel został narysowany w `tools/art/ui.js` jako sakwa: kołnierz, klapa z łukiem
   i szwem, dwa rzemienie z okuciami, brzuch rozszerzający się ku dołowi, kratki
   we wnęce wyciętej w płótnie. Trzy podejścia, po każdym uwaga z gry — *prostokątny
   ekran z obwódką*, potem *za duży, za kanciasty, za mało brązowy*, na koniec:
   **wróć do zwykłego plecaka**. Cofnięte w całości, rysunek zszedł z atlasu.

   Wnioski, żeby nie zaczynać tego od nowa bez powodu:

   - **Siatka rządzi wielkością panelu.** Osiem kolumn po 48 px to 384 px samych
     kratek; każdy zapas płótna dokłada się do tego, więc „worek widoczny dookoła"
     i „panel nie zajmuje pół ekranu" wykluczają się przy tej siatce.
   - Wypukły bok czyta się jako płótno, prosty jako skrzynia — ale przy wnęce
     zajmującej większość powierzchni żadna krzywizna nie ma gdzie zaistnieć.
   - Gdyby wracać do tematu: najpierw **mniejsza siatka albo mniejsza kratka**,
     a kształt dopiero potem. Odwrotna kolejność została sprawdzona i nie działa.

## Wrogowie — zgłoszone 2026-07-31 wieczorem

*Wrzucić nowe zwierzaki i poprawić dzika, bo ma chujowe animacje. Tylko szarżuje
i to lagując się. Zrób wrogów z inteligentną mechaniką, coś co zaskoczy graczy.*

**Część „laguje" jest już naprawiona** i przyczyna warta zapamiętania: moby były
stawiane **wprost na pozycji z migawki**, czyli dwadzieścia razy na sekundę, przy
rysowaniu sześćdziesiąt. Szarżujący dzik przeskakiwał po dziesięć pikseli i stał
między skokami. Inni gracze nie mieli tego problemu, bo ich pokazujemy 100 ms
w przeszłości i interpolujemy — moby po prostu wypadły z tej zasady. Dziś mają
ten sam bufor pozycji.

Reszta do zrobienia:

- **Dzik ma jedną sztuczkę.** Cztery stany (włóczy się, zapowiedź, szarża,
  odpoczynek) były dobrym wzorcem na start, ale wzorzec przerobiony na jedynego
  przeciwnika w grze znaczy, że po trzech spotkaniach nie ma już czego się uczyć.
  Potrzebuje **drugiego zachowania**: zawracania w trakcie szarży przy chybieniu,
  albo cofania się i ponawiania, albo wołania drugiego dzika.
- **Animacje.** Dziś to sam bieg i zapowiedź na czerwono. Brakuje: potrząśnięcia
  łbem przed szarżą, ryja przy ziemi w spoczynku, kulenia się po ogłuszeniu.
- **Nowe zwierzęta — każde z inną zasadą**, nie z innymi liczbami. Wilk atakuje
  w watasze i odcina odwrót, nietoperz lata i nie da się go trafić ciosem w dół,
  niedźwiedź nie ucieka i karze pchanie się do przodu. Zasada nadrzędna gry mówi:
  *jeśli mechanika nie zmienia decyzji gracza, to jej nie ma* — trzy zwierzęta
  różniące się tylko punktami życia są jednym zwierzęciem.
- **Zaskoczenie ma być uczciwe.** Wszystko, co zabija, musi być widoczne wcześniej:
  zapowiedź ciosu, dźwięk, ruch. Przeciwnik zaskakuje **wzorcem**, nie brakiem
  informacji — inaczej to nie jest trudność, tylko ruletka.

## Co dalej — kolejka na 2026-07-31

1. **Dokończyć zbieranie**: drzewo przewraca się (obrót wokół podstawy) i zostawia
   pniak, skała pęka etapami, wypadające rzeczy leżą na ziemi i da się je podnieść.
2. **Przedmioty i plecak-siatka** wg opisu wyżej: kształty, obracanie, przeciąganie.
3. **Worki po trupie** — z tym wchodzi utrata rzeczy przy śmierci.
4. **Pokój gracza w karczmie**: skrzynia i łóżko.
5. **Pięści jako broń startowa** — patrz niżej, decyzja już podjęta.
6. Menu pod `ESC` z suwakami głośności (zdjęte z rogu ekranu, czekają).
7. Błyski i dźwięki przy naładowaniu uniku.
8. Punkty orientacyjne w każdym obszarze (spalone drzewo, iglica, zatopiony wóz).
9. **Trafienie w drzewo jest za trudne.** Zgłoszone z gry 2026-07-31: *uderzam
   w jego stronę i nie trafiam cały czas, trzeba idealnie pod danym kątem stanąć*.
   Diagnoza spisana od razu, żeby nie szukać jej od nowa:

   - **Gracz celuje w koronę, a gra sprawdza pień.** Drzewo ma `radius: 7`
     i `torso: 20` (`world/nodes.js`), czyli cel wielkości pnia — a na ekranie
     zajmuje 34 px szerokości. To jest główny podejrzany.
   - Stożek ciosu ma 84° przy cięciach i **60° przy pchnięciu**, liczony od
     kierunku myszy. Do tego pięść ma teraz zasięg 0,37 × 46 px ≈ 17 px liczone
     od środka postaci — po odjęciu promienia celu zostaje jakieś 24 px od osi pnia.
   - Razem daje to wąskie okno w obu wymiarach naraz, i to jest ta „idealna" pozycja.

   Kierunek naprawy: **cele nieżywe mają być wybaczające**. Drzewo i głaz nie
   uciekają i nie oddają, więc precyzja nic tu nie wnosi — jest samą uciążliwością.
   Do zrobienia: większy `radius` zasobów (drzewo ~12–14, głaz ~14) i osobny,
   szerszy stożek dla zasobów niż dla walki. Trudność ma siedzieć w tym, **czym**
   się rąbie (siekiera kontra pięść), a nie w tym, pod jakim kątem się stoi.

10. **Animacja ciosu pięścią do napisania od nowa.** Ocena użytkownika po
    obejrzeniu w grze: *tragiczna*. I słusznie — dzisiejsza wersja to **pozy
    włóczni z odjętym drzewcem**: te same kąty, te same wychylenia, ten sam
    rytm faz, tylko z pięścią doklejoną w punkcie garści i skróconym wyrzutem
    ręki. Oszczędność wyszła dokładnie tak, jak takie oszczędności wychodzą.

    Pięść potrzebuje **własnych póz**, nie przeskalowanych cudzych. Pchnięcie
    włócznią jest ruchem z ramienia po prostej; cios pięścią to obrót całego
    tułowia, bark idący za ręką, druga ręka przy twarzy i przeniesienie ciężaru
    na przednią nogę. Nic z tego nie da się dostać mnożnikiem.
    Do zrobienia razem z tym: `ATTACK_POSES` rozbite na komplet na broń, a nie
    jeden komplet z poprawką — i wtedy siekiera dostanie zamach z góry, a nie
    kolejne przebranie pchnięcia.

11. **Ślad ciosu pięścią ma własny rysunek, nie przeskalowany łuk włóczni.**
    Dziś smuga jest jedna dla wszystkich broni i tylko ściskana mnożnikiem
    zasięgu. Działa — przestała mylić co do zasięgu — ale dalej jest **łukiem
    cięcia**, a pięść nie tnie. Powinien to być krótki błysk przy samej garści,
    a nie wycinek okręgu wokół tułowia. Do zrobienia razem z nowymi pozami ciosu.

12. ~~**Worek po trupie zamiast rozsypanych rzeczy.**~~ **Zrobione 2026-07-31.**
    Serwer trzyma worki osobno od rzeczy na ziemi, zawartość leci **tylko temu,
    kto przy worku stoi**, przekładanie rozstrzyga serwer (`takeFromSack`).
    Worek jest niczyj — kto stoi obok, ten bierze. Leży pięć minut. Było: Śmierć wysypuje dziś plecak
    jako osobne przedmioty na ziemię — koszt śmierci jest, ale przy pełnym
    plecaku odbiór to dwadzieścia naciśnięć `E`. Docelowo ma zostać **jeden worek**,
    który się otwiera i z którego przekłada się tyle, ile się zmieści. Wymaga
    interfejsu cudzego pojemnika — tego samego, który potem obsłuży skrzynię
    w pokoju w karczmie.

13. ~~**Uniki jako pasek, nie kryształy.**~~ **Zrobione 2026-07-31.** Ustalone 2026-07-31 po obejrzeniu
    zmniejszonych rombów: mają to być **trzy segmenty jednego zielonego paska**,
    w tej samej ramce i tej samej konwencji co życie i głód. Powód jest dobry
    i wart zapamiętania: HUD ma być **jednym przyrządem**, a nie zbiorem odznak.
    Romb obok dwóch pasków czyta się jako osobny system, choćby był mały.
    Ładowanie ma dalej być płynne, więc segment wypełnia się częściowo — dokładnie
    tak jak dziś kryształ, tylko w kształcie paska. `dodgeFuel` to już ułamek 0–3,
    więc po stronie danych nie ma nic do zmiany.

14. ~~**Cienie do zmiękczenia.**~~ **Zrobione 2026-07-31** — opis w rozdziale
    o oświetleniu i cieniach. Było: Zgłoszone
    2026-07-31: *ciemny prostokąt kanciasty jak Minecraft*. Cień rzucany to
    **sylwetka obiektu położona na ziemi**, więc obiekt, którego sylwetka jest
    prostokątem — brama, mur, słup — daje na placu prostokąt o ostrej krawędzi.
    Przy drzewie tego nie widać, bo korona sama jest nieregularna.

    Do zrobienia: rozmycie krawędzi cienia rosnące z odległością od podstawy
    (cień przy stopach jest ostry, dalej coraz bardziej rozmyty — tak zachowuje
    się prawdziwy półcień) i zmniejszenie krycia dużych, jednolitych sylwetek.
    Uwaga: CLAUDE.md już wcześniej notuje pokrewny szew — **granica ciepłego
    wnętrza i chłodnego placu też jest ostrym prostokątem**. To ta sama rodzina
    problemu i warto ją ruszyć jednym podejściem.

15. **Klimat: efekty głębi.** Mgła **zrobiona 2026-07-31**, patrz rozdział „Mgła".
    Reszta czeka. Zgłoszenie brzmiało: Zgłoszone 2026-07-31 —
    *antyaliasing, ambient occlusion, lekka mgła i inne tego typu rzeczy*.

    Nazwy trzeba przetłumaczyć na to, co ma sens w pixel arcie, bo dosłownie
    dwie z nich są **szkodliwe**: antyaliasing rozmywa piksele i psuje wszystko,
    na czym stoi ten projekt (`pixelArt: true`), a klasyczne AO liczy się z
    geometrii 3D, której tu nie ma. Ale to, o co użytkownikowi chodzi — **głębia
    i klimat** — da się zrobić i częściowo już działa:

    - **Ambient occlusion już jest** i nazywa się plamą kontaktową pod obiektem
      (`shadows.js`). Do wzmocnienia: przyciemnienie w miejscach zamkniętych —
      pod okapami, w kątach murów, w gęstwinie.
    - **Mgła** — pierwsza rzecz do zrobienia i najtańsza: warstwa nad podłożem,
      gęstniejąca nad trawą o świcie, ścieląca się przy ziemi, ruszająca się
      wolniej niż deszcz. Naturalnie wpina się w `daylight.js` (najgęstsza tuż
      przed wschodem) i w `weather.js` (po deszczu).
    - **Głębia ostrości ubogiego człowieka**: przygaszenie i odbarwienie tego,
      co daleko od gracza — ta sama sztuczka co `overcast()` w `lighting.js`.
    - **Promienie światła** przez okna i przez korony drzew — te same kliny, co
      już liczy widoczność przez okna, tylko rysowane zamiast wycinane.
    - **Cząstki tła**: kurz w słupie światła, spadające liście, iskry znad ognia.

    Kolejność ma znaczenie: **najpierw zmiękczenie cieni (punkt 14), potem mgła.**
    Mgła położona na ostre prostokątne cienie tylko je uwypukli.

16. **Reguły rozstawiania skał i drzew — zrobione 2026-07-31.** Było: głazy
   nachodzą na inne obiekty, a zagęszczenie takie, że *ledwo da się przejść przez
   mapę*. Przyczyna: `scatter()` pilnował odstępu **tylko w obrębie jednego
   wywołania**, więc drzewa nie wiedziały o głazach.

   - **Jedna lista zajętości na całą mapę** (`Zajętość` w `world/terrain.js`),
     nie jedna na warstwę i nie jedna na obszar — na styku lasu ze skaliskiem
     obiekty z dwóch obszarów też muszą się widzieć.
   - Każdy obiekt wnosi **własny promień**, a sprawdzana jest suma dwóch. Jedna
     reguła obsługuje wszystkie pary: dwa drzewa dzieli 52 px, ale gałąź wolno
     położyć 36 px od pnia. Wspólny odstęp dałby albo zlane korony, albo
     rozrzucone pojedynczo patyki.
   - **Odsunięcie od dróg liczone w rogach**, nie w punkcie zaczepienia. Punktowy
     test przepuszczał głaz stojący piksel od ścieżki — zaczepienie obok drogi,
     rysunek już na niej.
   - **Przechodniość się mierzy, nie ocenia okiem.** `npm run sprawdz` zalewa mapę
     od bramy z prawdziwą szerokością stóp: dziś 99,9% otwartego terenu osiągalne.
     Róg z litej skały nie jest błędem — test pyta o „są pola, żadnego nie
     osiągnięto", a nie o sam fakt nieosiągalności.

### Zasoby w dwóch poziomach

Ustalone 2026-07-31, pomysł użytkownika: *ręką nie rozwalę skały i drzewa*.

- **Duże** — głaz i drzewo — wymagają narzędzia: kilofa i siekiery.
- **Małe** — luźne kamienie i gałęzie rozrzucone po mapie — idą gołą ręką.

To domyka pętlę startową: zbierasz ręką materiał → robisz siekierę przy
warsztacie → dopiero teraz ścinasz drzewa. Pierwsza siekiera przestaje być
przedmiotem i staje się **wydarzeniem**, czyli dokładnie tym, po co gracz
wychodzi z miasta.

Zrobione: `nodes.js` rozdziela zasoby ręczne od narzędziowych (`tool: 'axe'`,
`tool: 'pick'`), a cios bez narzędzia odbija się z głuchym stukiem.

### Warsztat: gdzie się rzemieślniczy

Stanowiskiem jest **stół w skrzydle wschodnim** (`workbench`), nie kowadło.
Podchodzisz, nad blatem zapala się `E`, wchodzisz i dopiero wtedy widzisz listę
wyrobów. Odejście od stołu zamyka okno.

- **Pozycja stanowiska pochodzi z listy obiektów** (`craftStation()` w
  `world/forge.js`), nigdy z liczby wpisanej po stronie serwera. Poprzednia
  wersja miała współrzędne kowadła wpisane w `game.js`; po przebudowie wnętrza
  na cztery pomieszczenia kowadło pojechało pod palenisko, a strefa pracy
  została na środku sali wspólnej — crafting „nie działał", bo działał w pustym
  miejscu, do którego nikt nie podchodzi. `npm run sprawdz` pilnuje tego teraz
  dwoma testami: czy stanowisko istnieje i czy jest przy nim gdzie stanąć.
- **Okno warsztatu jest osobne** (`client/src/ui/craft.js`), a nie kolumną obok
  plecaka. Doklejone do plecaka wisiało na ekranie zawsze — przygaszone przez
  większość gry — choć przydaje się w jednym miejscu na mapie.
- **Ikonę wyrobu przycinać do jej ramki w atlasie.** Ikony stoją w `props.png`
  obok siebie (dzida x=0, siekiera x=17, kilof x=34) i mają po 16 px szerokości,
  więc pole szerokie na 48 px pokazywało wszystkie trzy naraz plus kawałek
  drzewa. Skalowanie samego tła nie wystarczy — rozmiar musi dostać **element**.
- `E` robi dwie rzeczy i kolejność jest treścią: najpierw podnoszenie z ziemi,
  warsztat dopiero gdy nie ma czego podnieść. Przy stole może leżeć wyrzucona
  kłoda i to jej gracz chce sięgnąć.

### Broń startowa: pięści

**Gracz zaczyna bez broni.** Decyzja z 2026-07-30, powód wart zapamiętania:

> **Stan startowy musi być stanem najgorszym.**

Gdyby każdy odradzał się z włócznią, to (a) włócznia przestaje być łupem — nikt jej
nie podniesie z worka, więc zabicie gracza nie daje nic; (b) śmierć przestaje
kosztować, bo broń wraca za darmo; (c) pierwsza znaleziona broń przestaje być
wydarzeniem. Tibia robi dokładnie to i dlatego działa.

Pięści mają być **słabe, ale użyteczne**: niski obrażenia i krótki zasięg (zasięg
boli bardziej niż liczby — trzeba wejść w zwarcie), ale wystarczą na najsłabsze
zwierzę i na zbieranie tego, co leży.

Koszt techniczny jest **znikomy**: klatki ciosu powstają z garści, kąta i zasięgu,
a włócznia jest dorysowywana osobno (`drawSpear`). „Pięści" to te same pozy
z pominiętym drzewcem i skróconym wyrzutem ręki — nie trzeba rysować nowej postaci.

**Dalsza kolejka, w tej kolejności:**

Lobby jest domknięte. Dalej **walka przed mapą** — kolejność ustalona 2026-07-30
i świadomie odwrócona względem poprzedniej (najpierw był teren, potem walka).
Powód: walka jest tym, co gracz robi bez przerwy, więc musi być przyjemna, zanim
powstanie cokolwiek, po czym się chodzi.

1. **Miecz i atak.** Zamach, uderzenie, odrzut. Cel jest jeden: żeby chciało się
   uderzać dalej. To znaczy zapas przed ciosem (widać, że zaraz padnie), krótkie
   zatrzymanie klatki w chwili trafienia, odrzut celu i wstrząs obrazu.
2. **Odskok** (prostszy od turlania) — żeby walka była dynamiczna, nie wymianą ciosów
   na stojąco.
3. **Potworki.**
4. **Nowe bronie:** łuk, potem magia.
5. Dopiero potem mapa, survival, zbieranie surowców, crafting, budowanie.

Uzgodnione wcześniej i wciąż obowiązujące: cykliczne wipe'y, pionowy plasterek
zamiast szerokiego frontu.

## Ścieżka rozwoju

Spisana 2026-08-01. Zasada porządkująca, z której wynika kolejność:

> **Najpierw to, co daje powód do następnego kroku.**
> System, który nie zmienia decyzji gracza, można dołożyć zawsze; system, bez
> którego następny nie ma sensu, blokuje wszystko za sobą.

Dlatego bank wszedł przed lepszymi narzędziami, a nie odwrotnie: siekiera
z miedzi bez skrzyni to zabawka, którą się gubi przy pierwszej śmierci.

### Etap 1 — pętla, która się domyka (**zrobione**)

zbieranie ręką → siekiera przy warsztacie → drzewa i głazy → skrzynia jako bank
→ karczmarz skupuje nadmiar → większa skrzynia za złoto → miedź na zachodzie
→ lepsze narzędzia. Do tego głód, pieczenie mięsa i trwały stan konta.

### Etap 2 — jaskinia i pierwsze prawdziwe zagrożenie

**Następny w kolejce.** Miedź leży dziś na powierzchni i to jest zaślepka.

1. **Jaskinia na zachodzie** — wnętrze ładowane przy wejściu, tak samo jak pokój
   w karczmie. Ciemna, oświetlona tylko tym, co gracz przyniesie.
2. **Nietoperze** — pierwszy przeciwnik, który **lata**, czyli nie da się go
   zablokować terenem. `MOB_KINDS` jest tabelą danych, więc sam mob to wpis
   i klatki; robota siedzi w zachowaniu (lot, nurkowanie, wycofanie).
3. **Miedź przenosi się do jaskini.** Wtedy „idę po miedź" znaczy „wchodzę
   do ciemnej dziury z czymś, co gryzie", a nie „idę kawałek dalej".
4. **Pochodnia jako przedmiot** — zajmuje rękę. Nosisz światło albo broń.

### Etap 2b — kupowanie u karczmarza

Dziś karczmarz tylko **skupuje**, a złoto ma jedno wyjście: większa skrzynia.
Do dołożenia: mikstury lecznicze za średnią cenę i **miecz za dużą** — coś,
na co się zbiera przez kilka wypraw. Sprzedaż broni przez karczmarza jest tu
w porządku, bo nie da się jej wykuć samemu: kupno zostaje jedyną drogą i złoto
dostaje drugi, mocniejszy powód.

Uwaga na balans: cena musi być **wyraźnie wyższa** niż rozbudowa skrzyni,
inaczej miecz staje się pierwszym zakupem i bank przestaje być celem.

### Etap 3 — pokój gracza

Skrzynia stoi dziś w warsztacie, wspólnym dla wszystkich. Pokój daje jej
miejsce, które jest **czyjeś**: łóżko (odpoczynek), ogródek, i powód, żeby
kupować rozbudowę u karczmarza. Wnętrze instancjonowane — każdemu ładuje się
jego własne.

### Etap 4 — żelazo i drugi biom

Mokradła na wschodzie stoją puste. Żelazo dalej niż miedź, zbroja i broń z niego,
zioła na mikstury. Dopiero tu ma sens **skala trudności przez odległość**:
im dalej od bramy, tym więcej do stracenia w drodze powrotnej.

### Etap 5 — PvP z prawdziwą stawką

System czaszek (PK jak w Tibii), worki po trupie graczy, cykliczne wipe'y.
Wchodzi na końcu, bo bez etapów 2–4 nie ma czego łupić.

### Czego świadomie nie robimy

- **Minimapy i znaczników zadań** — prowadzi kontrast i droga.
- **Samoleczenia** — leczą mikstury, łóżko i pieczeń, wszystko kosztuje.
- **Stosów w plecaku** — miejsce jest zasobem, nie licznikiem sztuk.
- **Osobnej bazy danych** — stan gracza jest własnością konta, a kont są
  dziesiątki. Wróci, gdy dojdzie handel między graczami.

## Wdrożenie

Ten sam VPS, na którym stoją Goblin i Nibylandia. Sprawdzone połączeniem 2026-07-29.

- **VPS:** OVH `51.83.134.101`, user `ubuntu`, host `vps-547a20e1`.
- **SSH:** `ssh -i ~/.ssh/id_ed25519 ubuntu@51.83.134.101`. (W notatkach Nibylandii
  klucz nazywa się `goblin_vps` — to nazwa z Windowsa, na Macu leży jako `id_ed25519`.)
- **Port:** `9002`. Zajęte: 9000 Goblin, 9001 Nibylandia.
- **Subdomena:** `mp.szabrownicy.goblinpc.pl`. Rekord A dodaje ręcznie użytkownik
  w LightHosting (strefa `goblinpc.pl` jest tam, nie w Vercelu): nazwa
  `mp.szabrownicy`, wartość `51.83.134.101`, TTL 3600.
- **Caddy:** dopisać nowy blok, nie ruszać istniejących. Reverse proxy do
  `localhost:9002` **musi** mieć `transport http { versions 1.1 }` — bez tego nie
  przechodzi uścisk dłoni WebSocket (wycierpiane na Goblinie i Nibylandii).
- **systemd:** usługa `szabrownicy-server`, `Restart=always`, wzorzec z
  `/etc/systemd/system/nibylandia-server.service`.
- **Node na VPS jeszcze nie ma** — Goblin i Nibylandia to eksporty Godota. Trzeba
  doinstalować przy pierwszym wdrożeniu.
- Wdrożenie to `git pull` + restart usługi. Żadnego budowania ani eksportu.

**Znane słabe punkty:** aktywny portal wygląda jak słupek fryzjerski (i tak zejdzie
z mapy — portali nie będzie), studnia jest mętna, kilka drobnych obiektów to poziom
wypełniacza.

**Odskok potrzebuje własnych klatek — najlepiej turlania.** Dziś to przesuwana
sylwetka z bladym śladem za sobą i widać, że to ta sama postać przemieszczona,
a nie ruch ciała. Turlanie jest z tych trzech najtrudniejsze do narysowania
(goblin musi się zwinąć i obrócić, a sylwetka jest wypisana ręcznie), ale to ono
daje efekt. Ustalone 2026-07-30, świadomie odłożone: walka ma najpierw działać.

**Cios do góry idzie w bok, nie w przód.** Postać odwrócona plecami wyprowadza cios
„w głąb ekranu", a na to nie ma miejsca: nad głową zostaje 5 pikseli w klatce wysokiej
na 27, bo wiersze 0–5 to zapas na nakrycie głowy. Ostrze nie miało gdzie pójść w górę
i położyło się w poziomie. Poprawka nie polega na zmianie kątów — klatki ataku muszą
dostać **własną, wyższą klatkę** (zaczepienie to (0.5, 1), więc miejsce dodane u góry
jest darmowe) i cały łuk trzeba przenieść nad głowę. Świadomie odłożone: walka ma
najpierw działać, a potem wyglądać.
