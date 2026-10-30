//! Łącza katalogów w folderze Community.
//!
//! Domyślnie tworzymy połączenia katalogów NTFS (junction): nie wymagają uprawnień
//! administratora ani trybu dewelopera i działają między dyskami lokalnymi. Dla dysków
//! sieciowych potrzebne jest dowiązanie symboliczne – wtedy Windows wymaga trybu dewelopera.
//!
//! Usuwanie łącza zawsze idzie przez `remove_dir` na samym łączu, nigdy przez
//! `remove_dir_all` – cel łącza (biblioteka dodatków) zostaje nietknięty.

use std::path::{Path, PathBuf};

/// Ścieżka do porównań: bez przedrostków `\\?\` i `\??\`, z ukośnikami Windows, małymi literami.
pub fn norm(path: &Path) -> String {
    let s = path.to_string_lossy().replace('/', "\\");
    let s = s
        .strip_prefix(r"\\?\UNC\")
        .map(|r| format!(r"\\{r}"))
        .or_else(|| s.strip_prefix(r"\\?\").map(String::from))
        .or_else(|| s.strip_prefix(r"\??\").map(String::from))
        .unwrap_or(s);
    s.trim_end_matches('\\').to_lowercase()
}

/// Ścieżka czytelna dla człowieka (bez przedrostków rozszerzonej długości).
pub fn clean(path: &Path) -> PathBuf {
    let s = path.to_string_lossy();
    if let Some(r) = s.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{r}"));
    }
    if let Some(r) = s.strip_prefix(r"\\?\").or_else(|| s.strip_prefix(r"\??\")) {
        return PathBuf::from(r);
    }
    path.to_path_buf()
}

/// Czy ścieżka jest łączem (junction albo dowiązaniem symbolicznym), bez podążania za nim.
pub fn is_link(path: &Path) -> bool {
    std::fs::symlink_metadata(path).map(|m| m.file_type().is_symlink()).unwrap_or(false)
}

/// Cel łącza albo `None`, gdy ścieżka nie jest łączem.
pub fn target(path: &Path) -> Option<PathBuf> {
    if !is_link(path) {
        return None;
    }
    let t = std::fs::read_link(path).ok()?;
    let t = clean(&t);
    // Względne dowiązania symboliczne liczymy od folderu, w którym leżą.
    Some(if t.is_relative() { path.parent().map(|p| p.join(&t)).unwrap_or(t) } else { t })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Junction,
    Symlink,
}

impl Mode {
    pub fn parse(s: &str) -> Self {
        if s == "symlink" { Mode::Symlink } else { Mode::Junction }
    }
}

fn is_network(path: &Path) -> bool {
    path.to_string_lossy().starts_with(r"\\")
}

/// Tworzy łącze `link` → `target`. Gdy połączenie katalogów jest niemożliwe (dysk sieciowy),
/// próbuje dowiązania symbolicznego.
pub fn create(link: &Path, target: &Path, mode: Mode) -> Result<(), String> {
    if std::fs::symlink_metadata(link).is_ok() {
        return Err(format!("W folderze Community istnieje już „{}”", link.file_name().unwrap_or_default().to_string_lossy()));
    }
    if !target.is_dir() {
        return Err(format!("Folder dodatku nie istnieje: {}", target.display()));
    }
    let want_symlink = mode == Mode::Symlink || is_network(target);
    if !want_symlink {
        match create_junction(link, target) {
            Ok(()) => return Ok(()),
            Err(e) if is_network(target) => return Err(e),
            Err(e) => {
                // Ostatnia próba – dowiązanie (zadziała w trybie dewelopera).
                return create_symlink(link, target).map_err(|_| e);
            }
        }
    }
    create_symlink(link, target)
}

#[cfg(windows)]
fn create_junction(link: &Path, target: &Path) -> Result<(), String> {
    junction::create(target, link).map_err(|e| format!("Nie udało się utworzyć łącza katalogu: {e}"))
}

#[cfg(not(windows))]
fn create_junction(link: &Path, target: &Path) -> Result<(), String> {
    create_symlink(link, target)
}

#[cfg(windows)]
fn create_symlink(link: &Path, target: &Path) -> Result<(), String> {
    std::os::windows::fs::symlink_dir(target, link).map_err(|e| {
        if e.raw_os_error() == Some(1314) {
            "Dowiązania symboliczne wymagają włączonego trybu dewelopera Windows (Ustawienia → System → Dla deweloperów)".to_string()
        } else {
            format!("Nie udało się utworzyć dowiązania: {e}")
        }
    })
}

#[cfg(not(windows))]
fn create_symlink(link: &Path, target: &Path) -> Result<(), String> {
    std::os::unix::fs::symlink(target, link).map_err(|e| format!("Nie udało się utworzyć dowiązania: {e}"))
}

/// Usuwa samo łącze. Odmawia, gdy ścieżka jest zwykłym folderem.
pub fn remove(link: &Path) -> Result<(), String> {
    if !is_link(link) {
        return Err(format!("„{}” nie jest łączem – nie usuwam zwykłego folderu", link.display()));
    }
    std::fs::remove_dir(link)
        .or_else(|_| std::fs::remove_file(link))
        .map_err(|e| format!("Nie udało się usunąć łącza: {e}"))
}

/// Czy dwie ścieżki leżą na tym samym woluminie (wtedy przeniesienie to zwykła zmiana nazwy).
pub fn same_volume(a: &Path, b: &Path) -> bool {
    fn root(p: &Path) -> String {
        let n = norm(p);
        if let Some(rest) = n.strip_prefix(r"\\") {
            // \\serwer\udział
            return rest.split('\\').take(2).collect::<Vec<_>>().join("\\");
        }
        n.split('\\').next().unwrap_or("").to_string()
    }
    root(a) == root(b)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_prefixes() {
        assert_eq!(norm(Path::new(r"\\?\D:\Addons\Pkg\")), r"d:\addons\pkg");
        assert_eq!(norm(Path::new(r"\??\D:\Addons\Pkg")), r"d:\addons\pkg");
        assert_eq!(norm(Path::new(r"\\?\UNC\nas\sim\Pkg")), r"\\nas\sim\pkg");
        assert!(same_volume(Path::new(r"D:\a"), Path::new(r"d:\b\c")));
        assert!(!same_volume(Path::new(r"C:\a"), Path::new(r"D:\a")));
    }

    #[test]
    fn link_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("lib").join("pkg");
        std::fs::create_dir_all(&dest).unwrap();
        std::fs::write(dest.join("manifest.json"), "{}").unwrap();
        let community = dir.path().join("Community");
        std::fs::create_dir_all(&community).unwrap();
        let link = community.join("pkg");
        create(&link, &dest, Mode::Junction).unwrap();
        assert!(is_link(&link));
        assert_eq!(norm(&target(&link).unwrap()), norm(&dest));
        assert!(link.join("manifest.json").exists());
        remove(&link).unwrap();
        assert!(!link.exists());
        assert!(dest.join("manifest.json").exists(), "cel łącza musi zostać");
        assert!(remove(&dest).is_err(), "zwykłego folderu nie usuwamy");
    }
}
