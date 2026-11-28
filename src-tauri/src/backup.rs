//! Backup (brief, "Saving and backup"; architecture, "Backup"). The library
//! is a git repository, made one if it is not, and Tir records its changes
//! there as a commit once it has been quiet for a few minutes, and when Tir
//! closes, then pushes them to the connected repository on GitHub. Offline
//! is normal: commits wait, and Tir tries again by itself, waiting longer
//! each time. When GitHub has commits this machine lacks, Tir pauses: it
//! keeps recording here but pushes nothing until it is resumed, and it
//! never merges, rebases or forces. All of it runs on a thread of its own,
//! so neither git nor GitHub ever holds up the interface; the page hears
//! how backup stands as `tir://backup`. A missing git or a repository Tir
//! cannot use is reported there, never crashed on.

use crate::git::{self, Coverage, Git, Pushed, Repository};
use crate::github::{self, Anonymous, Seen};
use crate::library;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant};

/// When backup acts.
#[derive(Clone, Copy, Debug)]
pub struct Timing {
    /// How long the library stays unchanged before Tir records its changes.
    pub quiet: Duration,
    /// How often Tir asks GitHub whether the other machine has pushed,
    /// while all is well.
    pub check: Duration,
    /// The first pause before trying again when a push or a check failed;
    /// each failure after doubles it, up to `most`.
    pub retry: Duration,
    pub most: Duration,
    /// How long a push or a check may take.
    pub network: Duration,
    /// How long the push at closing may take: the window has gone by then,
    /// and Tir exits once it is done.
    pub closing: Duration,
}

pub const TIMING: Timing = Timing {
    quiet: Duration::from_secs(3 * 60),
    check: Duration::from_secs(5 * 60),
    retry: Duration::from_secs(30),
    most: Duration::from_secs(5 * 60),
    network: git::NETWORK,
    closing: Duration::from_secs(60),
};

/// Where backup stands with GitHub.
#[derive(Serialize, Clone, Copy, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum State {
    /// No repository is connected: the library is recorded on this machine
    /// only.
    #[default]
    Off,
    /// GitHub has every commit, as Tir last heard.
    BackedUp,
    /// A push is under way.
    Pushing,
    /// GitHub could not be reached; Tir tries again by itself.
    Offline,
    /// GitHub refused or failed the push (`reason`); Tir tries again by
    /// itself.
    Failing,
    /// GitHub has commits this machine lacks: Tir pushes nothing until it
    /// is resumed.
    Paused,
}

/// How backup stands, for the page.
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub state: State,
    /// The connected repository's address.
    pub remote: Option<String>,
    /// Commits GitHub does not have yet.
    pub waiting: u32,
    /// Saved changes awaiting their local commit.
    pub pending: bool,
    /// When the newest commit GitHub has was made, in milliseconds since
    /// 1970, as Tir last heard.
    pub backed_up: Option<f64>,
    /// Why the last push or check failed, while Tir tries again.
    pub reason: Option<String>,
    /// Why Tir cannot record the library's changes in git, if it cannot.
    pub problem: Option<String>,
    /// This destination last passed a privacy check.
    pub private: bool,
}

/// What came of connecting a repository, for the connect dialog.
#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "result", rename_all = "camelCase")]
pub enum Checked {
    /// Backups go to the repository from now on.
    Connected,
    /// The address is no GitHub repository's.
    NotGitHub,
    /// GitHub could not be reached at all.
    Offline { reason: String },
    /// This machine's git login could not reach the repository.
    Unreachable { reason: String },
    /// Anyone can read the repository.
    Public,
    /// Whether anyone can read it could not be told.
    Unknown { reason: String },
    /// The repository holds commits the library lacks.
    Holds,
    /// The library cannot be backed up, and why.
    Problem { reason: String },
}

/// What backup needs.
pub struct Setup {
    pub git: Git,
    /// The library's folder, or why there is none.
    pub root: Result<PathBuf, String>,
    /// The library's command lock (`Library::busy`): a commit waits for a
    /// change under way, and a change for the commit.
    pub busy: Arc<Mutex<()>>,
    pub timing: Timing,
}

enum Event {
    /// The library may have changed.
    Changed,
    /// Back up now: record what changed, push, and answer how it stands.
    Now(Sender<Status>),
    /// Ask GitHub again after a pause, push if it has nothing this machine
    /// lacks, and answer how it stands.
    Resume(Sender<Status>),
    /// Connect the repository at the address: then record, ask it, and
    /// push. On backup's thread, so no push to the one it replaces is under
    /// way; the answer is why it could not, if it could not.
    Connect(String, Sender<Result<(), String>>),
    /// Tir is closing: record what is left, push, and stop.
    Close(Sender<()>),
}

/// Backup's thread, and how it stands.
pub struct Backup {
    events: Sender<Event>,
    status: Arc<Mutex<Status>>,
    git: Git,
    root: Result<PathBuf, String>,
    busy: Arc<Mutex<()>>,
    anonymous: Arc<Anonymous>,
    /// One connect at a time: two checked side by side would each connect
    /// their repository, and push to it, in turn.
    connecting: Mutex<()>,
}

impl Backup {
    /// Starts backup's thread; `publish` hears each new status. `anonymous`
    /// asks what anyone without a login sees of a repository.
    pub fn start(
        setup: Setup,
        anonymous: Anonymous,
        publish: impl Fn(&Status) + Send + 'static,
    ) -> Self {
        let (events, received) = mpsc::channel();
        let status = Arc::new(Mutex::new(Status::default()));
        let (git, root, busy) = (setup.git.clone(), setup.root.clone(), setup.busy.clone());
        let anonymous = Arc::new(anonymous);
        let worker = Worker {
            setup,
            anonymous: anonymous.clone(),
            status: status.clone(),
            publish: Box::new(publish),
            due: None,
            next: None,
            failures: 0,
        };
        thread::Builder::new()
            .name("backup".into())
            .spawn(move || worker.run(received))
            .expect("Tir could not start its backup thread");
        Backup {
            events,
            status,
            git,
            root,
            busy,
            anonymous,
            connecting: Mutex::default(),
        }
    }

    /// The library may have changed: its changes are recorded once it has
    /// been quiet for a while.
    pub fn changed(&self) {
        let _ = self.events.send(Event::Changed);
    }

    /// Records what changed and pushes it, without waiting for quiet; how
    /// backup stands then, or `None` once backup has stopped.
    pub fn now(&self) -> Option<Status> {
        self.ask(Event::Now)
    }

    /// Asks GitHub again after a pause, and pushes if it may; how backup
    /// stands then.
    pub fn resume(&self) -> Option<Status> {
        self.ask(Event::Resume)
    }

    fn ask(&self, event: impl FnOnce(Sender<Status>) -> Event) -> Option<Status> {
        let (reply, answer) = mpsc::channel();
        self.events.send(event(reply)).ok()?;
        answer.recv().ok()
    }

    pub fn status(&self) -> Status {
        lock(&self.status).clone()
    }

    /// How much of the project `folder`, or of its draft `draft`, GitHub
    /// holds as Tir last heard: for the warning before it is deleted.
    pub fn coverage(&self, folder: &str, draft: Option<&str>) -> Coverage {
        let named = |name: &str| !name.is_empty() && !name.contains('/') && !name.starts_with('.');
        if self.status().remote.is_none() {
            return Coverage::None;
        }
        if !named(folder) || !draft.is_none_or(named) {
            return Coverage::Unknown;
        }
        let Ok(root) = &self.root else {
            return Coverage::Unknown;
        };
        let Ok(Repository::Branch(branch)) = usable(&self.git, root) else {
            return Coverage::Unknown;
        };
        let path = match draft {
            Some(draft) => format!("{folder}/drafts/{draft}"),
            None => format!("{folder}/"),
        };
        self.git
            .coverage(root, &branch, &path)
            .unwrap_or(Coverage::Unknown)
    }

    /// Connects the repository at the address the writer `pasted`, if this
    /// machine's git login reaches it, only a login can read it, and it
    /// holds nothing the library lacks; backup then records and pushes.
    /// Makes the library, and the library a repository, if need be.
    pub fn connect(&self, pasted: &str) -> Checked {
        let _one_at_a_time = lock(&self.connecting);
        let Some(address) = github::parse(pasted) else {
            return Checked::NotGitHub;
        };
        let root = match &self.root {
            Ok(root) => root.clone(),
            Err(problem) => {
                return Checked::Problem {
                    reason: problem.clone(),
                };
            }
        };
        {
            let _library = lock(&self.busy);
            if let Err(error) = library::make_library(&root) {
                return Checked::Problem {
                    reason: format!("Tir could not make the library ({error})."),
                };
            }
            if let Err(reason) = prepare(&self.git, &root) {
                return Checked::Problem { reason };
            }
        }
        let url = address.url();
        let branches = match self.git.ls_remote(&root, &url) {
            Ok(branches) => branches,
            Err(error) if git::unreachable(&error) => {
                return Checked::Offline {
                    reason: sentence(&error),
                };
            }
            Err(git::Error::Missing) => {
                return Checked::Problem {
                    reason: failure("", &git::Error::Missing),
                };
            }
            Err(error) => {
                return Checked::Unreachable {
                    reason: sentence(&error),
                };
            }
        };
        match self.anonymous.sees(&root, &address) {
            Seen::Public => return Checked::Public,
            Seen::Unknown(reason) => return Checked::Unknown { reason },
            Seen::Nothing => {}
        }
        for (_, id) in &branches {
            match self.git.holds(&root, id) {
                Ok(true) => {}
                Ok(false) => return Checked::Holds,
                Err(error) => {
                    return Checked::Problem {
                        reason: unreadable(&error),
                    };
                }
            }
        }
        let (reply, answer) = mpsc::channel();
        if self.events.send(Event::Connect(url, reply)).is_err() {
            return Checked::Problem {
                reason: "Tir is closing.".into(),
            };
        }
        match answer.recv() {
            Ok(Ok(())) => Checked::Connected,
            Ok(Err(reason)) => Checked::Problem { reason },
            Err(_) => Checked::Problem {
                reason: "Tir is closing.".into(),
            },
        }
    }

    /// Records and pushes what is left, then stops backup and calls `done`.
    pub fn finish(&self, done: impl FnOnce()) {
        let (finished, wait) = mpsc::channel();
        if self.events.send(Event::Close(finished)).is_ok() {
            let _ = wait.recv();
        }
        done();
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

struct Worker {
    setup: Setup,
    anonymous: Arc<Anonymous>,
    status: Arc<Mutex<Status>>,
    publish: Box<dyn Fn(&Status) + Send>,
    /// When to record the library's changes, if it may have changed.
    due: Option<Instant>,
    /// When to ask GitHub again, and push what waits.
    next: Option<Instant>,
    /// Pushes and checks that failed since the last that worked.
    failures: u32,
}

impl Worker {
    fn run(mut self, events: Receiver<Event>) {
        self.look();
        loop {
            let wake = [self.due, self.next].into_iter().flatten().min();
            let event = match wake {
                Some(at) => events.recv_timeout(at.saturating_duration_since(Instant::now())),
                None => events.recv().map_err(|_| RecvTimeoutError::Disconnected),
            };
            match event {
                Ok(Event::Changed) => {
                    self.due = Some(Instant::now() + self.setup.timing.quiet);
                    self.update(|status| status.pending = status.remote.is_some());
                }
                Ok(Event::Now(reply)) => {
                    self.record();
                    self.check(false, self.setup.timing.network);
                    let _ = reply.send(self.status());
                }
                Ok(Event::Resume(reply)) => {
                    self.record();
                    self.check(true, self.setup.timing.network);
                    let _ = reply.send(self.status());
                }
                Ok(Event::Connect(url, reply)) => {
                    let connected = self.connect(&url);
                    let done = connected.is_ok();
                    let _ = reply.send(connected);
                    if done {
                        self.record();
                        self.check(true, self.setup.timing.network);
                    }
                }
                Ok(Event::Close(done)) => {
                    self.record();
                    if self.status().waiting > 0 {
                        self.check(false, self.setup.timing.closing);
                    }
                    let _ = done.send(());
                    return;
                }
                Err(RecvTimeoutError::Timeout) => {
                    let now = Instant::now();
                    if self.due.is_some_and(|due| due <= now) && self.record() {
                        self.check(false, self.setup.timing.network);
                    }
                    if self.next.is_some_and(|next| next <= now) {
                        self.check(false, self.setup.timing.network);
                    }
                }
                Err(RecvTimeoutError::Disconnected) => return,
            }
        }
    }

    fn status(&self) -> Status {
        lock(&self.status).clone()
    }

    /// The library's folder, when there is a library.
    fn root(&self) -> Option<PathBuf> {
        self.setup
            .root
            .as_ref()
            .ok()
            .filter(|root| root.is_dir())
            .cloned()
    }

    /// At launch: whether the library holds changes to record, made while
    /// Tir was closed or left by one that stopped, and whether Tir can; and
    /// a first check with GitHub, which pushes what waits.
    fn look(&mut self) {
        let root = match &self.setup.root {
            Ok(root) if root.is_dir() => root.clone(),
            // No library yet: its first project or word is a change.
            Ok(_) => return,
            Err(problem) => {
                let problem = problem.clone();
                return self.update(|status| status.problem = Some(problem));
            }
        };
        let looked = match self.repository(&root) {
            // Making the repository is the first change to record.
            Ok(Repository::None) => Ok(true),
            Ok(_) => owned(&root).and_then(|()| {
                self.setup
                    .git
                    .changed(&root)
                    .map_err(|error| unreadable(&error))
            }),
            Err(problem) => Err(problem),
        };
        // Changes to record, or a problem the writer may mend meanwhile:
        // either way, record after the quiet spell.
        let may_have_changed = !matches!(looked, Ok(false));
        if may_have_changed {
            self.due = Some(Instant::now() + self.setup.timing.quiet);
        }
        let problem = looked.err();
        self.refresh(&root);
        self.update(|status| {
            status.problem = problem;
            status.pending = status.remote.is_some() && may_have_changed;
        });
        if self.status().remote.is_some() {
            self.next = Some(Instant::now());
        }
    }

    /// Records the library's changes as a commit, making the library a
    /// repository first if need be, while no library command runs; whether
    /// a commit was made.
    fn record(&mut self) -> bool {
        self.due = None;
        let root = match &self.setup.root {
            Ok(root) => root.clone(),
            Err(problem) => {
                let problem = problem.clone();
                self.update(|status| status.problem = Some(problem));
                return false;
            }
        };
        let busy = self.setup.busy.clone();
        let recorded = {
            let _library = lock(&busy);
            if !root.is_dir() {
                return false;
            }
            self.commit(&root)
        };
        if recorded.is_err() {
            // Whatever stopped it, such as a lock a git of the writer's
            // held, may be gone by then.
            self.due = Some(Instant::now() + self.setup.timing.quiet);
        }
        let made = recorded == Ok(true);
        let was = self.status().problem.is_some();
        let problem = recorded.err();
        let mended = was && problem.is_none();
        self.update(|status| {
            status.problem = problem;
            if status.problem.is_none() {
                status.pending = false;
            }
        });
        self.refresh(&root);
        // Commits may have waited while Tir could not record: ask GitHub.
        if mended && self.status().state != State::Paused {
            self.next = Some(Instant::now());
        }
        made
    }

    /// Commits the library's changes; whether there were any.
    fn commit(&self, root: &Path) -> Result<bool, String> {
        let git = &self.setup.git;
        prepare(git, root)?;
        git.commit(root)
            .map(|message| message.is_some())
            .map_err(|error| failure("Tir could not record the library's changes in git.", &error))
    }

    /// What the library is to git, or why Tir cannot record its changes.
    fn repository(&self, root: &Path) -> Result<Repository, String> {
        usable(&self.setup.git, root)
    }

    /// Pushes to `url` from now on, a repository only a login can read, and
    /// asks it afresh: a pause or failure was the old one's.
    fn connect(&mut self, url: &str) -> Result<(), String> {
        let root = self
            .root()
            .ok_or_else(|| "The library is not there.".to_string())?;
        {
            let _library = lock(&self.setup.busy);
            self.setup
                .git
                .connect(&root, url)
                .map_err(|error| failure("Tir could not connect the repository.", &error))?;
        }
        self.failures = 0;
        self.update(|status| {
            status.state = State::BackedUp;
            status.reason = None;
            status.private = false;
        });
        self.refresh(&root);
        Ok(())
    }

    /// Confirms the destination and its visibility before sending commits.
    fn check(&mut self, resuming: bool, limit: Duration) {
        self.next = None;
        let paused = self.status().state == State::Paused;
        if paused && !resuming {
            return;
        }
        let Some(root) = self.root() else {
            return;
        };
        let branch = match self.repository(&root) {
            Ok(Repository::Branch(branch)) => branch,
            Ok(_) => return,
            Err(problem) => {
                self.update(|status| status.problem = Some(problem));
                self.due
                    .get_or_insert(Instant::now() + self.setup.timing.retry);
                return;
            }
        };
        self.refresh(&root);
        let status = self.status();
        if status.remote.is_none() || status.problem.is_some() {
            return;
        }
        let answer = self.sync(&root, &branch, Instant::now() + limit);
        if paused && let Err(error) = &answer {
            self.update(|status| status.reason = Some(sentence(error)));
            return;
        }
        self.heard(&root, answer);
    }

    fn sync(&mut self, root: &Path, branch: &str, deadline: Instant) -> Result<Pushed, git::Error> {
        let git = &self.setup.git;
        let url = git
            .remote(root)?
            .ok_or_else(|| git::Error::Io("No repository is connected.".into()))?;
        let address = github::parse(&url).ok_or_else(|| {
            git::Error::Io(
                "This address is not a GitHub repository. Use Change repository… to connect a private one."
                    .into(),
            )
        })?;
        git.verify_destination(root, &url)?;
        git.fetch(root, branch, remaining(deadline)?)?;
        let reason = match self.anonymous.sees(root, &address) {
            Seen::Nothing => None,
            Seen::Public => Some(
                "This repository is public. Make it private or connect a different repository."
                    .into(),
            ),
            Seen::Unknown(reason) => Some(format!(
                "Tir could not verify that the repository is private: {reason}"
            )),
        };
        self.update(|status| status.private = reason.is_none());
        if let Some(reason) = reason {
            return Err(git::Error::Io(reason));
        }
        let standing = self.setup.git.standing(root, branch)?;
        if standing.behind > 0 {
            return Ok(Pushed::Behind);
        }
        if standing.waiting == 0 {
            return Ok(Pushed::Done);
        }
        self.setup.git.verify_destination(root, &url)?;
        self.update(|status| status.state = State::Pushing);
        self.setup.git.push(root, branch, remaining(deadline)?)
    }

    /// Takes in what GitHub answered, and when to ask it next.
    fn heard(&mut self, root: &Path, answer: Result<Pushed, git::Error>) {
        self.refresh(root);
        let now = Instant::now();
        match answer {
            Ok(Pushed::Done) => {
                self.failures = 0;
                self.next = Some(now + self.setup.timing.check);
                self.update(|status| {
                    status.state = State::BackedUp;
                    status.reason = None;
                });
            }
            Ok(Pushed::Behind) => {
                self.failures = 0;
                self.next = None;
                self.update(|status| {
                    status.state = State::Paused;
                    status.reason = None;
                });
            }
            Err(error) => {
                let timing = self.setup.timing;
                let pause = timing
                    .retry
                    .saturating_mul(2u32.saturating_pow(self.failures))
                    .min(timing.most);
                self.failures = self.failures.saturating_add(1);
                self.next = Some(now + pause);
                let offline = git::unreachable(&error);
                let reason = sentence(&error);
                self.update(|status| {
                    status.state = if offline {
                        State::Offline
                    } else {
                        State::Failing
                    };
                    status.reason = Some(reason);
                });
            }
        }
    }

    /// Reads the repository's display address and its last-known branch state.
    fn refresh(&mut self, root: &Path) {
        let git = &self.setup.git;
        let remote = git.remote(root).ok().flatten().map(|url| {
            github::parse(&url)
                .map_or_else(|| "Unverified repository".into(), |address| address.url())
        });
        let standing = match self.repository(root) {
            Ok(Repository::Branch(branch)) if remote.is_some() => git.standing(root, &branch).ok(),
            _ => None,
        };
        let waiting = standing.as_ref().map_or(0, |standing| standing.waiting);
        self.update(|status| {
            if remote.is_none() {
                status.pending = false;
                status.state = State::Off;
                status.reason = None;
            } else if status.state == State::Off {
                status.state = State::BackedUp;
            }
            if status.remote != remote {
                status.private = false;
            }
            status.remote = remote;
            status.waiting = waiting;
            status.backed_up = standing.and_then(|standing| standing.backed_up);
        });
    }

    /// Changes the status, and publishes it if it changed.
    fn update(&mut self, change: impl FnOnce(&mut Status)) {
        let (status, problem) = {
            let mut status = lock(&self.status);
            let was = status.clone();
            change(&mut status);
            if *status == was {
                return;
            }
            let problem = status.problem != was.problem;
            (status.clone(), problem)
        };
        if problem && let Some(problem) = &status.problem {
            eprintln!("Tir's backup: {problem}");
        }
        (self.publish)(&status);
    }
}

fn remaining(deadline: Instant) -> Result<Duration, git::Error> {
    deadline
        .checked_duration_since(Instant::now())
        .ok_or(git::Error::TimedOut)
}

/// What the library is to git, or why Tir cannot record its changes.
fn usable(git: &Git, root: &Path) -> Result<Repository, String> {
    match git.repository(root) {
        Ok(Repository::Detached) => Err(
            "The library's git repository is not on a branch (its HEAD is detached), so Tir \
             records nothing. Check out its branch in a terminal."
                .into(),
        ),
        Ok(Repository::Busy(operation)) => Err(format!(
            "A git {operation} is under way in the library, so Tir records nothing until it \
             is finished in a terminal."
        )),
        Ok(Repository::Conflicted) => Err(
            "The library's git repository holds unresolved conflicts, so Tir records nothing \
             until they are resolved in a terminal."
                .into(),
        ),
        Ok(repository) => Ok(repository),
        Err(error) => Err(unreadable(&error)),
    }
}

/// Whether the library holds nothing but Tir's projects and files, or why
/// Tir will not record it: never a folder such as the home folder, even
/// one already a repository of the writer's.
fn owned(root: &Path) -> Result<(), String> {
    match library::foreign_entry(root) {
        Ok(None) => Ok(()),
        Ok(Some(name)) => Err(format!(
            "Tir backs up only a library of its own, and “{name}” in {} is none of Tir's \
             projects. Move it out of the library and Tir will start backing up.",
            root.display()
        )),
        Err(error) => Err(format!("Tir could not read the library ({error}).")),
    }
}

/// Makes the library a repository if it is none yet, with Tir's
/// `.gitignore` unless it has one; or why Tir cannot record its changes.
fn prepare(git: &Git, root: &Path) -> Result<(), String> {
    let repository = usable(git, root)?;
    owned(root)?;
    match repository {
        Repository::None => git.init(root),
        _ => git.ignore(root),
    }
    .map_err(|error| failure("Tir could not make the library a git repository.", &error))
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
    use crate::git::tests::{committed, elsewhere, library_in, missing, sandboxed, subjects};
    use crate::git::{BRANCH, NETWORK, REMOTE};
    use std::fs;

    const BACKUP_URL: &str = "https://github.com/mara/screenplays.git";

    /// Timing for tests: `quiet` as given, quick retries, and no check
    /// with GitHub but the one at launch.
    fn timing(quiet: Duration) -> Timing {
        Timing {
            quiet,
            check: Duration::from_secs(3600),
            retry: Duration::from_millis(100),
            most: Duration::from_millis(200),
            network: Duration::from_secs(20),
            closing: Duration::from_secs(20),
        }
    }

    /// What anyone sees, in the sandbox of `dir`: the repositories its
    /// `gitconfig-anonymous` points GitHub's HTTPS addresses at.
    fn anonymous(dir: &TempDir) -> Anonymous {
        Anonymous::Sandboxed(Git::sandboxed(dir.0.join("gitconfig-anonymous")))
    }

    /// A sandbox standing for GitHub: this machine's login reaches the
    /// repositories in `dir/remotes`, anyone those in `dir/public`. Makes
    /// `mara/NAME.git` for each of `names`, empty, and public when `public`
    /// says so.
    fn github_with(dir: &TempDir, names: &[(&str, bool)]) {
        let remotes = dir.0.join("remotes/mara");
        let public = dir.0.join("public/mara");
        fs::create_dir_all(&remotes).unwrap();
        fs::create_dir_all(&public).unwrap();
        for (name, open) in names {
            let bare = format!("{name}.git");
            elsewhere(
                dir,
                &remotes,
                &["init", "-q", "--bare", "--initial-branch", BRANCH, &bare],
            );
            if *open {
                std::os::unix::fs::symlink(remotes.join(&bare), public.join(&bare)).unwrap();
            }
        }
        fs::write(
            dir.0.join("gitconfig"),
            format!(
                "[url \"{}/\"]\n\tinsteadOf = git@github.com:\n\tinsteadOf = https://github.com/\n",
                dir.0.join("remotes").display()
            ),
        )
        .unwrap();
        fs::write(
            dir.0.join("gitconfig-anonymous"),
            format!(
                "[url \"{}/\"]\n\tinsteadOf = https://github.com/\n",
                dir.0.join("public").display()
            ),
        )
        .unwrap();
    }

    #[test]
    fn connects_a_private_empty_repository_and_backs_up_to_it() {
        let dir = TempDir::new();
        github_with(&dir, &[("screenplays", false)]);
        let (git, root) = recorded(&dir);
        let (_, backup, _) = start(&dir, git.clone(), TIMING);
        assert_eq!(backup.status().state, State::Off);
        assert_eq!(
            backup.connect("  https://github.com/mara/screenplays\n"),
            Checked::Connected
        );
        assert_eq!(
            git.remote(&root).unwrap().as_deref(),
            Some("https://github.com/mara/screenplays.git")
        );
        let bare = dir.0.join("remotes/mara/screenplays.git");
        wait_until("the first backup", || on_github(&dir, &bare) == 1);
        wait_until("the status", || backup.status().state == State::BackedUp);
        assert!(backup.status().private);
        backup.finish(|| {});
    }

    #[test]
    fn warns_of_a_public_repository_and_connects_nothing() {
        let dir = TempDir::new();
        github_with(&dir, &[("screenplays", true)]);
        let (git, root) = recorded(&dir);
        let (_, backup, _) = start(&dir, git.clone(), TIMING);
        assert_eq!(
            backup.connect("git@github.com:mara/screenplays.git"),
            Checked::Public
        );
        assert_eq!(git.remote(&root).unwrap(), None);
        assert_eq!(backup.status().state, State::Off);
        backup.finish(|| {});
    }

    #[test]
    fn never_pushes_to_a_public_or_redirected_origin() {
        let dir = TempDir::new();
        let (git, root, bare) = connected(&dir);
        let public = dir.0.join("public/mara/screenplays.git");
        std::os::unix::fs::symlink(&bare, &public).unwrap();
        let (_, backup, _) = start(&dir, git.clone(), TIMING);
        wait_until("the private repository warning", || {
            backup.status().state == State::Failing
        });
        let status = backup.now().unwrap();
        assert!(status.reason.unwrap().contains("public"));
        assert_eq!(on_github(&dir, &bare), 0);
        fs::remove_file(public).unwrap();

        let other = crate::git::tests::github(&dir);
        git.run(
            &root,
            &["config", "remote.origin.pushurl", other.to_str().unwrap()],
        )
        .unwrap();
        assert_eq!(backup.now().unwrap().state, State::Failing);
        assert_eq!(on_github(&dir, &other), 0);
        git.run(&root, &["config", "--unset", "remote.origin.pushurl"])
            .unwrap();
        assert_eq!(backup.now().unwrap().state, State::BackedUp);
        assert_eq!(on_github(&dir, &bare), 1);
        backup.finish(|| {});
    }

    #[test]
    fn refuses_a_missing_repository_and_no_github_address() {
        let dir = TempDir::new();
        github_with(&dir, &[]);
        let (git, root) = recorded(&dir);
        let (_, backup, _) = start(&dir, git.clone(), TIMING);
        let Checked::Unreachable { reason } = backup.connect("git@github.com:mara/missing.git")
        else {
            panic!("a missing repository was reached");
        };
        assert!(
            reason.contains("does not appear to be a git repository"),
            "{reason}"
        );
        assert_eq!(
            backup.connect("/home/mara/screenplays.git"),
            Checked::NotGitHub
        );
        assert_eq!(backup.connect(""), Checked::NotGitHub);
        assert_eq!(git.remote(&root).unwrap(), None);
        backup.finish(|| {});
    }

    #[test]
    fn refuses_a_repository_holding_work_the_library_lacks() {
        let dir = TempDir::new();
        github_with(&dir, &[("screenplays", false)]);
        // GitHub's "Add a README" made a first commit of its own.
        let bare = dir.0.join("remotes/mara/screenplays.git");
        elsewhere(
            &dir,
            &dir.0,
            &["clone", "-q", bare.to_str().unwrap(), "web"],
        );
        fs::write(dir.0.join("web/README.md"), "# screenplays\n").unwrap();
        elsewhere(&dir, &dir.0.join("web"), &["add", "README.md"]);
        elsewhere(
            &dir,
            &dir.0.join("web"),
            &["commit", "-q", "-m", "Initial commit"],
        );
        elsewhere(&dir, &dir.0.join("web"), &["push", "-q", REMOTE, BRANCH]);
        let (git, root) = recorded(&dir);
        let (_, backup, _) = start(&dir, git.clone(), TIMING);
        assert_eq!(
            backup.connect("git@github.com:mara/screenplays.git"),
            Checked::Holds
        );
        assert_eq!(git.remote(&root).unwrap(), None);
        backup.finish(|| {});
    }

    #[test]
    fn connects_the_repository_a_library_was_cloned_from() {
        let dir = TempDir::new();
        github_with(&dir, &[("screenplays", false)]);
        let (git, root) = recorded(&dir);
        let (_, backup, _) = start(&dir, git.clone(), TIMING);
        assert_eq!(
            backup.connect("git@github.com:mara/screenplays.git"),
            Checked::Connected
        );
        let bare = dir.0.join("remotes/mara/screenplays.git");
        wait_until("the first backup", || on_github(&dir, &bare) == 1);
        // Connected again, as from a clone of it: GitHub holds nothing the
        // library lacks.
        assert_eq!(
            backup.connect("git@github.com:mara/screenplays.git"),
            Checked::Connected
        );
        assert_eq!(
            git.remote(&root).unwrap().as_deref(),
            Some("git@github.com:mara/screenplays.git")
        );
        backup.finish(|| {});
    }

    #[test]
    fn moves_backup_to_another_repository() {
        let dir = TempDir::new();
        github_with(&dir, &[("old", false), ("new", false)]);
        let (git, _) = recorded(&dir);
        let (_, backup, _) = start(&dir, git.clone(), TIMING);
        assert_eq!(
            backup.connect("git@github.com:mara/old.git"),
            Checked::Connected
        );
        let old = dir.0.join("remotes/mara/old.git");
        wait_until("the first backup", || on_github(&dir, &old) == 1);
        assert_eq!(
            backup.connect("git@github.com:mara/new.git"),
            Checked::Connected
        );
        let new = dir.0.join("remotes/mara/new.git");
        wait_until("the backup to the new one", || on_github(&dir, &new) == 1);
        wait_until("the status", || {
            backup.status().state == State::BackedUp && backup.status().waiting == 0
        });
        assert_eq!(
            backup.status().remote.as_deref(),
            Some("git@github.com:mara/new.git")
        );
        backup.finish(|| {});
    }

    #[test]
    fn connects_nothing_without_git() {
        let dir = TempDir::new();
        github_with(&dir, &[("screenplays", false)]);
        let (_, backup, _) = start(&dir, missing(&dir), TIMING);
        assert_eq!(
            backup.connect("git@github.com:mara/screenplays.git"),
            Checked::Problem {
                reason: "Tir could not find git on this machine, so it cannot back up the library."
                    .into()
            }
        );
        backup.finish(|| {});
    }

    /// Backup of the library in `dir`, made holding "Salt Line" unless it
    /// is there, and every status it published.
    fn start(
        dir: &TempDir,
        git: Git,
        timing: Timing,
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
                timing,
            },
            anonymous(dir),
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

    /// `recorded`, with an empty bare repository standing for GitHub.
    fn connected(dir: &TempDir) -> (Git, PathBuf, PathBuf) {
        github_with(dir, &[("screenplays", false)]);
        let (git, root) = recorded(dir);
        let bare = dir.0.join("remotes/mara/screenplays.git");
        git.run(&root, &["remote", "add", REMOTE, BACKUP_URL])
            .unwrap();
        (git, root, bare)
    }

    fn edit(root: &Path, text: &str) {
        fs::write(root.join("Salt Line/drafts/First Draft.tir"), text).unwrap();
    }

    /// How many commits GitHub's repository holds.
    fn on_github(dir: &TempDir, bare: &Path) -> usize {
        elsewhere(dir, bare, &["rev-list", "--count", "--all"])
            .parse()
            .unwrap()
    }

    /// Waits up to ten seconds for `ready`; when it came.
    fn wait_until(what: &str, mut ready: impl FnMut() -> bool) -> Instant {
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            if ready() {
                return Instant::now();
            }
            assert!(Instant::now() < deadline, "{what} never came");
            thread::sleep(Duration::from_millis(20));
        }
    }

    #[test]
    fn records_changes_once_the_library_has_been_quiet() {
        let dir = TempDir::new();
        let (git, _) = recorded(&dir);
        let quiet = Duration::from_millis(1500);
        let (root, backup, _) = start(&dir, git.clone(), timing(quiet));
        edit(&root, "{\"one\":1}\n");
        backup.changed();
        thread::sleep(Duration::from_millis(500));
        edit(&root, "{\"two\":2}\n");
        backup.changed();
        let last = Instant::now();
        // Less than the quiet spell after the last change, nothing yet.
        thread::sleep(Duration::from_millis(500));
        assert_eq!(subjects(&git, &root).len(), 1);
        let came = wait_until("the commit", || subjects(&git, &root).len() == 2);
        assert!(came - last >= quiet);
        assert!(!git.changed(&root).unwrap());
        // No repository is connected: recorded here only.
        assert_eq!(backup.status().state, State::Off);
        assert_eq!(backup.status().remote, None);
        backup.finish(|| {});
    }

    #[test]
    fn records_what_is_left_on_closing() {
        let dir = TempDir::new();
        let (git, _) = recorded(&dir);
        let (root, backup, heard) = start(&dir, git.clone(), TIMING);
        edit(&root, "{\"closing\":1}\n");
        backup.changed();
        backup.finish(|| {});
        assert_eq!(subjects(&git, &root).len(), 2);
        assert!(!git.changed(&root).unwrap());
        // Nothing went wrong, so nothing was published.
        assert!(lock(&heard).is_empty());
        // Backup has stopped; the library may still be told of a change.
        backup.changed();
        let mut called = false;
        backup.finish(|| called = true);
        assert!(called);
    }

    #[test]
    fn records_at_launch_what_changed_while_tir_was_closed() {
        let dir = TempDir::new();
        let (git, root) = recorded(&dir);
        edit(&root, "{\"while closed\":1}\n");
        let (_, backup, _) = start(&dir, git.clone(), timing(Duration::from_millis(100)));
        wait_until("the commit", || subjects(&git, &root).len() == 2);
        backup.finish(|| {});
    }

    #[test]
    fn makes_the_library_a_repository() {
        let dir = TempDir::new();
        let git = sandboxed(&dir);
        let (root, backup, _) = start(&dir, git.clone(), TIMING);
        assert!(!root.join(".git").exists());
        backup.finish(|| {});
        assert_eq!(subjects(&git, &root), ["Back up Salt Line"]);
        assert!(committed(&git, &root).contains(&".gitignore".to_string()));
    }

    #[test]
    fn makes_no_repository_of_a_folder_holding_more_than_tirs_files() {
        let dir = TempDir::new();
        let git = sandboxed(&dir);
        let root = library_in(&dir.0);
        fs::write(root.join("taxes.ods"), "").unwrap();
        let (_, backup, heard) = start(&dir, git, TIMING);
        backup.finish(|| {});
        assert!(!root.join(".git").exists());
        let problem = backup.status().problem.unwrap();
        assert!(problem.starts_with("Tir backs up only a library of its own, and “taxes.ods”"));
        assert_eq!(lock(&heard).len(), 1);
    }

    #[test]
    fn reports_a_missing_git_and_carries_on() {
        let dir = TempDir::new();
        let (_, backup, heard) = start(&dir, missing(&dir), TIMING);
        backup.changed();
        backup.now();
        backup.resume();
        backup.finish(|| {});
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
        let (_, backup, heard) = start(&dir, git, TIMING);
        backup.finish(|| {});
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
        let (_, backup, heard) = start(&dir, git.clone(), timing(Duration::from_millis(100)));
        let problem = |part: &'static str| {
            let backup = &backup;
            move || {
                backup
                    .status()
                    .problem
                    .is_some_and(|problem| problem.contains(part))
            }
        };
        wait_until("the detached HEAD", problem("not on a branch"));
        git.run(&root, &["checkout", "-q", BRANCH]).unwrap();
        let head = String::from_utf8(git.run(&root, &["rev-parse", "HEAD"]).unwrap()).unwrap();
        fs::write(root.join(".git/MERGE_HEAD"), head).unwrap();
        backup.changed();
        wait_until("the merge", problem("A git merge is under way"));
        assert_eq!(subjects(&git, &root).len(), 1);
        fs::remove_file(root.join(".git/MERGE_HEAD")).unwrap();
        backup.changed();
        wait_until("the commit", || subjects(&git, &root).len() == 2);
        backup.finish(|| {});
        assert_eq!(backup.status(), Status::default());
        assert_eq!(lock(&heard).last(), Some(&Status::default()));
    }

    #[test]
    fn pushes_what_waited_once_a_problem_is_mended_with_no_change_after() {
        let dir = TempDir::new();
        let (git, root, bare) = connected(&dir);
        git.run(&root, &["checkout", "-q", "--detach"]).unwrap();
        let (_, backup, _) = start(&dir, git.clone(), timing(Duration::from_millis(100)));
        wait_until("the detached HEAD", || backup.status().problem.is_some());
        assert_eq!(on_github(&dir, &bare), 0);
        // Mended in a terminal: Tir sees it by itself, and pushes.
        git.run(&root, &["checkout", "-q", BRANCH]).unwrap();
        wait_until("the push", || on_github(&dir, &bare) == 1);
        wait_until("the status", || backup.status().state == State::BackedUp);
        assert_eq!(backup.status().problem, None);
        backup.finish(|| {});
    }

    #[test]
    fn records_nothing_of_a_repository_holding_more_than_tirs_files() {
        let dir = TempDir::new();
        let git = sandboxed(&dir);
        let root = library_in(&dir.0);
        // A repository of the writer's own, as a home folder might be.
        fs::write(root.join("taxes.ods"), "").unwrap();
        elsewhere(&dir, &root, &["init", "-q"]);
        let (_, backup, _) = start(&dir, git.clone(), timing(Duration::from_millis(100)));
        wait_until("the problem", || backup.status().problem.is_some());
        backup.changed();
        backup.finish(|| {});
        assert!(subjects(&git, &root).is_empty());
        assert!(!root.join(".gitignore").exists());
        assert!(
            backup
                .status()
                .problem
                .unwrap()
                .starts_with("Tir backs up only a library of its own, and “taxes.ods”")
        );
    }

    #[test]
    fn gives_a_repository_without_one_tirs_gitignore() {
        let dir = TempDir::new();
        let git = sandboxed(&dir);
        let root = library_in(&dir.0);
        elsewhere(&dir, &root, &["init", "-q", "--initial-branch", BRANCH]);
        fs::write(root.join("Salt Line/drafts/First Draft.tir.9-0.tmp"), "{").unwrap();
        fs::write(root.join("Salt Line/research.pdf"), "%PDF").unwrap();
        let (_, backup, _) = start(&dir, git.clone(), TIMING);
        backup.finish(|| {});
        assert_eq!(
            committed(&git, &root),
            [
                ".gitignore",
                "Salt Line/drafts/First Draft.fountain",
                "Salt Line/drafts/First Draft.tir",
                "Salt Line/project.json",
            ]
        );
    }

    #[test]
    fn reports_a_library_it_cannot_find() {
        let dir = TempDir::new();
        let backup = Backup::start(
            Setup {
                git: sandboxed(&dir),
                root: Err("Tir could not find the home folder, where the library is.".into()),
                busy: Arc::default(),
                timing: TIMING,
            },
            anonymous(&dir),
            |_| {},
        );
        backup.now();
        backup.finish(|| {});
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
                timing: TIMING,
            },
            anonymous(&dir),
            |_| {},
        );
        let command = lock(&busy);
        edit(&root, "{\"saving\":1}\n");
        let closing = thread::spawn(move || backup.finish(|| {}));
        thread::sleep(Duration::from_millis(300));
        assert_eq!(subjects(&git, &root).len(), 1);
        drop(command);
        closing.join().unwrap();
        assert_eq!(subjects(&git, &root).len(), 2);
    }

    #[test]
    fn pushes_what_waits_at_launch_and_each_commit_after() {
        let dir = TempDir::new();
        let (git, root, bare) = connected(&dir);
        let (_, backup, heard) = start(&dir, git.clone(), timing(Duration::from_millis(200)));
        wait_until("the first push", || on_github(&dir, &bare) == 1);
        wait_until("the status", || backup.status().state == State::BackedUp);
        let status = backup.status();
        assert_eq!(status.remote.as_deref(), Some(BACKUP_URL));
        assert_eq!(status.waiting, 0);
        assert!(status.backed_up.is_some());
        edit(&root, "{\"two\":2}\n");
        backup.changed();
        wait_until("the second push", || on_github(&dir, &bare) == 2);
        wait_until("the status", || {
            backup.status().state == State::BackedUp && backup.status().waiting == 0
        });
        assert!(
            lock(&heard)
                .iter()
                .any(|status| status.state == State::Pushing)
        );
        backup.finish(|| {});
    }

    #[test]
    fn backs_up_now_without_waiting_for_quiet() {
        let dir = TempDir::new();
        let (git, root, bare) = connected(&dir);
        let (_, backup, _) = start(&dir, git.clone(), timing(Duration::from_secs(3600)));
        wait_until("the first push", || on_github(&dir, &bare) == 1);
        edit(&root, "{\"now\":1}\n");
        backup.changed();
        backup.now();
        wait_until("the push", || on_github(&dir, &bare) == 2);
        assert_eq!(subjects(&git, &root).len(), 2);
        backup.finish(|| {});
    }

    #[test]
    fn keeps_commits_while_github_cannot_be_reached_and_pushes_them_once_it_can() {
        let dir = TempDir::new();
        let (git, root, bare) = connected(&dir);
        let timing = Timing {
            network: Duration::from_secs(1),
            ..timing(Duration::from_secs(3600))
        };
        let (_, backup, _) = start(&dir, git.clone(), timing);
        wait_until("the first push", || on_github(&dir, &bare) == 1);
        // GitHub does not answer in time, as when the line has gone.
        git.run(
            &root,
            &[
                "config",
                "remote.origin.receivepack",
                "sleep 5; git-receive-pack",
            ],
        )
        .unwrap();
        edit(&root, "{\"offline\":1}\n");
        backup.now();
        wait_until("offline", || backup.status().state == State::Offline);
        let status = backup.status();
        assert_eq!(status.waiting, 1);
        assert_eq!(
            status.reason.as_deref(),
            Some("Git took too long to answer, so Tir stopped it.")
        );
        assert_eq!(subjects(&git, &root).len(), 2);
        // GitHub's answer is now a refusal: the repository is not there.
        let away = dir.0.join("away.git");
        fs::rename(&bare, &away).unwrap();
        git.run(&root, &["config", "--unset", "remote.origin.receivepack"])
            .unwrap();
        wait_until("the refusal", || backup.status().state == State::Failing);
        assert!(
            backup
                .status()
                .reason
                .unwrap()
                .contains("does not appear to be a git repository")
        );
        // Tir tries again by itself, and the commit arrives.
        fs::rename(&away, &bare).unwrap();
        wait_until("the push", || on_github(&dir, &bare) == 2);
        wait_until("the status", || backup.status().state == State::BackedUp);
        assert_eq!(backup.status().waiting, 0);
        assert_eq!(backup.status().reason, None);
        backup.finish(|| {});
    }

    /// Another machine's clone of GitHub's repository adds the dictionary
    /// and pushes it.
    fn push_from_the_laptop(dir: &TempDir, bare: &Path) {
        let laptop = dir.0.join("laptop");
        elsewhere(
            dir,
            &dir.0,
            &["clone", "-q", bare.to_str().unwrap(), "laptop"],
        );
        fs::write(laptop.join("dictionary.txt"), "Tomás\n").unwrap();
        elsewhere(dir, &laptop, &["add", "dictionary.txt"]);
        elsewhere(dir, &laptop, &["commit", "-q", "-m", "On the laptop"]);
        elsewhere(dir, &laptop, &["push", "-q", REMOTE, BRANCH]);
    }

    fn head(git: &Git, root: &Path) -> String {
        String::from_utf8(git.run(root, &["rev-parse", "HEAD"]).unwrap())
            .unwrap()
            .trim()
            .to_owned()
    }

    #[test]
    fn pauses_when_github_has_commits_this_machine_lacks_and_merges_nothing() {
        let dir = TempDir::new();
        let (git, root, bare) = connected(&dir);
        let (_, backup, _) = start(&dir, git.clone(), timing(Duration::from_millis(200)));
        wait_until("the first push", || on_github(&dir, &bare) == 1);
        push_from_the_laptop(&dir, &bare);
        edit(&root, "{\"desktop\":1}\n");
        backup.now();
        wait_until("the pause", || backup.status().state == State::Paused);
        let paused_at = head(&git, &root);
        // Paused, Tir still records here, and pushes nothing.
        edit(&root, "{\"desktop\":2}\n");
        backup.changed();
        wait_until("the commit", || subjects(&git, &root).len() == 3);
        thread::sleep(Duration::from_millis(400));
        assert_eq!(on_github(&dir, &bare), 2);
        assert_eq!(backup.status().state, State::Paused);
        // Nothing merged: no dictionary here, the draft as written here,
        // and the branch only grew by Tir's own commit.
        assert!(!root.join("dictionary.txt").exists());
        assert_eq!(
            fs::read_to_string(root.join("Salt Line/drafts/First Draft.tir")).unwrap(),
            "{\"desktop\":2}\n"
        );
        assert_eq!(elsewhere(&dir, &root, &["rev-parse", "HEAD~1"]), paused_at);
        assert_eq!(subjects(&git, &root).len(), 3);
        // The writer brings the library up to date, then resumes.
        elsewhere(
            &dir,
            &root,
            &[
                "pull",
                "-q",
                "--no-rebase",
                "--no-edit",
                REMOTE,
                "refs/heads/main",
            ],
        );
        backup.resume();
        wait_until("the push", || {
            elsewhere(&dir, &bare, &["rev-parse", BRANCH]) == head(&git, &root)
        });
        wait_until("the status", || backup.status().state == State::BackedUp);
        assert_eq!(backup.status().waiting, 0);
        backup.finish(|| {});
    }

    #[test]
    fn pauses_at_launch_when_github_has_moved_on() {
        let dir = TempDir::new();
        let (git, root, bare) = connected(&dir);
        git.push(&root, BRANCH, NETWORK).unwrap();
        push_from_the_laptop(&dir, &bare);
        let (_, backup, _) = start(&dir, git.clone(), timing(Duration::from_secs(3600)));
        wait_until("the pause", || backup.status().state == State::Paused);
        assert_eq!(subjects(&git, &root).len(), 1);
        assert!(!root.join("dictionary.txt").exists());
        // Resuming before the library is brought up to date changes nothing.
        backup.resume();
        let away = dir.0.join("away.git");
        fs::rename(&bare, &away).unwrap();
        let status = backup.resume().unwrap();
        assert_eq!(status.state, State::Paused);
        assert!(status.reason.is_some());
        fs::rename(away, &bare).unwrap();
        assert_eq!(backup.status().state, State::Paused);
        assert_eq!(on_github(&dir, &bare), 2);
        backup.finish(|| {});
    }

    #[test]
    fn pushes_on_closing_after_recording() {
        let dir = TempDir::new();
        let (git, root, bare) = connected(&dir);
        let (_, backup, _) = start(&dir, git.clone(), TIMING);
        wait_until("the first push", || on_github(&dir, &bare) == 1);
        edit(&root, "{\"closing\":1}\n");
        backup.changed();
        backup.finish(|| {
            assert_eq!(subjects(&git, &root).len(), 2);
            assert_eq!(on_github(&dir, &bare), 2);
        });
    }
}
