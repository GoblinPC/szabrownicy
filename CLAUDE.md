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

11. **Reguły rozstawiania skał i drzew.** Zgłoszone 2026-07-31 po obejrzeniu mapy
   w grze: obiekty stoją zbyt losowo — głazy nachodzą na inne obiekty i na styki
   kafli, a zagęszczenie jest takie, że **ledwo da się przejść przez mapę**.
   `scatter()` pilnuje minimalnego odstępu **między obiektami tego samego wywołania**
   i nic poza tym; nie wie o obiektach z innych warstw ani o tym, że przez las ma
   dać się przejść. Do zrobienia: wspólna lista zajętości dla wszystkich warstw,
   odsunięcie od dróg i krawędzi, i gęstość dobrana tak, żeby zostawały przejścia.

### Zasoby w dwóch poziomach

Ustalone 2026-07-31, pomysł użytkownika: *ręką nie rozwalę skały i drzewa*.

- **Duże** — głaz i drzewo — wymagają narzędzia: kilofa i siekiery.
- **Małe** — luźne kamienie i gałęzie rozrzucone po mapie — idą gołą ręką.

To domyka pętlę startową: zbierasz ręką materiał → robisz siekierę w kuźni →
dopiero teraz ścinasz drzewa. Pierwsza siekiera przestaje być przedmiotem
i staje się **wydarzeniem**, czyli dokładnie tym, po co gracz wychodzi z miasta.

Jeszcze nie zrobione. Dziś wszystko rąbie się wszystkim.

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
