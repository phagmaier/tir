//! Starts Tir. The Rust side only reads and writes files, runs git and
//! opens system dialogs (architecture, design rule 3); so far it keeps the
//! window's settings.

mod settings;

use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Where Tir keeps its settings: Tir's config directory
/// (`~/.config/dev.tir.desktop` on Linux), or `TIR_CONFIG_DIR` when set, so
/// that tests and trial runs use a temporary directory.
fn settings_dir(app: &AppHandle) -> Result<PathBuf, String> {
    match std::env::var_os("TIR_CONFIG_DIR").filter(|dir| !dir.is_empty()) {
        Some(dir) => Ok(PathBuf::from(dir)),
        None => app
            .path()
            .app_config_dir()
            .map_err(|error| error.to_string()),
    }
}

/// The settings file's text, or `None` when there is none yet.
#[tauri::command(async)]
fn read_settings(app: AppHandle) -> Result<Option<String>, String> {
    settings::read(&settings_dir(&app)?).map_err(|error| error.to_string())
}

/// Replaces the settings file with `text`.
#[tauri::command(async)]
fn write_settings(app: AppHandle, text: String) -> Result<(), String> {
    settings::write(&settings_dir(&app)?, &text).map_err(|error| error.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![read_settings, write_settings])
        .run(tauri::generate_context!())
        .expect("error while running Tir");
}
