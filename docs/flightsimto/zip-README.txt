FS Addon Toolkit {VERSION}
Free Community add-on manager for Microsoft Flight Simulator 2024 and 2020
Design and development: redzikowski.com

==============================================================================
 WHAT'S INSIDE
==============================================================================

  {SETUP}   Windows installer
  README.txt{PAD}   this file

FS Addon Toolkit is a standalone Windows program.
Do NOT put it in your Community folder.

==============================================================================
 1. INSTALLATION
==============================================================================

Requirements: Windows 10 or 11 (64-bit), MSFS 2024 and/or 2020
(Steam or Microsoft Store). WebView2 is built into Windows 11; on
Windows 10 the installer downloads it if it is missing.

1. Run {SETUP} and follow the installer.
   If Windows SmartScreen warns about the file: More info -> Run anyway.
   The installer asks for administrator rights once, because it installs
   to Program Files. The program itself runs without them.
2. Start FS Addon Toolkit. Your simulator is detected automatically
   from UserCfg.opt.
3. In Settings, add the folders where you keep your add-ons as
   libraries. Links that already exist in Community (for example from
   MSFS Addons Linker) are picked up and offered automatically.
4. Switch add-ons on and off, then launch the sim straight from the
   toolkit.

==============================================================================
 2. HOW IT WORKS
==============================================================================

Your add-ons stay where they are, on any local drive. Enabling an add-on
creates a directory junction in Community that points to its folder.
Disabling it removes only that link: your files are never copied,
modified or deleted. Junctions do not need administrator rights.

Changes are blocked while the simulator is running, because MSFS reads
Community only at startup. Every batch of changes can be undone from
History or with Ctrl+Z.

==============================================================================
 3. UPDATES - YOU ONLY DOWNLOAD ONCE
==============================================================================

- The toolkit checks for a new version at startup. It shows what's new
  and installs the update over the current version (Windows asks for
  administrator rights for the installer).
- You can also check by hand: Settings -> Check for updates.
- Your settings, profiles and history stay where they are
  (%APPDATA%\com.blacksingularities.fsaddontoolkit).
- New versions are also posted on flightsim.to and on GitHub:
  https://github.com/BlackSingularities/FSaddonToolkit/releases

==============================================================================
 4. UNINSTALLING
==============================================================================

Windows Settings -> Apps -> FS Addon Toolkit -> Uninstall.
Links already created in Community stay in place and keep working.
To remove them first, disable the add-ons in the toolkit (or use
Light mode / an empty profile) before uninstalling.

==============================================================================
 5. FEEDBACK
==============================================================================

Bug reports and ideas: comments on flightsim.to, the "Report a problem
or suggest a feature" form in Settings, or an issue on GitHub.

  Website:     https://redzikowski.com/portfolio/fsaddontoolkit
  Source code: https://github.com/BlackSingularities/FSaddonToolkit (MIT)

Microsoft Flight Simulator is a trademark of Microsoft Corporation.
FS Addon Toolkit is an independent project and is not affiliated with
Microsoft or Asobo Studio. Airport database: OurAirports (public domain).


==============================================================================
 PO POLSKU
==============================================================================

Uruchom {SETUP}. Gdy SmartScreen ostrzega:
"Więcej informacji -> Uruchom mimo to". Instalator raz prosi o uprawnienia
administratora (instalacja do Program Files); sam program działa bez nich.

W Ustawieniach dodaj foldery z dodatkami jako biblioteki. Włączenie dodatku
tworzy w Community łącze (junction) do jego folderu, wyłączenie usuwa tylko
łącze - pliki nigdy nie są kopiowane ani kasowane. Nie wrzucaj programu do
folderu Community.

Aktualizacje: program sam sprawdza nowe wersje i instaluje je na miejscu
starej - ustawienia, profile i historia zostają. Pobierasz tylko raz.
Interfejs jest dostępny po polsku i po angielsku (Ustawienia).
