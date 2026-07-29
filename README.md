# Szabrownicy — Kuźnia

Przeglądarkowa gra 2D w rzucie 3/4 z góry: gobliński świat, po którym można
biegać, spotykać innych graczy i rozmawiać. Docelowo lobby sklepu GoblinPC.

**Cała grafika i cały dźwięk powstają programistycznie.** W repozytorium nie ma
ani jednego rysunku zrobionego w edytorze ani jednego pliku audio. Kafle,
obiekty, postacie i font bitmapowy z polskimi znakami generuje `tools/art/`
(czysty Node, zero zależności, własny enkoder PNG na wbudowanym `zlib`). Muzyka,
ogień, wiatr i kroki są syntezowane w przeglądarce przez WebAudio — muzyka jako
moduł w stylu amigowego trackera, z instrumentami zbudowanymi z jednego cyklu
fali o długości 64 próbek.

## Uruchomienie

```bash
npm --prefix server install   # tylko raz
node server/src/index.js      # http://localhost:8080
```

Serwer deweloperski obserwuje katalog `client/` i sam przeładowuje przeglądarkę
po każdym zapisie pliku.

Regeneracja całej grafiki:

```bash
npm run art
```

Wynik ląduje w `client/assets/gen/` (commitowany, żeby wdrożenie nie wymagało
kroku budowania), a arkusze kontrolne do obejrzenia w `docs/preview/`.

## Sterowanie

| | |
|---|---|
| `WASD` / strzałki | ruch |
| `Shift` | bieg |
| `TAB` | zmiana wariantu goblina (tymczasowo, do czasu ekranu startowego) |
| `M` | cisza |
| `N` | włączenie i wyłączenie samej muzyki |

Suwaki głośności są w prawym górnym rogu.

## Dokumentacja

- [`docs/DESIGN.md`](docs/DESIGN.md) — projekt całości: świat, warstwy
  renderowania, protokół sieciowy, etapy budowy.
- [`CLAUDE.md`](CLAUDE.md) — zasady pracy nad projektem, konwencje grafiki
  i dźwięku oraz spis pułapek, na które już wdepnęliśmy.

## Stos

Phaser 3.80 z CDN bez kroku budowania po stronie klienta, Node z `express` i `ws`
po stronie serwera.
