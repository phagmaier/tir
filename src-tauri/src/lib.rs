//! Starts Tir. The Rust side only reads and writes files, runs git and
//! opens system dialogs (architecture, design rule 3): it keeps the
//! window's settings and the library, backs the library up with git, shows
//! the dialogs, and holds the window open on closing until the page has
//! saved.

mod backup;
mod closing;
mod dialogs;
mod files;
mod git;
mod github;
mod instance;
mod library;
mod settings;

use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WebviewWindowBuilder, WindowEvent};

/// `TIR_CONFIG_DIR`, which tests and trial runs set to a temporary
/// directory, for the settings and, unless they name one, the library;
/// made absolute, so the library's folders are found and synced.
fn sandbox() -> Option<PathBuf> {
    std::env::var_os("TIR_CONFIG_DIR")
        .filter(|dir| !dir.is_empty())
        .map(PathBuf::from)
        .map(|dir| std::path::absolute(&dir).unwrap_or(dir))
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

/// The machine's git, or in a sandbox (`TIR_CONFIG_DIR`) git reading only
/// the sandbox's `gitconfig` and reaching only files, so a trial run never
/// uses the writer's login or GitHub (architecture, "Running and checking").
fn find_git() -> git::Git {
    match sandbox() {
        Some(dir) => git::Git::sandboxed(dir.join("gitconfig")),
        None => git::Git::system(),
    }
}

/// How Tir asks what anyone without a login sees of a repository: GitHub's
/// API, or in a sandbox git reading only `gitconfig-anonymous`, which a
/// trial points at the repositories it counts as public.
fn find_anonymous() -> github::Anonymous {
    match sandbox() {
        Some(dir) => {
            github::Anonymous::Sandboxed(git::Git::sandboxed(dir.join("gitconfig-anonymous")))
        }
        None => github::Anonymous::Api,
    }
}

/// How backup stands, for the page to show at first; later changes come as
/// `tir://backup`.
#[tauri::command]
fn backup_status(backup: State<'_, backup::Backup>) -> backup::Status {
    backup.status()
}

/// Runs `work` with backup on a thread of its own: it may wait minutes for
/// GitHub, and an async command's own thread is one the runtime shares.
async fn blocking<T: Send + 'static>(
    app: AppHandle,
    work: impl FnOnce(&backup::Backup) -> T + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || work(&app.state::<backup::Backup>()))
        .await
        .map_err(|error| error.to_string())
}

/// Records the library's changes and pushes them now; how backup stands
/// once it has.
#[tauri::command]
async fn back_up_now(app: AppHandle) -> Result<Option<backup::Status>, String> {
    blocking(app, backup::Backup::now).await
}

/// Asks GitHub again after a pause, and pushes if it has nothing this
/// machine lacks; how backup stands once it has.
#[tauri::command]
async fn resume_backup(app: AppHandle) -> Result<Option<backup::Status>, String> {
    blocking(app, backup::Backup::resume).await
}

/// Connects the repository at `address`, once it is checked; what came of it.
#[tauri::command]
async fn connect_repository(app: AppHandle, address: String) -> Result<backup::Checked, String> {
    blocking(app, move |backup| backup.connect(&address)).await
}

/// How much of the project `folder`, or its draft `draft`, GitHub holds:
/// the warning before deleting it says.
#[tauri::command(async)]
fn backup_of(
    backup: State<'_, backup::Backup>,
    folder: String,
    draft: Option<String>,
) -> git::Coverage {
    backup.coverage(&folder, draft.as_deref())
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
            // The window (`create: false` in tauri.conf.json) is made only
            // once no other Tir has this settings file and library open.
            match settings_dir(app.handle())
                .and_then(|dir| instance::claim(&dir).map_err(|error| error.to_string()))
            {
                Ok(Some(instance)) => {
                    app.manage(instance);
                }
                Ok(None) => {
                    dialogs::already_open(app.handle());
                    return Ok(());
                }
                // Tir still runs, as it would without the lock.
                Err(error) => eprintln!("Tir could not check for another Tir: {error}"),
            }
            // Only the one Tir with this library backs it up.
            let library = app.state::<library::Library>();
            let emitter = app.handle().clone();
            let backup = backup::Backup::start(
                backup::Setup {
                    git: find_git(),
                    root: library.root().map(Path::to_path_buf).map_err(str::to_owned),
                    busy: library.busy(),
                    timing: backup::TIMING,
                },
                find_anonymous(),
                move |status| {
                    let _ = emitter.emit("tir://backup", status);
                },
            );
            app.manage(backup);
            let window = app
                .config()
                .app
                .windows
                .first()
                .ok_or("No window to open.")?;
            WebviewWindowBuilder::from_config(app.handle(), window)?.build()?;
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
            library::commands::read_dictionary,
            library::commands::add_to_dictionary,
            backup_status,
            back_up_now,
            resume_backup,
            connect_repository,
            backup_of,
            dialogs::open_script,
            dialogs::export_fountain,
            dialogs::export_fdx,
            dialogs::export_pdf,
            dialogs::ask,
            dialogs::tell,
            closing::hold_close,
            closing::close_window,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Tir");
    app.run(|app, event| {
        if let RunEvent::Exit = event {
            // A save or change under way when the window went finishes
            // first; then backup records what is left and pushes it. Once
            // it is recorded, another Tir may start: this one only pushes.
            app.state::<library::Library>().finish_commands();
            let release = || {
                if let Some(instance) = app.try_state::<instance::Instance>() {
                    instance.release();
                }
            };
            match app.try_state::<backup::Backup>() {
                Some(backup) => backup.finish(release),
                None => release(),
            }
        }
    });
}
