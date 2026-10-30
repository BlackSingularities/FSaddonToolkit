//! Pakiety oficjalne (Marketplace, DLC, zawartość strumieniowana) z `Content.xml`.
//!
//! Symulator zapisuje tam stan każdego pakietu: `Activated` / `UserDisabled` (MSFS 2024)
//! albo `true` / `false` (MSFS 2020). Zmieniamy wyłącznie wartość atrybutu `active`
//! w konkretnych wierszach – reszta pliku zostaje bajt w bajt. Przed każdym zapisem
//! robimy kopię zapasową. Wpisy `communityfs20-*` / `communityfs24-*` opisują pakiety
//! z folderu Community – tymi zarządzamy przez łącza, więc tu je pomijamy.

use crate::airports;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

static PACKAGE: Lazy<Regex> = Lazy::new(|| Regex::new(r#"<Package\s+name="([^"]+)"\s+active="([^"]*)"\s*/>"#).unwrap());

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficialPkg {
    pub name: String,
    pub title: String,
    pub enabled: bool,
    pub raw: String,
    pub category: String,
    /// "fs24" | "fs20" | inny przedrostek.
    pub generation: String,
    pub creator: String,
    pub thumb: String,
    pub icao: String,
    pub lat: f64,
    pub lon: f64,
    pub airport_name: String,
    pub on_disk: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficialList {
    pub path: String,
    pub readonly: bool,
    pub boolean_style: bool,
    pub packages: Vec<OfficialPkg>,
}

fn enabled_value(v: &str) -> bool {
    !(v.eq_ignore_ascii_case("UserDisabled") || v.eq_ignore_ascii_case("false") || v.eq_ignore_ascii_case("Disabled"))
}

fn category(name: &str) -> &'static str {
    let n = name.to_lowercase();
    if n.contains("livery") || n.contains("liveries") {
        "livery"
    } else if n.contains("-aircraft-") || n.contains("-helicopter-") || n.contains("-rotorcraft-") || n.contains("-glider-") {
        "aircraft"
    } else if n.contains("-airport-") || n.contains("-airfield-") || n.contains("-heliport-") {
        "airport"
    } else if n.contains("modellib") || n.contains("-library") || n.contains("materiallib") {
        "library"
    } else if ["landmark", "discovery", "city", "photogrammetry", "scenery", "poi", "handcrafted", "world-update", "coverage", "terrain"].iter().any(|k| n.contains(k)) {
        "scenery"
    } else if n.starts_with("fs-base") || n.contains("-base") || n.contains("core") {
        "core"
    } else {
        "other"
    }
}

/// Tytuł z nazwy: „fs24-asobo-airport-epwa-warsaw-chopin” → „Asobo Airport EPWA Warsaw Chopin”.
fn pretty(name: &str) -> String {
    let rest = name.split_once('-').map(|(p, r)| if p.starts_with("fs") { r } else { name }).unwrap_or(name);
    rest.split(['-', '_'])
        .filter(|w| !w.is_empty())
        .map(|w| {
            if w.len() == 4 && airports::get(w).is_some() && rest.contains("airport") {
                w.to_uppercase()
            } else {
                let mut c = w.chars();
                c.next().map(|f| f.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_default()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn thumb_in(dir: &Path) -> Option<String> {
    let rd = std::fs::read_dir(dir).ok()?;
    let info = rd.flatten().find(|e| e.file_name().to_string_lossy().eq_ignore_ascii_case("contentinfo"))?.path();
    walkdir::WalkDir::new(info)
        .max_depth(3)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file())
        .map(|e| e.into_path())
        .filter(|p| {
            let n = p.to_string_lossy().to_lowercase();
            n.ends_with(".jpg") || n.ends_with(".png")
        })
        .min_by_key(|p| !p.file_name().map(|n| n.to_string_lossy().to_lowercase().starts_with("thumbnail")).unwrap_or(false))
        .map(|p| p.to_string_lossy().into_owned())
}

fn manifest_fields(dir: &Path) -> (String, String) {
    let Ok(b) = std::fs::read(dir.join("manifest.json")) else { return Default::default() };
    let b = b.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(&b);
    let Ok(v) = serde_json::from_slice::<serde_json::Value>(b) else { return Default::default() };
    let f = |k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or("").trim().to_string();
    (f("title"), f("creator"))
}

pub fn list(path: &Path, official_dirs: &[String], streamed: Option<&Path>) -> Result<OfficialList, String> {
    let text = std::fs::read_to_string(path).map_err(|e| format!("Nie udało się odczytać Content.xml: {e}"))?;
    let readonly = std::fs::metadata(path).map(|m| m.permissions().readonly()).unwrap_or(false);
    // Foldery na dysku: OneStore bez przedrostka „fs24-”, StreamedPackages z przedrostkiem.
    let mut dirs: HashMap<String, PathBuf> = HashMap::new();
    for d in official_dirs {
        let generation = if d.contains("2020") || d.ends_with("Official\\OneStore") || d.ends_with("Official\\Steam") { "fs20" } else { "fs24" };
        if let Ok(rd) = std::fs::read_dir(d) {
            for e in rd.flatten() {
                let n = e.file_name().to_string_lossy().to_lowercase();
                dirs.insert(format!("{generation}-{n}"), e.path());
                dirs.entry(n).or_insert(e.path());
            }
        }
    }
    let streamed_names: std::collections::HashSet<String> = streamed
        .and_then(|s| std::fs::read_dir(s).ok())
        .map(|rd| rd.flatten().map(|e| e.file_name().to_string_lossy().to_lowercase()).collect())
        .unwrap_or_default();
    let boolean_style = PACKAGE.captures_iter(&text).any(|c| c[2].eq_ignore_ascii_case("true") || c[2].eq_ignore_ascii_case("false"));
    let mut packages = vec![];
    for c in PACKAGE.captures_iter(&text) {
        let name = c[1].to_string();
        let lower = name.to_lowercase();
        if lower.starts_with("communityfs") || lower.starts_with("community-") {
            continue;
        }
        let generation = lower.split('-').next().unwrap_or("").to_string();
        let dir = dirs.get(&lower);
        let (title, creator) = dir.map(|d| manifest_fields(d)).unwrap_or_default();
        let cat = category(&name);
        let airport = if cat == "airport" { airports::guess_from_name(&name).into_iter().next() } else { None };
        packages.push(OfficialPkg {
            title: if title.is_empty() { pretty(&name) } else { title },
            creator: if creator.is_empty() { name.split('-').nth(1).map(|c| { let mut ch = c.chars(); ch.next().map(|f| f.to_uppercase().collect::<String>() + ch.as_str()).unwrap_or_default() }).unwrap_or_default() } else { creator },
            enabled: enabled_value(&c[2]),
            raw: c[2].to_string(),
            category: cat.into(),
            generation,
            thumb: dir.and_then(|d| thumb_in(d)).unwrap_or_default(),
            icao: airport.map(|a| a.icao.clone()).unwrap_or_default(),
            lat: airport.map(|a| a.lat).unwrap_or(0.0),
            lon: airport.map(|a| a.lon).unwrap_or(0.0),
            airport_name: airport.map(|a| a.name.clone()).unwrap_or_default(),
            on_disk: dir.is_some() || streamed_names.contains(&lower),
            name,
        });
    }
    packages.sort_by_cached_key(|p| p.title.to_lowercase());
    Ok(OfficialList { path: path.to_string_lossy().into_owned(), readonly, boolean_style, packages })
}

/// Zmienia stan pakietów. Zwraca listę (nazwa, poprzednia wartość, nowa wartość).
pub fn set(path: &Path, changes: &HashMap<String, bool>, backup_dir: &Path) -> Result<Vec<(String, String, String)>, String> {
    let text = std::fs::read_to_string(path).map_err(|e| format!("Nie udało się odczytać Content.xml: {e}"))?;
    let boolean_style = PACKAGE.captures_iter(&text).any(|c| c[2].eq_ignore_ascii_case("true") || c[2].eq_ignore_ascii_case("false"));
    let wanted: HashMap<String, bool> = changes.iter().map(|(k, v)| (k.to_lowercase(), *v)).collect();
    let mut done = vec![];
    let out = PACKAGE.replace_all(&text, |c: &regex::Captures| {
        let name = &c[1];
        match wanted.get(&name.to_lowercase()) {
            Some(&on) if enabled_value(&c[2]) != on => {
                let value = match (boolean_style, on) {
                    (true, true) => "true",
                    (true, false) => "false",
                    (false, true) => "Activated",
                    (false, false) => "UserDisabled",
                };
                done.push((name.to_string(), c[2].to_string(), value.to_string()));
                c[0].replacen(&format!("active=\"{}\"", &c[2]), &format!("active=\"{value}\""), 1)
            }
            _ => c[0].to_string(),
        }
    });
    if done.is_empty() {
        return Ok(done);
    }
    backup(path, backup_dir)?;
    let readonly = std::fs::metadata(path).map(|m| m.permissions().readonly()).unwrap_or(false);
    if readonly {
        set_readonly(path, false)?;
    }
    let result = crate::store::write_atomic(path, out.as_bytes());
    if readonly {
        let _ = set_readonly(path, true);
    }
    result.map(|_| done)
}

/// Kopia zapasowa Content.xml z datą; trzymamy 20 ostatnich.
pub fn backup(path: &Path, dir: &Path) -> Result<PathBuf, String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let target = dir.join(format!("Content-{stamp}.xml"));
    std::fs::copy(path, &target).map_err(|e| format!("Kopia zapasowa Content.xml: {e}"))?;
    let mut all: Vec<PathBuf> = std::fs::read_dir(dir).map(|rd| rd.flatten().map(|e| e.path()).collect()).unwrap_or_default();
    all.retain(|p| p.file_name().map(|n| n.to_string_lossy().starts_with("Content-")).unwrap_or(false));
    all.sort();
    while all.len() > 20 {
        let _ = std::fs::remove_file(all.remove(0));
    }
    Ok(target)
}

pub fn backups(dir: &Path) -> Vec<String> {
    let mut all: Vec<String> = std::fs::read_dir(dir)
        .map(|rd| rd.flatten().map(|e| e.path()).filter(|p| p.file_name().map(|n| n.to_string_lossy().starts_with("Content-")).unwrap_or(false)).map(|p| p.to_string_lossy().into_owned()).collect())
        .unwrap_or_default();
    all.sort();
    all.reverse();
    all
}

pub fn restore(path: &Path, from: &Path, backup_dir: &Path) -> Result<(), String> {
    if !from.starts_with(backup_dir) {
        return Err("Nieprawidłowa kopia zapasowa".into());
    }
    backup(path, backup_dir)?;
    let data = std::fs::read(from).map_err(|e| e.to_string())?;
    crate::store::write_atomic(path, &data)
}

pub fn set_readonly(path: &Path, readonly: bool) -> Result<(), String> {
    let mut perm = std::fs::metadata(path).map_err(|e| e.to_string())?.permissions();
    #[allow(clippy::permissions_set_readonly_false)]
    perm.set_readonly(readonly);
    std::fs::set_permissions(path, perm).map_err(|e| format!("Zmiana atrybutu Content.xml: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn toggles_only_requested_lines() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("Content.xml");
        let xml = "<Packages>\n\t<Package name=\"communityfs24-x\" active=\"Activated\"/>\n\t<Package name=\"fs24-asobo-airport-epwa-warsaw\" active=\"Activated\"/>\n\t<Package name=\"fs20-aerosoft-paderborn\" active=\"UserDisabled\"/>\n</Packages>\n";
        std::fs::write(&p, xml).unwrap();
        let l = list(&p, &[], None).unwrap();
        assert_eq!(l.packages.len(), 2);
        let epwa = l.packages.iter().find(|x| x.name.contains("epwa")).unwrap();
        assert_eq!(epwa.category, "airport");
        assert_eq!(epwa.icao, "EPWA");
        assert!(epwa.enabled);
        let mut ch = HashMap::new();
        ch.insert("fs24-asobo-airport-epwa-warsaw".to_string(), false);
        ch.insert("fs20-aerosoft-paderborn".to_string(), true);
        let done = set(&p, &ch, &dir.path().join("bak")).unwrap();
        assert_eq!(done.len(), 2);
        let after = std::fs::read_to_string(&p).unwrap();
        assert_eq!(after, xml.replace("epwa-warsaw\" active=\"Activated\"", "epwa-warsaw\" active=\"UserDisabled\"").replace("paderborn\" active=\"UserDisabled\"", "paderborn\" active=\"Activated\""));
        assert_eq!(backups(&dir.path().join("bak")).len(), 1);
    }
}
