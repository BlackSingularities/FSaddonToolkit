//! FS Addon Toolkit – komendy dla interfejsu, zadania w tle i stan aplikacji.

mod airports;
mod bgl;
mod engine;
mod health;
mod install;
mod links;
mod official;
mod package;
mod sim;
mod store;
mod update;

use engine::{Cache, Journal, Layout, OpError, OpResult, Pkg, Scan};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use store::{Entry, Library, Op, Profile, Settings, Store};
use tauri::{AppHandle, Emitter, Manager, State};

struct AppState {
    store: Store,
    cache_dir: PathBuf,
    scan_cache: Mutex<Cache>,
    last: Mutex<Option<Scan>>,
    installs: Mutex<Vec<sim::Installation>>,
    /// Jedna operacja na plikach naraz – przełączanie, przenoszenie, instalacja.
    ops: Mutex<()>,
}

impl AppState {
    fn settings(&self) -> Settings {
        self.store.settings()
    }

    fn installation(&self, settings: &Settings) -> Option<sim::Installation> {
        let list = self.installs.lock().unwrap_or_else(|e| e.into_inner());
        list.iter().find(|i| i.id == settings.installation_id).or(list.first()).cloned()
    }

    fn layout(&self) -> Result<(Settings, Layout), String> {
        let s = self.settings();
        let inst = self.installation(&s);
        let l = Layout::new(&s, inst.as_ref())?;
        Ok((s, l))
    }

    fn rescan(&self) -> Result<Scan, String> {
        let (mut settings, layout) = self.layout()?;
        let mut cache = self.scan_cache.lock().unwrap_or_else(|e| e.into_inner());
        let scan = engine::scan(&layout, &settings, &mut cache);
        // Pakiety zewnętrzne zapamiętujemy, żeby po wyłączeniu nie zniknęły z listy.
        let mut changed = false;
        for p in scan.packages.iter().filter(|p| p.source == "external") {
            if !settings.external.iter().any(|e| links::norm(Path::new(e)) == links::norm(Path::new(&p.path))) {
                settings.external.push(p.path.clone());
                changed = true;
            }
        }
        if changed {
            let _ = self.store.save("settings.json", &settings);
        }
        let _ = self.store_cache(&cache);
        *self.last.lock().unwrap_or_else(|e| e.into_inner()) = Some(scan.clone());
        Ok(scan)
    }

    fn store_cache(&self, cache: &Cache) -> Result<(), String> {
        let data = serde_json::to_vec(cache).map_err(|e| e.to_string())?;
        store::write_atomic(&self.cache_dir.join("scan-cache.json"), &data)
    }

    fn current(&self) -> Result<Scan, String> {
        if let Some(s) = self.last.lock().unwrap_or_else(|e| e.into_inner()).clone() {
            return Ok(s);
        }
        self.rescan()
    }

    fn guard_sim(&self, settings: &Settings) -> Result<(), String> {
        if settings.block_while_running && sim::is_running() {
            return Err("Symulator jest uruchomiony – zmiany w dodatkach zadziałają dopiero po ponownym starcie, a przenoszenie folderów może się nie udać. Zamknij MSFS albo wyłącz blokadę w ustawieniach.".into());
        }
        Ok(())
    }
}

type St<'a> = State<'a, AppState>;

// ───────────────────────────── Informacje i ustawienia ─────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: String,
    install_kind: String,
    data_dir: String,
    airports: usize,
}

#[tauri::command]
fn app_info(state: St) -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION").into(),
        install_kind: update::install_kind().into(),
        data_dir: state.store.dir.to_string_lossy().into_owned(),
        airports: airports::count(),
    }
}

#[tauri::command]
fn get_settings(state: St) -> Settings {
    state.settings()
}

#[tauri::command]
fn save_settings(state: St, settings: Settings) -> Result<Settings, String> {
    let mut s = settings;
    s.libraries.retain(|l| !l.path.trim().is_empty());
    for l in s.libraries.iter_mut() {
        if l.id.is_empty() {
            l.id = store::new_id();
        }
        if l.name.trim().is_empty() {
            l.name = Path::new(&l.path).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| l.path.clone());
        }
    }
    s.meta.retain(|_, m| m.favorite || m.locked || !m.category.is_empty() || !m.tags.is_empty() || !m.note.is_empty());
    let old = state.settings();
    state.store.save("settings.json", &s)?;
    let layout_changed = old.libraries.iter().map(|l| &l.path).ne(s.libraries.iter().map(|l| &l.path))
        || old.custom_community != s.custom_community
        || old.installation_id != s.installation_id
        || old.parking != s.parking
        || old.target_community != s.target_community
        || old.meta.len() != s.meta.len()
        || old.meta.iter().any(|(k, v)| s.meta.get(k).map(|n| serde_json::to_string(n).ok() != serde_json::to_string(v).ok()).unwrap_or(true));
    if layout_changed {
        *state.last.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }
    Ok(s)
}

/// Sprawdza folder biblioteki zanim trafi do ustawień.
#[tauri::command]
fn check_library(state: St, path: String) -> Result<Library, String> {
    let p = PathBuf::from(path.trim());
    if !p.is_dir() {
        return Err("Ten folder nie istnieje".into());
    }
    let (settings, layout) = state.layout()?;
    let n = links::norm(&p);
    for c in &layout.communities {
        let cn = links::norm(c);
        if n == cn || n.starts_with(&format!("{cn}\\")) || cn.starts_with(&format!("{n}\\")) {
            return Err("Biblioteka nie może być folderem Community ani go zawierać – wybierz osobny folder (najlepiej na innym dysku)".into());
        }
    }
    if links::norm(&layout.parking) == n {
        return Err("To jest folder wyłączonych pakietów – wybierz inny".into());
    }
    for l in &settings.libraries {
        let ln = links::norm(Path::new(&l.path));
        if ln == n || n.starts_with(&format!("{ln}\\")) || ln.starts_with(&format!("{n}\\")) {
            return Err(format!("Ten folder pokrywa się z biblioteką „{}”", l.name));
        }
    }
    Ok(Library {
        id: store::new_id(),
        name: p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| path.clone()),
        path: links::clean(&p).to_string_lossy().into_owned(),
    })
}

#[tauri::command]
fn installations(state: St) -> Vec<sim::Installation> {
    let list = sim::detect();
    *state.installs.lock().unwrap_or_else(|e| e.into_inner()) = list.clone();
    list
}

// ───────────────────────────── Skan i przełączanie ─────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanOut {
    #[serde(flatten)]
    scan: Scan,
    installation: Option<sim::Installation>,
    sim_running: bool,
}

#[tauri::command]
async fn scan(app: AppHandle, force: bool) -> Result<ScanOut, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        if force {
            state.scan_cache.lock().unwrap_or_else(|e| e.into_inner()).entries.clear();
        }
        let settings = state.settings();
        let installation = state.installation(&settings);
        let scan = match state.rescan() {
            Ok(s) => s,
            Err(e) => Scan {
                packages: vec![],
                communities: vec![],
                target: String::new(),
                parking: String::new(),
                libraries: vec![],
                broken: vec![],
                strays: vec![],
                suggested_libraries: vec![],
                took_ms: 0,
                error: e,
            },
        };
        Ok(ScanOut { scan, installation, sim_running: sim::is_running() })
    })
    .await
    .map_err(|e| e.to_string())?
}

fn find<'a>(scan: &'a Scan, id: &str) -> Option<&'a Pkg> {
    scan.packages.iter().find(|p| p.id == id)
}

/// Włącza i wyłącza pakiety w jednej partii (jedna pozycja w historii, jedno „cofnij”).
fn apply(state: &AppState, enable: &[String], disable: &[String], label: &str) -> Result<OpResult, String> {
    let _lock = state.ops.lock().unwrap_or_else(|e| e.into_inner());
    let (settings, layout) = state.layout()?;
    state.guard_sim(&settings)?;
    let scan = state.rescan()?;
    let mut journal = Journal::new(label);
    let mut res = OpResult { batch: journal.batch.clone(), ..Default::default() };
    let err = |p: Option<&Pkg>, id: &str, message: String| OpError { id: id.into(), title: p.map(|p| p.info.title.clone()).unwrap_or_default(), message };
    // Najpierw wyłączanie – zwalnia nazwy w Community dla innych kopii.
    for id in disable {
        let Some(p) = find(&scan, id) else {
            res.errors.push(err(None, id, "Pakiet zniknął z dysku".into()));
            continue;
        };
        match engine::disable(&layout, p, &mut journal) {
            Ok(true) => res.changed += 1,
            Ok(false) => res.skipped += 1,
            Err(e) => res.errors.push(err(Some(p), id, e)),
        }
    }
    // Po wyłączeniach stan się zmienił – odświeżamy, żeby kontrola kopii widziała prawdę.
    let scan = if disable.is_empty() { scan } else { state.rescan()? };
    for id in enable {
        let Some(p) = find(&scan, id) else {
            res.errors.push(err(None, id, "Pakiet zniknął z dysku".into()));
            continue;
        };
        match engine::enable(&layout, &scan.packages, p, &mut journal) {
            Ok(true) => res.changed += 1,
            Ok(false) => res.skipped += 1,
            Err(e) => res.errors.push(err(Some(p), id, e)),
        }
    }
    state.store.append_journal(journal.entries);
    state.rescan()?;
    Ok(res)
}

#[tauri::command]
async fn set_enabled(app: AppHandle, ids: Vec<String>, enabled: bool, label: Option<String>) -> Result<OpResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let label = label.unwrap_or_else(|| if enabled { "Włączenie".into() } else { "Wyłączenie".into() });
        if enabled { apply(&state, &ids, &[], &label) } else { apply(&state, &[], &ids, &label) }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn apply_changes(app: AppHandle, enable: Vec<String>, disable: Vec<String>, label: String) -> Result<OpResult, String> {
    tauri::async_runtime::spawn_blocking(move || apply(&app.state::<AppState>(), &enable, &disable, &label)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn history(state: St) -> Vec<Entry> {
    let mut all = state.store.journal();
    all.reverse();
    all.truncate(1500);
    all
}

#[tauri::command]
async fn undo_batch(app: AppHandle, batch: String) -> Result<OpResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _lock = state.ops.lock().unwrap_or_else(|e| e.into_inner());
        let settings = state.settings();
        state.guard_sim(&settings)?;
        let mode = links::Mode::parse(&settings.link_mode);
        let mut all = state.store.journal();
        let mut res = OpResult { batch: batch.clone(), ..Default::default() };
        let mut official: HashMap<String, bool> = HashMap::new();
        for e in all.iter_mut().rev().filter(|e| e.batch == batch && !e.undone) {
            if let Op::Official { name, from, .. } = &e.op {
                official.insert(name.clone(), !(from.eq_ignore_ascii_case("UserDisabled") || from.eq_ignore_ascii_case("false")));
                e.undone = true;
                res.changed += 1;
                continue;
            }
            match engine::undo(&e.op, mode) {
                Ok(()) => {
                    e.undone = true;
                    res.changed += 1;
                }
                Err(m) => res.errors.push(OpError { id: String::new(), title: e.title.clone(), message: m }),
            }
        }
        if !official.is_empty() {
            if let Some(path) = state.installation(&settings).and_then(|i| i.content_xml) {
                official::set(Path::new(&path), &official, &state.store.dir.join("content-backups"))?;
            }
        }
        state.store.save("history.json", &all)?;
        state.rescan()?;
        Ok(res)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ───────────────────────────── Profile ─────────────────────────────

#[tauri::command]
fn get_profiles(state: St) -> Vec<Profile> {
    state.store.profiles()
}

#[tauri::command]
fn save_profiles(state: St, profiles: Vec<Profile>) -> Result<Vec<Profile>, String> {
    let mut list = profiles;
    for p in list.iter_mut() {
        if p.id.is_empty() {
            p.id = store::new_id();
            p.created = store::now();
        }
        if p.updated.is_empty() {
            p.updated = store::now();
        }
        p.packages.sort();
        p.packages.dedup();
    }
    state.store.save("profiles.json", &list)?;
    Ok(list)
}

#[tauri::command]
fn write_text(path: String, text: String) -> Result<(), String> {
    std::fs::write(&path, text).map_err(|e| format!("Zapis pliku: {e}"))
}

#[tauri::command]
fn read_text(path: String) -> Result<String, String> {
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > 20 * 1024 * 1024 {
        return Err("Plik jest za duży".into());
    }
    std::fs::read_to_string(&path).map_err(|e| format!("Odczyt pliku: {e}"))
}

// ───────────────────────────── Miniatury ─────────────────────────────

/// Miniatura w pamięci podręcznej (szerokość do 560 px). Małe pliki zwracamy bez zmian.
#[tauri::command]
async fn thumb(app: AppHandle, path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let src = PathBuf::from(&path);
        let meta = std::fs::metadata(&src).map_err(|e| e.to_string())?;
        if meta.len() < 160 * 1024 {
            return Ok(path);
        }
        let mtime = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
        let key = engine::id_of(Path::new(&format!("{path}|{}|{mtime}", meta.len())));
        let dir = app.state::<AppState>().cache_dir.join("thumbs");
        let out = dir.join(format!("{key}.jpg"));
        if out.exists() {
            return Ok(out.to_string_lossy().into_owned());
        }
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let img = image::open(&src).map_err(|e| format!("Miniatura: {e}"))?;
        let small = if img.width() > 560 { img.thumbnail(560, 560 * img.height() / img.width().max(1)) } else { img };
        small.to_rgb8().save_with_format(&out, image::ImageFormat::Jpeg).map_err(|e| format!("Miniatura: {e}"))?;
        Ok(out.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ───────────────────────────── Szczegóły pakietu ─────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Details {
    manifest: String,
    release_notes: String,
    dependents: Vec<String>,
}

#[tauri::command]
fn package_details(state: St, id: String) -> Result<Details, String> {
    let scan = state.current()?;
    let p = find(&scan, &id).ok_or("Nie ma takiego pakietu")?;
    let raw = std::fs::read_to_string(Path::new(&p.path).join("manifest.json")).unwrap_or_default();
    let v: serde_json::Value = serde_json::from_str(raw.trim_start_matches('\u{feff}')).unwrap_or_default();
    let mut notes = String::new();
    if let Some(n) = v.get("release_notes") {
        let pick = n.get("neutral").or_else(|| n.as_object().and_then(|o| o.values().next()));
        if let Some(obj) = pick.and_then(|x| x.as_object()) {
            for (k, val) in obj {
                if let Some(t) = val.as_str().filter(|t| !t.trim().is_empty()) {
                    notes.push_str(&format!("{k}: {}\n", t.trim()));
                }
            }
        }
    }
    let dependents = scan
        .packages
        .iter()
        .filter(|o| o.info.dependencies.iter().any(|d| d.name.eq_ignore_ascii_case(&p.key)))
        .map(|o| o.id.clone())
        .collect();
    Ok(Details { manifest: raw.chars().take(20_000).collect(), release_notes: notes, dependents })
}

#[tauri::command]
async fn generate_layout(app: AppHandle, id: String) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let scan = state.current()?;
        let p = find(&scan, &id).ok_or("Nie ma takiego pakietu")?;
        let n = package::generate_layout(Path::new(&p.path))?;
        state.rescan()?;
        Ok(n)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn trash_packages(app: AppHandle, ids: Vec<String>) -> Result<OpResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _lock = state.ops.lock().unwrap_or_else(|e| e.into_inner());
        let settings = state.settings();
        state.guard_sim(&settings)?;
        let scan = state.rescan()?;
        let mut res = OpResult::default();
        for id in &ids {
            let Some(p) = find(&scan, id) else { continue };
            if !p.link.is_empty() {
                if let Err(e) = links::remove(Path::new(&p.link)) {
                    res.errors.push(OpError { id: id.clone(), title: p.info.title.clone(), message: e });
                    continue;
                }
            }
            match trash::delete(&p.path) {
                Ok(()) => res.changed += 1,
                Err(e) => res.errors.push(OpError { id: id.clone(), title: p.info.title.clone(), message: format!("Kosz: {e}") }),
            }
        }
        state.rescan()?;
        Ok(res)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ───────────────────────────── Zadania w tle ─────────────────────────────

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct JobEvent {
    id: String,
    label: String,
    detail: String,
    done: u64,
    total: u64,
    step: usize,
    steps: usize,
    finished: bool,
    errors: Vec<String>,
    changed: usize,
}

struct Job {
    app: AppHandle,
    ev: JobEvent,
}

impl Job {
    fn new(app: &AppHandle, label: &str, steps: usize) -> Self {
        let ev = JobEvent { id: store::new_id(), label: label.into(), detail: String::new(), done: 0, total: 0, step: 0, steps, finished: false, errors: vec![], changed: 0 };
        Self { app: app.clone(), ev }
    }
    fn emit(&self) {
        let _ = self.app.emit("job", self.ev.clone());
    }
    fn step(&mut self, step: usize, detail: &str) {
        self.ev.step = step;
        self.ev.detail = detail.into();
        self.ev.done = 0;
        self.ev.total = 0;
        self.emit();
    }
    fn finish(mut self) {
        self.ev.finished = true;
        self.emit();
    }
}

#[tauri::command]
fn relocate(app: AppHandle, ids: Vec<String>, library_id: String) -> Result<String, String> {
    let state = app.state::<AppState>();
    let (settings, _) = state.layout()?;
    state.guard_sim(&settings)?;
    let lib = settings.libraries.iter().find(|l| l.id == library_id).cloned().ok_or("Nie ma takiej biblioteki")?;
    let mut job = Job::new(&app, &format!("Przenoszenie do „{}”", lib.name), ids.len());
    let id = job.ev.id.clone();
    std::thread::spawn(move || {
        let app = job.app.clone();
        let state = app.state::<AppState>();
        let _lock = state.ops.lock().unwrap_or_else(|e| e.into_inner());
        let res = (|| -> Result<(), String> {
            let (_, layout) = state.layout()?;
            let scan = state.rescan()?;
            let mut journal = Journal::new(&job.ev.label.clone());
            for (n, pid) in ids.iter().enumerate() {
                let Some(p) = find(&scan, pid) else { continue };
                job.step(n + 1, &p.info.title);
                let app = job.app.clone();
                let ev = job.ev.clone();
                let mut tick = |done: u64, total: u64| {
                    let mut e = ev.clone();
                    e.done = done;
                    e.total = total;
                    let _ = app.emit("job", e);
                };
                match engine::relocate(&layout, p, &lib, &mut journal, &mut tick) {
                    Ok(()) => job.ev.changed += 1,
                    Err(e) => job.ev.errors.push(format!("{}: {e}", p.info.title)),
                }
            }
            state.store.append_journal(journal.entries);
            state.rescan()?;
            Ok(())
        })();
        if let Err(e) = res {
            job.ev.errors.push(e);
        }
        job.finish();
    });
    Ok(id)
}

#[tauri::command]
fn install_addons(app: AppHandle, paths: Vec<String>, library_id: String, enable: bool, replace: bool) -> Result<String, String> {
    let state = app.state::<AppState>();
    let settings = state.settings();
    let lib = settings.libraries.iter().find(|l| l.id == library_id).cloned().ok_or("Najpierw dodaj bibliotekę dodatków w ustawieniach")?;
    let mut job = Job::new(&app, &format!("Instalacja do „{}”", lib.name), paths.len());
    let id = job.ev.id.clone();
    std::thread::spawn(move || {
        let app = job.app.clone();
        let state = app.state::<AppState>();
        let root = PathBuf::from(&lib.path);
        let mut installed = vec![];
        {
            let _lock = state.ops.lock().unwrap_or_else(|e| e.into_inner());
            for (n, path) in paths.iter().enumerate() {
                let p = PathBuf::from(path);
                job.step(n + 1, &p.file_name().unwrap_or_default().to_string_lossy());
                let mut errors = vec![];
                let app = job.app.clone();
                let ev = job.ev.clone();
                let mut tick = |done: u64, total: u64| {
                    let mut e = ev.clone();
                    e.done = done;
                    e.total = total;
                    let _ = app.emit("job", e);
                };
                let got = if p.is_dir() {
                    install::install_folder(&p, &root, replace, &mut errors, &mut tick)
                } else if install::is_archive(&p) {
                    install::install_archive(&p, &root, replace, &mut errors, &mut tick)
                } else {
                    errors.push(format!("{}: obsługiwane są foldery oraz archiwa ZIP, RAR i 7z", p.display()));
                    vec![]
                };
                job.ev.changed += got.len();
                job.ev.errors.extend(errors);
                installed.extend(got);
            }
        }
        if let Ok(scan) = state.rescan() {
            if enable && !installed.is_empty() {
                let ids: Vec<String> = installed.iter().map(|i| engine::id_of(Path::new(&i.path))).filter(|id| scan.packages.iter().any(|p| &p.id == id)).collect();
                match apply(&state, &ids, &[], "Instalacja") {
                    Ok(r) => job.ev.errors.extend(r.errors.into_iter().map(|e| format!("{}: {}", e.title, e.message))),
                    Err(e) => job.ev.errors.push(e),
                }
            }
        }
        job.finish();
    });
    Ok(id)
}

// ───────────────────────────── Kondycja ─────────────────────────────

fn official_names(state: &AppState) -> HashSet<String> {
    let settings = state.settings();
    let Some(inst) = state.installation(&settings) else { return HashSet::new() };
    let Some(path) = inst.content_xml else { return HashSet::new() };
    let text = std::fs::read_to_string(path).unwrap_or_default();
    let re = regex::Regex::new(r#"name="(?:fs\d\d-|communityfs\d\d-)?([^"]+)""#).unwrap();
    re.captures_iter(&text).map(|c| c[1].to_lowercase()).collect()
}

#[tauri::command]
async fn health(app: AppHandle) -> Result<Vec<health::Issue>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        // Raport tuż po skanie – bierzemy ostatni wynik zamiast skanować drugi raz.
        let scan = state.current()?;
        Ok(health::check(&scan, &official_names(&state)))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn fix_issue(app: AppHandle, fix: String, packages: Vec<String>, paths: Vec<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let (settings, layout) = state.layout()?;
        let msg = match fix.as_str() {
            "remove-link" => {
                let _lock = state.ops.lock().unwrap_or_else(|e| e.into_inner());
                for p in &paths {
                    links::remove(Path::new(p))?;
                }
                format!("Usunięto łącza: {}", paths.len())
            }
            "flatten" => {
                state.guard_sim(&settings)?;
                let _lock = state.ops.lock().unwrap_or_else(|e| e.into_inner());
                let mut n = 0;
                for p in &paths {
                    let wrapper = PathBuf::from(p);
                    let community = wrapper.parent().map(Path::to_path_buf).unwrap_or(layout.target.clone());
                    n += install::flatten(&wrapper, &community)?;
                }
                format!("Wyciągnięto pakiety: {n}")
            }
            "trash" => {
                for p in &paths {
                    if links::is_link(Path::new(p)) {
                        return Err("To jest łącze – użyj „Usuń łącze”".into());
                    }
                    trash::delete(p).map_err(|e| format!("Kosz: {e}"))?;
                }
                "Przeniesiono do kosza".into()
            }
            "enable" => {
                let r = apply(&state, &packages[..1.min(packages.len())], &[], "Włączenie zależności")?;
                r.errors.first().map(|e| e.message.clone()).map(Err).unwrap_or(Ok("Włączono zależność".to_string()))?
            }
            "layout" => {
                let scan = state.current()?;
                let mut n = 0;
                for id in &packages {
                    if let Some(p) = find(&scan, id) {
                        package::generate_layout(Path::new(&p.path))?;
                        n += 1;
                    }
                }
                format!("Odtworzono layout.json: {n}")
            }
            "disable-copies" => {
                // Zostaje kopia z biblioteki (albo pierwsza), pozostałe wyłączamy.
                let scan = state.current()?;
                let mut copies: Vec<&Pkg> = packages.iter().filter_map(|id| find(&scan, id)).filter(|p| p.enabled).collect();
                copies.sort_by_key(|p| (p.source != "library", p.source != "community"));
                let off: Vec<String> = copies.iter().skip(1).map(|p| p.id.clone()).collect();
                let r = apply(&state, &[], &off, "Usunięcie duplikatów")?;
                format!("Wyłączono kopie: {}", r.changed)
            }
            _ => return Err("Nieznana naprawa".into()),
        };
        state.rescan()?;
        Ok(msg)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ───────────────────────────── Pakiety oficjalne ─────────────────────────────

#[tauri::command]
async fn official_list(app: AppHandle) -> Result<official::OfficialList, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let settings = state.settings();
        let inst = state.installation(&settings).ok_or("Nie wykryto instalacji MSFS")?;
        let path = inst.content_xml.clone().ok_or("Nie znaleziono pliku Content.xml – uruchom symulator przynajmniej raz")?;
        let streamed = PathBuf::from(&inst.packages_path).join("StreamedPackages");
        official::list(Path::new(&path), &inst.official_dirs, Some(&streamed))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn official_set(state: St, changes: HashMap<String, bool>, label: Option<String>) -> Result<usize, String> {
    let settings = state.settings();
    state.guard_sim(&settings)?;
    let inst = state.installation(&settings).ok_or("Nie wykryto instalacji MSFS")?;
    let path = inst.content_xml.ok_or("Nie znaleziono pliku Content.xml")?;
    let done = official::set(Path::new(&path), &changes, &state.store.dir.join("content-backups"))?;
    let mut journal = Journal::new(&label.unwrap_or_else(|| "Pakiety oficjalne".into()));
    for (name, from, to) in &done {
        journal.push(name, Op::Official { name: name.clone(), from: from.clone(), to: to.clone() });
    }
    state.store.append_journal(journal.entries);
    Ok(done.len())
}

#[tauri::command]
fn official_readonly(state: St, readonly: bool) -> Result<(), String> {
    let settings = state.settings();
    let path = state.installation(&settings).and_then(|i| i.content_xml).ok_or("Nie znaleziono pliku Content.xml")?;
    official::set_readonly(Path::new(&path), readonly)
}

#[tauri::command]
fn official_backups(state: St) -> Vec<String> {
    official::backups(&state.store.dir.join("content-backups"))
}

#[tauri::command]
fn official_restore(state: St, backup: String) -> Result<(), String> {
    let settings = state.settings();
    state.guard_sim(&settings)?;
    let path = state.installation(&settings).and_then(|i| i.content_xml).ok_or("Nie znaleziono pliku Content.xml")?;
    official::restore(Path::new(&path), Path::new(&backup), &state.store.dir.join("content-backups"))
}

// ───────────────────────────── Symulator, lotniska ─────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SimStatus {
    running: bool,
    disks: Vec<sim::Disk>,
}

#[tauri::command]
async fn sim_status() -> SimStatus {
    tauri::async_runtime::spawn_blocking(|| SimStatus { running: sim::is_running(), disks: sim::disks() }).await.unwrap_or(SimStatus { running: false, disks: vec![] })
}

#[tauri::command]
fn launch_sim(state: St) -> Result<(), String> {
    let settings = state.settings();
    let inst = state.installation(&settings).ok_or("Nie wykryto instalacji MSFS")?;
    sim::launch(&inst.launch_uri)
}

#[tauri::command]
fn airport_search(query: String) -> Vec<airports::Airport> {
    airports::search(&query, 12)
}

// ───────────────────────────── Aktualizacje ─────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateInfo {
    available: bool,
    latest: String,
    url: String,
    download: Option<String>,
    notes: String,
    can_install: bool,
}

fn version_tuple(v: &str) -> Vec<u64> {
    v.trim_start_matches('v').split(['.', '-']).filter_map(|x| x.parse().ok()).collect()
}

const UPDATE_FEED: &str = "https://redzikowski.com/api/releases/repos/BlackSingularities/FSaddonToolkit/releases/latest";
const UPDATE_ASSETS: &str = "https://redzikowski.com/api/projects/fsaddontoolkit/asset/";

#[tauri::command]
async fn check_update() -> Result<UpdateInfo, String> {
    let client = reqwest::Client::builder()
        .user_agent(concat!("FSAddonToolkit/", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let r = client.get(UPDATE_FEED).send().await.map_err(|e| format!("Brak połączenia z redzikowski.com: {e}"))?;
    if !r.status().is_success() {
        return Err(format!("Serwer aktualizacji odpowiedział kodem {}", r.status()));
    }
    let v: serde_json::Value = r.json().await.map_err(|e| e.to_string())?;
    let tag = v.get("tag_name").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let kind = update::install_kind();
    let want = update::asset_suffix(kind);
    let download = v.get("assets").and_then(|a| a.as_array()).and_then(|a| {
        a.iter()
            .find(|x| x.get("name").and_then(|n| n.as_str()).map(|n| n.ends_with(want)).unwrap_or(false))
            .and_then(|x| x.get("browser_download_url").and_then(|u| u.as_str()).map(String::from))
    });
    Ok(UpdateInfo {
        available: version_tuple(&tag) > version_tuple(env!("CARGO_PKG_VERSION")),
        latest: tag,
        url: String::new(),
        notes: String::new(),
        can_install: matches!(kind, "portable" | "installed"),
        download,
    })
}

#[tauri::command]
async fn install_update(app: AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with(UPDATE_ASSETS) {
        return Err("Nieprawidłowy adres aktualizacji".into());
    }
    let run = update::install(&url).await?;
    std::process::Command::new(&run).spawn().map_err(|e| format!("Uruchomienie nowej wersji: {e}"))?;
    app.exit(0);
    Ok(())
}

// ───────────────────────────── Start ─────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data = app.path().app_data_dir().unwrap_or_else(|_| std::env::temp_dir().join("FSAddonToolkit"));
            let cache_dir = app.path().app_cache_dir().unwrap_or_else(|_| data.join("cache"));
            let _ = std::fs::create_dir_all(&cache_dir);
            let cache: Cache = std::fs::read(cache_dir.join("scan-cache.json")).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
            app.manage(AppState {
                store: Store::new(data),
                cache_dir,
                scan_cache: Mutex::new(cache),
                last: Mutex::new(None),
                installs: Mutex::new(sim::detect()),
                ops: Mutex::new(()),
            });
            update::cleanup_old();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            get_settings,
            save_settings,
            check_library,
            installations,
            scan,
            set_enabled,
            apply_changes,
            history,
            undo_batch,
            get_profiles,
            save_profiles,
            write_text,
            read_text,
            thumb,
            package_details,
            generate_layout,
            trash_packages,
            relocate,
            install_addons,
            health,
            fix_issue,
            official_list,
            official_set,
            official_readonly,
            official_backups,
            official_restore,
            sim_status,
            launch_sim,
            airport_search,
            check_update,
            install_update,
        ])
        .run(tauri::generate_context!())
        .expect("błąd uruchomienia aplikacji");
}
