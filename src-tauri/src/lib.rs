//! Starts Tir. The Rust side only reads and writes files, runs git and
//! opens system dialogs (architecture, design rule 3); so far it keeps the
//! window's settings and the library, shows the dialogs, and holds the
//! window open on closing until the page has saved.

mod closing;
mod dialogs;
mod files;
mod library;
mod settings;

use std::path::PathBuf;
use tauri::{AppHandle, Manager, RunEvent, State, WindowEvent};

/// `TIR_CONFIG_DIR`, which tests and trial runs set to a temporary
/// directory, for the settings and, unless they name one, the library.
fn sandbox() -> Option<PathBuf> {
    std::env::var_os("TIR_CONFIG_DIR")
        .filter(|dir| !dir.is_empty())
        .map(PathBuf::from)
}

/// Where Tir keeps its settings: Tir's config directory
/// (`~/.config/dev.tir.desktop` on Linux), or `TIR_CONFIG_DIR` when set.
fn settings_dir(app: &AppHandle) -> Result<PathBuf, String> {
    match sandbox() {
        Some(dir) => Ok(dir),
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

/// Replaces the settings file with `text`, which must name the library the
/// file named when Tir started: the page keeps that field and may not move
/// the library (architecture, "File access").
#[tauri::command(async)]
fn write_settings(
    app: AppHandle,
    library: State<'_, library::Library>,
    text: String,
) -> Result<(), String> {
    if settings::library(&text).as_deref() != library.configured() {
        return Err("The settings may not move the library.".into());
    }
    settings::write(&settings_dir(&app)?, &text).map_err(|error| error.to_string())
}

/// The library, where the settings file says or in its default place
/// (`library::root`). A settings file Tir cannot read names none.
fn find_library(app: &AppHandle) -> library::Library {
    let configured = settings_dir(app)
        .ok()
        .and_then(|dir| settings::read(&dir).ok().flatten())
        .and_then(|text| settings::library(&text));
    let home = app.path().home_dir().ok();
    let root = library::root(configured.as_deref(), home.as_deref(), sandbox().as_deref());
    library::Library::new(root, configured)
}

pub fn run() {
    let app = tauri::Builder::default()
        // Its dialogs are shown from this side only: the page is given none
        // of the plugin's commands (capabilities/default.json).
        .plugin(tauri_plugin_dialog::init())
        .manage(dialogs::Dialogs::default())
        .manage(closing::Closing::default())
        .setup(|app| {
            app.manage(find_library(app.handle()));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event
                && window.state::<closing::Closing>().hold(window)
            {
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            read_settings,
            write_settings,
            library::commands::list_library,
            library::commands::library_place,
            library::commands::create_project,
            library::commands::write_project,
            library::commands::rename_project,
            library::commands::delete_project,
            library::commands::create_draft,
            library::commands::read_draft,
            library::commands::write_draft,
            library::commands::rename_draft,
            library::commands::delete_draft,
            dialogs::open_script,
            dialogs::ask,
            dialogs::tell,
            closing::hold_close,
            closing::close_window,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Tir");
    app.run(|app, event| {
        if let RunEvent::Exit = event {
            // A save or change under way when the window went finishes first.
            app.state::<library::Library>().finish_commands();
        }
    });
}
