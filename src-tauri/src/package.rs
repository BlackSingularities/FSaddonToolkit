//! Odczyt jednego pakietu: `manifest.json`, `layout.json`, miniatury, warianty samolotów,
//! lotniska z plików BGL i kategoria. Wynik jest zapisywany w pamięci podręcznej skanu,
//! więc kolejne skany czytają z dysku tylko pakiety, które się zmieniły.

use crate::{airports, bgl};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AirportRef {
    pub icao: String,
    pub name: String,
    pub city: String,
    pub country: String,
    pub lat: f64,
    pub lon: f64,
    /// "bgl" – odczytane z pliku scenerii, "name" – odgadnięte z nazwy paczki.
    pub source: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Dependency {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageInfo {
    pub has_manifest: bool,
    pub has_layout: bool,
    pub title: String,
    pub creator: String,
    pub manufacturer: String,
    pub version: String,
    pub content_type: String,
    pub min_game_version: String,
    pub category: String,
    pub size: u64,
    pub files: u64,
    pub thumbs: Vec<String>,
    pub aircraft: Vec<String>,
    pub airports: Vec<AirportRef>,
    pub dependencies: Vec<Dependency>,
    pub has_model: bool,
    pub has_panels: bool,
    /// Data modyfikacji folderu (ms od 1970) – „data instalacji” w sortowaniu.
    pub modified: u64,
    pub error: String,
}

/// Znacznik zmian: daty modyfikacji folderu, manifestu i layoutu. Inny znacznik = ponowny odczyt.
pub fn stamp(dir: &Path) -> u64 {
    let m = |p: PathBuf| {
        std::fs::metadata(p)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    };
    let a = m(dir.to_path_buf());
    let b = m(dir.join("manifest.json"));
    let c = m(dir.join("layout.json"));
    a.wrapping_mul(31).wrapping_add(b).wrapping_mul(31).wrapping_add(c)
}

fn modified_ms(dir: &Path) -> u64 {
    std::fs::metadata(dir)
        .and_then(|m| m.created().or_else(|_| m.modified()))
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn read_json(path: &Path) -> Option<serde_json::Value> {
    let bytes = std::fs::read(path).ok()?;
    // Część paczek ma BOM na początku pliku.
    let bytes = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(&bytes);
    serde_json::from_slice(bytes).ok()
}

fn s(v: &serde_json::Value, key: &str) -> String {
    v.get(key).and_then(|x| x.as_str()).unwrap_or("").trim().to_string()
}

/// Lista plików pakietu: z `layout.json` (szybko) albo z przejścia po folderze.
fn file_list(dir: &Path) -> (Vec<(String, u64)>, bool) {
    if let Some(layout) = read_json(&dir.join("layout.json")) {
        if let Some(items) = layout.get("content").and_then(|c| c.as_array()) {
            let files = items
                .iter()
                .filter_map(|i| Some((i.get("path")?.as_str()?.replace('\\', "/"), i.get("size").and_then(|x| x.as_u64()).unwrap_or(0))))
                .collect();
            return (files, true);
        }
    }
    let files = walkdir::WalkDir::new(dir)
        .max_depth(12)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file())
        .take(200_000)
        .filter_map(|e| {
            let rel = e.path().strip_prefix(dir).ok()?.to_string_lossy().replace('\\', "/");
            Some((rel, e.metadata().map(|m| m.len()).unwrap_or(0)))
        })
        .collect();
    (files, false)
}

fn is_image(lower: &str) -> bool {
    lower.ends_with(".jpg") || lower.ends_with(".jpeg") || lower.ends_with(".png") || lower.ends_with(".webp")
}

/// Miniatury: najpierw okładka z ContentInfo, potem miniatury samolotów i malowań, potem zrzuty.
fn thumbnails(dir: &Path, files: &[(String, u64)]) -> Vec<String> {
    let mut scored: Vec<(u8, &str)> = files
        .iter()
        .filter_map(|(p, size)| {
            let lower = p.to_lowercase();
            if !is_image(&lower) || *size == 0 {
                return None;
            }
            let file = lower.rsplit('/').next().unwrap_or("");
            let score = if lower.starts_with("contentinfo/") && file.starts_with("thumbnail") {
                0
            } else if file.starts_with("thumbnail") && !file.contains("small") {
                1
            } else if lower.starts_with("contentinfo/") && (file.contains("screenshot") || file.contains("preview")) {
                2
            } else if file.starts_with("thumbnail") {
                3
            } else if lower.starts_with("contentinfo/") {
                4
            } else {
                return None;
            };
            Some((score, p.as_str()))
        })
        .collect();
    scored.sort_by_key(|(score, p)| (*score, p.len()));
    scored.into_iter().take(24).map(|(_, p)| dir.join(p).to_string_lossy().into_owned()).collect()
}

/// Tytuły wariantów z `aircraft.cfg` (sekcje `[FLTSIM.n]`).
fn aircraft_titles(dir: &Path, files: &[(String, u64)]) -> Vec<String> {
    let mut titles = vec![];
    for (p, _) in files.iter().filter(|(p, _)| p.to_lowercase().ends_with("aircraft.cfg")).take(40) {
        let Ok(bytes) = std::fs::read(dir.join(p)) else { continue };
        let text = String::from_utf8_lossy(&bytes);
        let mut in_fltsim = false;
        for line in text.lines() {
            let line = line.split(';').next().unwrap_or("").trim();
            if line.starts_with('[') {
                in_fltsim = line.to_lowercase().starts_with("[fltsim.");
                continue;
            }
            if !in_fltsim {
                continue;
            }
            if let Some((k, v)) = line.split_once('=') {
                if k.trim().eq_ignore_ascii_case("title") {
                    let v = v.trim().trim_matches('"').trim().to_string();
                    if !v.is_empty() && !titles.contains(&v) {
                        titles.push(v);
                    }
                }
            }
        }
    }
    titles.truncate(60);
    titles
}

fn airport_refs(dir: &Path, files: &[(String, u64)], name: &str, title: &str) -> Vec<AirportRef> {
    let mut found: Vec<bgl::BglAirport> = vec![];
    let bgls = files.iter().filter(|(p, size)| p.to_lowercase().ends_with(".bgl") && *size < 512 * 1024 * 1024).take(400);
    for (p, _) in bgls {
        for a in bgl::airports_in(&dir.join(p)) {
            if !found.iter().any(|f| f.icao == a.icao) {
                found.push(a);
            }
        }
    }
    let mut refs: Vec<AirportRef> = found
        .into_iter()
        .map(|a| {
            let db = airports::get(&a.icao);
            AirportRef {
                name: db.map(|d| d.name.clone()).unwrap_or_default(),
                city: db.map(|d| d.city.clone()).unwrap_or_default(),
                country: db.map(|d| d.country.clone()).unwrap_or_default(),
                icao: a.icao,
                lat: a.lat,
                lon: a.lon,
                source: "bgl".into(),
            }
        })
        .collect();
    if refs.is_empty() {
        for a in airports::guess_from_name(name).into_iter().chain(airports::guess_from_name(title)) {
            if !refs.iter().any(|r| r.icao == a.icao) {
                refs.push(AirportRef {
                    icao: a.icao.clone(),
                    name: a.name.clone(),
                    city: a.city.clone(),
                    country: a.country.clone(),
                    lat: a.lat,
                    lon: a.lon,
                    source: "name".into(),
                });
            }
        }
    }
    // Paczki z setkami lotnisk (np. poprawki całego kraju) – na mapie wystarczy próbka.
    refs.truncate(600);
    refs
}

/// Kategoria na podstawie `content_type`, zawartości i nazwy.
pub fn categorize(content_type: &str, name: &str, files: &[(String, u64)], airports: usize, has_model: bool) -> String {
    let ct = content_type.to_uppercase();
    let lname = name.to_lowercase();
    let has = |needle: &str| files.iter().any(|(p, _)| p.to_lowercase().contains(needle));
    let cat = match ct.as_str() {
        "LIVERY" => "livery",
        "AIRCRAFT" if !has_model || lname.contains("livery") || lname.contains("liveries") || lname.contains("-paint") => "livery",
        "AIRCRAFT" => "aircraft",
        "SCENERY" if airports > 0 => "airport",
        "SCENERY" if lname.contains("lib") || lname.contains("library") || lname.contains("objects") => "library",
        "SCENERY" => "scenery",
        "INSTRUMENTS" | "MISC" | "CORE" | "MOD" => {
            if lname.contains("library") || lname.contains("-lib") {
                "library"
            } else {
                "utility"
            }
        }
        _ => {
            if has("simobjects/airplanes/") || has("simobjects/rotorcraft/") {
                if has_model { "aircraft" } else { "livery" }
            } else if airports > 0 {
                "airport"
            } else if has("ingamepanels/") || has("html_ui/") {
                "utility"
            } else if has("scenery/") {
                "scenery"
            } else {
                "other"
            }
        }
    };
    cat.into()
}

pub fn read(dir: &Path) -> PackageInfo {
    let name = dir.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let mut info = PackageInfo { modified: modified_ms(dir), ..Default::default() };
    let manifest = read_json(&dir.join("manifest.json"));
    if let Some(m) = &manifest {
        info.has_manifest = true;
        info.title = s(m, "title");
        info.creator = s(m, "creator");
        info.manufacturer = s(m, "manufacturer");
        info.version = s(m, "package_version");
        info.content_type = s(m, "content_type").to_uppercase();
        info.min_game_version = s(m, "minimum_game_version");
        if let Some(deps) = m.get("dependencies").and_then(|d| d.as_array()) {
            info.dependencies = deps
                .iter()
                .filter_map(|d| Some(Dependency { name: d.get("name")?.as_str()?.to_string(), version: s(d, "package_version") }))
                .collect();
        }
    } else if dir.join("manifest.json").exists() {
        info.error = "Uszkodzony plik manifest.json".into();
    }
    let (files, has_layout) = file_list(dir);
    info.has_layout = has_layout;
    info.files = files.len() as u64;
    info.size = files.iter().map(|(_, s)| s).sum();
    info.has_model = files.iter().any(|(p, _)| {
        let l = p.to_lowercase();
        l.contains("/model") && (l.ends_with(".gltf") || l.ends_with(".bin") || l.ends_with(".xml"))
    });
    info.has_panels = files.iter().any(|(p, _)| p.to_lowercase().starts_with("ingamepanels/"));
    info.thumbs = thumbnails(dir, &files);
    let is_aircraft = info.content_type == "AIRCRAFT" || info.content_type == "LIVERY";
    if is_aircraft || files.iter().any(|(p, _)| p.to_lowercase().ends_with("aircraft.cfg")) {
        info.aircraft = aircraft_titles(dir, &files);
    }
    if !is_aircraft {
        info.airports = airport_refs(dir, &files, &name, &info.title);
    }
    info.category = categorize(&info.content_type, &name, &files, info.airports.len(), info.has_model);
    if info.title.is_empty() || is_junk_title(&info.title) {
        info.title = pretty_name(&name);
    }
    info
}

/// Część twórców wpisuje w tytuł notkę o prawach autorskich zamiast nazwy dodatku.
fn is_junk_title(title: &str) -> bool {
    let l = title.to_lowercase();
    l.contains('©') || l.contains("(c) ") || l.contains("copyright") || l.contains("no free use") || l.contains("all rights reserved")
}

/// „barellimsfsaddon-airport-limf-turin” → „LIMF Turin”, „vendor-aircraft-c172” → „Aircraft C172”.
pub fn pretty_name(folder: &str) -> String {
    let words: Vec<&str> = folder.split(['-', '_', ' ']).filter(|w| !w.is_empty()).collect();
    let start = words.iter().position(|w| matches!(w.to_lowercase().as_str(), "airport" | "airfield" | "heliport" | "scenery" | "aircraft" | "landmarks")).map(|i| i + 1).filter(|i| *i < words.len()).unwrap_or(usize::from(words.len() > 1));
    words[start..]
        .iter()
        .map(|w| {
            if w.len() <= 4 && airports::get(w).is_some() && start > 0 {
                w.to_uppercase()
            } else {
                let mut c = w.chars();
                c.next().map(|f| f.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_default()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Czy folder wygląda na pakiet MSFS.
pub fn is_package(dir: &Path) -> bool {
    dir.join("manifest.json").is_file()
}

/// Pakiety wewnątrz folderu (np. rozpakowane archiwum z dodatkowym poziomem folderów).
pub fn find_packages(root: &Path, max_depth: usize) -> Vec<PathBuf> {
    let mut out = vec![];
    let mut it = walkdir::WalkDir::new(root).max_depth(max_depth).into_iter();
    while let Some(Ok(e)) = it.next() {
        if !e.file_type().is_dir() {
            continue;
        }
        if is_package(e.path()) {
            out.push(e.path().to_path_buf());
            it.skip_current_dir();
        }
    }
    out
}

/// Windows FILETIME (setki nanosekund od 1601-01-01), jak w `layout.json` generowanym przez SDK.
fn filetime(t: std::time::SystemTime) -> u64 {
    let unix = t.duration_since(UNIX_EPOCH).map(|d| d.as_nanos() as u64 / 100).unwrap_or(0);
    unix + 116_444_736_000_000_000
}

/// Odtwarza `layout.json` i pole `total_package_size` w manifeście (jak MSFSLayoutGenerator).
pub fn generate_layout(dir: &Path) -> Result<usize, String> {
    let manifest_path = dir.join("manifest.json");
    let raw = std::fs::read(&manifest_path).map_err(|e| format!("Brak manifest.json: {e}"))?;
    let raw = raw.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(&raw);
    let mut manifest: serde_json::Value = serde_json::from_slice(raw).map_err(|e| format!("Uszkodzony manifest.json: {e}"))?;
    let mut entries = vec![];
    let mut total: u64 = 0;
    for e in walkdir::WalkDir::new(dir).into_iter().filter_map(Result::ok) {
        if !e.file_type().is_file() {
            continue;
        }
        let rel = e.path().strip_prefix(dir).map_err(|e| e.to_string())?.to_string_lossy().replace('\\', "/");
        let lower = rel.to_lowercase();
        if lower == "layout.json" || lower == "manifest.json" || lower.starts_with("_cvt_") || lower == "msfslayoutgenerator.exe" {
            continue;
        }
        let meta = e.metadata().map_err(|e| e.to_string())?;
        total += meta.len();
        entries.push(serde_json::json!({
            "path": rel,
            "size": meta.len(),
            "date": filetime(meta.modified().unwrap_or(UNIX_EPOCH)),
        }));
    }
    entries.sort_by(|a, b| a["path"].as_str().cmp(&b["path"].as_str()));
    let count = entries.len();
    let layout = serde_json::to_string_pretty(&serde_json::json!({ "content": entries })).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("layout.json"), layout).map_err(|e| format!("Zapis layout.json: {e}"))?;
    if let Some(obj) = manifest.as_object_mut() {
        obj.insert("total_package_size".into(), serde_json::Value::String(format!("{total:020}")));
        let text = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
        std::fs::write(&manifest_path, text).map_err(|e| format!("Zapis manifest.json: {e}"))?;
    }
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(p: &Path, text: &str) {
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, text).unwrap();
    }

    #[test]
    fn reads_aircraft_package() {
        let dir = tempfile::tempdir().unwrap();
        let pkg = dir.path().join("vendor-aircraft-c172");
        write(&pkg.join("manifest.json"), r#"{"title":"C172 Classic","creator":"Vendor","package_version":"1.2.0","content_type":"AIRCRAFT","dependencies":[{"name":"vendor-lib","package_version":"1.0.0"}]}"#);
        write(&pkg.join("SimObjects/Airplanes/C172/aircraft.cfg"), "[FLTSIM.0]\ntitle = \"C172 Blue\" ; komentarz\n[FLTSIM.1]\ntitle=C172 Red\n[GENERAL]\ntitle=nie\n");
        write(&pkg.join("SimObjects/Airplanes/C172/model/c172.xml"), "<x/>");
        write(&pkg.join("SimObjects/Airplanes/C172/texture.blue/thumbnail.jpg"), "jpg");
        write(&pkg.join("ContentInfo/vendor-aircraft-c172/Thumbnail.jpg"), "jpg");
        let info = read(&pkg);
        assert_eq!(info.title, "C172 Classic");
        assert_eq!(info.category, "aircraft");
        assert_eq!(info.aircraft, vec!["C172 Blue", "C172 Red"]);
        assert_eq!(info.dependencies[0].name, "vendor-lib");
        assert!(info.thumbs[0].replace('\\', "/").ends_with("ContentInfo/vendor-aircraft-c172/Thumbnail.jpg"));
        assert!(!info.has_layout);

        let n = generate_layout(&pkg).unwrap();
        assert_eq!(n, 4);
        let again = read(&pkg);
        assert!(again.has_layout);
        assert_eq!(again.files, 4);
        let m: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(pkg.join("manifest.json")).unwrap()).unwrap();
        assert_eq!(m["total_package_size"].as_str().unwrap().len(), 20);
        assert_eq!(m["title"], "C172 Classic");
    }

    #[test]
    fn titles() {
        assert!(is_junk_title("©bma NO FREE USE ALLOWED"));
        assert_eq!(pretty_name("barellimsfsaddon-airport-limf-turin"), "LIMF Turin");
    }

    #[test]
    fn livery_and_utility() {
        let files = vec![("SimObjects/Airplanes/X/texture.lot/thumbnail.jpg".to_string(), 1u64)];
        assert_eq!(categorize("AIRCRAFT", "lot-livery-a320", &files, 0, false), "livery");
        assert_eq!(categorize("MISC", "pms50-gtn750", &[], 0, false), "utility");
        assert_eq!(categorize("SCENERY", "x-airport-epwa", &[], 1, false), "airport");
        assert_eq!(categorize("SCENERY", "x-landmarks", &[], 0, false), "scenery");
    }

    #[test]
    fn nested_packages() {
        let dir = tempfile::tempdir().unwrap();
        write(&dir.path().join("archive/inner-a/manifest.json"), "{}");
        write(&dir.path().join("archive/inner-a/sub/manifest.json"), "{}");
        write(&dir.path().join("archive/group/inner-b/manifest.json"), "{}");
        let mut found = find_packages(dir.path(), 4);
        found.sort();
        assert_eq!(found.len(), 2);
    }
}
