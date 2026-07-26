# Szabrownicy

Prosta, śmieszna, klimatyczna (fantasy/gobliński kowal) gra przeglądarkowa typu **extraction** (jak Arc Raiders / Dark and Darker, tylko prościej) — ma być podpięta pod sklep GoblinPC, tak żeby klienci/fani mogli wejść "na chwilę" się poszwendać, kogoś obrobić z łupu i wyjść. To osobny, nowy projekt — **nie** kontynuacja `C:\Users\Goblin\Documents\Nibylandia` (tamten był w Godocie, multiplayer top-down survival; ten pomysł go zastąpił po burzy mózgów).

## Jak pracujemy

- Użytkownik (Goblin) nie rysuje już grafik ani nie babra się w edytorach — całą robotę (kod, decyzje techniczne, budowanie, wdrażanie) robi Claude. Rozmawiają po polsku.
- Design gry powstaje przez rozmowę/rzucanie pomysłów, nie przez jednorazowe zlecenie — użytkownik lubi być pytany o kierunek (ankiety przez `AskUserQuestion`) zanim padnie duża decyzja architektoniczna, ale ufa osądowi Claude'a co do wykonalności/tempa budowy.
- **Buduj etapami, waliduj zanim inwestujesz głębiej.** Nie budować od razu pełnego zakresu (crafting, wizualny hub, potwory, prawdziwy generator map) — najpierw sama pętla rozgrywki, potem rozbudowa tylko tam, gdzie widać że ludzie wracają.
- Assety graficzne: gotowe pakiety w `client/assets/` (źródło: `Nibylandia/art/Tiny Swords (Free Pack)`, faction "Black" jako wygląd gracza/gobliego klanu). Zero nowej grafiki do rysowania.

## Koncepcja gry (ustalona na burzy mózgów)

Rdzeń: **strach przed utratą łupu**, nie czysty PvP. Gracz wychodzi z bezpiecznego miejsca po surowce, ryzykuje że ktoś go trafi i obrobi z niesionego (jeszcze niezbankowanego) łupu zanim zdąży się wydostać. Trafienie = upuszczenie łupu na ziemię, **nie śmierć/nie respawn** — ofiara dostaje odrzut + chwilową nietykalność i gra dalej.

Struktura (docelowa, budowana etapami):
1. **Dom gracza** — prywatny ekran/instancja gracza z przyciskiem "Idź na wyprawę". Docelowo (Faza 2+) tu żyje piec/warsztat do rozbudowanego craftingu (przetop rudy → sztabki → broń/zbroja).
2. **Mapa wyprawy (raid)** — jedna wspólna, stale żywa mapa (wszyscy na wyprawie widzą się nawzajem live, nie osobne instancje per grupa). Zbierasz surowce (drewno/złoto/mięso/rzadkie), presja = inni gracze PvP + **rotujące punkty wyjścia** (otwarte przez losowy czas, zamykają się, otwierają się gdzie indziej). Wyjście wymaga kanałowania (stania) w otwartym punkcie przez kilka sekund — przerywa je trafienie.
3. **Hub społecznościowy** (Faza 3, jeszcze nie budowany) — wspólny plac, widać innych graczy i **z zewnątrz** ich rosnące domy, ale wnętrze domu to prywatna instancja właściciela. Cel: pogodzić "widzę wszystkich na żywo" z prywatną bazą.
4. **Potwory/PvE na mapie wyprawy** (Faza 4) — dodatkowa presja obok graczy, jeszcze nie zaimplementowane.
5. **Prawdziwy proceduralny generator map** (Faza 5, opcjonalnie) — na razie świadomie NIE budowany (ryzykowne, czasochłonne); zamiast tego jedna dopracowana mapa + losowość z rotacji zasobów/punktów wyjścia. Jeśli gra się przyjmie, można dobudować pulę/generator układów.

## Stan implementacji (Faza 1)

- **Serwer:** `server/src/index.js` — Node + `ws` + `express` (serwuje też statyczne pliki klienta z tego samego portu). Autorytatywny: pozycje, zbieranie zasobów, walka/upuszczanie łupu, rotacja punktów wyjścia, kanałowanie ekstrakcji, trwały schowek per token (`server/data/stashes.json`, gitignored).
- **Klient:** `client/` — czysty Phaser 3 (CDN, brak build stepu). `index.html` = ekran domu (DOM) + kontener na Phaser. `src/main.js` = cała logika: WebSocket, ekran domu, `RaidScene` (ruch WASD/strzałki, atak spacja/klik, rendering graczy/zasobów/łupu/punktów wyjścia, pasek kanałowania).
- Tożsamość gracza: losowy token w `localStorage` (ten sam wzorzec co w projekcie Goblin/Nibylandia) — **uwaga:** localStorage jest wspólny między kartami tej samej przeglądarki, więc do testów z dwiema różnymi tożsamościami trzeba użyć innej przeglądarki/okna incognito.
- Brak jeszcze: craftingu, wizualnego hubu, potworów, muzyki/dźwięków, ekranu logowania/nazwy poza prostym polem tekstowym.

## Uruchamianie lokalnie

```bash
cd server
npm install   # tylko raz
npm start     # http://localhost:8080
```

## Deploy (do ustalenia, jeszcze nie zrobione)

Nie kopiować jeszcze wzorca z Nibylandii 1:1 — tam serwer był binarką Godota. Tu serwer to zwykły proces Node, więc deploy będzie prostszy (np. ten sam VPS `51.83.134.101`, PM2/systemd, nowy port + subdomena, Caddy reverse proxy — analogicznie do wzorca z Nibylandii/Goblina co do domeny i Caddy, ale bez kroku "eksport Godota"). Ustalić z użytkownikiem konkretną subdomenę/port dopiero gdy Faza 1 będzie grywalna i wart wdrożenia.
