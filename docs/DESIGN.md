# Szabrownicy — Kuźnia (projekt świata)

Lobby-świat w stylu top-down 3/4. Gracze wchodzą, biegają po kuźni i placu przed nią,
widzą się nawzajem i rozmawiają dymkami nad głowami. Cała grafika generowana
programistycznie. Zaprojektowane tak, żeby dokładanie minigierek za portalami nie
wymagało przebudowy.

---

## 1. Zasady, z których wynika reszta

1. **Grafika jest kodem.** Żaden PNG nie jest rysowany ręcznie ani pobierany. Wszystko
   powstaje w `tools/art/` i regeneruje się komendą `npm run art`. "Cień za ciemny" =
   zmiana jednej liczby, nie przerysowanie 40 plików.
2. **Zamknięta paleta.** Każdy piksel w grze pochodzi z listy w `palette.js`. To jedna
   decyzja, która daje spójność wizualną za darmo.
3. **Światło robi klimat, nie sprite'y.** Te same kafle bez oświetlenia wyglądają jak
   szkic, z oświetleniem jak gra. Warstwa świetlna jest częścią projektu, nie dodatkiem.
4. **Świat to strefy.** Od pierwszego dnia serwer myśli w kategoriach stref, nawet gdy
   istnieje tylko jedna. Portal do minigierki to nowa strefa, nie refaktor.
5. **Etapami, z widocznym efektem po każdym.** Po każdym etapie da się odpalić i obejrzeć.

---

## 2. Parametry techniczne

| Rzecz | Wartość |
|---|---|
| Kafel | 16×16 px |
| Postać | 16×24 px (stopy w dolnej krawędzi) |
| Perspektywa | 3/4 top-down (widać fronty ścian i boki obiektów) |
| Mapa | 48×36 kafli = 768×576 px |
| Zoom kamery | ×3, adaptacyjnie ×4 przy małym oknie |
| Font | bitmapowy 5×7 px, własny, z polskimi znakami |
| Tick serwera | 15 Hz, interpolacja u klienta z 100 ms opóźnieniem |

---

## 3. Paleta

Kolory zgrupowane w **rampy materiałowe**. Zasada cieniowania: cień i światło zostają
w obrębie rampy danego materiału, a obrys to jej najciemniejszy odcień — **nigdy czysta
czerń**. To właśnie sprawia, że elementy z różnych plików wyglądają jak jeden świat.

```
sadza     #14100f #1f1a19 #2e2725 #453b37 #5c4f49
kamień    #4a423c #6b5d54 #857569 #a08d7e #bda997
drewno    #2a1d15 #3d2b1f #5a3f2b #7a5738 #9c7047
żelazo    #262b31 #3a4048 #545c66 #767f8c #9aa4b0
żar       #7a1f0a #c43a0d #f2700f #ffa524 #ffe08a
goblin    #1e3316 #2f4a22 #476b30 #66913f #8ab355
roślinność #14260f #1e3a1c #33582a #4f7a33 #6b9c45
noc       #0d1220 #182238 #2a3a58 #445a80 #5f7aa8
akcenty   #b87333 (miedź)  #4fc3f7 (magia)  #e8dcc0 (pergamin)
```

Ambient stref: wnętrze kuźni `#2a1c14` (ciepły mrok), plac `#182238` (chłodny zmierzch).

---

## 4. Pipeline grafiki (`tools/art/`)

Czysty Node, **zero zależności** — enkoder PNG piszę sam na wbudowanym `zlib` (~60 linii).

```
palette.js    nazwane kolory i rampy
canvas.js     mikro-biblioteka: px, rect, line, ellipse, outline, shade,
              dither, mirror, noise — operuje na tablicy indeksów palety
png.js        zapis tablicy pikseli do PNG
rng.js        deterministyczny PRNG — "losowe" plamy sadzy zawsze te same
tiles.js      kafle terenu i ścian
props.js      obiekty (kowadło, palenisko, beczki, kadź, miech, brama…)
goblins.js    postacie warstwowo: sylwetka + wariant + animacja
font.js       font bitmapowy 5×7 z ogonkami
fx.js         cząstki, gradienty świateł
ui.js         ramki dymków, panel czatu, przyciski
build.js      składa wszystko do client/assets/gen/
```

Wyjście (**commitowane do repo**, żeby deploy nie wymagał kroku budowania):

- `tileset.png` — atlas kafli
- `props.png` — obiekty świata
- `goblins.png` — 6 wariantów × 3 kierunki rysowane (dół/góra/bok, bok odbijany
  lustrzanie) × 8 klatek (2 idle + 6 biegu) = 144 klatki
- `font.png`, `fx.png`, `ui.png`

Postacie składane warstwowo: jedna funkcja rysuje sylwetkę i animację, warianty
podmieniają tylko rampy kolorów i dokładają nakrycie głowy/brodę. Dzięki temu szósty
goblin kosztuje kilkanaście linii, nie osobny rysunek.

---

## 5. Świat: kuźnia i plac (48×36)

```
y 0–4     skalna grań i las — nieprzekraczalna granica, korony drzew jako warstwa overhead
y 4–18    HALA KUŹNI (wnętrze, ciepły ambient)
            palenisko z kominem (lewa góra) — główne źródło światła
            kowadło (centrum) — punkt orientacyjny, wokół niego ludzie się kręcą
            kadź hartownicza, miech, stół roboczy
            stojaki z bronią przy prawej ścianie — docelowo witryna GoblinPC
            skrzynie, regały, beczki wzdłuż ścian
            4 pochodnie na ścianach
y 18–20   mur z bramą — przejście, zmiana ambientu
y 20–34   PLAC (na zewnątrz, chłodny ambient)
            ubita ziemia z koleinami i kałużami
            ognisko pośrodku — naturalne miejsce zbiórki i rozmów
            studnia, wóz, stosy drewna
            tablica ogłoszeń (zmiana nicku/wyglądu, komunikaty ze sklepu)
            3 portale przy krawędziach: Arena / Wyprawa / Sklep — na razie "Wkrótce"
y 34–36   płot i skały — domknięcie kadru
```

Warstwy renderowania: `ground → decal → objects (sortowane po Y) → postacie →
overhead (dach, korony drzew, alpha gdy gracz pod spodem) → światło → winieta`.

Mapa zdefiniowana w kodzie (`client/src/world/forge.js`) jako tablice kafli plus lista
obiektów — bez Tiled, skoro i tak sam generuję zawartość.

---

## 6. Oświetlenie, cienie, cząstki

**Warstwa świetlna** to `RenderTexture` wielkości ekranu:

1. wypełnienie kolorem ambientu strefy,
2. dla każdego źródła radialny gradient w trybie wycinania (dziura w ciemności),
3. nałożenie na scenę w trybie `MULTIPLY`,
4. druga warstwa `ADD` — ciepła poświata wokół ognia,
5. winieta przyciemniająca rogi.

**Źródła:** palenisko (duże, mocne migotanie), pochodnie ×4, żar w kadzi, ognisko na
placu, latarnie przy portalach. Migotanie to suma kilku sinusoid o niewspółmiernych
częstotliwościach plus szum — nigdy nie łapie widocznego rytmu.

**Cienie:** miękka elipsa pod każdą postacią i obiektem, odchylona w kierunku od
najbliższego źródła światła, alpha zależna od odległości.

**Cząstki:** iskry z paleniska (unoszą się i stygną od `#ffe08a` do `#c43a0d`), dym z
komina widoczny nad dachem, kurz dryfujący w smugach światła, pulsujące węgle, obłoczki
kurzu spod nóg przy biegu.

**Animowane otoczenie:** miech pracuje, woda w kadzi faluje, płomienie mają 4 klatki,
chorągiew nad bramą się rusza.

---

## 7. Sterowanie i odczucie ruchu

WASD i strzałki, ruch w 8 kierunkach, sprite w 4. Prędkość ~70 px/s z łagodnym
rozpędzaniem i wygaszaniem — postać ma czuć wagę, nie teleportować się. Kamera podąża
z wygładzeniem i martwą strefą, żeby drobne ruchy nie kołysały całym ekranem.
`Shift` — szybszy chód (bez wpływu na rozgrywkę, dla wygody).

---

## 8. Sieć

Protokół JSON po WebSocket. Klient jest autorytatywny nad własną pozycją — to lobby
towarzyskie, nie ma o co oszukiwać, a kod jest przez to znacznie prostszy.

```
klient → serwer   join {token, name, skin}
                  move {x, y, dir, moving}       ~15 Hz, tylko przy zmianie
                  chat {text}
                  portal {id}                    na przyszłość

serwer → klient   welcome {id, zone, players[]}
                  spawn {player} / despawn {id}
                  state [{id,x,y,dir,moving}]    15 Hz, tylko strefa gracza
                  chat {id, text}
                  system {text}
```

Serwer trzyma `zones: Map<zoneId, Set<player>>` i rozgłasza wyłącznie w obrębie strefy.
Klient interpoluje między dwoma ostatnimi migawkami z 100 ms opóźnieniem — ruch innych
graczy jest gładki mimo 15 Hz.

Tożsamość: losowy token w `localStorage` (jak dotychczas), do niego przypisany nick
i wybrany wariant goblina, trzymane w `server/data/players.json`.

**Ochrona czatu:** maks. 1 wiadomość na 1,5 s, 120 znaków, odcięcie znaków sterujących
i nadmiarowych spacji, nick 3–16 znaków.

---

## 9. Czat i dymki

Enter otwiera pole tekstowe. Ukryty element `<input>` przechwytuje klawiaturę (obsługa
polskich znaków i klawiatur mobilnych za darmo), ale sam tekst rysuję w Phaserze moim
fontem, żeby nic nie wypadało ze stylu.

Dymek nad głową: tło z 9-slice, ogonek wskazujący postać, maks. 3 linie po ~22 znaki,
czas życia 4 s plus 60 ms na znak, potem zanikanie. Nowa wiadomość zastępuje poprzednią
szybkim przejściem, a stara ląduje w logu. Log ostatnich 6 wiadomości w lewym dolnym
rogu, blaknie po 10 s ciszy.

Nad każdą postacią stała plakietka z nickiem — mniejszy font, lekki cień, przygaszona,
żeby nie zaśmiecała kadru.

---

## 10. Ekran startowy

Ciemny kadr z animowanym żarem i lecącymi iskrami w tle, tytuł, pole na nick, podgląd
goblina ze strzałkami do przełączania sześciu wariantów (postać na podglądzie stoi
w animacji spoczynku, oświetlona tym samym systemem co świat) i przycisk wejścia.
Ten ekran ma sprzedać "to jest prawdziwa gra" zanim gracz zrobi pierwszy krok.

---

## 11. Struktura plików

```
tools/art/              generatory grafiki
client/
  index.html
  assets/gen/           wygenerowane PNG (commitowane)
  src/
    main.js             boot Phasera
    net.js              WebSocket + interpolacja
    scenes/             Boot.js, Title.js, Forge.js
    world/forge.js      definicja mapy
    render/             lighting.js, particles.js, ysort.js, text.js
    ui/                 chat.js, bubbles.js, nameplate.js
server/src/
  index.js  zones.js  chat.js  players.js
legacy/                 stary kod ekstrakcji — baza pod pierwszą minigierkę
docs/DESIGN.md          ten plik
```

Dotychczasowe paczki assetów (Tiny Swords, dungeon tileset, MediavelFree) wypadają
z projektu — mieszanie trzech obcych stylów jest dokładnie tym, co psuło spójność.

---

## 12. Etapy budowy

| # | Etap | Widoczny efekt |
|---|---|---|
| 1 | Pipeline, paleta, enkoder PNG, font | `npm run art` produkuje font i próbnik palety |
| 2 | Kafle, obiekty, mapa, kolizje, kamera | statyczna kuźnia do obejrzenia |
| 3 | Goblin: 6 wariantów, animacje, ruch | bieganie po kuźni offline |
| 4 | Światło, cienie, cząstki | moment, w którym zaczyna wyglądać jak gra |
| 5 | Ekran startowy | pełna ścieżka wejścia |
| 6 | Multiplayer: strefy, interpolacja, plakietki | widać innych graczy |
| 7 | Czat i dymki | pełny zakres lobby |
| 8 | Portale, szlif, deploy | wersja do pokazania klientom |

---

## 13. Co dalej (nie budowane teraz, ale przewidziane)

Portale prowadzą do osobnych stref, więc każda z poniższych rzeczy to dołożenie sceny
i wpisu w rejestrze stref, bez ruszania kuźni:

- **Wyprawa** — stara mechanika ekstrakcji z `legacy/`, jako pierwsza minigierka.
- **Arena** — proste starcia między graczami.
- **Sklep** — witryna GoblinPC wewnątrz świata, przy stojakach z bronią.
- **Kuźnia jako warsztat** — crafting przy palenisku, jeśli ludzie zaczną wracać.
