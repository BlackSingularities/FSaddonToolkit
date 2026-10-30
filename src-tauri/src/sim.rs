//! Wykrywanie instalacji Microsoft Flight Simulator (2024 i 2020, Steam i Microsoft Store),
//! odczyt `UserCfg.opt`, położenie folderów Community, `Content.xml` i stan procesu symulatora.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Installation {
    /// Stały identyfikator: `msfs2024-steam`, `msfs2024-store`, `msfs2020-steam`, `msfs2020-store`.
    pub id: String,
    pub label: String,
    /// "2024" albo "2020".
    pub sim: String,
    /// "steam" albo "store".
    pub store: String,
    pub user_cfg: String,
    pub packages_path: String,
    /// Foldery Community, które symulator czyta (MSFS 2024 czyta też `Community2024`).
    pub communities: Vec<String>,
    pub content_xml: Option<String>,
    /// Foldery z pakietami oficjalnymi zainstalowanymi na dysku (miniatury dla widoku DLC).
    pub official_dirs: Vec<String>,
    pub launch_uri: String,
}

struct Candidate {
    id: &'static str,
    label: &'static str,
    sim: &'static str,
    store: &'static str,
    base: PathBuf,
    launch: &'static str,
}

fn env_dir(name: &str) -> Option<PathBuf> {
    std::env::var_os(name).map(PathBuf::from)
}

fn candidates() -> Vec<Candidate> {
    let mut out = vec![];
    if let Some(local) = env_dir("LOCALAPPDATA") {
        out.push(Candidate {
            id: "msfs2024-store",
            label: "MSFS 2024 · Microsoft Store / Xbox",
            sim: "2024",
            store: "store",
            base: local.join(r"Packages\Microsoft.Limitless_8wekyb3d8bbwe\LocalCache"),
            launch: r"shell:AppsFolder\Microsoft.Limitless_8wekyb3d8bbwe!App",
        });
        out.push(Candidate {
            id: "msfs2020-store",
            label: "MSFS 2020 · Microsoft Store / Xbox",
            sim: "2020",
            store: "store",
            base: local.join(r"Packages\Microsoft.FlightSimulator_8wekyb3d8bbwe\LocalCache"),
            launch: r"shell:AppsFolder\Microsoft.FlightSimulator_8wekyb3d8bbwe!App",
        });
    }
    if let Some(roaming) = env_dir("APPDATA") {
        out.push(Candidate {
            id: "msfs2024-steam",
            label: "MSFS 2024 · Steam",
            sim: "2024",
            store: "steam",
            base: roaming.join("Microsoft Flight Simulator 2024"),
            launch: "steam://rungameid/2537590",
        });
        out.push(Candidate {
            id: "msfs2020-steam",
            label: "MSFS 2020 · Steam",
            sim: "2020",
            store: "steam",
            base: roaming.join("Microsoft Flight Simulator"),
            launch: "steam://rungameid/1250410",
        });
    }
    out
}

/// Wartość `InstalledPackagesPath` z pliku `UserCfg.opt`.
pub fn parse_packages_path(cfg: &str) -> Option<String> {
    cfg.lines().find_map(|line| {
        let line = line.trim();
        let rest = line.strip_prefix("InstalledPackagesPath")?;
        let value = rest.trim().trim_matches('"').trim();
        (!value.is_empty()).then(|| value.to_string())
    })
}

/// `Content.xml` bywa w LocalCache albo w podfolderze profilu gracza – bierzemy najnowszy.
fn find_content_xml(base: &Path) -> Option<PathBuf> {
    walkdir::WalkDir::new(base)
        .max_depth(2)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file() && e.file_name().eq_ignore_ascii_case("Content.xml"))
        .filter_map(|e| {
            let modified = e.metadata().ok()?.modified().ok()?;
            Some((modified, e.into_path()))
        })
        .max_by_key(|(m, _)| *m)
        .map(|(_, p)| p)
}

pub fn detect() -> Vec<Installation> {
    let mut out = vec![];
    for c in candidates() {
        let cfg_path = c.base.join("UserCfg.opt");
        let Ok(cfg) = std::fs::read_to_string(&cfg_path) else { continue };
        let Some(packages) = parse_packages_path(&cfg) else { continue };
        let packages = PathBuf::from(packages);
        let mut communities = vec![packages.join("Community").to_string_lossy().into_owned()];
        if c.sim == "2024" && packages.join("Community2024").is_dir() {
            communities.push(packages.join("Community2024").to_string_lossy().into_owned());
        }
        let official_dirs = ["Official\\OneStore", "Official\\Steam", "Official2020\\OneStore", "Official2020\\Steam", "Official2024\\OneStore", "Official2024\\Steam"]
            .iter()
            .map(|d| packages.join(d))
            .filter(|p| p.is_dir())
            .map(|p| p.to_string_lossy().into_owned())
            .collect();
        out.push(Installation {
            id: c.id.into(),
            label: c.label.into(),
            sim: c.sim.into(),
            store: c.store.into(),
            user_cfg: cfg_path.to_string_lossy().into_owned(),
            packages_path: packages.to_string_lossy().into_owned(),
            communities,
            content_xml: find_content_xml(&c.base).map(|p| p.to_string_lossy().into_owned()),
            official_dirs,
            launch_uri: c.launch.into(),
        });
    }
    // Najpierw MSFS 2024, potem 2020.
    out.sort_by(|a, b| b.sim.cmp(&a.sim).then(a.store.cmp(&b.store)));
    out
}

static RUNNING: Mutex<Option<(Instant, bool)>> = Mutex::new(None);

/// Czy symulator (2024 albo 2020) jest uruchomiony. Wynik trzymamy przez 3 s.
pub fn is_running() -> bool {
    let mut guard = RUNNING.lock().unwrap_or_else(|e| e.into_inner());
    if let Some((at, value)) = *guard {
        if at.elapsed() < Duration::from_secs(3) {
            return value;
        }
    }
    let mut sys = sysinfo::System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let running = sys.processes().values().any(|p| {
        let name = p.name().to_string_lossy().to_lowercase();
        name == "flightsimulator2024.exe" || name == "flightsimulator.exe"
    });
    *guard = Some((Instant::now(), running));
    running
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Disk {
    pub mount: String,
    pub name: String,
    pub total: u64,
    pub free: u64,
}

pub fn disks() -> Vec<Disk> {
    let list = sysinfo::Disks::new_with_refreshed_list();
    let mut out: Vec<Disk> = list
        .list()
        .iter()
        .filter(|d| d.total_space() > 0)
        .map(|d| Disk {
            mount: d.mount_point().to_string_lossy().into_owned(),
            name: d.name().to_string_lossy().into_owned(),
            total: d.total_space(),
            free: d.available_space(),
        })
        .collect();
    out.sort_by(|a, b| a.mount.cmp(&b.mount));
    out.dedup_by(|a, b| a.mount == b.mount);
    out
}

pub fn launch(uri: &str) -> Result<(), String> {
    if !(uri.starts_with("steam://rungameid/") || uri.starts_with("shell:AppsFolder\\")) {
        return Err("Nieznany sposób uruchomienia symulatora".into());
    }
    std::process::Command::new("explorer.exe")
        .arg(uri)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Nie udało się uruchomić symulatora: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_installed_packages_path() {
        let cfg = "Version 59\n{Graphics\n\tVersion 1.1\n}\nInstalledPackagesPath \"D:\\MSFS 2024\\Packages\"\n";
        assert_eq!(parse_packages_path(cfg).as_deref(), Some("D:\\MSFS 2024\\Packages"));
        assert_eq!(parse_packages_path("Version 1\n"), None);
    }
}
