# Teren za murami — zasady

Spisane przed generowaniem czegokolwiek, żeby dało się poprawiać regułę zamiast
gotowego lasu. Ustalenia z 2026-07-30.

## Problem, który to rozwiązuje

Plac i kuźnia powstały przez wpisywanie współrzędnych na oko. Efekt sam nazwał
użytkownik: **nic nie ma swojego miejsca**. Drzewo stoi tam, gdzie ktoś je
postawił, a nie dlatego, że coś je tam postawiło.

## Sześć zasad

**1. Warstwy, w kolejności. Każda ogranicza następną.**

To jest cała odpowiedź na „wygląda jak losowo rozrzucone". Rozrzut wygląda źle
nie dlatego, że jest losowy, tylko dlatego, że jest **jednorodny** — nic nie
zależy od niczego. Kolejność:

1. ukształtowanie: wysokość i woda,
2. biomy z wysokości i wilgotności,
3. **punkty charakterystyczne** — miejsca, które mają znaczenie,
4. **drogi łączące te punkty**,
5. gęstwiny i polany — nie równy posyp, tylko skupiska,
6. surowce, zależne od biomu,
7. ozdoby.

Drzewo z warstwy 5 stoi na skraju polany przy drodze z warstwy 4, w biomie
z warstwy 2. Dlatego nie wygląda na rzucone.

**2. Każdy obszar ma jeden punkt orientacyjny widoczny z daleka.**

Landmark to element, który **odstaje od otoczenia** i po którym gracz się
orientuje. Jeden na obszar, każdy inny: samotna skała, spalone drzewo, kamienny
krąg, most. Bez nich las jest labiryntem, w którym każde miejsce wygląda tak samo.

**3. Rozrzut przez próbkowanie z minimalnym odstępem, nie przez `random()`.**

Losowanie pozycji niezależnie daje kępki i pustki — i to jest ten wygląd, którego
użytkownik nie znosi. Próbkowanie z wymuszonym minimalnym odstępem (Poisson)
daje rozkład, który oko czyta jako naturalny. **Jedna funkcja, a rozwiązuje
połowę problemu.**

**4. Droga jest kręgosłupem, nie ozdobą.**

Powstaje przed obiektami i to ona decyduje, co gdzie stoi: wzdłuż niej rzeczy
są przetarte i wydeptane, dalej gęstsze i dziksze. Wyjście z miasta prowadzi na
drogę, a nie w losowy krzak.

**5. Kontrast prowadzi wzrok.**

Gracz patrzy na to, co odstaje kolorem, kształtem, światłem albo ruchem. Polana
w gęstym lesie przyciąga, bo jest jasna. Ciemne wejście do jaskini przyciąga,
bo jest czarne. To jest darmowe prowadzenie gracza — bez strzałek i znaczników.

**6. Punkty charakterystyczne muszą się różnić.**

Dwa obozy bandytów obok siebie to jeden obóz widziany dwa razy. Każdy punkt
odpowiada na inne pytanie: gdzie się schronić, co tu się stało, po co wracać.

## Układ na start

**Nie kontynent.** Miasto plus **trzy obszary**, po jednym za każdą bramą —
tyle, żeby dało się je obejrzeć w całości i poprawić.

| kierunek | obszar | landmark | surowiec |
|---|---|---|---|
| południe | las | spalone drzewo | drewno |
| zachód | skalisko | samotna iglica | kamień |
| wschód | mokradła | zatopiony wóz | zioła |

Drogi z trzech bram schodzą się przed miastem. Im dalej od bramy, tym rzadsze
ślady człowieka i gęstszy teren — to jest jedyny wskaźnik trudności, jakiego
potrzeba, i działa bez żadnej liczby na ekranie.

## Czego nie ma

- **minimapy** — cały pomysł to „nie wiadomo, co jest dalej",
- **znaczników zadań** — prowadzi kontrast i droga,
- **pięter i klifów** — skalna ściana jest nieprzechodnią granicą, kopalnia
  będzie wnętrzem za wejściem do jaskini.
