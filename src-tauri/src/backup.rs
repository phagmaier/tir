//! Backup (brief, "Saving and backup"; architecture, "Backup"). The library
//! is a git repository, made one if it is not, and Tir records its changes
//! there as a commit once it has been quiet for a few minutes, and when Tir
//! closes. All of it runs on a thread of its own, so git never holds up the
//! interface; the page hears how backup stands as `tir://backup`. A missing
//! git or a repository Tir cannot use is reported there, never crashed on.

use crate::git::{Git, Repository};
use crate::library;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant};

/// How long the library stays unchanged before Tir records its changes.
pub const QUIET: Duration = Duration::from_secs(3 * 60);

/// How backup stands, for the page.
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    /// Why Tir cannot record the library's changes in git, if it cannot.
    pub problem: Option<String>,
}

/// What backup needs.
pub struct Setup {
    pub git: Git,
    /// The library's folder, or why there is none.
    pub root: Result<PathBuf, String>,
    /// The library's command lock (`Library::busy`): a commit waits for a
    /// change under way, and a change for the commit.
    pub busy: Arc<Mutex<()>>,
    /// How long the library stays unchanged before Tir records its changes.
    pub quiet: Duration,
}

enum Event {
    /// The library may have changed.
    Changed,
    /// Tir is closing: record what is left, then stop, and say so.
    Close(Sender<()>),
}

/// Backup's thread, and how it stands.
pub struct Backup {
    events: Sender<Event>,
    status: Arc<Mutex<Status>>,
}

impl Backup {
    /// Starts backup's thread; `publish` hears each new status.
    pub fn start(setup: Setup, publish: impl Fn(&Status) + Send + 'static) -> Self {
        let (events, received) = mpsc::channel();
        let status = Arc::new(Mutex::new(Status::default()));
        let worker = Worker {
            setup,
            status: status.clone(),
            publish: Box::new(publish),
            due: None,
        };
        thread::Builder::new()
            .name("backup".into())
            .spawn(move || worker.run(received))
            .expect("Tir could not start its backup thread");
        Backup { events, status }
    }

    /// The library may have changed: its changes are recorded once it has
    /// been quiet for a while.
    pub fn changed(&self) {
        let _ = self.events.send(Event::Changed);
    }

    pub fn status(&self) -> Status {
        lock(&self.status).clone()
    }

    /// Records what is left, then stops backup; returns once it has.
    pub fn finish(&self) {
        let (done, finished) = mpsc::channel();
        if self.events.send(Event::Close(done)).is_ok() {
            let _ = finished.recv();
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

struct Worker {
    setup: Setup,
    status: Arc<Mutex<Status>>,
    publish: Box<dyn Fn(&Status) + Send>,
    /// When to record the library's changes, if it may have changed.
    due: Option<Instant>,
}

impl Worker {
    fn run(mut self, events: Receiver<Event>) {
        self.look();
        loop {
            let event = match self.due {
                Some(due) => events.recv_timeout(due.saturating_duration_since(Instant::now())),
                None => events.recv().map_err(|_| RecvTimeoutError::Disconnected),
            };
            match event {
                Ok(Event::Changed) => self.due = Some(Instant::now() + self.setup.quiet),
                Ok(Event::Close(done)) => {
                    self.record();
                    let _ = done.send(());
                    return;
                }
                Err(RecvTimeoutError::Timeout) => self.record(),
                Err(RecvTimeoutError::Disconnected) => return,
            }
        }
    }

    /// At launch: whether the library holds changes to record, made while
    /// Tir was closed or left by one that stopped, and whether Tir can.
    fn look(&mut self) {
        let root = match &self.setup.root {
            Ok(root) if root.is_dir() => root.clone(),
            // No library yet: its first project or word is a change.
            Ok(_) => return,
            Err(problem) => return self.report(Some(problem.clone())),
        };
        let looked = match self.repository(&root) {
            // Making the repository is the first change to record.
            Ok(Repository::None) => Ok(true),
            Ok(_) => self
                .setup
                .git
                .changed(&root)
                .map_err(|error| unreadable(&error)),
            Err(problem) => Err(problem),
        };
        match looked {
            Ok(changed) => {
                if changed {
                    self.due = Some(Instant::now() + self.setup.quiet);
                }
                self.report(None);
            }
            Err(problem) => self.report(Some(problem)),
        }
    }

    /// Records the library's changes as a commit, making the library a
    /// repository first if need be, while no library command runs.
    fn record(&mut self) {
        self.due = None;
        let root = match &self.setup.root {
            Ok(root) => root.clone(),
            Err(problem) => return self.report(Some(problem.clone())),
        };
        let busy = self.setup.busy.clone();
        let _library = lock(&busy);
        if !root.is_dir() {
            return;
        }
        let recorded = self.commit(&root);
        if recorded.is_err() {
            // Whatever stopped it, such as a lock a git of the writer's
            // held, may be gone by then.
            self.due = Some(Instant::now() + self.setup.quiet);
        }
        self.report(recorded.err());
    }

    fn commit(&self, root: &Path) -> Result<(), String> {
        let git = &self.setup.git;
        if let Repository::None = self.repository(root)? {
            // Never a repository of a folder holding more than Tir's files.
            match library::foreign_entry(root) {
                Ok(None) => {}
                Ok(Some(name)) => {
                    return Err(format!(
                        "Tir backs up only a library of its own, and “{name}” in {} is none of \
                         Tir's projects. Move it out of the library and Tir will start backing up.",
                        root.display()
                    ));
                }
                Err(error) => return Err(format!("Tir could not read the library ({error}).")),
            }
            git.init(root).map_err(|error| {
                failure("Tir could not make the library a git repository.", &error)
            })?;
        }
        git.commit(root)
            .map(drop)
            .map_err(|error| failure("Tir could not record the library's changes in git.", &error))
    }

    /// What the library is to git, or why Tir cannot record its changes.
    fn repository(&self, root: &Path) -> Result<Repository, String> {
        match self.setup.git.repository(root) {
            Ok(Repository::Detached) => Err(
                "The library's git repository is not on a branch (its HEAD is detached), so Tir \
                 records nothing. Check out its branch in a terminal."
                    .into(),
            ),
            Ok(Repository::Busy(operation)) => Err(format!(
                "A git {operation} is under way in the library, so Tir records nothing until it \
                 is finished in a terminal."
            )),
            Ok(repository) => Ok(repository),
            Err(error) => Err(unreadable(&error)),
        }
    }

    fn report(&mut self, problem: Option<String>) {
        let status = {
            let mut status = lock(&self.status);
            if status.problem == problem {
                return;
            }
            status.problem = problem;
            status.clone()
        };
        if let Some(problem) = &status.problem {
            eprintln!("Tir's backup: {problem}");
        }
        (self.publish)(&status);
    }
}

/// Why the library's repository could not be read.
fn unreadable(error: &crate::git::Error) -> String {
    failure("Tir could not read the library's git repository.", error)
}

/// What failed, `what`, and why, `error`; no git at all is a reason of its own.
fn failure(what: &str, error: &crate::git::Error) -> String {
    match error {
        crate::git::Error::Missing => {
            "Tir could not find git on this machine, so it cannot back up the library.".into()
        }
        _ => format!("{what} {}", sentence(error)),
    }
}

/// `error` as a sentence of a message: from a capital, with a full stop.
fn sentence(error: &crate::git::Error) -> String {
    let text = error.to_string();
    let mut chars = text.chars();
    let mut sentence: String = match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => return text,
    };
    if !sentence.ends_with(['.', '!', '?', '…']) {
        sentence.push('.');
    }
    sentence
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::files::tests::TempDir;
    use crate::git::tests::{committed, library_in, missing, sandboxed, subjects};
    use std::fs;

    /// Backup of the library in `dir`, made holding "Salt Line" unless it
    /// is there, and every status it published.
    fn start(
        dir: &TempDir,
        git: Git,
        quiet: Duration,
    ) -> (PathBuf, Backup, Arc<Mutex<Vec<Status>>>) {
        let root = dir.0.join("Screenplays");
        if !root.exists() {
            library_in(&dir.0);
        }
        let heard = Arc::new(Mutex::new(Vec::new()));
        let published = heard.clone();
        let backup = Backup::start(
            Setup {
                git,
                root: Ok(root.clone()),
                busy: Arc::default(),
                quiet,
            },
            move |status| lock(&published).push(status.clone()),
        );
        (root, backup, heard)
    }

    /// A library that is a repository with one commit, and nothing since.
    fn recorded(dir: &TempDir) -> (Git, PathBuf) {
        let git = sandboxed(dir);
        let root = library_in(&dir.0);
        git.init(&root).unwrap();
        git.commit(&root).unwrap();
        (git, root)
    }

    fn edit(root: &Path, text: &str) {
        fs::write(root.join("Salt Line/drafts/First Draft.tir"), text).unwrap();
    }

    /// Waits up to ten seconds for `root` to hold `count` commits.
    fn wait_for_commits(git: &Git, root: &Path, count: usize) -> Instant {
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            if subjects(git, root).len() >= count {
                return Instant::now();
            }
            assert!(Instant::now() < deadline, "no commit came");
            thread::sleep(Duration::from_millis(20));
        }
    }

    #[test]
    fn records_changes_once_the_library_has_been_quiet() {
        let dir = TempDir::new();
        let (git, _) = recorded(&dir);
        let quiet = Duration::from_millis(1500);
        let (root, backup, _) = start(&dir, git.clone(), quiet);
        edit(&root, "{\"one\":1}\n");
        backup.changed();
        thread::sleep(Duration::from_millis(500));
        edit(&root, "{\"two\":2}\n");
        backup.changed();
        let last = Instant::now();
        // Less than the quiet spell after the last change, nothing yet.
        thread::sleep(Duration::from_millis(500));
        assert_eq!(subjects(&git, &root).len(), 1);
        let came = wait_for_commits(&git, &root, 2);
        assert!(came - last >= quiet);
        assert_eq!(
            subjects(&git, &root),
            ["Back up Salt Line", "Back up Salt Line"]
        );
        assert!(!git.changed(&root).unwrap());
        backup.finish();
    }

    #[test]
    fn records_what_is_left_on_closing() {
        let dir = TempDir::new();
        let (git, _) = recorded(&dir);
        let (root, backup, heard) = start(&dir, git.clone(), QUIET);
        edit(&root, "{\"closing\":1}\n");
        backup.changed();
        backup.finish();
        assert_eq!(subjects(&git, &root).len(), 2);
        assert!(!git.changed(&root).unwrap());
        // Nothing went wrong, so nothing was published.
        assert!(lock(&heard).is_empty());
        // Backup has stopped; the library may still be told of a change.
        backup.changed();
        backup.finish();
    }

    #[test]
    fn records_at_launch_what_changed_while_tir_was_closed() {
        let dir = TempDir::new();
        let (git, _) = recorded(&dir);
        let root = dir.0.join("Screenplays");
        edit(&root, "{\"while closed\":1}\n");
        let (_, backup, _) = start(&dir, git.clone(), Duration::from_millis(100));
        wait_for_commits(&git, &root, 2);
        backup.finish();
    }

    #[test]
    fn makes_the_library_a_repository() {
        let dir = TempDir::new();
        let git = sandboxed(&dir);
        let (root, backup, _) = start(&dir, git.clone(), QUIET);
        assert!(!root.join(".git").exists());
        backup.finish();
        assert_eq!(subjects(&git, &root), ["Back up Salt Line"]);
        assert!(committed(&git, &root).contains(&".gitignore".to_string()));
    }

    #[test]
    fn makes_no_repository_of_a_folder_holding_more_than_tirs_files() {
        let dir = TempDir::new();
        let git = sandboxed(&dir);
        let root = library_in(&dir.0);
        fs::write(root.join("taxes.ods"), "").unwrap();
        let (_, backup, heard) = start(&dir, git, QUIET);
        backup.finish();
        assert!(!root.join(".git").exists());
        let problem = backup.status().problem.unwrap();
        assert!(problem.starts_with("Tir backs up only a library of its own, and “taxes.ods”"));
        assert_eq!(lock(&heard).len(), 1);
    }

    #[test]
    fn reports_a_missing_git_and_carries_on() {
        let dir = TempDir::new();
        let (_, backup, heard) = start(&dir, missing(&dir), QUIET);
        backup.changed();
        backup.finish();
        assert_eq!(
            backup.status().problem.as_deref(),
            Some("Tir could not find git on this machine, so it cannot back up the library.")
        );
        assert_eq!(lock(&heard).len(), 1);
    }

    #[test]
    fn reports_a_damaged_repository() {
        let dir = TempDir::new();
        let (git, root) = recorded(&dir);
        fs::remove_file(root.join(".git/HEAD")).unwrap();
        let (_, backup, heard) = start(&dir, git, QUIET);
        backup.finish();
        let problem = backup.status().problem.unwrap();
        assert!(
            problem.starts_with(
                "Tir could not read the library's git repository. Not a git repository"
            ),
            "{problem}"
        );
        assert_eq!(lock(&heard).len(), 1);
    }

    #[test]
    fn records_nothing_on_a_detached_head_or_during_a_merge_until_it_is_over() {
        let dir = TempDir::new();
        let (git, root) = recorded(&dir);
        git.run(&root, &["checkout", "-q", "--detach"]).unwrap();
        edit(&root, "{\"detached\":1}\n");
        let (_, backup, heard) = start(&dir, git.clone(), Duration::from_millis(100));
        thread::sleep(Duration::from_millis(400));
        assert!(backup.status().problem.unwrap().contains("not on a branch"));
        git.run(&root, &["checkout", "-q", crate::git::BRANCH])
            .unwrap();
        let head = String::from_utf8(git.run(&root, &["rev-parse", "HEAD"]).unwrap()).unwrap();
        fs::write(root.join(".git/MERGE_HEAD"), head).unwrap();
        backup.changed();
        thread::sleep(Duration::from_millis(400));
        assert!(
            backup
                .status()
                .problem
                .unwrap()
                .contains("A git merge is under way")
        );
        assert_eq!(subjects(&git, &root).len(), 1);
        fs::remove_file(root.join(".git/MERGE_HEAD")).unwrap();
        backup.changed();
        wait_for_commits(&git, &root, 2);
        backup.finish();
        assert_eq!(backup.status(), Status::default());
        let heard = lock(&heard);
        assert_eq!(heard.last(), Some(&Status::default()));
    }

    #[test]
    fn reports_a_library_it_cannot_find() {
        let dir = TempDir::new();
        let backup = Backup::start(
            Setup {
                git: sandboxed(&dir),
                root: Err("Tir could not find the home folder, where the library is.".into()),
                busy: Arc::default(),
                quiet: QUIET,
            },
            |_| {},
        );
        backup.finish();
        assert_eq!(
            backup.status().problem.as_deref(),
            Some("Tir could not find the home folder, where the library is.")
        );
    }

    #[test]
    fn waits_for_the_library_command_under_way() {
        let dir = TempDir::new();
        let (git, root) = recorded(&dir);
        let busy: Arc<Mutex<()>> = Arc::default();
        let backup = Backup::start(
            Setup {
                git: git.clone(),
                root: Ok(root.clone()),
                busy: busy.clone(),
                quiet: QUIET,
            },
            |_| {},
        );
        let command = lock(&busy);
        edit(&root, "{\"saving\":1}\n");
        let closing = thread::spawn(move || backup.finish());
        thread::sleep(Duration::from_millis(300));
        assert_eq!(subjects(&git, &root).len(), 1);
        drop(command);
        closing.join().unwrap();
        assert_eq!(subjects(&git, &root).len(), 2);
    }
}
