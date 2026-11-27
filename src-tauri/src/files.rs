//! Reading and writing Tir's files (architecture, "Writing files"): the
//! settings file and draft files. A write never leaves a file damaged.

use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

/// Replaces the file at `path` with `bytes`. They go to a temporary file
/// beside it, `NAME.tmp`, which is synced and then renamed over the old
/// file, and the directory is synced so the rename itself reaches the disk:
/// the file is always whole, old or new. A write that fails removes its
/// temporary file; an error syncing the directory comes after the rename,
/// with the new file in place.
pub fn replace(path: &Path, bytes: &[u8]) -> io::Result<()> {
    replace_with(path, |file| file.write_all(bytes))
}

/// `replace`, with `write` filling the temporary file.
fn replace_with(path: &Path, write: impl FnOnce(&mut File) -> io::Result<()>) -> io::Result<()> {
    let temporary = temporary_for(path)?;
    let written = File::create(&temporary)
        .and_then(|mut file| {
            write(&mut file)?;
            file.sync_all()
        })
        .and_then(|()| fs::rename(&temporary, path));
    if let Err(error) = written {
        // The old file was not touched; leave nothing beside it.
        let _ = fs::remove_file(&temporary);
        return Err(error);
    }
    let directory = match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent,
        _ => Path::new("."),
    };
    File::open(directory)?.sync_all()
}

fn temporary_for(path: &Path) -> io::Result<PathBuf> {
    let mut name = path
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "no file name"))?
        .to_owned();
    name.push(".tmp");
    Ok(path.with_file_name(name))
}

/// The file's text. Bytes that are not UTF-8 are refused, as
/// `io::ErrorKind::InvalidData`, rather than replaced: a draft or script
/// read with replacement characters would be saved with them.
pub fn read_text(path: &Path) -> io::Result<String> {
    String::from_utf8(fs::read(path)?)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "not UTF-8 text"))
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    /// A new directory under the system's temporary directory, removed on drop.
    pub struct TempDir(pub PathBuf);

    impl TempDir {
        pub fn new() -> Self {
            static NEXT: AtomicUsize = AtomicUsize::new(0);
            let n = NEXT.fetch_add(1, Ordering::Relaxed);
            let dir = std::env::temp_dir().join(format!("tir-test-{}-{n}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            TempDir(dir)
        }

        pub fn names(&self) -> Vec<String> {
            let mut names: Vec<_> = fs::read_dir(&self.0)
                .unwrap()
                .map(|entry| entry.unwrap().file_name().into_string().unwrap())
                .collect();
            names.sort();
            names
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    /// A draft file's worth of text, about 200 KB as a 120-page draft is,
    /// with accents, an emoji and the escapes a draft holds.
    fn draft_text(words: &str) -> String {
        let line = format!(
            "    {{\"type\":\"action\",\"text\":\"{words} Tomás, große straße, 🌊, \\u2028 \\\"quoted\\\"\"}},\n"
        );
        format!(
            "{{\n  \"format\": \"tir-draft\",\n  \"elements\": [\n{}  ]\n}}\n",
            line.repeat(2000)
        )
    }

    #[test]
    fn replaces_a_file_and_reads_it_back_identical() {
        let dir = TempDir::new();
        let path = dir.0.join("Salt Line.tir");
        let first = draft_text("The gate is locked.");
        replace(&path, first.as_bytes()).unwrap();
        assert_eq!(read_text(&path).unwrap(), first);
        let second = draft_text("The gate stands open.");
        replace(&path, second.as_bytes()).unwrap();
        assert_eq!(read_text(&path).unwrap(), second);
        assert_eq!(dir.names(), ["Salt Line.tir"]);
    }

    #[test]
    fn a_write_that_fails_part_way_leaves_the_old_file_whole() {
        let dir = TempDir::new();
        let path = dir.0.join("draft.tir");
        let old = draft_text("The gate is locked.");
        replace(&path, old.as_bytes()).unwrap();
        let new = draft_text("The gate stands open.");
        let error = replace_with(&path, |file| {
            file.write_all(&new.as_bytes()[..new.len() / 2])?;
            Err(io::Error::other("no space left on device"))
        })
        .unwrap_err();
        assert_eq!(error.to_string(), "no space left on device");
        assert_eq!(read_text(&path).unwrap(), old);
        assert_eq!(dir.names(), ["draft.tir"]);
    }

    #[test]
    fn a_rename_that_fails_leaves_nothing_beside_the_file() {
        let dir = TempDir::new();
        // A directory where the file should go: the rename over it fails.
        let path = dir.0.join("draft.tir");
        fs::create_dir(&path).unwrap();
        assert!(replace(&path, b"{}\n").is_err());
        assert!(path.is_dir());
        assert_eq!(dir.names(), ["draft.tir"]);
    }

    #[test]
    fn refuses_text_that_is_not_utf8() {
        let dir = TempDir::new();
        let path = dir.0.join("Salt Line.fountain");
        // "Tomás" as Windows-1252 writes it.
        fs::write(&path, b"INT. HARBOUR - NIGHT\n\nTom\xe1s waits.\n").unwrap();
        assert_eq!(
            read_text(&path).unwrap_err().kind(),
            io::ErrorKind::InvalidData
        );
        fs::write(&path, "\u{feff}Tomás waits.\r\n").unwrap();
        assert_eq!(read_text(&path).unwrap(), "\u{feff}Tomás waits.\r\n");
        assert_eq!(
            read_text(&dir.0.join("missing.fountain"))
                .unwrap_err()
                .kind(),
            io::ErrorKind::NotFound
        );
    }
}
