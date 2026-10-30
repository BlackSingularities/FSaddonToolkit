//! Kontrola kondycji: zerwane łącza, źle rozpakowane paczki, duplikaty, brakujące zależności,
//! konflikty lotnisk, brak `layout.json` i inne rzeczy, które spowalniają albo psują symulator.

use crate::engine::Scan;
use serde::Serialize;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    pub id: String,
    /// "error" | "warn" | "info"
    pub severity: String,
    pub kind: String,
    pub title: String,
    pub detail: String,
    /// Pakiety, których dotyczy (identyfikatory ze skanu).
    pub packages: Vec<String>,
    pub paths: Vec<String>,
    /// Naprawa jednym kliknięciem: "remove-link", "flatten", "trash", "enable", "layout", "disable-copies".
    pub fix: String,
    pub fix_label: String,
}

fn issue(severity: &str, kind: &str, title: String, detail: String) -> Issue {
    Issue {
        id: String::new(),
        severity: severity.into(),
        kind: kind.into(),
        title,
        detail,
        packages: vec![],
        paths: vec![],
        fix: String::new(),
        fix_label: String::new(),
    }
}

/// `official` – nazwy pakietów oficjalnych bez przedrostka (żeby zależność od nich nie była „brakująca”).
pub fn check(scan: &Scan, official: &HashSet<String>) -> Vec<Issue> {
    let mut out = vec![];

    for lib in scan.libraries.iter().filter(|l| !l.exists) {
        let mut i = issue("error", "library-missing", format!("Biblioteka „{}” jest niedostępna", lib.name), format!("Folder {} nie istnieje albo dysk jest odłączony. Pakiety z tej biblioteki nie są widoczne.", lib.path));
        i.paths = vec![lib.path.clone()];
        out.push(i);
    }

    for b in &scan.broken {
        let name = b.link.rsplit('\\').next().unwrap_or(&b.link).to_string();
        let mut i = issue("error", "broken-link", format!("Zerwane łącze: {name}"), format!("Łącze w Community wskazuje na {} – ten folder nie istnieje. Symulator może zgłaszać błędy przy wczytywaniu.", b.target));
        i.paths = vec![b.link.clone()];
        i.fix = "remove-link".into();
        i.fix_label = "Usuń łącze".into();
        out.push(i);
    }

    for s in &scan.strays {
        let name = s.path.rsplit('\\').next().unwrap_or(&s.path).to_string();
        match s.kind.as_str() {
            "folder" if !s.nested.is_empty() => {
                let mut i = issue("warn", "nested", format!("Paczka w dodatkowym folderze: {name}"), format!("Symulator nie widzi {} pakietów schowanych o poziom głębiej. Wyciągnięcie ich do Community naprawi instalację.", s.nested.len()));
                i.paths = vec![s.path.clone()];
                i.fix = "flatten".into();
                i.fix_label = "Wyciągnij pakiety".into();
                out.push(i);
            }
            "folder" => {
                let mut i = issue("info", "no-manifest", format!("Folder bez manifest.json: {name}"), "To nie jest pakiet MSFS – symulator go pomija, ale przeszukuje przy każdym starcie.".into());
                i.paths = vec![s.path.clone()];
                i.fix = "trash".into();
                i.fix_label = "Do kosza".into();
                out.push(i);
            }
            "archive" => {
                let mut i = issue("info", "archive", format!("Archiwum w Community: {name}"), "Archiwa w Community nic nie robią. Zainstaluj je do biblioteki albo usuń.".into());
                i.paths = vec![s.path.clone()];
                i.fix = "install".into();
                i.fix_label = "Zainstaluj".into();
                out.push(i);
            }
            _ => {}
        }
    }

    let mut by_key: HashMap<&str, Vec<&crate::engine::Pkg>> = HashMap::new();
    for p in &scan.packages {
        by_key.entry(p.key.as_str()).or_default().push(p);
    }
    let mut dup_keys: Vec<_> = by_key.iter().filter(|(_, v)| v.len() > 1).collect();
    dup_keys.sort_by_key(|(k, _)| *k);
    for (_, copies) in dup_keys {
        let enabled = copies.iter().filter(|p| p.enabled).count();
        let title = &copies[0].info.title;
        let mut i = if enabled > 1 {
            let mut i = issue("error", "double-enabled", format!("Kilka kopii włączonych naraz: {title}"), "Ten sam pakiet jest w Community więcej niż raz – symulator wczyta tylko jedną kopię i może mieszać pliki.".into());
            i.fix = "disable-copies".into();
            i.fix_label = "Zostaw jedną".into();
            i
        } else {
            issue("info", "duplicate", format!("Duplikat: {title}"), format!("{} kopie tego samego pakietu zajmują miejsce na dysku.", copies.len()))
        };
        i.packages = copies.iter().map(|p| p.id.clone()).collect();
        i.paths = copies.iter().map(|p| format!("{} · {}", p.info.version, p.path)).collect();
        out.push(i);
    }

    let enabled_keys: HashSet<&str> = scan.packages.iter().filter(|p| p.enabled).map(|p| p.key.as_str()).collect();
    for p in scan.packages.iter().filter(|p| p.enabled) {
        for d in &p.info.dependencies {
            let k = d.name.to_lowercase();
            if enabled_keys.contains(k.as_str()) || official.contains(&k) || k.starts_with("fs-base") || k.starts_with("asobo-") || k.starts_with("microsoft-") {
                continue;
            }
            if let Some(dep) = scan.packages.iter().find(|x| x.key == k) {
                let mut i = issue("warn", "dependency-off", format!("Wyłączona zależność: {}", dep.info.title), format!("„{}” wymaga pakietu „{}”, który jest wyłączony.", p.info.title, dep.info.title));
                i.packages = vec![dep.id.clone(), p.id.clone()];
                i.fix = "enable".into();
                i.fix_label = "Włącz zależność".into();
                out.push(i);
            } else {
                let mut i = issue("info", "dependency-missing", format!("Brak zależności: {}", d.name), format!("„{}” deklaruje zależność od „{}”, której nie ma w Community ani w bibliotekach (może to być pakiet oficjalny).", p.info.title, d.name));
                i.packages = vec![p.id.clone()];
                out.push(i);
            }
        }
        if p.info.has_manifest && !p.info.has_layout {
            let mut i = issue("warn", "no-layout", format!("Brak layout.json: {}", p.info.title), "Bez layout.json symulator nie zna plików pakietu – dodatek może się nie wczytać. Plik da się odtworzyć.".into());
            i.packages = vec![p.id.clone()];
            i.fix = "layout".into();
            i.fix_label = "Odtwórz layout.json".into();
            out.push(i);
        }
        if !p.info.error.is_empty() {
            let mut i = issue("error", "manifest", format!("{}: {}", p.info.title, p.info.error), p.path.clone());
            i.packages = vec![p.id.clone()];
            out.push(i);
        }
    }

    // Kilka włączonych scenerii tego samego lotniska – wygrywa jedna, reszta tylko obciąża.
    let mut by_icao: HashMap<&str, Vec<&crate::engine::Pkg>> = HashMap::new();
    for p in scan.packages.iter().filter(|p| p.enabled && p.info.category == "airport") {
        for a in p.info.airports.iter().filter(|a| a.source == "bgl").take(40) {
            by_icao.entry(a.icao.as_str()).or_default().push(p);
        }
    }
    let mut conflicts: Vec<_> = by_icao.into_iter().filter(|(_, v)| v.len() > 1).collect();
    conflicts.sort_by_key(|(k, _)| *k);
    for (icao, list) in conflicts {
        let mut ids: Vec<String> = list.iter().map(|p| p.id.clone()).collect();
        ids.dedup();
        if ids.len() < 2 {
            continue;
        }
        let names: Vec<String> = list.iter().map(|p| p.info.title.clone()).collect();
        let mut i = issue("warn", "airport-conflict", format!("Konflikt lotniska {icao}"), format!("{} włączone scenerie zawierają {icao}: {}. Zostaw jedną.", ids.len(), names.join(", ")));
        i.packages = ids;
        out.push(i);
    }

    let native: Vec<&crate::engine::Pkg> = scan.packages.iter().filter(|p| p.source == "community").collect();
    if !native.is_empty() && !scan.libraries.is_empty() {
        let size: u64 = native.iter().map(|p| p.info.size).sum();
        let mut i = issue("info", "native", format!("{} pakietów leży bezpośrednio w Community", native.len()), format!("Razem {:.1} GB. Po przeniesieniu do biblioteki zostaną włączone przez łącza – Community zostaje czysty, a dodatki można trzymać na innym dysku.", size as f64 / 1e9));
        i.packages = native.iter().map(|p| p.id.clone()).collect();
        i.fix = "relocate".into();
        i.fix_label = "Przenieś do biblioteki".into();
        out.push(i);
    }

    for (n, i) in out.iter_mut().enumerate() {
        i.id = format!("{}-{n}", i.kind);
    }
    let rank = |s: &str| match s {
        "error" => 0,
        "warn" => 1,
        _ => 2,
    };
    out.sort_by_key(|i| rank(&i.severity));
    out
}
