//! The library (architecture, "Library on disk"): the folder holding the
//! writer's projects, each a folder with its `project.json` and its drafts
//! in `drafts/`, each draft with its Fountain copy beside it. The interface
//! makes every name and every file's text (`src/core/file-names.ts`,
//! `project-file.ts`, `draft-file.ts`, `fountain/write.ts`); this side
//! takes names from it, never paths, and refuses any name that is not one
//! entry of its folder, and any link, so nothing it reads or changes lies
//! outside the library. Each change goes in an order that keeps every
//! project whole if Tir stops part way: a `project.json` names only drafts
//! that are there.

use crate::files;
use serde::Serialize;
use std::collections::{BTreeMap, HashMap};
use std::fs::{self, OpenOptions};
use std::hash::{DefaultHasher, Hasher};
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::UNIX_EPOCH;

const PROJECT: &str = "project.json";
const DRAFTS: &str = "drafts";
const DRAFT: &str = ".tir";
const COPY: &str = ".fountain";
/// The words the writer adds to spell check's dictionary, one a line, in the
/// library so that they are backed up with the scripts.
const DICTIONARY: &str = "dictionary.txt";
/// The longest word, in bytes, the dictionary takes.
const LONGEST_WORD: usize = 100;

/// The library's folder, found when Tir starts, or why there is none.
pub struct Library {
    root: Result<PathBuf, String>,
    /// The library the settings file named when Tir started.
    configured: Option<String>,
    /// One command at a time, so a change checks and writes a project file
    /// that no other change is writing; backup holds it too while it
    /// records the library's changes in git.
    busy: Arc<Mutex<()>>,
    /// For each draft, by project folder and file, the fingerprint of the
    /// text Tir last wrote there or read to show: a save refuses to replace
    /// a draft that has changed since, as a `git pull` changes it.
    known: Mutex<HashMap<(String, String), u64>>,
}

impl Library {
    pub fn new(root: Option<PathBuf>, configured: Option<String>) -> Self {
        Library {
            root: root
                .ok_or_else(|| "Tir could not find the home folder, where the library is.".into()),
            configured,
            busy: Arc::default(),
            known: Mutex::default(),
        }
    }

    /// The library's folder, or why there is none.
    pub fn root(&self) -> Result<&Path, &str> {
        self.root.as_deref().map_err(String::as_str)
    }

    /// The lock each command holds, for backup to hold while it records.
    pub fn busy(&self) -> Arc<Mutex<()>> {
        self.busy.clone()
    }

    /// The settings file's `library` when Tir started, which only the writer,
    /// editing the file, changes: the page may not name another.
    pub fn configured(&self) -> Option<&str> {
        self.configured.as_deref()
    }

    /// Waits for the command running, if one is, so that Tir never exits
    /// part way through a change or a save.
    pub fn finish_commands(&self) {
        drop(self.busy.lock());
    }

    fn known(&self) -> MutexGuard<'_, HashMap<(String, String), u64>> {
        self.known
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// What the draft `draft` of the project `folder` held when Tir last
    /// wrote it or read it to show, if Tir has.
    fn holds(&self, folder: &str, draft: &str) -> Option<u64> {
        self.known()
            .get(&(folder.to_owned(), draft.to_owned()))
            .copied()
    }

    /// Tir wrote `text` to the draft, or read it there to show it.
    fn saw(&self, folder: &str, draft: &str, text: &str) {
        self.known().insert(
            (folder.to_owned(), draft.to_owned()),
            fingerprint(text.as_bytes()),
        );
    }

    /// The draft has moved to the file `to` of its project.
    fn moved(&self, folder: &str, draft: &str, to: &str) {
        let mut known = self.known();
        if let Some(text) = known.remove(&(folder.to_owned(), draft.to_owned())) {
            known.insert((folder.to_owned(), to.to_owned()), text);
        }
    }

    /// The draft has gone.
    fn forget(&self, folder: &str, draft: &str) {
        self.known().remove(&(folder.to_owned(), draft.to_owned()));
    }

    /// The project `folder` has moved to the folder `to`, or gone if `None`.
    fn moved_project(&self, folder: &str, to: Option<&str>) {
        let mut known = self.known();
        let drafts: Vec<_> = known
            .keys()
            .filter(|(project, _)| project == folder)
            .cloned()
            .collect();
        for key in drafts {
            if let Some(text) = known.remove(&key)
                && let Some(to) = to
            {
                known.insert((to.to_owned(), key.1), text);
            }
        }
    }
}

/// A fingerprint of a draft's text, enough to tell whether a file still
/// holds what Tir last saw there.
pub fn fingerprint(text: &[u8]) -> u64 {
    let mut hasher = DefaultHasher::new();
    hasher.write(text);
    hasher.finish()
}

/// The library's folder: the one the settings file names, `configured`,
/// when it is a full path or starts with `~/`; otherwise `Screenplays` in
/// `sandbox` (`TIR_CONFIG_DIR`) when that is set, so that a trial run never
/// reaches the writer's library, or else in the home folder.
pub fn root(
    configured: Option<&str>,
    home: Option<&Path>,
    sandbox: Option<&Path>,
) -> Option<PathBuf> {
    let named = configured.and_then(|path| {
        let path = match path.strip_prefix('~') {
            Some("") => home?.to_path_buf(),
            Some(rest) => home?.join(rest.strip_prefix('/')?),
            None => PathBuf::from(path),
        };
        path.is_absolute().then_some(path)
    });
    named.or_else(|| Some(sandbox.or(home)?.join("Screenplays")))
}

/// `root` as the writer would type it, from `~` when it is in `home`: the
/// Projects screen shows where the library is when it is empty.
pub fn shown(root: &Path, home: Option<&Path>) -> String {
    match home.and_then(|home| root.strip_prefix(home).ok()) {
        Some(rest) if rest.as_os_str().is_empty() => "~".into(),
        Some(rest) => format!("~/{}", rest.display()),
        None => root.display().to_string(),
    }
}

/// What the library holds, for the interface to read.
#[derive(Serialize, Debug, Default, PartialEq)]
pub struct Listing {
    /// Every entry that is not hidden, folder or not, in name order: a new
    /// project's folder may be none of them.
    names: Vec<String>,
    /// Every folder that is not hidden, in name order.
    projects: Vec<Listed>,
}

/// One folder of the library.
#[derive(Serialize, Debug, PartialEq)]
pub struct Listed {
    folder: String,
    /// Its `project.json`'s text, which the interface reads; `None` when it
    /// cannot be read, as `problem` says.
    text: Option<String>,
    problem: Option<String>,
    /// The entries of its `drafts` folder, which no new draft may replace.
    files: Vec<String>,
    /// When each draft there, a file of its own, was last written, in
    /// milliseconds since 1970: the Projects screen's last edit. A file a
    /// git pull changes takes the pull's time.
    edited: BTreeMap<String, f64>,
}

/// The library's projects; none when there is no library yet.
pub fn list(root: &Path) -> io::Result<Listing> {
    let mut listing = Listing::default();
    let entries = match fs::read_dir(root) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(listing),
        entries => entries?,
    };
    for entry in entries {
        let entry = entry?;
        // A name that is not UTF-8 is none Tir makes or could give.
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        if name.starts_with('.') {
            continue;
        }
        // Not through links: a link to a folder elsewhere is no project.
        if entry.file_type()?.is_dir() {
            listing.projects.push(listed(&entry.path(), name.clone()));
        }
        listing.names.push(name);
    }
    listing.names.sort();
    listing.projects.sort_by(|a, b| a.folder.cmp(&b.folder));
    Ok(listing)
}

fn listed(dir: &Path, folder: String) -> Listed {
    let (text, problem) = match read_project(dir) {
        Ok(text) => (Some(text), None),
        Err(error) => (
            None,
            Some(match error.kind() {
                io::ErrorKind::NotFound => "The project file is missing.".to_string(),
                io::ErrorKind::InvalidData => {
                    "The project file is damaged: it is not UTF-8 text.".to_string()
                }
                io::ErrorKind::InvalidInput => {
                    "The project file is a link or a folder, not a file.".to_string()
                }
                _ => format!("The project file could not be read ({error})."),
            }),
        ),
    };
    let drafts = drafts_dir(dir).ok();
    let files = drafts
        .as_deref()
        .and_then(|drafts| entry_names(drafts).ok())
        .unwrap_or_default();
    let edited = drafts
        .map(|drafts| draft_times(&drafts, &files))
        .unwrap_or_default();
    Listed {
        folder,
        text,
        problem,
        files,
        edited,
    }
}

/// When each draft among `files` in `drafts` was last written, leaving out
/// copies, links and anything else that is no draft file.
fn draft_times(drafts: &Path, files: &[String]) -> BTreeMap<String, f64> {
    files
        .iter()
        .filter(|name| name.ends_with(DRAFT))
        .filter_map(|name| {
            let metadata = fs::symlink_metadata(drafts.join(name)).ok()?;
            if !metadata.is_file() {
                return None;
            }
            let since = metadata.modified().ok()?.duration_since(UNIX_EPOCH).ok()?;
            Some((name.clone(), since.as_nanos() as f64 / 1e6))
        })
        .collect()
}

fn entry_names(dir: &Path) -> io::Result<Vec<String>> {
    let mut names = Vec::new();
    for entry in fs::read_dir(dir)? {
        if let Ok(name) = entry?.file_name().into_string() {
            names.push(name);
        }
    }
    names.sort();
    Ok(names)
}

/// The first entry of the library, in name order, that is none of Tir's:
/// backup makes the library a repository only when it holds nothing else
/// (architecture, "Backup"), so never a folder such as the home folder.
/// Hidden entries and temporary files are Tir's or git's; a folder holding
/// a project file or a `drafts` folder is a project, readable or not.
pub fn foreign_entry(root: &Path) -> io::Result<Option<String>> {
    let mut foreign = Vec::new();
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let name = entry.file_name();
        let shown = name.to_string_lossy();
        if shown.starts_with('.') || shown.ends_with(".tmp") {
            continue;
        }
        let kind = entry.file_type()?;
        let ours = if kind.is_dir() {
            let dir = entry.path();
            fs::symlink_metadata(dir.join(PROJECT)).is_ok()
                || fs::symlink_metadata(dir.join(DRAFTS)).is_ok()
        } else {
            kind.is_file() && name == DICTIONARY
        };
        if !ours {
            foreign.push(shown.into_owned());
        }
    }
    foreign.sort();
    Ok(foreign.into_iter().next())
}

/// Makes the project `folder`, with `project` as its `project.json` and one
/// draft, `draft`, holding `text`, with `copy` as its Fountain copy. The
/// library is made too, if need be.
pub fn create_project(
    root: &Path,
    folder: &str,
    project: &str,
    draft: &str,
    text: &str,
    copy: &str,
) -> io::Result<()> {
    let dir = root.join(entry(folder)?);
    let drafts = dir.join(DRAFTS);
    let file = drafts.join(draft_entry(draft)?);
    make_library(root)?;
    claim_dir(&dir)?;
    let made = fs::create_dir(&drafts)
        .and_then(|()| files::replace(&file, text.as_bytes()))
        .and_then(|()| files::replace(&copy_of(&file), copy.as_bytes()))
        // Last: until then the folder is no project.
        .and_then(|()| files::replace(&dir.join(PROJECT), project.as_bytes()));
    if made.is_err() {
        // The folder is this call's own: nothing was in it before, and
        // without it no project file names a draft.
        let _ = fs::remove_dir_all(&dir);
    }
    made?;
    files::sync_dir(root)
}

/// Replaces the project `folder`'s `project.json`, which must still be
/// `was`, with `project`.
pub fn write_project(root: &Path, folder: &str, was: &str, project: &str) -> io::Result<()> {
    let dir = project_dir(root, folder)?;
    unchanged(&dir, was)?;
    publish_project(&dir, project)
}

/// Moves the project `folder` to the folder `to`, with `project` as its
/// `project.json`, which must still be `was`.
pub fn rename_project(
    root: &Path,
    folder: &str,
    to: &str,
    was: &str,
    project: &str,
) -> io::Result<()> {
    let dir = project_dir(root, folder)?;
    let moved = root.join(entry(to)?);
    unchanged(&dir, was)?;
    if folder == to {
        return publish_project(&dir, project);
    }
    claim_dir(&moved)?;
    // The project is whole in either folder, with either name.
    let renamed = publish_project(&dir, project)
        // Over the empty folder just claimed, which a rename may replace.
        .and_then(|()| fs::rename(&dir, &moved));
    if renamed.is_err() {
        let _ = fs::remove_dir(&moved);
    }
    renamed?;
    // Done: the project is in its new folder. A failure to sync the
    // library's folder now must not report the rename undone, or the page
    // would keep saving to the folder that is gone.
    let _ = files::sync_dir(root);
    Ok(())
}

/// Deletes the project `folder` and everything in it. Only a folder with a
/// project file, readable or not, is a project: Tir deletes no other.
pub fn delete_project(root: &Path, folder: &str) -> io::Result<()> {
    let dir = project_dir(root, folder)?;
    match fs::symlink_metadata(dir.join(PROJECT)) {
        Ok(metadata) if metadata.is_file() => {}
        _ => {
            return Err(refused(format!(
                "“{folder}” is not a Tir project: it has no project file."
            )));
        }
    }
    // Out of the library at once, under a hidden name, then removed, so a
    // removal that fails part way leaves no half project.
    let trash = claim_hidden_dir(root)?;
    if let Err(error) = fs::rename(&dir, &trash) {
        let _ = fs::remove_dir(&trash);
        return Err(error);
    }
    // Done: the project has left the library. Failures from here must not
    // report it still there, or the page would keep it open; what a failed
    // removal leaves is a hidden `.tmp` folder, which harms nothing.
    let _ = files::sync_dir(root);
    let _ = fs::remove_dir_all(&trash);
    Ok(())
}

/// Adds the draft `draft`, holding `text`, with `copy` as its Fountain
/// copy, to the project `folder`, with `project`, which names it, as its
/// `project.json`, which must still be `was`.
pub fn create_draft(
    root: &Path,
    folder: &str,
    draft: &str,
    text: &str,
    copy: &str,
    was: &str,
    project: &str,
) -> io::Result<()> {
    let dir = project_dir(root, folder)?;
    let file = drafts_dir(&dir)?.join(draft_entry(draft)?);
    unchanged(&dir, was)?;
    claim_draft(&file)?;
    let written = files::replace(&file, text.as_bytes())
        .and_then(|()| files::replace(&copy_of(&file), copy.as_bytes()));
    if let Err(error) = written {
        // Both are this call's own: `claim_draft` found their names free.
        let _ = fs::remove_file(copy_of(&file));
        let _ = fs::remove_file(&file);
        return Err(error);
    }
    // From here the draft stays, even if naming it fails: a draft the
    // project file does not name harms nothing.
    publish_project(&dir, project)
}

/// The text of the project `folder`'s draft `draft`.
pub fn read_draft(root: &Path, folder: &str, draft: &str) -> io::Result<String> {
    let dir = project_dir(root, folder)?;
    let file = drafts_dir(&dir)?.join(draft_entry(draft)?);
    files::read_text(existing_draft(&file)?)
}

/// Saves the project `folder`'s draft `draft`: `text` replaces the draft
/// file, then `copy` its Fountain copy, so the copy is never newer than
/// the draft. A save never makes a draft: the draft must be there, a file
/// of its own. A link or a folder where the copy goes is refused, as no
/// copy Tir writes is one. With `was`, the fingerprint of what Tir last
/// saw in the draft, a draft that has changed since is refused, so that
/// work brought in by a `git pull` is never saved over unseen.
pub fn write_draft(
    root: &Path,
    folder: &str,
    draft: &str,
    text: &str,
    copy: &str,
    was: Option<u64>,
) -> io::Result<()> {
    let dir = project_dir(root, folder)?;
    let file = drafts_dir(&dir)?.join(draft_entry(draft)?);
    existing_draft(&file)?;
    if let Some(was) = was
        && fingerprint(&fs::read(&file)?) != was
    {
        return Err(io::Error::other(format!(
            "“{}” has changed on disk since Tir opened it, perhaps by a git pull, so Tir \
             saved nothing over it. Close Tir and open it again to see the draft as it is now.",
            draft.strip_suffix(DRAFT).unwrap_or(draft)
        )));
    }
    let copy_file = copy_of(&file);
    match fs::symlink_metadata(&copy_file) {
        Ok(metadata) if !metadata.is_file() => {
            return Err(refused(format!(
                "“{}” is not a Fountain copy Tir wrote.",
                name_of(&copy_file)
            )));
        }
        _ => {}
    }
    files::replace(&file, text.as_bytes())?;
    files::replace(&copy_file, copy.as_bytes())
}

/// Moves the project `folder`'s draft `draft` to the file `to`, with
/// `project`, which names `to`, as its `project.json`, which must still be
/// `was`. The draft's Fountain copy follows it.
pub fn rename_draft(
    root: &Path,
    folder: &str,
    draft: &str,
    to: &str,
    was: &str,
    project: &str,
) -> io::Result<()> {
    let dir = project_dir(root, folder)?;
    let drafts = drafts_dir(&dir)?;
    let from = drafts.join(draft_entry(draft)?);
    let moved = drafts.join(draft_entry(to)?);
    unchanged(&dir, was)?;
    if draft == to {
        return publish_project(&dir, project);
    }
    // Copied, and the old file removed only once the project names the new
    // one, so the file it names is there throughout.
    let mut source = fs::File::open(regular_file(&from)?)?;
    let modified = source.metadata()?.modified()?;
    claim_draft(&moved)?;
    let published = files::replace_with(&moved, |file| {
        io::copy(&mut source, file)?;
        file.set_modified(modified)
    })
    .and_then(|()| files::publish(&dir.join(PROJECT), project.as_bytes()));
    if let Err(error) = published {
        let _ = fs::remove_file(&moved);
        return Err(error);
    }
    // Done: the page must save to the new file. Keep the old files until
    // the project file's rename is durable, so a crash cannot strand it.
    if files::sync_dir(&dir).is_ok() {
        let _ = fs::remove_file(&from);
        // `claim_draft` found the new copy's name free.
        let _ = fs::rename(copy_of(&from), copy_of(&moved));
        let _ = files::sync_dir(&drafts);
    }
    Ok(())
}

/// Deletes the project `folder`'s draft `draft` and its Fountain copy, with
/// `project`, which no longer names it, as its `project.json`, which must
/// still be `was`.
pub fn delete_draft(
    root: &Path,
    folder: &str,
    draft: &str,
    was: &str,
    project: &str,
) -> io::Result<()> {
    let dir = project_dir(root, folder)?;
    let drafts = drafts_dir(&dir)?;
    let file = drafts.join(draft_entry(draft)?);
    unchanged(&dir, was)?;
    // Commit by publishing the project file, then remove the old files
    // only once it is durable. Cleanup errors cannot undo the deletion.
    files::publish(&dir.join(PROJECT), project.as_bytes())?;
    if files::sync_dir(&dir).is_ok() {
        let _ = fs::remove_file(copy_of(&file));
        let _ = fs::remove_file(file);
        let _ = files::sync_dir(&drafts);
    }
    Ok(())
}

/// The writer's dictionary's text: nothing before the first word is added.
pub fn read_dictionary(root: &Path) -> io::Result<String> {
    let file = root.join(DICTIONARY);
    match fs::symlink_metadata(&file) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(String::new()),
        _ => files::read_text(regular_file(&file)?),
    }
}

/// Adds `word` to the writer's dictionary, on a line of its own after the
/// lines already there, unless a line holds it already. The library is
/// made if need be: a word may come before the first project.
pub fn add_word(root: &Path, word: &str) -> io::Result<()> {
    let one = !word.is_empty()
        && word.len() <= LONGEST_WORD
        && !word.chars().any(|c| c.is_whitespace() || c.is_control());
    if !one {
        return Err(refused(format!(
            "“{word}” is not a word Tir adds to the dictionary."
        )));
    }
    let mut text = read_dictionary(root)?;
    if text.lines().any(|line| line.trim() == word) {
        return Ok(());
    }
    if !text.is_empty() && !text.ends_with('\n') {
        text.push('\n');
    }
    text.push_str(word);
    text.push('\n');
    make_library(root)?;
    files::replace(&root.join(DICTIONARY), text.as_bytes())
}

/// `name`, refused unless it is one entry of a folder and not hidden: never
/// `..`, a path, or `.git`. The interface's names are such
/// (`isSafeName` in `src/core/file-names.ts`).
fn entry(name: &str) -> io::Result<&str> {
    let one = !name.is_empty()
        && !name.starts_with('.')
        && !name.contains(['/', '\\', '\0'])
        && name.len() <= 255;
    if one {
        Ok(name)
    } else {
        Err(refused(format!(
            "“{name}” is not a name Tir gives anything in the library."
        )))
    }
}

/// `file`, a draft that must be there, refused unless it is a file of its
/// own (`regular_file`).
fn existing_draft(file: &Path) -> io::Result<&Path> {
    match fs::symlink_metadata(file) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => Err(io::Error::new(
            io::ErrorKind::NotFound,
            format!("The draft file “{}” is missing.", name_of(file)),
        )),
        _ => regular_file(file),
    }
}

/// `name` as a draft's file.
fn draft_entry(name: &str) -> io::Result<&str> {
    if entry(name)?.ends_with(DRAFT) {
        Ok(name)
    } else {
        Err(refused(format!("“{name}” is not a draft's file.")))
    }
}

/// The project folder `folder`, which must be in the library.
fn project_dir(root: &Path, folder: &str) -> io::Result<PathBuf> {
    real_dir(root.join(entry(folder)?))
}

/// The `drafts` folder of the project in `dir`.
fn drafts_dir(dir: &Path) -> io::Result<PathBuf> {
    real_dir(dir.join(DRAFTS))
}

/// `dir`, refused unless it is a folder of its own: through a link to a
/// folder elsewhere, a write would land outside the library.
fn real_dir(dir: PathBuf) -> io::Result<PathBuf> {
    if fs::symlink_metadata(&dir)?.is_dir() {
        Ok(dir)
    } else {
        Err(refused(format!(
            "“{}” is not a folder in the library.",
            name_of(&dir)
        )))
    }
}

/// `file`, refused unless it is a file of its own: through a link, a read
/// would bring a file from outside the library into it.
fn regular_file(file: &Path) -> io::Result<&Path> {
    if fs::symlink_metadata(file)?.is_file() {
        Ok(file)
    } else {
        Err(refused(format!(
            "“{}” is not a file in the library.",
            name_of(file)
        )))
    }
}

/// The text of the project file in `dir`.
fn read_project(dir: &Path) -> io::Result<String> {
    files::read_text(regular_file(&dir.join(PROJECT))?)
}

/// Refuses a change when the project file in `dir` is no longer `was`, the
/// text the interface made the change from, so that a change made from an
/// older reading never undoes a newer one.
fn unchanged(dir: &Path, was: &str) -> io::Result<()> {
    if fs::read(regular_file(&dir.join(PROJECT))?)? == was.as_bytes() {
        Ok(())
    } else {
        Err(io::Error::other(format!(
            "“{}” changed since Tir last read it.",
            name_of(dir)
        )))
    }
}

/// Replaces the project file in `dir` with `project`. The change is done
/// once the file is in place: a failure to sync the folder after must not
/// report it undone, or the page would keep a reading the file no longer
/// holds and every later change would be refused.
fn publish_project(dir: &Path, project: &str) -> io::Result<()> {
    files::publish(&dir.join(PROJECT), project.as_bytes())?;
    let _ = files::sync_dir(dir);
    Ok(())
}

/// Makes the library's folder, and any folder above it that is missing, so
/// that each stays after a crash.
fn make_library(root: &Path) -> io::Result<()> {
    let mut missing = Vec::new();
    let mut dir = root;
    while fs::symlink_metadata(dir).is_err() {
        missing.push(dir);
        match dir.parent() {
            Some(parent) => dir = parent,
            None => break,
        }
    }
    fs::create_dir_all(root)?;
    for dir in missing.into_iter().rev() {
        if let Some(parent) = dir.parent() {
            files::sync_dir(parent)?;
        }
    }
    Ok(())
}

/// Makes the folder `dir`, refusing when anything has its name.
fn claim_dir(dir: &Path) -> io::Result<()> {
    fs::create_dir(dir).map_err(|error| taken(dir, error))
}

/// Makes the empty file `file` for a draft, refusing when anything has its
/// name or its Fountain copy's, which a save writes.
fn claim_draft(file: &Path) -> io::Result<()> {
    let copy = copy_of(file);
    if fs::symlink_metadata(&copy).is_ok() {
        return Err(taken(&copy, io::ErrorKind::AlreadyExists.into()));
    }
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(file)
        .map(drop)
        .map_err(|error| taken(file, error))
}

/// A new, empty, hidden folder in `root`, `.deleting.<pid>-<n>.tmp` with
/// the first `n` free.
fn claim_hidden_dir(root: &Path) -> io::Result<PathBuf> {
    let pid = std::process::id();
    for n in 0..=u32::MAX {
        let dir = root.join(format!(".deleting.{pid}-{n}.tmp"));
        match fs::create_dir(&dir) {
            Ok(()) => return Ok(dir),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error),
        }
    }
    Err(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "no free temporary folder name",
    ))
}

/// The Fountain copy beside the draft `file`.
fn copy_of(file: &Path) -> PathBuf {
    let name = name_of(file);
    file.with_file_name(format!(
        "{}{COPY}",
        name.strip_suffix(DRAFT).unwrap_or(&name)
    ))
}

fn name_of(path: &Path) -> String {
    path.file_name()
        .unwrap_or(path.as_os_str())
        .to_string_lossy()
        .into_owned()
}

fn refused(message: String) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}

fn taken(path: &Path, error: io::Error) -> io::Error {
    if error.kind() != io::ErrorKind::AlreadyExists {
        return error;
    }
    io::Error::new(
        io::ErrorKind::AlreadyExists,
        format!("“{}” is already in the library.", name_of(path)),
    )
}

/// The library's commands. Each takes names, checked as above, and the
/// texts to write; a change to a project also takes `was`, the project
/// file's text it was made from. An error comes back as its message. Each
/// command that may change the library tells backup, which records the
/// changes once the library has been quiet for a while.
pub mod commands {
    use super::Library;
    use crate::backup::Backup;
    use std::io;
    use std::path::Path;
    use tauri::{AppHandle, Manager, State};

    fn run<T>(
        library: &Library,
        command: impl FnOnce(&Path) -> io::Result<T>,
    ) -> Result<T, String> {
        let _one_at_a_time = library
            .busy
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let root = library.root.as_deref().map_err(Clone::clone)?;
        command(root).map_err(|error| error.to_string())
    }

    /// `run` for a command that changes the library, even when it fails
    /// part way.
    fn change<T>(
        library: &Library,
        backup: &Backup,
        command: impl FnOnce(&Path) -> io::Result<T>,
    ) -> Result<T, String> {
        let result = run(library, command);
        backup.changed();
        result
    }

    #[tauri::command(async)]
    pub fn list_library(library: State<'_, Library>) -> Result<super::Listing, String> {
        run(&library, super::list)
    }

    /// The library's folder as the writer would type it, for the Projects
    /// screen to show when the library is empty. The page only shows it: no
    /// command takes a path.
    #[tauri::command(async)]
    pub fn library_place(app: AppHandle, library: State<'_, Library>) -> Result<String, String> {
        let root = library.root.as_deref().map_err(Clone::clone)?;
        Ok(super::shown(root, app.path().home_dir().ok().as_deref()))
    }

    #[tauri::command(async)]
    pub fn create_project(
        library: State<'_, Library>,
        backup: State<'_, Backup>,
        folder: String,
        project: String,
        draft: String,
        text: String,
        copy: String,
    ) -> Result<(), String> {
        change(&library, &backup, |root| {
            super::create_project(root, &folder, &project, &draft, &text, &copy)?;
            library.saw(&folder, &draft, &text);
            Ok(())
        })
    }

    #[tauri::command(async)]
    pub fn write_project(
        library: State<'_, Library>,
        backup: State<'_, Backup>,
        folder: String,
        was: String,
        project: String,
    ) -> Result<(), String> {
        change(&library, &backup, |root| {
            super::write_project(root, &folder, &was, &project)
        })
    }

    #[tauri::command(async)]
    pub fn rename_project(
        library: State<'_, Library>,
        backup: State<'_, Backup>,
        folder: String,
        to: String,
        was: String,
        project: String,
    ) -> Result<(), String> {
        change(&library, &backup, |root| {
            super::rename_project(root, &folder, &to, &was, &project)?;
            library.moved_project(&folder, Some(&to));
            Ok(())
        })
    }

    #[tauri::command(async)]
    pub fn delete_project(
        library: State<'_, Library>,
        backup: State<'_, Backup>,
        folder: String,
    ) -> Result<(), String> {
        change(&library, &backup, |root| {
            super::delete_project(root, &folder)?;
            library.moved_project(&folder, None);
            Ok(())
        })
    }

    // The page names each argument; a struct would change what it sends.
    #[allow(clippy::too_many_arguments)]
    #[tauri::command(async)]
    pub fn create_draft(
        library: State<'_, Library>,
        backup: State<'_, Backup>,
        folder: String,
        draft: String,
        text: String,
        copy: String,
        was: String,
        project: String,
    ) -> Result<(), String> {
        change(&library, &backup, |root| {
            super::create_draft(root, &folder, &draft, &text, &copy, &was, &project)?;
            library.saw(&folder, &draft, &text);
            Ok(())
        })
    }

    /// The draft's text; with `shown`, the text the page shows and edits,
    /// which saves may then replace.
    #[tauri::command(async)]
    pub fn read_draft(
        library: State<'_, Library>,
        folder: String,
        draft: String,
        shown: bool,
    ) -> Result<String, String> {
        run(&library, |root| {
            let text = super::read_draft(root, &folder, &draft)?;
            if shown {
                library.saw(&folder, &draft, &text);
            }
            Ok(text)
        })
    }

    #[tauri::command(async)]
    pub fn write_draft(
        library: State<'_, Library>,
        backup: State<'_, Backup>,
        folder: String,
        draft: String,
        text: String,
        copy: String,
    ) -> Result<(), String> {
        change(&library, &backup, |root| {
            let was = library.holds(&folder, &draft);
            super::write_draft(root, &folder, &draft, &text, &copy, was)?;
            library.saw(&folder, &draft, &text);
            Ok(())
        })
    }

    #[tauri::command(async)]
    pub fn rename_draft(
        library: State<'_, Library>,
        backup: State<'_, Backup>,
        folder: String,
        draft: String,
        to: String,
        was: String,
        project: String,
    ) -> Result<(), String> {
        change(&library, &backup, |root| {
            super::rename_draft(root, &folder, &draft, &to, &was, &project)?;
            library.moved(&folder, &draft, &to);
            Ok(())
        })
    }

    #[tauri::command(async)]
    pub fn delete_draft(
        library: State<'_, Library>,
        backup: State<'_, Backup>,
        folder: String,
        draft: String,
        was: String,
        project: String,
    ) -> Result<(), String> {
        change(&library, &backup, |root| {
            super::delete_draft(root, &folder, &draft, &was, &project)?;
            library.forget(&folder, &draft);
            Ok(())
        })
    }

    #[tauri::command(async)]
    pub fn read_dictionary(library: State<'_, Library>) -> Result<String, String> {
        run(&library, super::read_dictionary)
    }

    #[tauri::command(async)]
    pub fn add_to_dictionary(
        library: State<'_, Library>,
        backup: State<'_, Backup>,
        word: String,
    ) -> Result<(), String> {
        change(&library, &backup, |root| super::add_word(root, &word))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::files::tests::TempDir;
    use std::os::unix::fs::symlink;

    // The texts are the interface's to make and this side's only to write,
    // so any text will do; these look like what the interface writes.
    const SALT: &str = "{\"format\": \"tir-project\", \"name\": \"Salt Line\"}\n";
    const TIDE: &str = "{\"format\": \"tir-project\", \"name\": \"Tide Line\"}\n";
    const LOW: &str = "{\"format\": \"tir-project\", \"name\": \"Low Tide\"}\n";
    const FIRST: &str = "{\"format\": \"tir-draft\", \"elements\": [\"first\"]}\n";
    const REWRITE: &str = "{\"format\": \"tir-draft\", \"elements\": [\"rewrite\"]}\n";
    const FIRST_COPY: &str = "INT. FIRST - NIGHT\n";
    const REWRITE_COPY: &str = "INT. REWRITE - NIGHT\n";

    /// A library, `root`, in a temporary folder beside `outside`, a folder a
    /// name or link that escaped the library would reach.
    struct Trial {
        dir: TempDir,
        root: PathBuf,
        outside: PathBuf,
    }

    impl Trial {
        /// The library holding "Salt Line", its project file `SALT` and its
        /// one draft "First Draft.tir", `FIRST`, with its copy, `FIRST_COPY`.
        fn new() -> Self {
            let dir = TempDir::new();
            let root = dir.0.join("Screenplays");
            let outside = dir.0.join("outside");
            fs::create_dir(&outside).unwrap();
            fs::write(outside.join(PROJECT), SALT).unwrap();
            create_project(
                &root,
                "Salt Line",
                SALT,
                "First Draft.tir",
                FIRST,
                FIRST_COPY,
            )
            .unwrap();
            Trial { dir, root, outside }
        }

        fn read(&self, path: &str) -> String {
            fs::read_to_string(self.root.join(path)).unwrap()
        }

        fn names(&self, path: &str) -> Vec<String> {
            entry_names(&self.root.join(path)).unwrap()
        }

        /// "Salt Line" as `Trial::new` made it.
        fn assert_salt_line_untouched(&self) {
            assert_eq!(self.names("Salt Line"), ["drafts", PROJECT]);
            assert_eq!(
                self.names("Salt Line/drafts"),
                ["First Draft.fountain", "First Draft.tir"]
            );
            assert_eq!(self.read("Salt Line/project.json"), SALT);
            assert_eq!(self.read("Salt Line/drafts/First Draft.tir"), FIRST);
            assert_eq!(
                self.read("Salt Line/drafts/First Draft.fountain"),
                FIRST_COPY
            );
        }

        /// Only `outside` and the library, and `outside` as it was made.
        fn assert_outside_untouched(&self) {
            assert_eq!(self.dir.names(), ["Screenplays", "outside"]);
            assert_eq!(entry_names(&self.outside).unwrap(), [PROJECT]);
            assert_eq!(
                fs::read_to_string(self.outside.join(PROJECT)).unwrap(),
                SALT
            );
        }
    }

    #[test]
    fn finds_the_library() {
        let home = Path::new("/home/you");
        let sandbox = Path::new("/tmp/tir-trial");
        assert_eq!(
            root(None, Some(home), None),
            Some(PathBuf::from("/home/you/Screenplays"))
        );
        // A trial run's library is never the writer's.
        assert_eq!(
            root(None, Some(home), Some(sandbox)),
            Some(PathBuf::from("/tmp/tir-trial/Screenplays"))
        );
        assert_eq!(
            root(Some("/srv/scripts"), Some(home), Some(sandbox)),
            Some(PathBuf::from("/srv/scripts"))
        );
        assert_eq!(
            root(Some("~/Scripts/Tir"), Some(home), None),
            Some(PathBuf::from("/home/you/Scripts/Tir"))
        );
        assert_eq!(
            root(Some("~"), Some(home), None),
            Some(PathBuf::from("/home/you"))
        );
        // A folder it cannot place gives the default.
        for configured in ["Scripts", "", "~other/Scripts", "./Scripts"] {
            assert_eq!(
                root(Some(configured), Some(home), None),
                Some(PathBuf::from("/home/you/Screenplays")),
                "{configured}"
            );
        }
        assert_eq!(
            root(Some("~/Scripts"), None, Some(sandbox)),
            Some(PathBuf::from("/tmp/tir-trial/Screenplays"))
        );
        assert_eq!(root(None, None, None), None);
    }

    #[test]
    fn shows_the_library_from_the_home_folder() {
        let home = Path::new("/home/you");
        let shown_in = |root: &str, home| shown(Path::new(root), home);
        assert_eq!(
            shown_in("/home/you/Screenplays", Some(home)),
            "~/Screenplays"
        );
        assert_eq!(
            shown_in("/home/you/Scripts/Tir", Some(home)),
            "~/Scripts/Tir"
        );
        assert_eq!(shown_in("/home/you", Some(home)), "~");
        assert_eq!(
            shown_in("/home/young/Screenplays", Some(home)),
            "/home/young/Screenplays"
        );
        assert_eq!(
            shown_in("/tmp/tir-trial/Screenplays", Some(home)),
            "/tmp/tir-trial/Screenplays"
        );
        assert_eq!(
            shown_in("/home/you/Screenplays", None),
            "/home/you/Screenplays"
        );
    }

    #[test]
    fn makes_the_library_with_its_first_project() {
        let dir = TempDir::new();
        let root = dir.0.join("Documents").join("Screenplays");
        assert_eq!(list(&root).unwrap(), Listing::default());
        create_project(
            &root,
            "Salt Line",
            SALT,
            "First Draft.tir",
            FIRST,
            FIRST_COPY,
        )
        .unwrap();
        assert_eq!(entry_names(&root).unwrap(), ["Salt Line"]);
        assert_eq!(
            entry_names(&root.join("Salt Line")).unwrap(),
            ["drafts", PROJECT]
        );
        assert_eq!(
            fs::read_to_string(root.join("Salt Line/project.json")).unwrap(),
            SALT
        );
        assert_eq!(
            fs::read_to_string(root.join("Salt Line/drafts/First Draft.tir")).unwrap(),
            FIRST
        );
        assert_eq!(
            fs::read_to_string(root.join("Salt Line/drafts/First Draft.fountain")).unwrap(),
            FIRST_COPY
        );
        let mut listing = list(&root).unwrap();
        // When the draft was written: `lists_when_each_draft_was_last_written`.
        let edited = std::mem::take(&mut listing.projects[0].edited);
        assert_eq!(edited.keys().collect::<Vec<_>>(), ["First Draft.tir"]);
        assert_eq!(
            listing,
            Listing {
                names: vec!["Salt Line".into()],
                projects: vec![Listed {
                    folder: "Salt Line".into(),
                    text: Some(SALT.into()),
                    problem: None,
                    files: vec!["First Draft.fountain".into(), "First Draft.tir".into()],
                    edited: BTreeMap::new(),
                }],
            }
        );
    }

    #[test]
    fn adds_the_writers_words_to_a_dictionary_in_the_library() {
        let dir = TempDir::new();
        let root = dir.0.join("Screenplays");
        assert_eq!(read_dictionary(&root).unwrap(), "");
        // A word may come before the first project: the library is made.
        add_word(&root, "Okafor").unwrap();
        add_word(&root, "Halcyon").unwrap();
        add_word(&root, "Okafor").unwrap();
        assert_eq!(read_dictionary(&root).unwrap(), "Okafor\nHalcyon\n");
        // A line the writer typed without its line break keeps its own line.
        fs::write(root.join(DICTIONARY), "Okafor\nTeo").unwrap();
        add_word(&root, "Tomás").unwrap();
        assert_eq!(read_dictionary(&root).unwrap(), "Okafor\nTeo\nTomás\n");
        // The dictionary is no project, but no project takes its name.
        let listing = list(&root).unwrap();
        assert_eq!(listing.names, [DICTIONARY]);
        assert!(listing.projects.is_empty());
    }

    #[test]
    fn refuses_what_is_no_word_and_a_dictionary_that_is_a_link() {
        let trial = Trial::new();
        for word in ["", "two words", "line\nbreak", "tab\t", &"long".repeat(26)] {
            assert_eq!(
                add_word(&trial.root, word).unwrap_err().kind(),
                io::ErrorKind::InvalidInput,
                "{word:?}"
            );
        }
        assert_eq!(trial.names(""), ["Salt Line"]);
        symlink(trial.outside.join(PROJECT), trial.root.join(DICTIONARY)).unwrap();
        assert!(read_dictionary(&trial.root).is_err());
        assert!(add_word(&trial.root, "Okafor").is_err());
        trial.assert_outside_untouched();
    }

    #[test]
    fn lists_when_each_draft_was_last_written() {
        let trial = Trial::new();
        // Neither its copy nor a link, a folder or a note is a draft.
        let drafts = trial.root.join("Salt Line/drafts");
        symlink(trial.outside.join(PROJECT), drafts.join("Linked.tir")).unwrap();
        fs::create_dir(drafts.join("Folder.tir")).unwrap();
        fs::write(drafts.join("notes.txt"), "notes").unwrap();
        let edited = |root: &Path| list(root).unwrap().projects.remove(0).edited;
        let made = edited(&trial.root);
        assert_eq!(made.keys().collect::<Vec<_>>(), ["First Draft.tir"]);
        let now = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs_f64()
            * 1e3;
        let first = made["First Draft.tir"];
        assert!((now - first).abs() < 10_000.0, "{now} {first}");

        // A save is an edit, but renaming the project is not.
        std::thread::sleep(std::time::Duration::from_millis(50));
        rename_project(&trial.root, "Salt Line", "Tide Line", SALT, TIDE).unwrap();
        assert_eq!(edited(&trial.root)["First Draft.tir"], first);
        write_draft(
            &trial.root,
            "Tide Line",
            "First Draft.tir",
            REWRITE,
            REWRITE_COPY,
            None,
        )
        .unwrap();
        let saved = edited(&trial.root)["First Draft.tir"];
        // The file system's clock may lag a few milliseconds behind.
        assert!(saved - first > 30.0, "{first} {saved}");
    }

    #[test]
    fn never_makes_a_project_over_anything_already_there() {
        let trial = Trial::new();
        fs::write(trial.root.join("README.md"), "notes").unwrap();
        for folder in ["Salt Line", "README.md"] {
            let error =
                create_project(&trial.root, folder, TIDE, "Other.tir", REWRITE, "").unwrap_err();
            assert_eq!(error.kind(), io::ErrorKind::AlreadyExists, "{folder}");
        }
        assert_eq!(trial.names(""), ["README.md", "Salt Line"]);
        assert_eq!(trial.read("README.md"), "notes");
        trial.assert_salt_line_untouched();
    }

    #[test]
    fn a_project_that_fails_to_be_made_leaves_nothing() {
        let trial = Trial::new();
        // Allowed as a name, but its temporary file's name is too long.
        let long = format!("{}.tir", "x".repeat(251));
        assert!(create_project(&trial.root, "Tide Line", TIDE, &long, FIRST, FIRST_COPY).is_err());
        assert_eq!(trial.names(""), ["Salt Line"]);
        trial.assert_salt_line_untouched();
        trial.assert_outside_untouched();
    }

    #[test]
    fn lists_every_folder_and_what_is_wrong_with_one() {
        let trial = Trial::new();
        // A damaged project file comes back as it is, for the interface to refuse.
        create_project(
            &trial.root,
            "Damaged",
            "{\"format\": \"tir-pro",
            "A.tir",
            FIRST,
            FIRST_COPY,
        )
        .unwrap();
        fs::create_dir_all(trial.root.join("Empty")).unwrap();
        fs::create_dir_all(trial.root.join("Latin-1/drafts")).unwrap();
        fs::write(
            trial.root.join("Latin-1/project.json"),
            b"{\"name\": \"Tom\xe1s\"}",
        )
        .unwrap();
        // Nothing is read through a link: not a project file, nor a drafts folder.
        fs::create_dir_all(trial.root.join("Linked file")).unwrap();
        symlink(
            trial.outside.join(PROJECT),
            trial.root.join("Linked file/project.json"),
        )
        .unwrap();
        symlink(&trial.outside, trial.root.join("Linked file/drafts")).unwrap();
        // Hidden entries, files and links are no projects.
        fs::create_dir_all(trial.root.join(".git/objects")).unwrap();
        fs::write(trial.root.join(".gitignore"), "*.tmp\n").unwrap();
        fs::write(trial.root.join("README.md"), "notes").unwrap();
        symlink(&trial.outside, trial.root.join("Linked")).unwrap();

        let listing = list(&trial.root).unwrap();
        assert_eq!(
            listing.names,
            [
                "Damaged",
                "Empty",
                "Latin-1",
                "Linked",
                "Linked file",
                "README.md",
                "Salt Line"
            ]
        );
        let shown: Vec<_> = listing
            .projects
            .iter()
            .map(|p| {
                (
                    p.folder.as_str(),
                    p.text.as_deref(),
                    p.problem.is_some(),
                    p.files.len(),
                )
            })
            .collect();
        assert_eq!(
            shown,
            [
                ("Damaged", Some("{\"format\": \"tir-pro"), false, 2),
                ("Empty", None, true, 0),
                ("Latin-1", None, true, 0),
                ("Linked file", None, true, 0),
                ("Salt Line", Some(SALT), false, 2),
            ]
        );
    }

    #[test]
    fn renames_a_project_and_its_folder() {
        let trial = Trial::new();
        rename_project(&trial.root, "Salt Line", "Tide Line", SALT, TIDE).unwrap();
        assert_eq!(trial.names(""), ["Tide Line"]);
        assert_eq!(trial.read("Tide Line/project.json"), TIDE);
        assert_eq!(trial.read("Tide Line/drafts/First Draft.tir"), FIRST);
        // A name that keeps the folder changes only the project file.
        rename_project(&trial.root, "Tide Line", "Tide Line", TIDE, LOW).unwrap();
        assert_eq!(trial.names(""), ["Tide Line"]);
        assert_eq!(trial.read("Tide Line/project.json"), LOW);
        trial.assert_outside_untouched();
    }

    #[test]
    fn never_renames_a_project_over_another() {
        let trial = Trial::new();
        create_project(
            &trial.root,
            "Tide Line",
            TIDE,
            "First Draft.tir",
            REWRITE,
            REWRITE_COPY,
        )
        .unwrap();
        let error = rename_project(&trial.root, "Salt Line", "Tide Line", SALT, LOW).unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::AlreadyExists);
        assert_eq!(trial.names(""), ["Salt Line", "Tide Line"]);
        assert_eq!(trial.read("Tide Line/project.json"), TIDE);
        assert_eq!(trial.read("Tide Line/drafts/First Draft.tir"), REWRITE);
        trial.assert_salt_line_untouched();
    }

    #[test]
    fn deletes_only_the_project_named() {
        let trial = Trial::new();
        create_project(
            &trial.root,
            "Tide Line",
            TIDE,
            "First Draft.tir",
            REWRITE,
            REWRITE_COPY,
        )
        .unwrap();
        delete_project(&trial.root, "Tide Line").unwrap();
        // Nothing left behind, hidden or not.
        assert_eq!(trial.names(""), ["Salt Line"]);
        trial.assert_salt_line_untouched();
        assert_eq!(
            delete_project(&trial.root, "Tide Line").unwrap_err().kind(),
            io::ErrorKind::NotFound
        );
        // A damaged project is still Tir's to delete.
        fs::write(trial.root.join("Salt Line/project.json"), "{\"form").unwrap();
        delete_project(&trial.root, "Salt Line").unwrap();
        assert!(trial.names("").is_empty());
        trial.assert_outside_untouched();
    }

    #[test]
    fn a_project_that_left_the_library_is_deleted_even_if_its_files_stay() {
        use std::os::unix::fs::PermissionsExt;
        let trial = Trial::new();
        // The files of a folder that cannot be written cannot be removed.
        let drafts = trial.root.join("Salt Line/drafts");
        fs::set_permissions(&drafts, fs::Permissions::from_mode(0o555)).unwrap();
        let deleted = delete_project(&trial.root, "Salt Line");
        // So the temporary folder can go.
        for entry in fs::read_dir(&trial.root).unwrap() {
            let drafts = entry.unwrap().path().join(DRAFTS);
            let _ = fs::set_permissions(&drafts, fs::Permissions::from_mode(0o755));
        }
        deleted.unwrap();
        assert_eq!(list(&trial.root).unwrap(), Listing::default());
        // What could not be removed is hidden, for no listing to show.
        let left = trial.names("");
        assert!(
            left.iter()
                .all(|name| name.starts_with(".deleting.") && name.ends_with(".tmp")),
            "{left:?}"
        );
        trial.assert_outside_untouched();
    }

    #[test]
    fn never_deletes_a_folder_that_is_not_a_project() {
        let trial = Trial::new();
        fs::create_dir_all(trial.root.join("References/drafts")).unwrap();
        fs::write(trial.root.join("References/drafts/notes.tir"), "notes").unwrap();
        fs::create_dir_all(trial.root.join("Linked file")).unwrap();
        symlink(
            trial.outside.join(PROJECT),
            trial.root.join("Linked file/project.json"),
        )
        .unwrap();
        for folder in ["References", "Linked file"] {
            let error = delete_project(&trial.root, folder).unwrap_err();
            assert_eq!(error.kind(), io::ErrorKind::InvalidInput, "{folder}");
        }
        assert_eq!(trial.names(""), ["Linked file", "References", "Salt Line"]);
        assert_eq!(trial.read("References/drafts/notes.tir"), "notes");
        trial.assert_salt_line_untouched();
        assert_eq!(entry_names(&trial.outside).unwrap(), [PROJECT]);
    }

    #[test]
    fn adds_renames_and_deletes_drafts_with_their_copies() {
        let trial = Trial::new();
        create_draft(
            &trial.root,
            "Salt Line",
            "Rewrite.tir",
            REWRITE,
            REWRITE_COPY,
            SALT,
            TIDE,
        )
        .unwrap();
        assert_eq!(trial.read("Salt Line/drafts/Rewrite.tir"), REWRITE);
        assert_eq!(
            trial.read("Salt Line/drafts/Rewrite.fountain"),
            REWRITE_COPY
        );
        assert_eq!(trial.read("Salt Line/project.json"), TIDE);
        OpenOptions::new()
            .write(true)
            .open(trial.root.join("Salt Line/drafts/Rewrite.tir"))
            .unwrap()
            .set_modified(UNIX_EPOCH + std::time::Duration::from_secs(1_700_000_000))
            .unwrap();

        rename_draft(
            &trial.root,
            "Salt Line",
            "Rewrite.tir",
            "Polish.tir",
            TIDE,
            LOW,
        )
        .unwrap();
        assert_eq!(
            trial.names("Salt Line/drafts"),
            [
                "First Draft.fountain",
                "First Draft.tir",
                "Polish.fountain",
                "Polish.tir"
            ]
        );
        assert_eq!(trial.read("Salt Line/drafts/Polish.tir"), REWRITE);
        assert_eq!(trial.read("Salt Line/drafts/Polish.fountain"), REWRITE_COPY);
        assert_eq!(trial.read("Salt Line/project.json"), LOW);
        assert_eq!(
            list(&trial.root).unwrap().projects[0].edited["Polish.tir"],
            1_700_000_000_000.0
        );
        // A name that keeps the file changes only the project file.
        rename_draft(
            &trial.root,
            "Salt Line",
            "Polish.tir",
            "Polish.tir",
            LOW,
            TIDE,
        )
        .unwrap();
        assert_eq!(trial.read("Salt Line/project.json"), TIDE);

        delete_draft(&trial.root, "Salt Line", "Polish.tir", TIDE, SALT).unwrap();
        trial.assert_salt_line_untouched();
        trial.assert_outside_untouched();
    }

    #[test]
    fn a_draft_is_deleted_even_if_its_copy_cannot_be_removed() {
        let trial = Trial::new();
        create_draft(
            &trial.root,
            "Salt Line",
            "Rewrite.tir",
            REWRITE,
            REWRITE_COPY,
            SALT,
            TIDE,
        )
        .unwrap();
        let copy = trial.root.join("Salt Line/drafts/Rewrite.fountain");
        fs::remove_file(&copy).unwrap();
        fs::create_dir(&copy).unwrap();

        delete_draft(&trial.root, "Salt Line", "Rewrite.tir", TIDE, SALT).unwrap();
        assert_eq!(trial.read("Salt Line/project.json"), SALT);
        assert!(!trial.root.join("Salt Line/drafts/Rewrite.tir").exists());
        assert!(copy.is_dir());
    }

    #[test]
    fn reads_and_saves_a_draft_with_its_copy() {
        let trial = Trial::new();
        assert_eq!(
            read_draft(&trial.root, "Salt Line", "First Draft.tir").unwrap(),
            FIRST
        );
        write_draft(
            &trial.root,
            "Salt Line",
            "First Draft.tir",
            REWRITE,
            REWRITE_COPY,
            None,
        )
        .unwrap();
        assert_eq!(trial.read("Salt Line/drafts/First Draft.tir"), REWRITE);
        assert_eq!(
            trial.read("Salt Line/drafts/First Draft.fountain"),
            REWRITE_COPY
        );
        // A missing copy is written afresh.
        fs::remove_file(trial.root.join("Salt Line/drafts/First Draft.fountain")).unwrap();
        write_draft(
            &trial.root,
            "Salt Line",
            "First Draft.tir",
            FIRST,
            FIRST_COPY,
            None,
        )
        .unwrap();
        // Nothing else changed, and no temporary file is left.
        trial.assert_salt_line_untouched();
        trial.assert_outside_untouched();
    }

    #[test]
    fn a_save_never_writes_over_a_draft_changed_since_tir_saw_it() {
        let trial = Trial::new();
        let saw = Some(fingerprint(FIRST.as_bytes()));
        // What Tir saw is still there: the save writes.
        write_draft(
            &trial.root,
            "Salt Line",
            "First Draft.tir",
            REWRITE,
            REWRITE_COPY,
            saw,
        )
        .unwrap();
        assert_eq!(trial.read("Salt Line/drafts/First Draft.tir"), REWRITE);
        // A pull brings the other machine's draft.
        let pulled = "{\"format\": \"tir-draft\", \"elements\": [\"laptop\"]}\n";
        fs::write(trial.root.join("Salt Line/drafts/First Draft.tir"), pulled).unwrap();
        let saw = Some(fingerprint(REWRITE.as_bytes()));
        let error = write_draft(
            &trial.root,
            "Salt Line",
            "First Draft.tir",
            FIRST,
            FIRST_COPY,
            saw,
        )
        .unwrap_err();
        assert_eq!(
            error.to_string(),
            "“First Draft” has changed on disk since Tir opened it, perhaps by a git pull, so \
             Tir saved nothing over it. Close Tir and open it again to see the draft as it is now."
        );
        // Neither the draft nor its copy was written.
        assert_eq!(trial.read("Salt Line/drafts/First Draft.tir"), pulled);
        assert_eq!(
            trial.read("Salt Line/drafts/First Draft.fountain"),
            REWRITE_COPY
        );
    }

    #[test]
    fn remembers_what_each_draft_held_as_drafts_and_projects_move() {
        let library = Library::new(None, None);
        library.saw("Salt Line", "First Draft.tir", FIRST);
        library.saw("Salt Line", "Rewrite.tir", REWRITE);
        library.saw("Low Tide", "First Draft.tir", REWRITE);
        let first = Some(fingerprint(FIRST.as_bytes()));
        let rewrite = Some(fingerprint(REWRITE.as_bytes()));
        assert_eq!(library.holds("Salt Line", "First Draft.tir"), first);
        assert_eq!(library.holds("Salt Line", "Gone.tir"), None);
        library.moved("Salt Line", "Rewrite.tir", "Second.tir");
        assert_eq!(library.holds("Salt Line", "Rewrite.tir"), None);
        assert_eq!(library.holds("Salt Line", "Second.tir"), rewrite);
        library.moved_project("Salt Line", Some("Salt"));
        assert_eq!(library.holds("Salt Line", "First Draft.tir"), None);
        assert_eq!(library.holds("Salt", "First Draft.tir"), first);
        assert_eq!(library.holds("Salt", "Second.tir"), rewrite);
        assert_eq!(library.holds("Low Tide", "First Draft.tir"), rewrite);
        library.forget("Salt", "Second.tir");
        assert_eq!(library.holds("Salt", "Second.tir"), None);
        library.moved_project("Salt", None);
        assert_eq!(library.holds("Salt", "First Draft.tir"), None);
        assert_eq!(library.holds("Low Tide", "First Draft.tir"), rewrite);
    }

    #[test]
    fn a_save_never_makes_a_draft() {
        let trial = Trial::new();
        let error = write_draft(
            &trial.root,
            "Salt Line",
            "Gone.tir",
            REWRITE,
            REWRITE_COPY,
            None,
        )
        .unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::NotFound);
        assert_eq!(error.to_string(), "The draft file “Gone.tir” is missing.");
        let error = read_draft(&trial.root, "Salt Line", "Gone.tir").unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::NotFound);
        assert_eq!(
            write_draft(
                &trial.root,
                "Tide Line",
                "First Draft.tir",
                REWRITE,
                "",
                None
            )
            .unwrap_err()
            .kind(),
            io::ErrorKind::NotFound
        );
        assert_eq!(trial.names(""), ["Salt Line"]);
        trial.assert_salt_line_untouched();
    }

    #[test]
    fn a_save_never_writes_over_a_link_or_a_folder_where_the_copy_goes() {
        let trial = Trial::new();
        let copy = trial.root.join("Salt Line/drafts/First Draft.fountain");
        fs::remove_file(&copy).unwrap();
        symlink(trial.outside.join(PROJECT), &copy).unwrap();
        let error = write_draft(
            &trial.root,
            "Salt Line",
            "First Draft.tir",
            REWRITE,
            "",
            None,
        )
        .unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::InvalidInput);
        assert!(copy.is_symlink());
        fs::remove_file(&copy).unwrap();
        fs::create_dir(&copy).unwrap();
        let error = write_draft(
            &trial.root,
            "Salt Line",
            "First Draft.tir",
            REWRITE,
            "",
            None,
        )
        .unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::InvalidInput);
        assert!(copy.is_dir());
        // Refused before anything was written.
        assert_eq!(trial.read("Salt Line/drafts/First Draft.tir"), FIRST);
        trial.assert_outside_untouched();
    }

    #[test]
    fn a_copy_that_cannot_be_written_is_reported_after_the_draft() {
        let trial = Trial::new();
        // The longest draft name whose temporary file fits in 255 bytes:
        // its copy's name is five bytes longer, so its copy's temporary
        // file cannot be made.
        let suffix = format!(".{}-0.tmp", std::process::id()).len();
        let long = format!("{}.tir", "x".repeat(255 - DRAFT.len() - suffix));

        // A new draft or project is made with its copy or not at all.
        assert!(create_draft(&trial.root, "Salt Line", &long, REWRITE, "", SALT, TIDE).is_err());
        trial.assert_salt_line_untouched();
        assert!(create_project(&trial.root, "Tide Line", TIDE, &long, FIRST, "").is_err());
        assert_eq!(trial.names(""), ["Salt Line"]);

        // A save writes the draft first: when its copy fails, the draft
        // holds the new text, the copy is not newer, and the save fails.
        fs::write(trial.root.join("Salt Line/drafts").join(&long), FIRST).unwrap();
        assert!(write_draft(&trial.root, "Salt Line", &long, REWRITE, REWRITE_COPY, None).is_err());
        assert_eq!(trial.read(&format!("Salt Line/drafts/{long}")), REWRITE);
        assert_eq!(
            trial.names("Salt Line/drafts"),
            ["First Draft.fountain", "First Draft.tir", long.as_str()]
        );
    }

    #[test]
    fn never_puts_a_draft_over_a_file_or_its_copy() {
        let trial = Trial::new();
        create_draft(
            &trial.root,
            "Salt Line",
            "Polish.tir",
            REWRITE,
            REWRITE_COPY,
            SALT,
            TIDE,
        )
        .unwrap();
        fs::write(trial.root.join("Salt Line/drafts/Notes.fountain"), "notes").unwrap();
        for draft in ["Polish.tir", "Notes.tir"] {
            let error =
                create_draft(&trial.root, "Salt Line", draft, REWRITE, "", TIDE, LOW).unwrap_err();
            assert_eq!(error.kind(), io::ErrorKind::AlreadyExists, "{draft}");
            let error = rename_draft(
                &trial.root,
                "Salt Line",
                "First Draft.tir",
                draft,
                TIDE,
                LOW,
            )
            .unwrap_err();
            assert_eq!(error.kind(), io::ErrorKind::AlreadyExists, "{draft}");
        }
        assert_eq!(
            trial.names("Salt Line/drafts"),
            [
                "First Draft.fountain",
                "First Draft.tir",
                "Notes.fountain",
                "Polish.fountain",
                "Polish.tir"
            ]
        );
        assert_eq!(trial.read("Salt Line/drafts/First Draft.tir"), FIRST);
        assert_eq!(trial.read("Salt Line/drafts/Polish.tir"), REWRITE);
        assert_eq!(trial.read("Salt Line/drafts/Notes.fountain"), "notes");
        assert_eq!(trial.read("Salt Line/project.json"), TIDE);
    }

    #[test]
    fn a_draft_that_fails_to_be_made_or_moved_leaves_the_project_as_it_was() {
        let trial = Trial::new();
        // Allowed as a name, but its temporary file's name is too long.
        let long = format!("{}.tir", "x".repeat(251));
        assert!(create_draft(&trial.root, "Salt Line", &long, REWRITE, "", SALT, TIDE).is_err());
        assert!(
            rename_draft(
                &trial.root,
                "Salt Line",
                "First Draft.tir",
                &long,
                SALT,
                TIDE
            )
            .is_err()
        );
        trial.assert_salt_line_untouched();
    }

    #[test]
    fn refuses_a_change_made_from_an_older_reading() {
        let trial = Trial::new();
        // Two changes made from the same reading, SALT: the second would
        // name a draft the first removed.
        create_draft(
            &trial.root,
            "Salt Line",
            "Rewrite.tir",
            REWRITE,
            REWRITE_COPY,
            SALT,
            TIDE,
        )
        .unwrap();
        let stale = [
            write_project(&trial.root, "Salt Line", SALT, LOW),
            rename_project(&trial.root, "Salt Line", "Low Tide", SALT, LOW),
            create_draft(
                &trial.root,
                "Salt Line",
                "Polish.tir",
                REWRITE,
                "",
                SALT,
                LOW,
            ),
            rename_draft(
                &trial.root,
                "Salt Line",
                "Rewrite.tir",
                "Polish.tir",
                SALT,
                LOW,
            ),
            delete_draft(&trial.root, "Salt Line", "Rewrite.tir", SALT, LOW),
        ];
        for result in stale {
            assert_eq!(result.unwrap_err().kind(), io::ErrorKind::Other);
        }
        assert_eq!(trial.names(""), ["Salt Line"]);
        assert_eq!(
            trial.names("Salt Line/drafts"),
            [
                "First Draft.fountain",
                "First Draft.tir",
                "Rewrite.fountain",
                "Rewrite.tir"
            ]
        );
        assert_eq!(trial.read("Salt Line/project.json"), TIDE);
    }

    #[test]
    fn refuses_names_that_reach_outside_the_library() {
        let trial = Trial::new();
        let long = "x".repeat(256);
        let folders = [
            "",
            ".",
            "..",
            "../outside",
            "/tmp",
            "a/b",
            "a\\b",
            "a\0b",
            ".git",
            &long,
        ];
        for folder in folders {
            let refused = |result: io::Result<()>| {
                assert_eq!(
                    result.unwrap_err().kind(),
                    io::ErrorKind::InvalidInput,
                    "{folder:?}"
                );
            };
            refused(create_project(
                &trial.root,
                folder,
                SALT,
                "First Draft.tir",
                FIRST,
                FIRST_COPY,
            ));
            refused(write_project(&trial.root, folder, SALT, TIDE));
            refused(rename_project(&trial.root, folder, "Tide Line", SALT, TIDE));
            refused(rename_project(&trial.root, "Salt Line", folder, SALT, TIDE));
            refused(delete_project(&trial.root, folder));
            refused(create_draft(
                &trial.root,
                folder,
                "Rewrite.tir",
                REWRITE,
                REWRITE_COPY,
                SALT,
                TIDE,
            ));
            refused(read_draft(&trial.root, folder, "First Draft.tir").map(drop));
            refused(write_draft(
                &trial.root,
                folder,
                "First Draft.tir",
                REWRITE,
                REWRITE_COPY,
                None,
            ));
        }
        let drafts = [
            "../project.json",
            "../../outside/x.tir",
            ".tir",
            "x.fountain",
            PROJECT,
            "x",
        ];
        for draft in drafts {
            let refused = |result: io::Result<()>| {
                assert_eq!(
                    result.unwrap_err().kind(),
                    io::ErrorKind::InvalidInput,
                    "{draft:?}"
                );
            };
            refused(create_project(
                &trial.root,
                "Tide Line",
                TIDE,
                draft,
                FIRST,
                FIRST_COPY,
            ));
            refused(create_draft(
                &trial.root,
                "Salt Line",
                draft,
                REWRITE,
                REWRITE_COPY,
                SALT,
                TIDE,
            ));
            refused(read_draft(&trial.root, "Salt Line", draft).map(drop));
            refused(write_draft(
                &trial.root,
                "Salt Line",
                draft,
                REWRITE,
                REWRITE_COPY,
                None,
            ));
            refused(rename_draft(
                &trial.root,
                "Salt Line",
                "First Draft.tir",
                draft,
                SALT,
                TIDE,
            ));
            refused(rename_draft(
                &trial.root,
                "Salt Line",
                draft,
                "Polish.tir",
                SALT,
                TIDE,
            ));
            refused(delete_draft(&trial.root, "Salt Line", draft, SALT, TIDE));
        }
        assert_eq!(trial.names(""), ["Salt Line"]);
        trial.assert_salt_line_untouched();
        trial.assert_outside_untouched();
    }

    #[test]
    fn refuses_links_out_of_the_library() {
        let trial = Trial::new();
        symlink(&trial.outside, trial.root.join("Linked")).unwrap();
        create_project(
            &trial.root,
            "Tide Line",
            TIDE,
            "First Draft.tir",
            FIRST,
            FIRST_COPY,
        )
        .unwrap();
        fs::remove_dir_all(trial.root.join("Tide Line/drafts")).unwrap();
        symlink(&trial.outside, trial.root.join("Tide Line/drafts")).unwrap();
        // A draft that is a link to a file outside is never copied in.
        symlink(
            trial.outside.join(PROJECT),
            trial.root.join("Salt Line/drafts/Linked.tir"),
        )
        .unwrap();

        let refused = |result: io::Result<()>| {
            assert_eq!(result.unwrap_err().kind(), io::ErrorKind::InvalidInput);
        };
        refused(write_project(&trial.root, "Linked", SALT, TIDE));
        refused(rename_project(&trial.root, "Linked", "Moved", SALT, TIDE));
        refused(delete_project(&trial.root, "Linked"));
        refused(create_draft(
            &trial.root,
            "Linked",
            "Rewrite.tir",
            REWRITE,
            REWRITE_COPY,
            SALT,
            TIDE,
        ));
        refused(create_draft(
            &trial.root,
            "Tide Line",
            "Rewrite.tir",
            REWRITE,
            REWRITE_COPY,
            TIDE,
            SALT,
        ));
        // Nor is a draft read or saved through a link.
        for (folder, draft) in [
            ("Linked", "First Draft.tir"),
            ("Tide Line", "First Draft.tir"),
            ("Salt Line", "Linked.tir"),
        ] {
            refused(read_draft(&trial.root, folder, draft).map(drop));
            refused(write_draft(
                &trial.root,
                folder,
                draft,
                REWRITE,
                REWRITE_COPY,
                None,
            ));
        }
        refused(delete_draft(
            &trial.root,
            "Tide Line",
            "First Draft.tir",
            TIDE,
            SALT,
        ));
        refused(rename_draft(
            &trial.root,
            "Salt Line",
            "Linked.tir",
            "Polish.tir",
            SALT,
            TIDE,
        ));
        assert_eq!(trial.read("Tide Line/project.json"), TIDE);
        assert_eq!(trial.names(""), ["Linked", "Salt Line", "Tide Line"]);
        assert_eq!(
            trial.names("Salt Line/drafts"),
            ["First Draft.fountain", "First Draft.tir", "Linked.tir"]
        );
        assert_eq!(trial.read("Salt Line/project.json"), SALT);
        trial.assert_outside_untouched();
        // Deleting a project removes the links in it, never what they reach.
        delete_project(&trial.root, "Tide Line").unwrap();
        delete_project(&trial.root, "Salt Line").unwrap();
        assert_eq!(trial.names(""), ["Linked"]);
        trial.assert_outside_untouched();
    }
}
