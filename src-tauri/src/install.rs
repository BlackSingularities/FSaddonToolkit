//! Instalacja dodatków z archiwów i folderów do biblioteki.
//!
//! ZIP rozpakowujemy sami. RAR i 7z – przez 7-Zip, gdy jest zainstalowany, a w przeciwnym
//! razie przez `tar.exe` wbudowany w Windows 11 (libarchive czyta oba formaty).
//! Rozpakowanie idzie do folderu tymczasowego w tej samej bibliotece, więc przeniesienie
//! gotowych pakietów na miejsce to tylko zmiana nazwy.

use crate::package;
use std::path::{Path, PathBuf};
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const NO_WINDOW: u32 = 0x0800_0000;

fn hidden(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    cmd.creation_flags(NO_WINDOW);
    cmd
}

fn seven_zip() -> Option<PathBuf> {
    ["ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"]
        .iter()
        .filter_map(std::env::var_os)
        .map(|p| PathBuf::from(p).join("7-Zip").join("7z.exe"))
        .find(|p| p.is_file())
}

fn extract_zip(archive: &Path, dest: &Path, progress: &mut dyn FnMut(u64, u64)) -> Result<(), String> {
    let file = std::fs::File::open(archive).map_err(|e| format!("Otwarcie archiwum: {e}"))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("Uszkodzone archiwum ZIP: {e}"))?;
    let total = zip.len() as u64;
    for i in 0..zip.len() {
        let mut f = zip.by_index(i).map_err(|e| format!("Archiwum ZIP: {e}"))?;
        // `enclosed_name` odrzuca ścieżki wychodzące poza folder docelowy („../”).
        let Some(rel) = f.enclosed_name() else { continue };
        let out = dest.join(&rel);
        if f.is_dir() {
            std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut w = std::fs::File::create(&out).map_err(|e| format!("Zapis {}: {e}", out.display()))?;
        std::io::copy(&mut f, &mut w).map_err(|e| format!("Rozpakowanie {}: {e}", rel.display()))?;
        if i % 50 == 0 {
            progress(i as u64, total);
        }
    }
    progress(total, total);
    Ok(())
}

fn extract_external(archive: &Path, dest: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    let output = if let Some(sz) = seven_zip() {
        hidden(Command::new(sz).arg("x").arg("-y").arg(format!("-o{}", dest.display())).arg(archive)).output()
    } else {
        hidden(Command::new("tar.exe").arg("-xf").arg(archive).arg("-C").arg(dest)).output()
    }
    .map_err(|e| format!("Nie udało się uruchomić rozpakowywania: {e}"))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "Nie udało się rozpakować {} – zainstaluj 7-Zip (7-zip.org) albo rozpakuj ręcznie. {}",
            archive.file_name().unwrap_or_default().to_string_lossy(),
            err.lines().last().unwrap_or("")
        ));
    }
    Ok(())
}

pub fn is_archive(path: &Path) -> bool {
    let l = path.to_string_lossy().to_lowercase();
    l.ends_with(".zip") || l.ends_with(".rar") || l.ends_with(".7z")
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Installed {
    pub folder: String,
    pub path: String,
    pub replaced: bool,
}

/// Przenosi znalezione pakiety z `staging` do biblioteki. Istniejące foldery idą do kosza,
/// gdy `replace`, w przeciwnym razie pakiet jest pomijany z błędem.
fn place(staging: &Path, library: &Path, replace: bool, errors: &mut Vec<String>) -> Vec<Installed> {
    let mut out = vec![];
    for p in package::find_packages(staging, 5) {
        let folder = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let dest = library.join(&folder);
        let mut replaced = false;
        if dest.exists() {
            if !replace {
                errors.push(format!("„{folder}” jest już w bibliotece – pominięto (włącz zastępowanie, żeby zaktualizować)"));
                continue;
            }
            if crate::links::is_link(&dest) {
                errors.push(format!("„{folder}” w bibliotece jest łączem – pominięto"));
                continue;
            }
            if let Err(e) = trash::delete(&dest) {
                errors.push(format!("Nie udało się usunąć starej wersji „{folder}”: {e}"));
                continue;
            }
            replaced = true;
        }
        match std::fs::rename(&p, &dest) {
            Ok(()) => out.push(Installed { folder, path: dest.to_string_lossy().into_owned(), replaced }),
            Err(e) => errors.push(format!("Przeniesienie „{folder}”: {e}")),
        }
    }
    out
}

pub fn install_archive(archive: &Path, library: &Path, replace: bool, errors: &mut Vec<String>, progress: &mut dyn FnMut(u64, u64)) -> Vec<Installed> {
    let staging = library.join(format!(".fsat-tmp-{}", crate::store::new_id()));
    let res = if archive.to_string_lossy().to_lowercase().ends_with(".zip") {
        extract_zip(archive, &staging, progress)
    } else {
        extract_external(archive, &staging)
    };
    let out = match res {
        Ok(()) => {
            let placed = place(&staging, library, replace, errors);
            if placed.is_empty() && errors.is_empty() {
                errors.push(format!("W archiwum {} nie ma pakietu MSFS (brak manifest.json)", archive.file_name().unwrap_or_default().to_string_lossy()));
            }
            placed
        }
        Err(e) => {
            errors.push(e);
            vec![]
        }
    };
    let _ = std::fs::remove_dir_all(&staging);
    out
}

/// Kopiuje pakiety z folderu (np. przeciągniętego z Pobranych) do biblioteki.
pub fn install_folder(dir: &Path, library: &Path, replace: bool, errors: &mut Vec<String>, progress: &mut dyn FnMut(u64, u64)) -> Vec<Installed> {
    let found = package::find_packages(dir, 5);
    if found.is_empty() {
        errors.push(format!("W folderze {} nie ma pakietu MSFS (brak manifest.json)", dir.display()));
        return vec![];
    }
    let staging = library.join(format!(".fsat-tmp-{}", crate::store::new_id()));
    for p in &found {
        let folder = p.file_name().unwrap_or_default();
        if let Err(e) = crate::engine::copy_dir(p, &staging.join(folder), progress) {
            errors.push(e);
        }
    }
    let out = place(&staging, library, replace, errors);
    let _ = std::fs::remove_dir_all(&staging);
    out
}

/// Pakiety schowane w dodatkowym folderze w Community wyciąga o poziom wyżej.
pub fn flatten(wrapper: &Path, community: &Path) -> Result<usize, String> {
    let found = package::find_packages(wrapper, 4);
    let mut moved = 0;
    for p in found {
        let folder = p.file_name().unwrap_or_default();
        let dest = community.join(folder);
        if dest.exists() {
            return Err(format!("W Community jest już „{}”", folder.to_string_lossy()));
        }
        std::fs::rename(&p, &dest).map_err(|e| format!("Przeniesienie: {e}"))?;
        moved += 1;
    }
    // Pusty (lub prawie pusty) folder po paczce trafia do kosza.
    let _ = trash::delete(wrapper);
    Ok(moved)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn installs_zip_with_wrapper_folder() {
        let dir = tempfile::tempdir().unwrap();
        let zip_path = dir.path().join("addon.zip");
        {
            let f = std::fs::File::create(&zip_path).unwrap();
            let mut z = zip::ZipWriter::new(f);
            let o = zip::write::SimpleFileOptions::default();
            z.start_file("Addon v1.0/vendor-airport-epkk/manifest.json", o).unwrap();
            z.write_all(br#"{"title":"EPKK","content_type":"SCENERY"}"#).unwrap();
            z.start_file("Addon v1.0/vendor-airport-epkk/layout.json", o).unwrap();
            z.write_all(br#"{"content":[]}"#).unwrap();
            z.start_file("Addon v1.0/readme.txt", o).unwrap();
            z.write_all(b"czytaj").unwrap();
            z.finish().unwrap();
        }
        let lib = dir.path().join("lib");
        std::fs::create_dir_all(&lib).unwrap();
        let mut errors = vec![];
        let got = install_archive(&zip_path, &lib, false, &mut errors, &mut |_, _| {});
        assert!(errors.is_empty(), "{errors:?}");
        assert_eq!(got.len(), 1);
        assert!(lib.join("vendor-airport-epkk").join("manifest.json").exists());
        assert_eq!(std::fs::read_dir(&lib).unwrap().count(), 1, "folder tymczasowy usunięty");
        let again = install_archive(&zip_path, &lib, false, &mut errors, &mut |_, _| {});
        assert!(again.is_empty());
        assert_eq!(errors.len(), 1);
    }
}
