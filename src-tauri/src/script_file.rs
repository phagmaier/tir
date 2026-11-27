//! The script's file (task 1.9; the stand-in until Stage 2's library and
//! automatic saving): the system's dialogs pick a Tir draft or a Fountain
//! file to open and a `.tir` file to save to, and this side keeps the path,
//! so the page never names a file. Tir writes only `.tir` files here, so a
//! Fountain file it opened is never written (architecture, design rule 4).

use crate::files;
use serde::Serialize;
use std::ffi::OsStr;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use tauri::{State, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

const DRAFT: &str = "tir";

/// The paths behind the script on screen.
#[derive(Default)]
pub struct ScriptFile(Mutex<Paths>);

#[derive(Default)]
struct Paths {
    /// The `.tir` file Ctrl+S writes: the one opened or last saved.
    draft: Option<PathBuf>,
    /// The file the script came from or was last saved to, beside which a
    /// Save dialog opens.
    source: Option<PathBuf>,
    /// A file read for the page, which may yet refuse it.
    read: Option<PathBuf>,
}

impl ScriptFile {
    fn paths(&self) -> MutexGuard<'_, Paths> {
        self.0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

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
/// which a message box says. The file becomes the script's only when the
/// page keeps it (`keep_opened`).
#[tauri::command(async)]
pub fn open_script(
    window: WebviewWindow,
    file: State<'_, ScriptFile>,
) -> Result<Option<Opened>, String> {
    let mut dialog = window
        .dialog()
        .file()
        .set_parent(&window)
        .add_filter("Tir draft or Fountain", &[DRAFT, "fountain"]);
    {
        let mut paths = file.paths();
        // Only a file this call reads can be kept.
        paths.read = None;
        if let Some(directory) = paths.source.as_deref().and_then(Path::parent) {
            dialog = dialog.set_directory(directory);
        }
    }
    let Some(picked) = dialog.blocking_pick_file() else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|error| error.to_string())?;
    let name = file_name(&path);
    let draft = is_draft(&path);
    let text = match files::read_text(&path) {
        Ok(text) => text,
        Err(error) => {
            let title = format!("Tir could not open “{name}”");
            show_failure(&window, title, unreadable(draft, &error));
            return Ok(None);
        }
    };
    file.paths().read = Some(path);
    Ok(Some(Opened { name, draft, text }))
}

/// The file `open_script` read last is now the script on screen's.
#[tauri::command]
pub fn keep_opened(file: State<'_, ScriptFile>) {
    let mut paths = file.paths();
    if let Some(path) = paths.read.take() {
        paths.draft = is_draft(&path).then(|| path.clone());
        paths.source = Some(path);
    }
}

/// Saves `text`, a draft file, to the script's `.tir` file, or to one picked
/// in the system's Save dialog when there is none yet or `choose` is set.
/// Returns the file's name; `None` when the dialog is closed, or when the
/// file cannot be written, which a message box says. `title`, the
/// script's, names the file the dialog suggests for a script that came from
/// no file.
#[tauri::command(async)]
pub fn save_draft(
    window: WebviewWindow,
    file: State<'_, ScriptFile>,
    text: String,
    choose: bool,
    title: String,
) -> Result<Option<String>, String> {
    let (draft, source) = {
        let paths = file.paths();
        (paths.draft.clone(), paths.source.clone())
    };
    let path = match draft.filter(|_| !choose) {
        Some(path) => path,
        None => match pick_draft(&window, source.as_deref(), &title) {
            Some(path) => path,
            None => return Ok(None),
        },
    };
    let name = file_name(&path);
    if let Err(error) = files::replace(&path, text.as_bytes()) {
        let title = format!("Tir could not save “{name}”");
        show_failure(
            &window,
            title,
            format!("The file could not be written ({error})."),
        );
        return Ok(None);
    }
    let mut paths = file.paths();
    paths.draft = Some(path.clone());
    paths.source = Some(path);
    Ok(Some(name))
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

/// A `.tir` file picked in the Save dialog, which starts beside `source`.
fn pick_draft(window: &WebviewWindow, source: Option<&Path>, title: &str) -> Option<PathBuf> {
    let mut dialog = window
        .dialog()
        .file()
        .set_parent(window)
        .add_filter("Tir draft", &[DRAFT])
        .set_file_name(suggested_name(source, title));
    if let Some(directory) = source.and_then(Path::parent) {
        dialog = dialog.set_directory(directory);
    }
    let picked = dialog.blocking_save_file()?.into_path().ok()?;
    let path = as_draft(picked.clone());
    // The dialog asked before replacing the file it was given, not one
    // whose name gained ".tir".
    if path != picked && path.exists() {
        let name = file_name(&path);
        let replace = ask(
            window.clone(),
            format!("Replace “{name}”?"),
            format!("A file named “{name}” already exists in this folder."),
            "Replace".into(),
        );
        if !replace {
            return None;
        }
    }
    Some(path)
}

fn is_draft(path: &Path) -> bool {
    path.extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case(DRAFT))
}

/// `path`, ending in `.tir`: the only files saving writes.
fn as_draft(path: PathBuf) -> PathBuf {
    if is_draft(&path) {
        return path;
    }
    let mut name = path.into_os_string();
    name.push(".");
    name.push(DRAFT);
    PathBuf::from(name)
}

/// The name the Save dialog suggests: the source's with `.tir`, or else the
/// title's first line, made a file name.
fn suggested_name(source: Option<&Path>, title: &str) -> String {
    if let Some(stem) = source.and_then(Path::file_stem).and_then(OsStr::to_str) {
        return format!("{stem}.{DRAFT}");
    }
    let title = title
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .replace(['/', '\0'], "-");
    let title = if title.is_empty() { "Untitled" } else { &title };
    format!("{title}.{DRAFT}")
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saves_only_to_tir_files() {
        let draft = |path: &str| as_draft(PathBuf::from(path));
        assert_eq!(draft("/s/Salt Line.tir"), PathBuf::from("/s/Salt Line.tir"));
        assert_eq!(draft("/s/Salt Line.TIR"), PathBuf::from("/s/Salt Line.TIR"));
        assert_eq!(draft("/s/Salt Line"), PathBuf::from("/s/Salt Line.tir"));
        // A Fountain file is never the one written.
        assert_eq!(
            draft("/s/Salt Line.fountain"),
            PathBuf::from("/s/Salt Line.fountain.tir")
        );
        assert_eq!(
            draft("/s/notes.tir.txt"),
            PathBuf::from("/s/notes.tir.txt.tir")
        );
    }

    #[test]
    fn suggests_the_source_name_or_the_title() {
        let fountain = Path::new("/s/Salt Line.fountain");
        assert_eq!(suggested_name(Some(fountain), "Other"), "Salt Line.tir");
        assert_eq!(suggested_name(None, "Salt Line"), "Salt Line.tir");
        assert_eq!(suggested_name(None, "Act 1/2\nDraft"), "Act 1-2.tir");
        assert_eq!(suggested_name(None, "  "), "Untitled.tir");
    }
}
