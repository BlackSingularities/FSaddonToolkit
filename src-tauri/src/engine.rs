//! Silnik: skan folderów Community i bibliotek, łączenie stanów w jedną listę pakietów,
//! włączanie i wyłączanie, przenoszenie do bibliotek i cofanie operacji.
//!
//! Model:
//! - **biblioteka** – dowolny folder (także na innym dysku) z pakietami; pakiet z biblioteki
//!   jest włączony, gdy w Community jest łącze do jego folderu,
//! - **Community** – pakiety leżące tu bezpośrednio są włączone; wyłączenie przenosi je
//!   do folderu wyłączonych obok Community (ten sam dysk, więc to tylko zmiana nazwy),
//! - **zewnętrzne** – łącza w Community wskazujące poza znane biblioteki (np. z innych
//!   narzędzi); pamiętamy je, żeby po wyłączeniu nie zniknęły z listy.

use crate::links::{self, Mode};
use crate::package::{self, PackageInfo};
use crate::sim::Installation;
use crate::store::{Entry, Library, Op, PackageMeta, Settings};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pkg {
    pub id: String,
    /// Nazwa folderu małymi literami – tak symulator rozpoznaje pakiet; klucz profili.
    pub key: String,
    pub folder: String,
    pub path: String,
    /// "community" | "library" | "parking" | "external"
    pub source: String,
    pub library_id: String,
    pub library_name: String,
    /// Podfolder biblioteki (np. „Samoloty”), gdy pakiety są w niej pogrupowane.
    pub group: String,
    pub enabled: bool,
    /// Łącze w Community, przez które pakiet jest włączony.
    pub link: String,
    #[serde(flatten)]
    pub info: PackageInfo,
    pub meta: PackageMeta,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Broken {
    pub link: String,
    pub target: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stray {
    pub path: String,
    /// "folder" – folder bez manifestu, "archive" – archiwum, "file" – inny plik.
    pub kind: String,
    /// Pakiety znalezione głębiej (źle rozpakowane archiwum).
    pub nested: Vec<String>,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibStat {
    pub id: String,
    pub name: String,
    pub path: String,
    pub exists: bool,
    pub count: usize,
    pub enabled: usize,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Scan {
    pub packages: Vec<Pkg>,
    pub communities: Vec<String>,
    pub target: String,
    pub parking: String,
    pub libraries: Vec<LibStat>,
    pub broken: Vec<Broken>,
    pub strays: Vec<Stray>,
    /// Foldery, do których prowadzą łącza w Community, a których nie ma na liście bibliotek.
    pub suggested_libraries: Vec<SuggestedLibrary>,
    pub took_ms: u64,
    pub error: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestedLibrary {
    pub path: String,
    pub links: usize,
    pub packages: usize,
}

#[derive(Debug, Clone)]
pub struct Layout {
    pub communities: Vec<PathBuf>,
    pub target: PathBuf,
    pub parking: PathBuf,
    pub libraries: Vec<Library>,
    pub mode: Mode,
}

impl Layout {
    pub fn new(settings: &Settings, inst: Option<&Installation>) -> Result<Self, String> {
        let communities: Vec<PathBuf> = if !settings.custom_community.trim().is_empty() {
            vec![PathBuf::from(settings.custom_community.trim())]
        } else if let Some(i) = inst {
            i.communities.iter().map(PathBuf::from).collect()
        } else {
            return Err("Nie znaleziono instalacji Microsoft Flight Simulator. Wskaż folder Community w ustawieniach.".into());
        };
        let target = communities
            .iter()
            .find(|c| !settings.target_community.is_empty() && links::norm(c) == links::norm(Path::new(&settings.target_community)))
            .or(communities.first())
            .cloned()
            .ok_or("Brak folderu Community")?;
        let parking = if settings.parking.trim().is_empty() {
            target.parent().map(|p| p.join("Community (wyłączone)")).unwrap_or_else(|| target.join("..").join("Community (wyłączone)"))
        } else {
            PathBuf::from(settings.parking.trim())
        };
        Ok(Self { communities, target, parking, libraries: settings.libraries.clone(), mode: Mode::parse(&settings.link_mode) })
    }
}

/// Krótki, stały identyfikator z kanonicznej ścieżki (FNV-1a).
pub fn id_of(path: &Path) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in links::norm(path).bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    format!("{h:016x}")
}

fn folder_of(path: &Path) -> String {
    path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

/// Podbijane przy zmianie sposobu odczytu pakietów – stara pamięć podręczna jest wtedy pomijana.
pub const CACHE_VERSION: u32 = 4;

#[derive(Default, Serialize, Deserialize)]
pub struct Cache {
    #[serde(default)]
    pub version: u32,
    pub entries: HashMap<String, (u64, PackageInfo)>,
}

struct Candidate {
    path: PathBuf,
    source: &'static str,
    library: Option<Library>,
    group: String,
    link: Option<PathBuf>,
}

fn dir_size(path: &Path) -> u64 {
    walkdir::WalkDir::new(path).into_iter().filter_map(Result::ok).filter(|e| e.file_type().is_file()).filter_map(|e| e.metadata().ok()).map(|m| m.len()).sum()
}

pub fn scan(layout: &Layout, settings: &Settings, cache: &mut Cache) -> Scan {
    let started = std::time::Instant::now();
    if cache.version != CACHE_VERSION {
        *cache = Cache { version: CACHE_VERSION, ..Default::default() };
    }
    let mut cands: Vec<Candidate> = vec![];
    let mut by_path: HashMap<String, usize> = HashMap::new();
    let mut lib_stats: Vec<LibStat> = vec![];

    for lib in &layout.libraries {
        let root = PathBuf::from(&lib.path);
        let exists = root.is_dir();
        lib_stats.push(LibStat { id: lib.id.clone(), name: lib.name.clone(), path: lib.path.clone(), exists, count: 0, enabled: 0, size: 0 });
        if !exists {
            continue;
        }
        for p in package::find_packages(&root, 3) {
            let n = links::norm(&p);
            if by_path.contains_key(&n) {
                continue;
            }
            let group = p.parent().and_then(|g| g.strip_prefix(&root).ok()).map(|g| g.to_string_lossy().into_owned()).unwrap_or_default();
            by_path.insert(n, cands.len());
            cands.push(Candidate { path: p, source: "library", library: Some(lib.clone()), group, link: None });
        }
    }
    if layout.parking.is_dir() {
        for p in package::find_packages(&layout.parking, 1) {
            let n = links::norm(&p);
            if by_path.contains_key(&n) {
                continue;
            }
            by_path.insert(n, cands.len());
            cands.push(Candidate { path: p, source: "parking", library: None, group: String::new(), link: None });
        }
    }

    let mut broken = vec![];
    let mut strays = vec![];
    let mut suggested: HashMap<String, (PathBuf, usize)> = HashMap::new();
    for community in &layout.communities {
        let Ok(rd) = std::fs::read_dir(community) else { continue };
        for e in rd.flatten() {
            let path = e.path();
            if let Some(target) = links::target(&path) {
                if !target.is_dir() {
                    broken.push(Broken { link: path.to_string_lossy().into_owned(), target: target.to_string_lossy().into_owned() });
                    continue;
                }
                let n = links::norm(&target);
                if let Some(&i) = by_path.get(&n) {
                    cands[i].link = Some(path);
                    continue;
                }
                if let Some(parent) = target.parent() {
                    let entry = suggested.entry(links::norm(parent)).or_insert((parent.to_path_buf(), 0));
                    entry.1 += 1;
                }
                by_path.insert(n, cands.len());
                cands.push(Candidate { path: target, source: "external", library: None, group: String::new(), link: Some(path) });
                continue;
            }
            let Ok(ft) = e.file_type() else { continue };
            if ft.is_dir() {
                if package::is_package(&path) {
                    by_path.insert(links::norm(&path), cands.len());
                    cands.push(Candidate { path: path.clone(), source: "community", library: None, group: String::new(), link: None });
                } else {
                    let nested = package::find_packages(&path, 4).into_iter().map(|p| p.to_string_lossy().into_owned()).collect();
                    strays.push(Stray { size: 0, path: path.to_string_lossy().into_owned(), kind: "folder".into(), nested });
                }
            } else if ft.is_file() {
                let lower = path.to_string_lossy().to_lowercase();
                let kind = if [".zip", ".rar", ".7z"].iter().any(|x| lower.ends_with(x)) { "archive" } else { "file" };
                let size = e.metadata().map(|m| m.len()).unwrap_or(0);
                strays.push(Stray { path: path.to_string_lossy().into_owned(), kind: kind.into(), nested: vec![], size });
            }
        }
    }
    for s in strays.iter_mut().filter(|s| s.kind == "folder") {
        s.size = dir_size(Path::new(&s.path));
    }
    for ext in &settings.external {
        let p = PathBuf::from(ext);
        let n = links::norm(&p);
        if by_path.contains_key(&n) || !package::is_package(&p) {
            continue;
        }
        by_path.insert(n, cands.len());
        cands.push(Candidate { path: p, source: "external", library: None, group: String::new(), link: None });
    }

    // Odczyt pakietów równolegle; z pamięci podręcznej, gdy znacznik zmian się zgadza.
    let infos: Vec<(String, u64, Option<PackageInfo>)> = cands
        .par_iter()
        .map(|c| {
            let n = links::norm(&c.path);
            let st = package::stamp(&c.path);
            match cache.entries.get(&n) {
                Some((s, info)) if *s == st => (n, st, Some(info.clone())),
                _ => (n, st, None),
            }
        })
        .collect();
    let fresh: Vec<(String, u64, PackageInfo)> = infos
        .par_iter()
        .zip(cands.par_iter())
        .filter(|((_, _, cached), _)| cached.is_none())
        .map(|((n, st, _), c)| (n.clone(), *st, package::read(&c.path)))
        .collect();
    for (n, st, info) in fresh {
        cache.entries.insert(n, (st, info));
    }
    let live: HashSet<String> = infos.iter().map(|(n, _, _)| n.clone()).collect();
    cache.entries.retain(|k, _| live.contains(k));

    let mut packages: Vec<Pkg> = cands
        .iter()
        .map(|c| {
            let n = links::norm(&c.path);
            let info = cache.entries.get(&n).map(|(_, i)| i.clone()).unwrap_or_default();
            let folder = folder_of(&c.path);
            let key = folder.to_lowercase();
            let enabled = c.source == "community" || c.link.is_some();
            Pkg {
                id: id_of(&c.path),
                meta: settings.meta.get(&key).cloned().unwrap_or_default(),
                key,
                folder,
                path: c.path.to_string_lossy().into_owned(),
                source: c.source.into(),
                library_id: c.library.as_ref().map(|l| l.id.clone()).unwrap_or_default(),
                library_name: c.library.as_ref().map(|l| l.name.clone()).unwrap_or_default(),
                group: c.group.clone(),
                enabled,
                link: c.link.as_ref().map(|l| l.to_string_lossy().into_owned()).unwrap_or_default(),
                info,
            }
        })
        .collect();
    packages.sort_by_cached_key(|p| p.info.title.to_lowercase());

    for stat in lib_stats.iter_mut() {
        for p in packages.iter().filter(|p| p.library_id == stat.id) {
            stat.count += 1;
            stat.size += p.info.size;
            stat.enabled += p.enabled as usize;
        }
    }
    let known: HashSet<String> = layout.libraries.iter().map(|l| links::norm(Path::new(&l.path))).collect();
    let mut suggested_libraries: Vec<SuggestedLibrary> = suggested
        .into_iter()
        .filter(|(n, _)| !known.contains(n))
        .map(|(_, (p, links))| SuggestedLibrary {
            packages: std::fs::read_dir(&p).map(|rd| rd.flatten().filter(|e| package::is_package(&e.path())).count()).unwrap_or(0),
            path: p.to_string_lossy().into_owned(),
            links,
        })
        .collect();
    suggested_libraries.sort_by_key(|s| std::cmp::Reverse(s.links));

    Scan {
        packages,
        communities: layout.communities.iter().map(|c| c.to_string_lossy().into_owned()).collect(),
        target: layout.target.to_string_lossy().into_owned(),
        parking: layout.parking.to_string_lossy().into_owned(),
        libraries: lib_stats,
        broken,
        strays,
        suggested_libraries,
        took_ms: started.elapsed().as_millis() as u64,
        error: String::new(),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpError {
    pub id: String,
    pub title: String,
    pub message: String,
}

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpResult {
    pub changed: usize,
    pub skipped: usize,
    pub errors: Vec<OpError>,
    pub batch: String,
}

pub struct Journal {
    pub batch: String,
    pub label: String,
    pub entries: Vec<Entry>,
}

impl Journal {
    pub fn new(label: &str) -> Self {
        Self { batch: crate::store::new_id(), label: label.into(), entries: vec![] }
    }
    pub fn push(&mut self, title: &str, op: Op) {
        self.entries.push(Entry { batch: self.batch.clone(), at: crate::store::now(), label: self.label.clone(), title: title.into(), op, undone: false });
    }
}

fn rename(from: &Path, to: &Path) -> Result<(), String> {
    if to.exists() {
        return Err(format!("Cel już istnieje: {}", to.display()));
    }
    if let Some(parent) = to.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Nie można utworzyć {}: {e}", parent.display()))?;
    }
    std::fs::rename(from, to).map_err(|e| {
        if e.raw_os_error() == Some(17) {
            format!("Foldery są na różnych dyskach – użyj „Przenieś do biblioteki”: {e}")
        } else if e.raw_os_error() == Some(5) || e.raw_os_error() == Some(32) {
            format!("Folder jest zablokowany (otwarty w symulatorze lub innym programie): {e}")
        } else {
            format!("Nie udało się przenieść folderu: {e}")
        }
    })
}

pub fn enable(layout: &Layout, all: &[Pkg], p: &Pkg, journal: &mut Journal) -> Result<bool, String> {
    if p.enabled {
        return Ok(false);
    }
    if let Some(other) = all.iter().find(|o| o.enabled && o.key == p.key && o.id != p.id) {
        return Err(format!("Włączona jest już inna kopia tego pakietu: {}", other.path));
    }
    let src = PathBuf::from(&p.path);
    let dest = layout.target.join(&p.folder);
    match p.source.as_str() {
        "parking" => {
            rename(&src, &dest)?;
            journal.push(&p.info.title, Op::Move { from: p.path.clone(), to: dest.to_string_lossy().into_owned() });
        }
        _ => {
            links::create(&dest, &src, layout.mode)?;
            journal.push(&p.info.title, Op::Link { link: dest.to_string_lossy().into_owned(), target: p.path.clone() });
        }
    }
    Ok(true)
}

pub fn disable(layout: &Layout, p: &Pkg, journal: &mut Journal) -> Result<bool, String> {
    if !p.enabled {
        return Ok(false);
    }
    if !p.link.is_empty() {
        links::remove(Path::new(&p.link))?;
        journal.push(&p.info.title, Op::Unlink { link: p.link.clone(), target: p.path.clone() });
        return Ok(true);
    }
    if p.source == "community" {
        let dest = layout.parking.join(&p.folder);
        rename(Path::new(&p.path), &dest)?;
        journal.push(&p.info.title, Op::Move { from: p.path.clone(), to: dest.to_string_lossy().into_owned() });
        return Ok(true);
    }
    Ok(false)
}

/// Odwraca jedną operację z dziennika.
pub fn undo(op: &Op, mode: Mode) -> Result<(), String> {
    match op {
        Op::Link { link, target } => {
            let l = Path::new(link);
            match links::target(l) {
                Some(t) if links::norm(&t) == links::norm(Path::new(target)) => links::remove(l),
                Some(_) => Err("Łącze wskazuje już gdzie indziej".into()),
                None if !l.exists() => Ok(()),
                None => Err("W miejscu łącza jest teraz zwykły folder".into()),
            }
        }
        Op::Unlink { link, target } => {
            if links::is_link(Path::new(link)) {
                return Ok(());
            }
            links::create(Path::new(link), Path::new(target), mode)
        }
        Op::Move { from, to } => {
            let (from, to) = (Path::new(from), Path::new(to));
            if from.exists() && !to.exists() {
                return Ok(());
            }
            if links::same_volume(from, to) {
                rename(to, from)
            } else {
                copy_dir(to, from, &mut |_, _| {})?;
                remove_real_dir(to)
            }
        }
        Op::Official { .. } => Ok(()),
    }
}

/// Usuwa zwykły folder z zawartością. Odmawia dla łączy – te usuwa `links::remove`.
pub fn remove_real_dir(path: &Path) -> Result<(), String> {
    if links::is_link(path) {
        return Err("Ścieżka jest łączem – nie usuwam zawartości celu".into());
    }
    std::fs::remove_dir_all(path).map_err(|e| format!("Nie udało się usunąć {}: {e}", path.display()))
}

/// Kopiuje folder z postępem (`done`, `total` w bajtach). Łącza wewnątrz pakietu są pomijane.
pub fn copy_dir(from: &Path, to: &Path, progress: &mut dyn FnMut(u64, u64)) -> Result<(), String> {
    let files: Vec<walkdir::DirEntry> = walkdir::WalkDir::new(from).follow_links(false).into_iter().filter_map(Result::ok).collect();
    let total: u64 = files.iter().filter(|e| e.file_type().is_file()).filter_map(|e| e.metadata().ok()).map(|m| m.len()).sum();
    if to.exists() {
        return Err(format!("Cel już istnieje: {}", to.display()));
    }
    let mut done = 0u64;
    let mut last = 0u64;
    for e in files {
        let rel = e.path().strip_prefix(from).map_err(|e| e.to_string())?;
        let dest = to.join(rel);
        if e.file_type().is_dir() {
            std::fs::create_dir_all(&dest).map_err(|e| format!("Tworzenie {}: {e}", dest.display()))?;
        } else if e.file_type().is_file() {
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            done += std::fs::copy(e.path(), &dest).map_err(|e| format!("Kopiowanie {}: {e}", rel.display()))?;
            if done - last > total / 200 + 1 {
                last = done;
                progress(done, total);
            }
        }
    }
    progress(total, total);
    Ok(())
}

/// Przenosi pakiet do biblioteki i zostawia go w tym samym stanie (włączony – przez łącze).
pub fn relocate(layout: &Layout, p: &Pkg, lib: &Library, journal: &mut Journal, progress: &mut dyn FnMut(u64, u64)) -> Result<(), String> {
    let src = PathBuf::from(&p.path);
    let root = PathBuf::from(&lib.path);
    if !root.is_dir() {
        return Err(format!("Biblioteka nie istnieje: {}", lib.path));
    }
    let dest = root.join(&p.folder);
    if links::norm(&dest) == links::norm(&src) {
        return Ok(());
    }
    if dest.exists() {
        return Err(format!("W bibliotece jest już folder „{}”", p.folder));
    }
    // Najpierw zdejmujemy łącze, żeby symulator nie widział folderu w połowie kopiowania.
    if !p.link.is_empty() {
        links::remove(Path::new(&p.link))?;
        journal.push(&p.info.title, Op::Unlink { link: p.link.clone(), target: p.path.clone() });
    }
    if links::same_volume(&src, &dest) {
        rename(&src, &dest)?;
    } else {
        if let Err(e) = copy_dir(&src, &dest, progress) {
            let _ = std::fs::remove_dir_all(&dest);
            return Err(e);
        }
        remove_real_dir(&src)?;
    }
    journal.push(&p.info.title, Op::Move { from: p.path.clone(), to: dest.to_string_lossy().into_owned() });
    if p.enabled {
        let link = if p.link.is_empty() { layout.target.join(&p.folder) } else { PathBuf::from(&p.link) };
        links::create(&link, &dest, layout.mode)?;
        journal.push(&p.info.title, Op::Link { link: link.to_string_lossy().into_owned(), target: dest.to_string_lossy().into_owned() });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pkg(root: &Path, name: &str, ct: &str) -> PathBuf {
        let p = root.join(name);
        std::fs::create_dir_all(&p).unwrap();
        std::fs::write(p.join("manifest.json"), format!(r#"{{"title":"{name}","content_type":"{ct}"}}"#)).unwrap();
        p
    }

    #[test]
    fn full_cycle() {
        let dir = tempfile::tempdir().unwrap();
        let community = dir.path().join("Packages").join("Community");
        let lib_root = dir.path().join("Library");
        std::fs::create_dir_all(&community).unwrap();
        pkg(&lib_root, "lib-aircraft", "AIRCRAFT");
        pkg(&lib_root.join("Lotniska"), "lib-airport-epwa", "SCENERY");
        pkg(&community, "native-util", "MISC");
        std::fs::write(community.join("leftover.zip"), b"PK").unwrap();
        std::fs::create_dir_all(community.join("wrapper").join("inner-pkg")).unwrap();
        std::fs::write(community.join("wrapper").join("inner-pkg").join("manifest.json"), "{}").unwrap();

        let settings = Settings {
            custom_community: community.to_string_lossy().into_owned(),
            libraries: vec![Library { id: "l1".into(), path: lib_root.to_string_lossy().into_owned(), name: "Lib".into() }],
            ..Default::default()
        };
        let layout = Layout::new(&settings, None).unwrap();
        let mut cache = Cache::default();
        let s = scan(&layout, &settings, &mut cache);
        assert_eq!(s.packages.len(), 3);
        assert_eq!(s.strays.len(), 2);
        assert_eq!(s.strays.iter().find(|x| x.kind == "folder").unwrap().nested.len(), 1);
        let find = |s: &Scan, k: &str| s.packages.iter().find(|p| p.key == k).unwrap().clone();
        let epwa = find(&s, "lib-airport-epwa");
        assert_eq!(epwa.group, "Lotniska");
        assert!(!epwa.enabled);

        let mut j = Journal::new("test");
        assert!(enable(&layout, &s.packages, &epwa, &mut j).unwrap());
        let native = find(&s, "native-util");
        assert!(native.enabled);
        assert!(disable(&layout, &native, &mut j).unwrap());

        let s2 = scan(&layout, &settings, &mut cache);
        assert!(find(&s2, "lib-airport-epwa").enabled);
        let parked = find(&s2, "native-util");
        assert_eq!(parked.source, "parking");
        assert!(!parked.enabled);
        assert!(!community.join("native-util").exists());

        // Cofnięcie w odwrotnej kolejności przywraca stan wyjściowy.
        for e in j.entries.iter().rev() {
            undo(&e.op, Mode::Junction).unwrap();
        }
        let s3 = scan(&layout, &settings, &mut cache);
        assert!(!find(&s3, "lib-airport-epwa").enabled);
        assert_eq!(find(&s3, "native-util").source, "community");

        // Przeniesienie pakietu z Community do biblioteki zostawia go włączonego (przez łącze).
        let native = find(&s3, "native-util");
        let mut j2 = Journal::new("move");
        relocate(&layout, &native, &settings.libraries[0], &mut j2, &mut |_, _| {}).unwrap();
        let s4 = scan(&layout, &settings, &mut cache);
        let moved = find(&s4, "native-util");
        assert_eq!(moved.source, "library");
        assert!(moved.enabled);
        assert!(links::is_link(&community.join("native-util")));
    }
}

/// Skan prawdziwej instalacji – tylko odczyt. Uruchamiany ręcznie:
/// `FSAT_LIB="H:\..." cargo test real_scan -- --ignored --nocapture`
#[cfg(test)]
mod real {
    use super::*;

    #[test]
    #[ignore]
    fn real_scan() {
        let inst = crate::sim::detect();
        let Some(i) = inst.first() else { return };
        let mut settings = Settings::default();
        if let Ok(lib) = std::env::var("FSAT_LIB") {
            settings.libraries.push(Library { id: "real".into(), path: lib, name: "Dodatki".into() });
        }
        let layout = Layout::new(&settings, Some(i)).unwrap();
        let mut cache = Cache::default();
        let s = scan(&layout, &settings, &mut cache);
        println!("{} · {} pakietów, {} ms (zimny)", i.label, s.packages.len(), s.took_ms);
        let s2 = scan(&layout, &settings, &mut cache);
        println!("ciepły skan: {} ms", s2.took_ms);
        let mut by_cat: std::collections::BTreeMap<&str, usize> = Default::default();
        for p in &s.packages {
            *by_cat.entry(p.info.category.as_str()).or_default() += 1;
        }
        println!("kategorie: {by_cat:?}");
        println!("włączone: {}, łącza: {}, zerwane: {}, inne wpisy: {}", s.packages.iter().filter(|p| p.enabled).count(), s.packages.iter().filter(|p| !p.link.is_empty()).count(), s.broken.len(), s.strays.len());
        let apt = s.packages.iter().filter(|p| p.info.category == "airport").count();
        let bgl = s.packages.iter().filter(|p| p.info.airports.iter().any(|a| a.source == "bgl")).count();
        println!("lotniska: {apt} paczek, z BGL: {bgl}, bez miniatur: {}", s.packages.iter().filter(|p| p.info.thumbs.is_empty()).count());
        for p in s.packages.iter().filter(|p| p.info.category == "airport").take(12) {
            println!("  {} → {:?}", p.folder, p.info.airports.iter().take(3).map(|a| format!("{}({}) {:.3},{:.3}", a.icao, a.source, a.lat, a.lon)).collect::<Vec<_>>());
        }
        for b in &s.broken {
            println!("zerwane: {} → {}", b.link, b.target);
        }
        for x in &s.strays {
            println!("inne: {} [{}] zagnieżdżone: {}", x.path, x.kind, x.nested.len());
        }
        if let Ok(out) = std::env::var("FSAT_DUMP") {
            std::fs::write(out, serde_json::to_string(&s).unwrap()).unwrap();
        }
        println!("sugerowane biblioteki: {:?}", s.suggested_libraries.iter().map(|x| (&x.path, x.links)).collect::<Vec<_>>());
    }

    #[test]
    fn cache_survives_new_fields() {
        // Pamięć z poprzedniej wersji (bez nowszych pól) ma się wczytać, a nie wymusić pełny skan.
        let old = r#"{"version":4,"entries":{"pkg":[1,{"title":"A","airports":[{"icao":"EPWA"}]}]}}"#;
        let c: Cache = serde_json::from_str(old).unwrap();
        assert_eq!(c.entries["pkg"].1.title, "A");
        assert_eq!(c.entries["pkg"].1.airports[0].icao, "EPWA");
    }
}
