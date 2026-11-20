//! Język komunikatów wysyłanych z backendu (błędy, wyniki napraw, kontrola kondycji).
//! Interfejs ustawia go komendą `set_language` zaraz po starcie i przy każdej zmianie w ustawieniach.

use std::sync::atomic::{AtomicBool, Ordering};

static EN: AtomicBool = AtomicBool::new(true);

pub fn set(code: &str) {
    EN.store(code != "pl", Ordering::Relaxed);
}

pub fn en() -> bool {
    EN.load(Ordering::Relaxed)
}

/// `tr!("polski {x}", "English {x}", args…)` – tekst w bieżącym języku aplikacji (zawsze `String`).
macro_rules! tr {
    ($pl:literal, $en:literal $(, $a:expr)* $(,)?) => {
        if $crate::i18n::en() { format!($en $(, $a)*) } else { format!($pl $(, $a)*) }
    };
}
