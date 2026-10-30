//! Trwałe dane aplikacji: ustawienia, profile, opisy pakietów (ulubione, blokady, tagi),
//! dziennik operacji i pamięć podręczna skanu. Każdy plik zapisujemy atomowo
//! (plik tymczasowy + zmiana nazwy), żeby awaria w trakcie zapisu nie zostawiła połówki.

use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    pub id: String,
    pub path: String,
    pub name: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PackageMeta {
    pub favorite: bool,
    /// Zablokowany pakiet zostaje włączony przy przełączaniu profili i „wyłącz wszystko”.
    pub locked: bool,
    pub category: String,
    pub tags: Vec<String>,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub installation_id: String,
    /// Własny folder Community (gdy wykrywanie nie trafia albo symulator jest „przenośny”).
    pub custom_community: String,
    /// Który z folderów Community dostaje nowe łącza (MSFS 2024: Community albo Community2024).
    pub target_community: String,
    pub libraries: Vec<Library>,
    /// Folder na wyłączone pakiety, które leżały bezpośrednio w Community. Pusty = obok Community.
    pub parking: String,
    pub link_mode: String,
    pub block_while_running: bool,
    pub confirm_bulk: bool,
    pub auto_update_check: bool,
    pub theme: String,
    pub accent: String,
    pub language: String,
    pub view: String,
    pub card_size: u32,
    pub map_style: String,
    pub sort: String,
    pub meta: HashMap<String, PackageMeta>,
    /// Pakiety spoza bibliotek, które kiedyś były podlinkowane w Community – pamiętamy je,
    /// żeby po wyłączeniu dało się je włączyć z powrotem.
    pub external: Vec<String>,
    pub onboarded: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            installation_id: String::new(),
            custom_community: String::new(),
            target_community: String::new(),
            libraries: vec![],
            parking: String::new(),
            link_mode: "junction".into(),
            block_while_running: true,
            confirm_bulk: true,
            auto_update_check: true,
            theme: "dark".into(),
            accent: "sky".into(),
            language: "pl".into(),
            view: "grid".into(),
            card_size: 240,
            map_style: "dark".into(),
            sort: "title".into(),
            meta: HashMap::new(),
            external: vec![],
            onboarded: false,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub note: String,
    pub color: String,
    /// Nazwy folderów pakietów (małymi literami), które profil włącza.
    pub packages: Vec<String>,
    /// Pakiety oficjalne, które profil wyłącza (z Content.xml).
    pub official_disabled: Vec<String>,
    pub created: String,
    pub updated: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum Op {
    /// Utworzono łącze `link` → `target`.
    Link { link: String, target: String },
    /// Usunięto łącze `link` → `target`.
    Unlink { link: String, target: String },
    /// Przeniesiono folder.
    Move { from: String, to: String },
    /// Zmieniono stan pakietu oficjalnego w Content.xml.
    Official { name: String, from: String, to: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub batch: String,
    pub at: String,
    pub label: String,
    pub title: String,
    pub op: Op,
    #[serde(default)]
    pub undone: bool,
}

pub struct Store {
    pub dir: PathBuf,
}

impl Store {
    pub fn new(dir: PathBuf) -> Self {
        let _ = std::fs::create_dir_all(&dir);
        Self { dir }
    }

    fn path(&self, name: &str) -> PathBuf {
        self.dir.join(name)
    }

    pub fn load<T: DeserializeOwned + Default>(&self, name: &str) -> T {
        std::fs::read(self.path(name)).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
    }

    pub fn save<T: Serialize>(&self, name: &str, value: &T) -> Result<(), String> {
        write_atomic(&self.path(name), &serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?)
    }

    pub fn settings(&self) -> Settings {
        self.load("settings.json")
    }

    pub fn profiles(&self) -> Vec<Profile> {
        self.load("profiles.json")
    }

    pub fn journal(&self) -> Vec<Entry> {
        self.load("history.json")
    }

    pub fn append_journal(&self, entries: Vec<Entry>) {
        if entries.is_empty() {
            return;
        }
        let mut all = self.journal();
        all.extend(entries);
        let len = all.len();
        if len > 2000 {
            all.drain(0..len - 2000);
        }
        let _ = self.save("history.json", &all);
    }
}

pub fn write_atomic(path: &Path, data: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension(format!("tmp{}", std::process::id()));
    std::fs::write(&tmp, data).map_err(|e| format!("Zapis {}: {e}", path.display()))?;
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("Zapis {}: {e}", path.display())
    })
}

pub fn now() -> String {
    chrono::Local::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, false)
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().simple().to_string()[..12].to_string()
}
