//! Native import, export and message dialogs. Only this side knows the
//! chosen paths: import reads a source and export publishes a new file.

use crate::files;
use percent_encoding::percent_decode_str;
use serde::Serialize;
use std::ffi::OsStr;
use std::fs::File;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

const FOUNTAIN: &str = "fountain";
const FDX: &str = "fdx";
const MAX_FDX_BYTES: u64 = 8 * 1024 * 1024;
const PDF: &str = "pdf";
/// The request header holding an exported PDF's suggested file name,
/// percent-encoded, since a header holds only ASCII.
const NAME_HEADER: &str = "tir-name";

/// The folder the Open dialog last picked a file in, where it opens next.
#[derive(Default)]
pub struct Dialogs(Mutex<Option<PathBuf>>);

/// The source's display name and UTF-8 text, without its path.
#[derive(Serialize)]
pub struct Opened {
    name: String,
    text: String,
}

/// Picks and reads a screenplay source, or returns `None` on cancellation.
#[tauri::command(async)]
pub fn open_script(
    window: WebviewWindow,
    dialogs: State<'_, Dialogs>,
) -> Result<Option<Opened>, String> {
    let mut dialog = window
        .dialog()
        .file()
        .set_parent(&window)
        .add_filter("Fountain or Final Draft", &[FOUNTAIN, FDX]);
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
    read_script(&path).map(Some)
}

/// The page suggests a file name; only the native dialog supplies the path.
#[tauri::command(async)]
pub fn export_fountain(window: WebviewWindow, name: String, text: String) -> Result<(), String> {
    export(&window, Export::FOUNTAIN, name, text.as_bytes())
}

/// Picks a new destination for a Final Draft screenplay.
#[tauri::command(async)]
pub fn export_fdx(window: WebviewWindow, name: String, text: String) -> Result<(), String> {
    export(&window, Export::FDX, name, text.as_bytes())
}

/// Like `export_fountain`, with the PDF as the request's raw body, which
/// JSON would carry as a list of numbers, and its suggested name in the
/// `tir-name` header.
#[tauri::command]
pub async fn export_pdf(window: WebviewWindow, request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("The PDF did not arrive as a file.".into());
    };
    let name = request
        .headers()
        .get(NAME_HEADER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| percent_decode_str(value).decode_utf8().ok())
        .ok_or("The PDF arrived without a file name.")?;
    export(&window, Export::PDF, name.into_owned(), bytes)
}

/// What an export writes: its Save dialog's title, the kind of file, and its extension.
struct Export {
    title: &'static str,
    kind: &'static str,
    extension: &'static str,
}

impl Export {
    const FOUNTAIN: Self = Self {
        title: "Export Fountain",
        kind: "Fountain",
        extension: FOUNTAIN,
    };
    const FDX: Self = Self {
        title: "Export Final Draft",
        kind: "Final Draft",
        extension: FDX,
    };
    const PDF: Self = Self {
        title: "Export PDF",
        kind: "PDF",
        extension: PDF,
    };
}

fn export(window: &WebviewWindow, to: Export, name: String, bytes: &[u8]) -> Result<(), String> {
    let suggestion = Path::new(&name);
    if suggestion.file_name() != Some(OsStr::new(&name)) || !has_extension(suggestion, to.extension)
    {
        return Err(format!(
            "The suggested name is not a {} file name.",
            to.kind
        ));
    }
    let Some(picked) = window
        .dialog()
        .file()
        .set_parent(window)
        .set_title(to.title)
        .set_file_name(name)
        .add_filter(to.kind, &[to.extension])
        .blocking_save_file()
    else {
        return Ok(());
    };
    write_new(
        picked.into_path().map_err(|error| error.to_string())?,
        to.extension,
        bytes,
    )
}

fn read_script(path: &Path) -> Result<Opened, String> {
    let name = file_name(path);
    let text = if has_extension(path, FDX) {
        read_fdx(path, &name)?
    } else if has_extension(path, FOUNTAIN) {
        files::read_text(path).map_err(|error| {
            if error.kind() == io::ErrorKind::InvalidData {
                format!("“{name}” is not UTF-8 text. Save it as UTF-8, then import it again.")
            } else {
                format!("“{name}” could not be read ({error}).")
            }
        })?
    } else {
        return Err(format!("“{name}” is not a .fountain or .fdx file."));
    };
    Ok(Opened { name, text })
}

fn read_fdx(path: &Path, name: &str) -> Result<String, String> {
    let mut bytes = Vec::new();
    File::open(path)
        .and_then(|file| file.take(MAX_FDX_BYTES + 1).read_to_end(&mut bytes))
        .map_err(|error| format!("“{name}” could not be read ({error})."))?;
    if bytes.len() as u64 > MAX_FDX_BYTES {
        return Err(format!("“{name}” is too large to import (limit: 8 MiB)."));
    }
    let invalid_encoding = || format!("“{name}” is not valid UTF-8 or UTF-16 text.");
    // XML in UTF-16 has a byte-order mark. Decode it without replacement
    // characters, just as with UTF-8.
    let (payload, decode) = match bytes.as_slice() {
        [0xff, 0xfe, payload @ ..] => (payload, u16::from_le_bytes as fn([u8; 2]) -> u16),
        [0xfe, 0xff, payload @ ..] => (payload, u16::from_be_bytes as fn([u8; 2]) -> u16),
        _ => return String::from_utf8(bytes).map_err(|_| invalid_encoding()),
    };
    let (words, remainder) = payload.as_chunks::<2>();
    if !remainder.is_empty() {
        return Err(invalid_encoding());
    }
    char::decode_utf16(words.iter().copied().map(decode))
        .collect::<Result<String, _>>()
        .map_err(|_| invalid_encoding())
}

/// Writes an export to a new file at `path`, with `extension` added when
/// the name has none; it never replaces anything there.
fn write_new(mut path: PathBuf, extension: &str, bytes: &[u8]) -> Result<(), String> {
    if path.extension().is_none() {
        path.set_extension(extension);
    }
    if !has_extension(&path, extension) {
        return Err(format!("Choose a name that ends in .{extension}."));
    }
    files::create_new(&path, bytes).map_err(|error| {
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

fn has_extension(path: &Path, extension: &str) -> bool {
    path.extension()
        .is_some_and(|found| found.eq_ignore_ascii_case(extension))
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
        let imported = read_script(&source).unwrap();
        assert_eq!(imported.text, text);
        assert_eq!(fs::read(&source).unwrap(), text.as_bytes());
        assert_eq!(fs::metadata(&source).unwrap().modified().unwrap(), before);
    }

    #[test]
    fn reads_utf16_fdx_and_refuses_an_oversized_fdx_before_decoding_it() {
        let dir = TempDir::new();
        let source = dir.0.join("Pump House.FDX");
        let text = "<?xml version=\"1.0\" encoding=\"UTF-16\"?><FinalDraft><Content>Renée 🐟</Content></FinalDraft>";
        let bytes: Vec<_> = [0xff, 0xfe]
            .into_iter()
            .chain(text.encode_utf16().flat_map(u16::to_le_bytes))
            .collect();
        fs::write(&source, &bytes).unwrap();
        assert_eq!(read_script(&source).unwrap().text, text);
        assert_eq!(fs::read(&source).unwrap(), bytes);

        let oversized = dir.0.join("Oversized.fdx");
        File::create(&oversized)
            .unwrap()
            .set_len(8 * 1024 * 1024 + 1)
            .unwrap();
        assert!(read_script(&oversized).err().unwrap().contains("too large"));
    }

    #[test]
    fn exports_only_to_a_new_file_and_never_replaces_the_source() {
        let dir = TempDir::new();
        let source = dir.0.join("source.fountain");
        fs::write(&source, b"The tide is out.\n").unwrap();
        let imported = read_script(&source).unwrap();
        let export = "Title: Harbour\n\nThe tide is in.\n";
        assert!(
            write_new(source.clone(), FOUNTAIN, export.as_bytes())
                .unwrap_err()
                .contains("already exists")
        );

        let alias = dir.0.join("alias.fountain");
        std::os::unix::fs::symlink(&source, &alias).unwrap();
        assert!(write_new(alias.clone(), FOUNTAIN, export.as_bytes()).is_err());
        assert_eq!(fs::read_link(alias).unwrap(), source);
        assert_eq!(fs::read(&source).unwrap(), imported.text.as_bytes());

        write_new(dir.0.join("export"), FOUNTAIN, export.as_bytes()).unwrap();
        let reopened = read_script(&dir.0.join("export.fountain")).unwrap();
        assert_eq!(reopened.text, export);
        assert_eq!(
            dir.names(),
            ["alias.fountain", "export.fountain", "source.fountain"]
        );
    }

    #[test]
    fn exports_a_pdf_byte_for_byte_only_under_a_pdf_name() {
        let dir = TempDir::new();
        // Not UTF-8, as a PDF's binary marker line is not.
        let pdf = b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n";
        assert!(
            write_new(dir.0.join("Salt Line.fountain"), PDF, pdf)
                .unwrap_err()
                .contains("ends in .pdf")
        );
        write_new(dir.0.join("Salt Line - First Draft"), PDF, pdf).unwrap();
        let written = dir.0.join("Salt Line - First Draft.pdf");
        assert_eq!(fs::read(&written).unwrap(), pdf);
        assert!(
            write_new(written.clone(), PDF, b"%PDF-1.7\n")
                .unwrap_err()
                .contains("already exists")
        );
        assert_eq!(fs::read(&written).unwrap(), pdf);
        assert_eq!(dir.names(), ["Salt Line - First Draft.pdf"]);
    }
}
