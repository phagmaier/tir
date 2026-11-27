//! Native import, export and message dialogs. Only this side knows the
//! chosen paths: import reads a source and export publishes a new file.

use crate::files;
use serde::Serialize;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

const FOUNTAIN: &str = "fountain";

/// The folder the Open dialog last picked a file in, where it opens next.
#[derive(Default)]
pub struct Dialogs(Mutex<Option<PathBuf>>);

/// The source's display name and UTF-8 text, without its path.
#[derive(Serialize)]
pub struct Opened {
    name: String,
    text: String,
}

/// Picks and reads a Fountain source, or returns `None` on cancellation.
#[tauri::command(async)]
pub fn open_fountain(
    window: WebviewWindow,
    dialogs: State<'_, Dialogs>,
) -> Result<Option<Opened>, String> {
    let mut dialog = window
        .dialog()
        .file()
        .set_parent(&window)
        .add_filter("Fountain", &[FOUNTAIN]);
    let last = dialogs
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone();
    if let Some(directory) = last {
        dialog = dialog.set_directory(directory);
    }
    let Some(picked) = dialog.blocking_pick_file() else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|error| error.to_string())?;
    if let Some(directory) = path.parent() {
        *dialogs
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(directory.to_path_buf());
    }
    read_fountain(&path).map(Some)
}

/// The page suggests a file name; only the native dialog supplies the path.
#[tauri::command(async)]
pub fn export_fountain(window: WebviewWindow, name: String, text: String) -> Result<(), String> {
    let suggestion = Path::new(&name);
    if suggestion.file_name() != Some(std::ffi::OsStr::new(&name)) || !is_fountain(suggestion) {
        return Err("The suggested name is not a Fountain file name.".into());
    }
    let Some(picked) = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Export Fountain")
        .set_file_name(name)
        .add_filter("Fountain", &[FOUNTAIN])
        .blocking_save_file()
    else {
        return Ok(());
    };
    write_fountain(
        picked.into_path().map_err(|error| error.to_string())?,
        &text,
    )
}

fn read_fountain(path: &Path) -> Result<Opened, String> {
    let name = file_name(path);
    if !is_fountain(path) {
        return Err(format!("“{name}” is not a .fountain file."));
    }
    let text = files::read_text(path).map_err(|error| {
        if error.kind() == io::ErrorKind::InvalidData {
            format!("“{name}” is not UTF-8 text. Save it as UTF-8, then import it again.")
        } else {
            format!("“{name}” could not be read ({error}).")
        }
    })?;
    Ok(Opened { name, text })
}

fn write_fountain(mut path: PathBuf, text: &str) -> Result<(), String> {
    if path.extension().is_none() {
        path.set_extension(FOUNTAIN);
    }
    if !is_fountain(&path) {
        return Err("Choose a name that ends in .fountain.".into());
    }
    files::create_new(&path, text.as_bytes()).map_err(|error| {
        let name = file_name(&path);
        if error.kind() == io::ErrorKind::AlreadyExists {
            format!("“{name}” already exists. Choose a new file name; Tir won't replace it.")
        } else {
            format!("“{name}” could not be exported ({error}).")
        }
    })
}

/// Asks `question`, under `title`; true for the button `yes`, false for Cancel.
#[tauri::command(async)]
pub fn ask(window: WebviewWindow, title: String, question: String, yes: String) -> bool {
    window
        .dialog()
        .message(question)
        .title(title)
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(yes, "Cancel".into()))
        .parent(&window)
        .blocking_show()
}

/// Shows what failed, `title`, and why, `message`, until it is dismissed.
#[tauri::command(async)]
pub fn tell(window: WebviewWindow, title: String, message: String) {
    show_failure(&window, title, message);
}

fn show_failure(window: &WebviewWindow, title: String, message: String) {
    window
        .dialog()
        .message(message)
        .title(title)
        .kind(MessageDialogKind::Error)
        .parent(window)
        .blocking_show();
}

/// Tells the writer that Tir is already open, then exits: a second Tir
/// could save over the first one's work (`instance.rs`).
pub fn already_open(app: &AppHandle) {
    let exit = app.clone();
    app.dialog()
        .message(
            "Switch to its window. A second Tir would show the same drafts, \
             and either could save over what was written in the other.",
        )
        .title("Tir is already open")
        .kind(MessageDialogKind::Info)
        .show(move |_| exit.exit(0));
}

fn is_fountain(path: &Path) -> bool {
    path.extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case(FOUNTAIN))
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .unwrap_or(path.as_os_str())
        .to_string_lossy()
        .into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::files::tests::TempDir;
    use std::fs::{self, File, FileTimes};
    use std::time::{Duration, UNIX_EPOCH};

    #[test]
    fn reads_the_import_source_without_changing_its_bytes_or_modification_time() {
        let dir = TempDir::new();
        let source = dir.0.join("Harbour.FOUNTAIN");
        let text = "\u{feff}Title: Harbour\r\n\r\nTomás waits.\r\n";
        fs::write(&source, text).unwrap();
        File::open(&source)
            .unwrap()
            .set_times(
                FileTimes::new().set_modified(UNIX_EPOCH + Duration::from_secs(1_700_000_000)),
            )
            .unwrap();
        // Read-only, so opening it for writing would fail the read.
        let mut permissions = fs::metadata(&source).unwrap().permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&source, permissions).unwrap();
        let before = fs::metadata(&source).unwrap().modified().unwrap();
        let imported = read_fountain(&source).unwrap();
        assert_eq!(imported.text, text);
        assert_eq!(fs::read(&source).unwrap(), text.as_bytes());
        assert_eq!(fs::metadata(&source).unwrap().modified().unwrap(), before);
    }

    #[test]
    fn exports_only_to_a_new_file_and_never_replaces_the_source() {
        let dir = TempDir::new();
        let source = dir.0.join("source.fountain");
        fs::write(&source, b"The tide is out.\n").unwrap();
        let imported = read_fountain(&source).unwrap();
        let export = "Title: Harbour\n\nThe tide is in.\n";
        assert!(
            write_fountain(source.clone(), export)
                .unwrap_err()
                .contains("already exists")
        );

        let alias = dir.0.join("alias.fountain");
        std::os::unix::fs::symlink(&source, &alias).unwrap();
        assert!(write_fountain(alias.clone(), export).is_err());
        assert_eq!(fs::read_link(alias).unwrap(), source);
        assert_eq!(fs::read(&source).unwrap(), imported.text.as_bytes());

        write_fountain(dir.0.join("export"), export).unwrap();
        let reopened = read_fountain(&dir.0.join("export.fountain")).unwrap();
        assert_eq!(reopened.text, export);
        assert_eq!(
            dir.names(),
            ["alias.fountain", "export.fountain", "source.fountain"]
        );
    }
}
