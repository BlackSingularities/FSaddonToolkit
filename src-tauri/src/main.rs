// Bez okna konsoli w wydaniu na Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    fs_addon_toolkit_lib::run()
}
