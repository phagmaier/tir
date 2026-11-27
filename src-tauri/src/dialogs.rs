//! The system's dialogs: the Open dialog that picks a Tir draft or a
//! Fountain file for the page to read (the Projects screen's Import…,
//! until task 2.6; architecture, "Saving and opening"), and message boxes.
//! This side keeps the path, so the page never names a file, and never
//! writes the file picked: the page makes a project of its own from it
//! (design rule 4).

use crate::files;
use serde::Serialize;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{State, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

const DRAFT: &str = "tir";

/// The folder the Open dialog last picked a file in, where it opens next.
#[derive(Default)]
pub struct Dialogs(Mutex<Option<PathBuf>>);

/// A file read for the page: its name, whether it is a Tir draft (else it
/// is read as Fountain), and its text.
#[derive(Serialize)]
pub struct Opened {
    name: String,
    draft: bool,
    text: String,
}

/// Asks for a Tir draft or a Fountain file in the system's dialog and reads
/// it; `None` when the dialog is closed, or when the file cannot be read,
/// which a message box says.
#[tauri::command(async)]
pub fn open_script(
    window: WebviewWindow,
    dialogs: State<'_, Dialogs>,
) -> Result<Option<Opened>, String> {
    let mut dialog = window
        .dialog()
        .file()
        .set_parent(&window)
        .add_filter("Tir draft or Fountain", &[DRAFT, "fountain"]);
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
    let name = file_name(&path);
    let draft = is_draft(&path);
    match files::read_text(&path) {
        Ok(text) => Ok(Some(Opened { name, draft, text })),
        Err(error) => {
            let title = format!("Tir could not open “{name}”");
            show_failure(&window, title, unreadable(draft, &error));
            Ok(None)
        }
    }
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

fn is_draft(path: &Path) -> bool {
    path.extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case(DRAFT))
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .unwrap_or(path.as_os_str())
        .to_string_lossy()
        .into_owned()
}

/// Why a picked file could not be read, for a message box.
fn unreadable(draft: bool, error: &io::Error) -> String {
    match (error.kind(), draft) {
        (io::ErrorKind::InvalidData, true) => {
            "The draft file is damaged: it is not UTF-8 text.".to_string()
        }
        (io::ErrorKind::InvalidData, false) => "It is not UTF-8 text, which is how Tir reads \
            Fountain. Save it as UTF-8 in a text editor, then open it again."
            .to_string(),
        _ => format!("It could not be read ({error})."),
    }
}
