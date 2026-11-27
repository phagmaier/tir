//! Tir's settings file (architecture, "Settings"): the window's settings,
//! one file per machine in Tir's config directory, never in the library. The
//! interface reads and checks the text (`src/core/settings.ts`); this side
//! reads the file and replaces it, and takes the library's folder from it.

use crate::files;
use std::fs;
use std::io;
use std::path::Path;

const FILE: &str = "settings.json";

/// The file's text, or `None` when there is no file yet. Bytes that are not
/// UTF-8 come back replaced, so the interface reads them as a damaged file.
pub fn read(dir: &Path) -> io::Result<Option<String>> {
    match fs::read(dir.join(FILE)) {
        Ok(bytes) => Ok(Some(String::from_utf8_lossy(&bytes).into_owned())),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

/// Replaces the file with `text`, making the directory if needed, so that
/// the file is always whole, old or new (`files::replace`).
pub fn write(dir: &Path, text: &str) -> io::Result<()> {
    fs::create_dir_all(dir)?;
    files::replace(&dir.join(FILE), text.as_bytes())
}

/// The library's folder as the settings file's `text` names it, if it
/// does; the interface keeps the field and never reads it (`library` in
/// `src/core/settings.ts`). A damaged or foreign file names none, as the
/// interface reads it.
pub fn library(text: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(text).ok()?;
    if value.get("format").and_then(serde_json::Value::as_str) != Some("tir-settings") {
        return None;
    }
    value.get("library")?.as_str().map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::files::tests::TempDir;

    const TEXT: &str = "{\n  \"format\": \"tir-settings\",\n  \"zoom\": 1.25\n}\n";

    #[test]
    fn reads_back_what_it_wrote() {
        let dir = TempDir::new();
        write(&dir.0, TEXT).unwrap();
        assert_eq!(read(&dir.0).unwrap().as_deref(), Some(TEXT));
        write(&dir.0, "{}\n").unwrap();
        assert_eq!(read(&dir.0).unwrap().as_deref(), Some("{}\n"));
        // Only the settings file remains: the temporary one was renamed.
        assert_eq!(dir.names(), ["settings.json"]);
    }

    #[test]
    fn makes_the_directory_it_writes_in() {
        let dir = TempDir::new();
        let config = dir.0.join("config").join("dev.tir.desktop");
        write(&config, TEXT).unwrap();
        assert_eq!(read(&config).unwrap().as_deref(), Some(TEXT));
    }

    #[test]
    fn reads_no_file_as_none() {
        let dir = TempDir::new();
        assert_eq!(read(&dir.0).unwrap(), None);
        assert_eq!(read(&dir.0.join("missing")).unwrap(), None);
    }

    #[test]
    fn reads_a_damaged_file_as_text_and_replaces_it() {
        let dir = TempDir::new();
        fs::write(dir.0.join(FILE), b"{\"zoom\": \xff\xfe").unwrap();
        assert_eq!(
            read(&dir.0).unwrap().as_deref(),
            Some("{\"zoom\": \u{fffd}\u{fffd}")
        );
        write(&dir.0, TEXT).unwrap();
        assert_eq!(read(&dir.0).unwrap().as_deref(), Some(TEXT));
    }

    #[test]
    fn takes_the_library_from_a_settings_file() {
        let named = "{\n  \"format\": \"tir-settings\",\n  \"version\": 1,\n  \"zoom\": 1,\n  \"library\": \"~/Scripts\"\n}\n";
        assert_eq!(library(named).as_deref(), Some("~/Scripts"));
        for text in [
            TEXT,
            "{\"format\": \"tir-settings\", \"library\": 42}",
            "{\"format\": \"tir-draft\", \"library\": \"/srv/scripts\"}",
            "{\"library\": \"/srv/scripts\"}",
            "[\"library\"]",
            "{\"format\": \"tir-settings\", \"library\": \"/srv",
            "",
        ] {
            assert_eq!(library(text), None, "{text}");
        }
    }

    #[test]
    fn reports_a_directory_it_cannot_write_in() {
        let dir = TempDir::new();
        // A file where the directory should be.
        let blocked = dir.0.join("blocked");
        fs::write(&blocked, "").unwrap();
        assert!(write(&blocked, TEXT).is_err());
        assert!(read(&blocked).is_err());
    }
}
