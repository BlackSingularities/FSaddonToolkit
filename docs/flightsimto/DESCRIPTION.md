# flightsim.to – listing

## Title

FS Addon Toolkit – Community Add-on Manager for MSFS 2024 & 2020

## Short description

Turn add-ons on and off with one click. Keep them on any drive, see every airport on a map, switch whole setups with profiles and prepare each flight with only the scenery you need. No copying, no admin rights.

## Tags

add-on manager, community folder, utility, tool, profiles, scenery, airports, MSFS 2024, MSFS 2020, SimBrief

---

## Description

**Your Community folder, finally under control.**

FS Addon Toolkit is a free, open-source add-on manager for Microsoft Flight Simulator 2024 and 2020 (Steam and Microsoft Store). Keep your add-ons on any drive, in as many libraries as you like, and decide with a single click what the simulator loads. Fewer active add-ons mean faster loading, less memory used and fewer conflicts, and nothing is ever copied or deleted along the way.

### How it works

Your add-ons stay where they are, for example `D:\Scenery Vault` or `H:\Add-ons`. When you enable one, the toolkit creates a **directory junction** in Community that points to its folder. When you disable it, only that link is removed and your files are never touched. Junctions work across local drives **without administrator rights**. For network drives you can switch to symbolic links.

On first launch the toolkit reads your existing links (for example from MSFS Addons Linker) and offers those folders as libraries, so you can switch over in under a minute.

### Features

**Add-on library**
- Thumbnail tiles or a compact table, with categories for aircraft, airports, scenery, liveries, utilities and object libraries
- Search by name, developer, ICAO code, city, country or your own tags
- Filter by state, source and favourites, multi-select with Ctrl/Shift and apply changes in bulk
- Liveries are matched to their aircraft: enabling an aircraft offers its liveries, and disabling it asks whether to disable them too
- Group airports by country, with flags and a single switch for a whole country

**Package details**
- Image gallery, aircraft variants from `aircraft.cfg`, an airport mini-map and liveries for this aircraft
- Dependencies (from `manifest.json` or added by you) and "required by" – enabling an add-on can enable its dependencies too, disabling warns when something still needs it, notes, tags, custom category, favourite and **lock** (a locked package is never disabled by bulk actions)
- A clear "library → link → Community" diagram, `manifest.json` and release notes

**Airport map**
- Every airport from your scenery on a world map, read directly from the BGL files. Names are matched against a built-in database of 78,000 airports.
- Enable or disable airports from the map, box-select a whole region and switch it on at once
- Dark, light, OpenStreetMap and satellite base maps

**Prepare a flight**
- Pick departure and arrival, then set a radius and an optional route corridor. Only the airport scenery near your route stays enabled, together with the aircraft you choose.
- **Load from SimBrief** (optional): one click imports your latest flight plan, including departure, destination and alternates, and selects the matching installed aircraft
- Save the result as a profile for next time

**Profiles and Light mode**
- Save complete add-on sets such as "Europe Airliner Ops", "Alps VFR" or "Bush Flying" and switch between them with one click
- Preview what will be enabled and disabled first, or use "Add" mode to enable without disabling anything
- Profiles can manage only selected categories (for example airports only), can include official content, and can be exported and imported as `.fsat-profile.json`
- **Light mode** disables everything except your locked essentials in one click

**Official content**
- Marketplace, DLC and streamed packages from `Content.xml` can be enabled or disabled like any other add-on
- A backup is created before every write (the last 20 are kept), and the file can be made read-only so the simulator does not overwrite it

**Health check**
- Finds broken links, packages unpacked one folder too deep (fixed with one click), folders without a manifest, archives left in Community, duplicates and multiple enabled copies, disabled or missing dependencies, conflicting sceneries for the same airport and unavailable libraries
- Rebuilds a missing `layout.json` the same way MSFSLayoutGenerator does

**Install and move**
- Install from ZIP, RAR and 7z archives (RAR and 7z through 7-Zip or Windows 11's built-in `tar`) or from folders, even by dragging them onto the window
- Detects packages hidden in subfolders and replaces older versions, sending the old ones to the Recycle Bin
- Move packages from Community to a library or between drives, with a progress bar. Enabled packages are linked again automatically.

**Safe by design**
- Every batch of changes can be undone from History or with Ctrl+Z
- Changes are blocked while the simulator is running
- Removed files go to the Recycle Bin instead of being permanently deleted, and files are saved atomically
- A link is only ever removed as a link: the toolkit refuses to delete a real folder in its place

**Quality of life**
- A dashboard with active add-ons, the size loaded into the sim, airports by country, developers, the largest add-ons, drive space and recent activity
- A "simulator running" indicator and a launch button for Steam and Microsoft Store
- Dark, light and AMOLED themes with five accent colours, and an English or Polish interface
- Keyboard shortcuts: `1`–`8` switch views, `Ctrl+F` search, `Ctrl+A` select all, `Ctrl+Z` undo, `F5` refresh, `Esc` close
- Built-in update check and a "Report a problem or suggest a feature" form

### Requirements

- Windows 10 or 11 (64-bit) with WebView2, which is built into Windows 11
- Microsoft Flight Simulator 2024 and/or 2020, Steam or Microsoft Store edition

### Installation

1. Download the archive and run the installer inside (`FSAddonToolkit_x.y.z_x64-setup.exe`). If SmartScreen warns about it, choose More info → Run anyway.
2. Start **FS Addon Toolkit**. Your simulator installation is detected automatically from `UserCfg.opt`.
3. In **Settings**, add the folders where you keep your add-ons as libraries. Existing links in Community are picked up and offered automatically.
4. Switch add-ons on and off, and launch the sim straight from the toolkit.

Do **not** put this tool in your Community folder. It is a standalone Windows application.

### FAQ

**Does it copy, move or modify my add-ons?**
No. Enabling and disabling only creates or removes a link in Community. Files are moved only when you choose "Move to library" yourself.

**Do I need to run it as administrator?**
No. Directory junctions do not need elevated rights.

**I already use another linker. Will it conflict?**
No. Existing links are recognised, and the folders they point to can be added as libraries in one click.

**Can I use it while the sim is running?**
You can browse, plan and build profiles at any time. Changes are blocked while MSFS is running, because the simulator only reads Community at startup.

### Feedback

Found a bug or have an idea? Use **Report a problem or suggest a feature** in the app’s Settings, or open an issue on GitHub. Every report is read.

- Website: https://redzikowski.com/portfolio/fsaddontoolkit
- Source code (MIT): https://github.com/BlackSingularities/FSaddonToolkit

*Microsoft Flight Simulator is a trademark of Microsoft Corporation. FS Addon Toolkit is an independent project and is not affiliated with Microsoft or Asobo Studio. The airport database comes from OurAirports (public domain).*

---

## Screenshot captions

| File | Caption |
| --- | --- |
| `01-addons.png` | Your whole add-on library at a glance: switch anything on or off with one click |
| `02-dashboard.png` | Dashboard: what is loaded, how much space it takes and what needs attention |
| `03-airport-details.png` | Package details: gallery, library-to-Community link, profiles and an airport mini-map |
| `04-aircraft-details.png` | Aircraft with their liveries: enable every livery at once |
| `05-map.png` | Every airport you own on one map, read straight from the scenery files |
| `06-prepare-flight.png` | Prepare a flight: import from SimBrief and keep only the scenery along your route |
| `07-profiles.png` | Profiles: switch complete setups with a preview of every change |
| `08-airports-by-country.png` | Airports grouped by country, with one switch per country |
| `09-health.png` | Health check: duplicates, missing dependencies and broken layouts, fixed in one click |
| `10-official.png` | Official Marketplace and DLC content, toggled safely with automatic backups |
| `11-light-list.png` | Light theme and compact table view |

*The screenshots use sample data: the add-on, developer and airline names are made up for the presentation.*
