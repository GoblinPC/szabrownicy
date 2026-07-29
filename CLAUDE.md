# Szabrownicy — Kuźnia

Przeglądarkowa gra 2D w rzucie 3/4 z góry, podpięta docelowo pod sklep GoblinPC.
**Cała grafika i cały dźwięk powstają programistycznie** — w repozytorium nie ma
ani jednego rysunku czy pliku audio zrobionego ręcznie albo pobranego.

Obecny zakres to **lobby**: wspólny świat, po którym gracze biegają, widzą się
nawzajem i rozmawiają dymkami nad głowami. Docelowo świat ma się rozrastać
o kolejne strefy za portalami (wyprawa, arena, sklep, kopalnia, survival
z budowaniem baz) — ale **po kolei**, bez budowania wszystkiego naraz.

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
    render/         lighting.js, shadows.js
    audio/          waveforms, tracker, songs, ambience, sfx, audio
    ui/mixer.js     suwaki głośności (zwykły HTML nad kanwą)
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

## Oświetlenie i cienie

`client/src/render/lighting.js` — maska światła rysowana co klatkę na małym
płótnie 2D (1 piksel maski = 2 piksele świata) i rozciągana na widok kamery
w trybie mnożenia. Kolor otoczenia zależy od miejsca: wnętrze hali ciepły mrok
`[122, 96, 84]`, plac chłodny zmierzch `[86, 100, 140]`. Migotanie to suma dwóch
niewspółmiernych sinusoid, więc ogień nie łapie słyszalnego rytmu.

`client/src/render/shadows.js` — cień to sylwetka obiektu położona na ziemi
i odchylona **w kierunku od najbliższego ognia**, plus miękka plama kontaktowa.
Dwie reguły wyniesione z błędów:

- obiekty, które **same świecą** (ognisko, palenisko, pochodnie, portale), mają
  `noShadow: true` — inaczej rzucają pod siebie wielką czarną plamę;
- `lightAt` pomija lampy bliższe niż 18 px, bo takie siedzą wewnątrz obiektu.

**Znana wada:** granica między ciepłym wnętrzem a chłodnym placem to na razie
ostry prostokąt. Przy bramie widać szew — do rozmycia.

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

## Stan i co dalej

**Działa:** mapa kuźni i placu, ruch z bezwładnością i kolizjami, kamera,
oświetlenie z migotaniem, cienie od ognia, cząstki (iskry, kurz, pył), sześć
wariantów goblina z animacjami spoczynku i biegu w trzech kierunkach, muzyka,
ambient i kroki, suwaki głośności, serwer deweloperski z przeładowywaniem na żywo.
**Multiplayer** — serwer autorytatywny, przewidywanie ruchu u klienta, interpolacja
innych graczy, plakietki z nickami. **Wdrożone** na `mp.szabrownicy.goblinpc.pl`,
wpięte w guzik GRAJ na goblinpc.pl.

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

**Kolejka, w tej kolejności:**

1. **Kreator postaci** — warstwy zamiast gotowych wariantów (patrz niżej).
2. **Czat z dymkami** nad głowami.
3. **Ekran startowy** z nickiem i kreatorem.
4. **Wnętrze kuźni** — mur na 2–3 kafle wysokości, dach z belkami znikający po
   wejściu pod niego. Teraz hala czyta się jak podwórko z płotkiem, nie jak wnętrze.
5. **Ograniczona widoczność** — promienie od postaci zatrzymywane przez ściany.
   Ten sam mechanizm obsłuży potem noc i kopalnię.
6. Dalej: świat z chunków, ekwipunek, zbieranie, crafting, walka, bazy, PvP.

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

**Znane słabe punkty:** aktywny portal wygląda jak słupek fryzjerski, studnia
jest mętna, kilka drobnych obiektów to poziom wypełniacza.
