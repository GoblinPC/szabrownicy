# HUD i ekran startowy — projekt

Dokument powstał **przed** rysowaniem czegokolwiek, żeby dało się poprawiać
zasady zamiast gotowego interfejsu. Ustalenia z 2026-07-30.

## Zasada nadrzędna

> HUD czyta się **kątem oka**. Oczy gracza są na środku ekranu, na przeciwniku.

Wszystko, co z tego wynika, jest ważniejsze od tego, co ładne:

- panele siedzą **przy krawędziach**, środek zostaje pusty;
- stan własnego ciała ma być w **jednym miejscu**, żeby oko miało jeden adres,
  a nie trzy;
- element, który nie zmienia decyzji gracza, **nie ma prawa być widoczny stale**;
- kształt niesie znaczenie szybciej niż kolor, a kolor szybciej niż liczba. Liczba
  jest dodatkiem dla tych, którzy chcą policzyć — nigdy jedynym nośnikiem.

## Co jest na ekranie i dlaczego

### Zawsze — lewy dolny róg, jeden blok „ja"

| element | dlaczego zawsze |
|---|---|
| **Pasek życia** | jedyna liczba, od której zależy „walczyć czy uciekać" |
| **Trzy uniki** | zasób taktyczny; bez podglądu gracz odskakuje w próżnię |
| **Głód** | dojdzie razem z jedzeniem, nie wcześniej |

Trzy paski jeden pod drugim, wyrównane do lewej, wspólna ramka. Jedno spojrzenie
w jedno miejsce daje pełny stan ciała.

### Zawsze — lewy górny róg

**Nazwa strefy i czy jesteś bezpieczny.** To jest w tej grze element krytyczny,
nie ozdobny: przekroczenie bramy zmienia zasady świata i **nie wolno**, żeby gracz
się o tym dowiedział dopiero po pierwszym ciosie w plecy.

Zmiana strefy dostaje krótki, wyraźny komunikat na środku ekranu — jedyny przypadek,
w którym cokolwiek wchodzi na środek, i właśnie dlatego zadziała.

### Na żądanie

| element | klawisz | dlaczego nie zawsze |
|---|---|---|
| Plecak | `I` albo `TAB`\* | zasłania pół ekranu, otwiera się świadomie |
| Lista graczy | `TAB` | ciekawostka, nie decyzja |
| Czat | `Enter` | pole tylko przy pisaniu; log blaknie po chwili ciszy |
| Diagnostyka | `F1` | przyrząd, nie interfejs |

\* Do rozstrzygnięcia przy wdrożeniu: `TAB` jest dziś listą graczy. W grze
z plecakiem-siatką `TAB` powinien należeć do plecaka, a lista graczy zejść gdzie
indziej — bo do plecaka sięga się sto razy częściej.

### Świadomie **nie** na HUD

- **minimapa** — cały pomysł na ten świat to „nie wiadomo, co jest dalej";
- **licznik potworów, punktów, doświadczenia** — nic z tego nie zmienia decyzji
  w chwili walki;
- **paski nad każdą postacią** — pasek pokazuje się dopiero nad rannym i to jest
  informacja sama w sobie.

## Jak to ma wyglądać

Grafika powstaje tak samo jak reszta: kodem, z zamkniętej palety, z obrysem
w najciemniejszym odcieniu materiału.

- **Ramki metodą 9-slice.** Jeden mały sprite ramki (rogi + boki + środek) rozciąga
  się na dowolny rozmiar bez rozmycia rogów. Dzięki temu ta sama ramka obsłuży
  pasek życia, panel plecaka i okno opcji — i wszystko będzie wyglądać jak jeden
  przedmiot, a nie jak trzy różne.
- **Materiał: kute żelazo i ciemne drewno**, czyli rampy `iron`, `wood` i `soot`.
  Interfejs ma wyglądać, jakby był z tego samego świata co kuźnia.
- **Wypełnienia z rampy, nie z gradientu**: życie `goblin` → `ember` przy resztkach,
  uniki `stone` (puste) → `ember 4` (gotowe).
- **Bez wygładzania.** Wszystko na siatce pikseli, przy całkowitym powiększeniu.

### Pasek życia

Dwie warstwy, co już działa i zostaje: czerwona dogania szybko, jasna wolno — po
niej widać **wielkość ciosu**, a nie tylko ile zostało. Do tego dochodzi:

- kuta ramka z nitami zamiast prostokąta,
- **ząbkowany koniec** wypełnienia, żeby krawędź nie była linijką,
- liczba wewnątrz paska, mała, dla tych, którzy chcą policzyć.

### Uniki — trzy ładujące się znaczniki

Trzy romby pod paskiem życia. Pusty to sam obrys, pełny świeci. Ładujący się
**wypełnia się od dołu**, więc widać nie tylko ile jest, ale ile **zaraz** będzie —
to jest różnica między „mam jeden" a „za pół sekundy mam dwa", czyli dokładnie ta
informacja, na której opiera się decyzja o wejściu w zwarcie.

Zmiana w rozgrywce: dziś unik ma jeden odstęp czasowy. Ma mieć **trzy ładunki**,
każdy odnawiany osobno. Trzy pod rząd to ucieczka; wtedy przez chwilę nie masz nic
i to jest cena.

## Ekran startowy

Ma wyglądać jak wejście do gry, a nie jak formularz. Dziś jest formularzem.

```
        SZABROWNICY
     ─────────────────
      [ nick        ]
      [ hasło       ]

        [  GRAJ  ]

     opcje     sterowanie
```

- **Tło żyje**: świat widać za przyciemnieniem, ogień miga, deszcz pada. To już
  działa i jest najtańszym sposobem na pokazanie, że gra jest, zanim się wejdzie.
- **Opcje** przejmują suwaki głośności z rogu ekranu — w grze zostaje sam skrót
  klawiszowy. Panel miksera nad kanwą to zaszłość z czasów, gdy nie było gdzie go
  postawić.
- **Sterowanie** to plansza z układem klawiszy. Przy grze z myszką, unikiem
  i plecakiem-siatką nie da się już liczyć na to, że gracz zgadnie.
- Wersja klienta w rogu, drobnym drukiem — przydaje się przy zgłoszeniach.

## Kolejność wdrożenia

1. Generator ramek 9-slice i wspólny styl paneli (`tools/art/ui.js`).
2. Pasek życia w nowej ramce + trzy uniki jako ładunki (razem, bo dzielą blok).
3. Wskaźnik strefy i komunikat przy przekraczaniu bramy.
4. Ekran startowy z opcjami i sterowaniem.
5. Plecak — osobny, duży kawałek; wchodzi dopiero, gdy istnieją przedmioty.
