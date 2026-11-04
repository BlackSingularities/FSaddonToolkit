# Zmiany

## 1.3.1

- Komunikat o nowej wersji bez listy zmian, linków i informacji, skąd pobierana jest aktualizacja.

## 1.3.0

- Nowy pulpit: kafelki z najważniejszymi liczbami (aktywne, ładowany rozmiar, lotniska i kraje, samoloty i malowania, źródła, problemy) oraz panele kategorii, bibliotek, profili, lotnisk wg krajów, twórców, największych dodatków, kondycji, dysków i ostatniej aktywności – wiersze prowadzą do przefiltrowanej listy.
- Flagi krajów przy kodach ICAO; wyszukiwanie także po nazwie kraju.
- Lotniska można grupować po krajach („Wg krajów”) – zwijane grupy z przełącznikiem całego kraju.
- Nowe kafelki dodatków: tytuł na zdjęciu, szklane etykiety, kolorowa kategoria, źródło i rozmiar w stopce.
- Odświeżony, bardziej zwarty interfejs: mniejsze paski i kontrolki, wyraźna aktywna zakładka, nowy przycisk uruchamiania symulatora.
- Podkład mapy wybiera się w ustawieniach.

## 1.2.1

- Start bez ponownego czytania całej bazy: pamięć podręczna skanu wczytuje się także po aktualizacji aplikacji (nowe pola nie unieważniają jej w całości), więc czytane są tylko nowe i zmienione dodatki.
- Raport problemów korzysta z właśnie zrobionego skanu zamiast skanować drugi raz.
- Odświeżanie (przycisk, F5) sprawdza tylko zmienione dodatki; pełny skan od nowa – Shift+F5 lub Shift+klik.

## 1.2.0

- Zakres profilu: profil może zarządzać tylko wybranymi kategoriami (np. same lotniska) – samolotów i reszty wtedy nie rusza.
- Malowania przy samolocie: przy włączaniu samolotu okno z jego malowaniami (miniatury, zaznacz wszystkie/żadne), przy wyłączaniu pytanie, czy wyłączyć też malowania; domyślne zachowanie w ustawieniach (pytaj / włączaj wszystkie / nie ruszaj).
- Kafelek malowania pokazuje, do którego samolotu należy.

## 1.1.0

- Miniatury na kafelkach nie znikają już po chwili.
- Samoloty i malowania rozpoznawane po modelu lotu (`flight_model.cfg` / `engines.cfg`); malowania powiązane z samolotami, licznik malowań na kafelku i lista w szczegółach z włączaniem wszystkich naraz.
- Motyw AMOLED (czarny).
- Nowy widok szczegółów: duże zdjęcie z nazwą, pasek miniatur, duży przełącznik, kafelki parametrów, schemat „biblioteka → łącze → Community”, tagi jako żetony.
- Mapa: każde lotnisko jako osobny punkt, zaznaczanie przeciągnięciem (tryb zaznaczania albo Shift), włączanie i wyłączanie zaznaczonych, „tylko te lotniska”; zmiana podkładu i przełączanie dodatków nie resetują widoku.

## 1.0.0 – pierwsze wydanie

- Włączanie i wyłączanie dodatków MSFS 2024 i 2020 (Steam i Microsoft Store) jednym kliknięciem.
- Biblioteki dodatków na dowolnych dyskach podpinane do Community połączeniami katalogów (bez uprawnień administratora); dowiązania symboliczne dla dysków sieciowych.
- Pakiety leżące bezpośrednio w Community wyłączane przeniesieniem do folderu obok (natychmiastowo, ten sam dysk).
- Wykrywanie bibliotek z istniejących łączy (np. MSFS Addons Linker) przy pierwszym uruchomieniu.
- Kategorie: samoloty, lotniska, sceneria, malowania, narzędzia, biblioteki obiektów; własna kategoria, tagi, notatki, ulubione i blokada.
- Miniatury z ContentInfo i samolotów, galeria, warianty z aircraft.cfg, zależności z manifestu.
- Lotniska odczytywane z plików BGL scenerii, wbudowana baza 78 tys. lotnisk (OurAirports), mapa z klastrami i przełączaniem z mapy.
- Przygotowanie lotu: tylko scenerie w promieniu od startu i celu (i opcjonalnie wzdłuż trasy) oraz wybrany samolot.
- Profile z podglądem zmian, trybem dodawania, eksportem i importem; tryb lekki.
- Pakiety oficjalne (Marketplace, DLC, zawartość strumieniowana) przełączane w Content.xml z kopiami zapasowymi i ochroną przed nadpisaniem.
- Kondycja: zerwane łącza, paczki w dodatkowym folderze, duplikaty, wyłączone zależności, konflikty lotnisk, brak layout.json (odtwarzanie jak MSFSLayoutGenerator).
- Instalacja z ZIP (oraz RAR i 7z przez 7-Zip lub tar z Windows 11) i z folderów, także przeciąganiem na okno.
- Przenoszenie pakietów między dyskami z postępem, historia operacji z cofaniem, kosz zamiast trwałego usuwania.
- Aktualizacje przez redzikowski.com, polski i angielski interfejs, motyw ciemny i jasny.
