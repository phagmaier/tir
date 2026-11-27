//! Tir's settings file (architecture, "Settings"): the window's settings,
//! one file per machine in Tir's config directory, never in the library. The
//! interface reads and checks the text (`src/core/settings.ts`); this side
//! only reads the file and replaces it.

use std::fs;
use std::io::{self, Write};
use std::path::Path;

const FILE: &str = "settings.json";
const TEMPORARY: &str = "settings.json.tmp";

/// The file's text, or `None` when there is no file yet. Bytes that are not
/// UTF-8 come back replaced, so the interface reads them as a damaged file.
pub fn read(dir: &Path) -> io::Result<Option<String>> {
    match fs::read(dir.join(FILE)) {
        Ok(bytes) => Ok(Some(String::from_utf8_lossy(&bytes).into_owned())),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

/// Replaces the file with `text`, making the directory if needed. The text
/// goes to a temporary file that is then renamed over the old one, so the
/// file is always whole, old or new.
pub fn write(dir: &Path, text: &str) -> io::Result<()> {
    fs::create_dir_all(dir)?;
    let temporary = dir.join(TEMPORARY);
    let mut file = fs::File::create(&temporary)?;
    file.write_all(text.as_bytes())?;
    file.sync_all()?;
    fs::rename(&temporary, dir.join(FILE))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};

    /// A new directory under the system's temporary directory, removed on drop.
    struct TempDir(PathBuf);

    impl TempDir {
        fn new() -> Self {
            static NEXT: AtomicUsize = AtomicUsize::new(0);
            let n = NEXT.fetch_add(1, Ordering::Relaxed);
            let dir = std::env::temp_dir().join(format!("tir-settings-{}-{n}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            TempDir(dir)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    const TEXT: &str = "{\n  \"format\": \"tir-settings\",\n  \"zoom\": 1.25\n}\n";

    #[test]
    fn reads_back_what_it_wrote() {
        let dir = TempDir::new();
        write(&dir.0, TEXT).unwrap();
        assert_eq!(read(&dir.0).unwrap().as_deref(), Some(TEXT));
        write(&dir.0, "{}\n").unwrap();
        assert_eq!(read(&dir.0).unwrap().as_deref(), Some("{}\n"));
        // Only the settings file remains: the temporary one was renamed.
        let names: Vec<_> = fs::read_dir(&dir.0)
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        assert_eq!(names, ["settings.json"]);
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
    fn reports_a_directory_it_cannot_write_in() {
        let dir = TempDir::new();
        // A file where the directory should be.
        let blocked = dir.0.join("blocked");
        fs::write(&blocked, "").unwrap();
        assert!(write(&blocked, TEXT).is_err());
        assert!(read(&blocked).is_err());
    }
}
