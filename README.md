# FS Addon Toolkit

Menedżer dodatków **Community** dla **Microsoft Flight Simulator 2024** (i 2020) na Windows, napisany w **Rust + Tauri 2**.

Dodatki mogą leżeć na dowolnych dyskach – w folderze Community albo w **bibliotekach** (np. `H:\Dodatki`). Włączenie dodatku z biblioteki tworzy w Community **połączenie katalogu** (junction) do jego folderu, wyłączenie usuwa samo łącze. Pliki nie są kopiowane ani usuwane, a symulator widzi tylko to, co jest włączone – wczytuje się szybciej i zużywa mniej pamięci.

## Jak to działa

| Gdzie leży pakiet | Włączenie | Wyłączenie |
| --- | --- | --- |
| Biblioteka (dowolny dysk) | łącze `Community\pakiet` → `Biblioteka\pakiet` | usunięcie łącza |
| Bezpośrednio w Community | – (jest włączony) | przeniesienie do `Community (wyłączone)` obok, ten sam dysk |
| Łącze z innego narzędzia | – | usunięcie łącza, pakiet zostaje zapamiętany |

- Połączenia katalogów działają **bez uprawnień administratora** i między dyskami lokalnymi. Dla dysków sieciowych można przełączyć tryb na dowiązania symboliczne (wymaga trybu dewelopera Windows).
- Łącza są usuwane zawsze jako łącza – aplikacja odmawia usunięcia zwykłego folderu w miejscu łącza.
- Przy pierwszym uruchomieniu aplikacja sprawdza, dokąd prowadzą istniejące łącza w Community (np. z MSFS Addons Linker), i proponuje te foldery jako biblioteki.
- Instalacja jest wykrywana z `UserCfg.opt` (`InstalledPackagesPath`) dla Steam i Microsoft Store; MSFS 2024 czyta także `Community2024`.

## Funkcje

- **Dodatki** – kafelki z miniaturami albo tabela; kategorie: samoloty, lotniska, sceneria, malowania, narzędzia, biblioteki obiektów; filtry stanu, źródła i ulubionych; wyszukiwanie po nazwie, twórcy, ICAO, mieście i tagach; zaznaczanie z Ctrl/Shift i operacje grupowe.
- **Szczegóły pakietu** – galeria miniatur (ContentInfo, malowania), warianty z `aircraft.cfg`, lotniska z mini-mapą, zależności i „wymagany przez”, notatki, tagi, własna kategoria, ulubione i blokada, `manifest.json`, informacje o wydaniu.
- **Mapa** – lotniska odczytane z plików BGL scenerii (rekordy lotnisk), dla pozostałych kod odgadnięty z nazwy paczki i współrzędne z wbudowanej bazy 78 tys. lotnisk (OurAirports). Klastry, przełączanie z dymka, włącz/wyłącz wszystko w widoku, podkład ciemny, jasny, OSM i satelitarny.
- **Przygotuj lot** – start, cel, promień i korytarz trasy: włączone zostają tylko scenerie lotnisk w pobliżu (oraz wybrany samolot), reszta lotnisk jest wyłączana. Wynik można zapisać jako profil.
- **Profile** – zapamiętane zestawy dodatków z podglądem zmian przed zastosowaniem, trybem „tylko dodaj”, aktualizacją z bieżącego stanu, eksportem i importem (`.fsat-profile.json`), opcjonalnie ze stanem pakietów oficjalnych.
- **Tryb lekki** – wyłącza wszystko poza zablokowanymi pakietami.
- **Oficjalne** – pakiety Marketplace, DLC i zawartość strumieniowana z `Content.xml` (`Activated` / `UserDisabled`). Zmieniane są tylko konkretne atrybuty, przed każdym zapisem powstaje kopia zapasowa (20 ostatnich), plik można zabezpieczyć przed nadpisaniem przez symulator.
- **Kondycja** – zerwane łącza, paczki rozpakowane w dodatkowym folderze (wyciąganie jednym kliknięciem), foldery bez manifestu, archiwa w Community, duplikaty i kilka włączonych kopii, wyłączone lub brakujące zależności, konflikty tego samego lotniska, brak `layout.json` (odtwarzanie jak MSFSLayoutGenerator), niedostępne biblioteki.
- **Instalacja** – archiwa ZIP (natywnie), RAR i 7z (7-Zip albo `tar.exe` z Windows 11) oraz foldery, także przez przeciągnięcie na okno; wykrywanie pakietów schowanych w podfolderach, zastępowanie starszych wersji (stare trafiają do kosza).
- **Przenoszenie** – pakiety z Community do biblioteki albo między dyskami z paskiem postępu; włączone pakiety po przeniesieniu są podpinane z powrotem.
- **Historia** – każdą partię zmian (włączenia, wyłączenia, przeniesienia, pakiety oficjalne) można cofnąć, także skrótem Ctrl+Z.
- **Bezpieczeństwo** – blokada zmian przy uruchomionym symulatorze, kosz zamiast trwałego usuwania, atomowe zapisy plików.
- Wskaźnik działania symulatora i przycisk uruchomienia (Steam / Microsoft Store), wolne miejsce na dyskach, motyw ciemny i jasny z pięcioma akcentami, interfejs polski i angielski.

### Skróty

`1`–`8` widoki · `Ctrl+F` szukaj · `Ctrl+A` zaznacz wszystko · `Ctrl+Z` cofnij · `F5` odśwież · `Esc` zamknij

## Pobieranie i aktualizacje

Instalator, MSI i wersja przenośna są dostępne na [redzikowski.com/portfolio/fsaddontoolkit](https://redzikowski.com/portfolio/fsaddontoolkit) i w [wydaniach na GitHubie](https://github.com/BlackSingularities/FSaddonToolkit/releases). Aplikacja sama sprawdza nowe wersje przez `redzikowski.com/api/github/repos/BlackSingularities/FSaddonToolkit/releases/latest` i podmienia instalację albo plik przenośny.

Wymagania: Windows 10 lub 11 x64 z WebView2 (w Windows 11 jest wbudowany).

## Budowanie

```bash
npm ci
npx tauri dev      # uruchomienie z podglądem zmian
npx tauri build    # instalatory w src-tauri/target/release/bundle
```

Testy:

```bash
cd src-tauri && cargo test
```

Test skanu prawdziwej instalacji (tylko odczyt):

```bash
cd src-tauri && FSAT_LIB="H:\Dodatki" cargo test --release real_scan -- --ignored --nocapture
```

Biblioteki interfejsu (Leaflet, MarkerCluster, ikony Lucide) są skopiowane do `ui/vendor` i `ui/icons.js` skryptem `npm run vendor`. Bazę lotnisk odświeża `python scripts/build-airports.py`.

Nowe wydanie powstaje wyłącznie po wypchnięciu tagu wersji (`v1.2.3`) – workflow `.github/workflows/build.yml` buduje instalator NSIS, MSI i wersję przenośną.

## Struktura

| Plik | Zawartość |
| --- | --- |
| `src-tauri/src/sim.rs` | wykrywanie instalacji, `UserCfg.opt`, `Content.xml`, proces symulatora, dyski |
| `src-tauri/src/links.rs` | połączenia katalogów i dowiązania, bezpieczne usuwanie łączy |
| `src-tauri/src/package.rs` | odczyt pakietu: manifest, layout, miniatury, warianty, kategoria, generator `layout.json` |
| `src-tauri/src/bgl.rs` | rekordy lotnisk z plików BGL |
| `src-tauri/src/airports.rs` | wbudowana baza lotnisk i odgadywanie kodów z nazw |
| `src-tauri/src/engine.rs` | skan, włączanie, wyłączanie, przenoszenie, cofanie |
| `src-tauri/src/official.rs` | pakiety oficjalne w `Content.xml` |
| `src-tauri/src/health.rs` | kontrola kondycji |
| `src-tauri/src/install.rs` | instalacja z archiwów i folderów |
| `src-tauri/src/store.rs` | ustawienia, profile, historia (zapisy atomowe) |
| `ui/` | interfejs (HTML, CSS, JavaScript bez bundlera) |

## Licencja

MIT. Baza lotnisk: [OurAirports](https://ourairports.com/data/) (domena publiczna). Mapa: Leaflet (BSD-2), MarkerCluster (MIT), podkłady Esri i OpenStreetMap. Ikony: Lucide (ISC).

Microsoft Flight Simulator jest znakiem towarowym Microsoft Corporation. Projekt nie jest powiązany z Microsoft ani Asobo Studio.
