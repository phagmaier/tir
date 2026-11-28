//! The system's git, run in the library (architecture, "Backup"). Each
//! command is an argument list, never a shell line, with the library as its
//! work tree and the library's `.git` as its repository whatever the
//! environment says, so git never finds or changes a repository outside the
//! library. Git is never asked to wait for anyone: its input is empty, it may
//! not prompt on a terminal, and each command is stopped after a time limit.
//! Hooks, the file system monitor and commit signing are off for Tir's
//! commands, which run unattended. A missing git, a failure and a command
//! stopped for taking too long each come back as an `Error`.

use std::fmt;
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

/// How long a command that stays on this machine may take.
const LOCAL: Duration = Duration::from_secs(60);

/// How long a command that talks to GitHub may take, a first backup of a
/// large library over a slow line included.
pub const NETWORK: Duration = Duration::from_secs(120);

/// The remote Tir pushes to, which a clone of the library names too.
pub const REMOTE: &str = "origin";

/// How ssh runs for Tir unless the writer's environment or configuration
/// names another command: never asking for a passphrase or whether to
/// trust a host, which only a terminal could answer, and giving up on a
/// connection that does not open.
const SSH: &str = "ssh -o BatchMode=yes -o ConnectTimeout=20";

/// The branch Tir makes when it makes the library a repository.
pub const BRANCH: &str = "main";

/// Variables that would point git at another repository, index or object
/// store than the library's.
const ELSEWHERE: &[&str] = &[
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_COMMON_DIR",
    "GIT_NAMESPACE",
    "GIT_CEILING_DIRECTORIES",
    "GIT_DISCOVERY_ACROSS_FILESYSTEM",
    "GIT_PREFIX",
];

/// Settings for every command Tir runs: no hooks, which could run anything
/// or wait for an answer, and no file system monitor, which would leave a
/// daemon watching the library.
const QUIET: &[&str] = &[
    "-c",
    "core.hooksPath=/dev/null",
    "-c",
    "core.fsmonitor=false",
];

/// The library's `.gitignore`, written when Tir makes the library a
/// repository: git records only the files Tir makes (architecture, "Library
/// on disk"), so nothing else put in the library reaches GitHub, nor does a
/// file left part-written by a crash (`*.tmp`; architecture, "Writing files").
pub const IGNORE: &str = "\
# Tir backs up only its own files: each project's project.json and drafts,
# with their Fountain copies, and the dictionary.
/*
!/.gitignore
!/dictionary.txt
!/*/
/*/*
!/*/project.json
!/*/drafts/
/*/drafts/*
!/*/drafts/*.tir
!/*/drafts/*.fountain
# Files and folders a write or a deletion left behind when Tir stopped.
*.tmp
";

/// How Tir runs git: the program, and whose configuration it reads.
#[derive(Clone, Debug)]
pub struct Git {
    program: PathBuf,
    /// A sandbox's configuration file, for tests and trial runs: git reads
    /// it and not the machine's, and reaches only files on this machine, so
    /// nothing a test or trial does can reach GitHub or use the writer's
    /// login.
    sandbox: Option<PathBuf>,
}

/// Why a git command did not do its work.
#[derive(Debug, PartialEq)]
pub enum Error {
    /// There is no git on this machine.
    Missing,
    /// Git could not be started or waited for.
    Io(String),
    /// Git took longer than its time limit, and was stopped.
    TimedOut,
    /// Git ran and failed, with its exit code and what it said.
    Failed { code: Option<i32>, message: String },
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Missing => write!(f, "Tir could not find git on this machine."),
            Error::Io(error) => write!(f, "Tir could not run git ({error})."),
            Error::TimedOut => write!(f, "Git took too long to answer, so Tir stopped it."),
            Error::Failed { message, .. } if message.is_empty() => write!(f, "Git failed."),
            Error::Failed { message, .. } => write!(f, "{message}"),
        }
    }
}

/// What the library is to git.
#[derive(Debug, PartialEq)]
pub enum Repository {
    /// No repository yet: the library has no `.git`.
    None,
    /// A repository on the branch named, with no merge or the like under way.
    Branch(String),
    /// A repository whose HEAD names a commit, not a branch.
    Detached,
    /// A repository in the middle of the operation named, such as a merge
    /// the writer started in a terminal.
    Busy(&'static str),
    /// A repository holding conflicts no operation marks, such as those
    /// `git stash pop` leaves.
    Conflicted,
}

impl Git {
    /// The machine's git, with the writer's own configuration and login.
    pub fn system() -> Self {
        Git {
            program: "git".into(),
            sandbox: None,
        }
    }

    /// Git reading only `config`, a file that need not exist, and reaching
    /// only files on this machine.
    pub fn sandboxed(config: PathBuf) -> Self {
        Git {
            program: "git".into(),
            sandbox: Some(config),
        }
    }

    /// A command for `root`'s repository, its work tree `root`.
    fn command(&self, root: &Path) -> Command {
        let mut command = Command::new(&self.program);
        for name in ELSEWHERE {
            command.env_remove(name);
        }
        command
            .current_dir(root)
            .env("GIT_DIR", root.join(".git"))
            .env("GIT_WORK_TREE", root)
            .env("GIT_TERMINAL_PROMPT", "0")
            // Messages Tir can recognise, in the interface's language.
            .env("LC_ALL", "C")
            // Reading the status writes nothing, so it never takes a lock a
            // command of the writer's needs.
            .env("GIT_OPTIONAL_LOCKS", "0")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .args(QUIET);
        if let Some(config) = &self.sandbox {
            // Nothing of the writer's configuration either: neither their
            // ignore and attributes files nor settings passed down.
            let home = config.parent().unwrap_or(config);
            command
                .env("GIT_CONFIG_GLOBAL", config)
                .env("GIT_CONFIG_NOSYSTEM", "1")
                .env("XDG_CONFIG_HOME", home)
                .env_remove("GIT_CONFIG_PARAMETERS")
                .env_remove("GIT_CONFIG_COUNT")
                .env("GIT_ALLOW_PROTOCOL", "file");
        }
        command
    }

    /// Runs git with `args` in `root`; what it printed.
    pub fn run(&self, root: &Path, args: &[&str]) -> Result<Vec<u8>, Error> {
        let mut command = self.command_in(root)?;
        command.args(args);
        output(command, LOCAL)
    }

    /// `command`, refusing a `root` that is no folder: git would start
    /// nowhere else, and the failure would read as no git.
    fn command_in(&self, root: &Path) -> Result<Command, Error> {
        if !root.is_dir() {
            return Err(Error::Io(format!("{} is not a folder", root.display())));
        }
        Ok(self.command(root))
    }

    /// A command that talks to the remote, never asking anyone anything:
    /// no password window (an empty `GIT_ASKPASS` makes git skip
    /// `core.askPass` and `SSH_ASKPASS` too), no ssh passphrase or host
    /// question, and ssh in batch mode unless the writer names their own.
    fn network(&self, root: &Path) -> Result<Command, Error> {
        let mut command = self.command_in(root)?;
        command
            .env("GIT_ASKPASS", "")
            .env("SSH_ASKPASS_REQUIRE", "never")
            .env("GCM_INTERACTIVE", "never");
        let named = ["GIT_SSH_COMMAND", "GIT_SSH"]
            .iter()
            .any(|name| std::env::var_os(name).is_some_and(|value| !value.is_empty()));
        if self.sandbox.is_none() && !named && self.config(root, "core.sshCommand")?.is_none() {
            command.env("GIT_SSH_COMMAND", SSH);
        }
        Ok(command)
    }

    /// `run`, as text.
    fn text(&self, root: &Path, args: &[&str]) -> Result<String, Error> {
        self.run(root, args)
            .map(|bytes| String::from_utf8_lossy(&bytes).trim_end().to_owned())
    }

    /// What `root`, the library, is to git; an error when git is missing or
    /// the repository cannot be read.
    pub fn repository(&self, root: &Path) -> Result<Repository, Error> {
        if let Err(error) = fs::symlink_metadata(root.join(".git")) {
            return match error.kind() {
                io::ErrorKind::NotFound => Ok(Repository::None),
                _ => Err(Error::Io(error.to_string())),
            };
        }
        let branch = match self.text(root, &["symbolic-ref", "-q", "--short", "HEAD"]) {
            Ok(branch) => branch,
            // HEAD is there and names no branch.
            Err(Error::Failed { code: Some(1), .. }) => return Ok(Repository::Detached),
            Err(error) => return Err(error),
        };
        // Each operation leaves its file or folder in the repository while
        // it is under way.
        const UNDER_WAY: [(&str, &str); 6] = [
            ("MERGE_HEAD", "merge"),
            ("SQUASH_MSG", "squash merge"),
            ("rebase-merge", "rebase"),
            ("rebase-apply", "rebase"),
            ("CHERRY_PICK_HEAD", "cherry-pick"),
            ("REVERT_HEAD", "revert"),
        ];
        let mut args = vec!["rev-parse"];
        for (path, _) in UNDER_WAY {
            args.extend(["--git-path", path]);
        }
        let paths = self.text(root, &args)?;
        for (path, (_, operation)) in paths.lines().zip(UNDER_WAY) {
            if fs::symlink_metadata(root.join(path)).is_ok() {
                return Ok(Repository::Busy(operation));
            }
        }
        // A conflict left by `git stash pop` and the like marks no
        // operation; `git add` would take its markers as resolved.
        if !self.run(root, &["ls-files", "--unmerged"])?.is_empty() {
            return Ok(Repository::Conflicted);
        }
        Ok(Repository::Branch(branch))
    }

    /// Makes `root` a repository on `BRANCH`, with Tir's `.gitignore`
    /// first, so no commit is ever made without it.
    pub fn init(&self, root: &Path) -> Result<(), Error> {
        self.ignore(root)?;
        self.run(root, &["init", "-q", "--initial-branch", BRANCH])
            .map(drop)
    }

    /// Gives `root` Tir's `.gitignore` (`IGNORE`) unless it has one: the
    /// writer may have changed it.
    pub fn ignore(&self, root: &Path) -> Result<(), Error> {
        let ignore = root.join(".gitignore");
        if fs::symlink_metadata(&ignore).is_err() {
            crate::files::replace(&ignore, IGNORE.as_bytes())
                .map_err(|error| Error::Io(error.to_string()))?;
        }
        Ok(())
    }

    /// Whether the work tree holds changes git has not recorded.
    pub fn changed(&self, root: &Path) -> Result<bool, Error> {
        self.run(root, &["status", "--porcelain", "-z"])
            .map(|status| !status.is_empty())
    }

    /// Records every change in the work tree as one commit, its message
    /// naming what changed; the message, or `None` when nothing changed.
    pub fn commit(&self, root: &Path) -> Result<Option<String>, Error> {
        self.run(root, &["add", "--all"])?;
        let staged = self.run(root, &["diff", "--cached", "--name-only", "-z"])?;
        let paths: Vec<_> = staged
            .split(|&byte| byte == 0)
            .filter(|path| !path.is_empty())
            .map(String::from_utf8_lossy)
            .collect();
        if paths.is_empty() {
            return Ok(None);
        }
        let message = message(paths.iter().map(|path| path.as_ref()));
        let mut args = vec!["-c", "commit.gpgSign=false"];
        // Commits carry the writer's name and address when git has them,
        // and Tir's otherwise, since git refuses to commit with neither.
        if self.config(root, "user.name")?.is_none() {
            args.extend(["-c", "user.name=Tir"]);
        }
        if self.config(root, "user.email")?.is_none() {
            args.extend(["-c", "user.email=tir@localhost"]);
        }
        args.extend(["commit", "-q", "--no-verify", "-m", &message]);
        self.run(root, &args)?;
        Ok(Some(message))
    }

    /// The configuration's value for `key`, if it has one.
    fn config(&self, root: &Path, key: &str) -> Result<Option<String>, Error> {
        match self.text(root, &["config", "--get", key]) {
            Ok(value) => Ok(Some(value)),
            Err(Error::Failed { code: Some(1), .. }) => Ok(None),
            Err(error) => Err(error),
        }
    }

    /// The address of the repository Tir pushes to, if one is connected.
    pub fn remote(&self, root: &Path) -> Result<Option<String>, Error> {
        self.config(root, &format!("remote.{REMOTE}.url"))
    }

    /// Whether Tir found, when it connected the repository, that only a
    /// login can read it.
    pub fn private(&self, root: &Path) -> Result<bool, Error> {
        Ok(self.config(root, "tir.private")?.as_deref() == Some("true"))
    }

    /// Pushes to `url` from now on, recording whether only a login can
    /// read it. Tir's record of the branch on the repository it replaces,
    /// if any, goes, so nothing counts as there that the new one lacks.
    pub fn connect(&self, root: &Path, url: &str, private: bool) -> Result<(), Error> {
        match self.remote(root)? {
            Some(was) if was == url => {}
            Some(_) => {
                self.run(root, &["remote", "set-url", REMOTE, url])?;
                let records = self.text(
                    root,
                    &[
                        "for-each-ref",
                        "--format=%(refname)",
                        &format!("refs/remotes/{REMOTE}/"),
                    ],
                )?;
                for record in records.lines() {
                    self.run(root, &["update-ref", "-d", record])?;
                }
            }
            None => {
                self.run(root, &["remote", "add", REMOTE, url])?;
            }
        }
        let private = if private { "true" } else { "false" };
        self.run(root, &["config", "tir.private", private])?;
        Ok(())
    }

    /// The branches of the repository at `url`, as this machine's git login
    /// reaches it: each one's name and its newest commit.
    pub fn ls_remote(&self, root: &Path, url: &str) -> Result<Vec<(String, String)>, Error> {
        let mut command = self.network(root)?;
        command.args(["ls-remote", url]);
        let listed = output(command, NETWORK)?;
        Ok(String::from_utf8_lossy(&listed)
            .lines()
            .filter_map(|line| line.split_once('\t'))
            .filter(|(_, name)| name.starts_with("refs/heads/"))
            .map(|(id, name)| (name.to_owned(), id.to_owned()))
            .collect())
    }

    /// Whether the branch holds the commit `id`.
    pub fn holds(&self, root: &Path, id: &str) -> Result<bool, Error> {
        // An id is hexadecimal: anything else is no commit, and never an
        // option for git.
        if id.is_empty() || !id.chars().all(|c| c.is_ascii_hexdigit()) {
            return Ok(false);
        }
        match self.run(root, &["merge-base", "--is-ancestor", id, "HEAD"]) {
            Ok(_) => Ok(true),
            // Not in the branch, or not here at all, or no branch yet.
            Err(Error::Failed { .. }) => Ok(false),
            Err(error) => Err(error),
        }
    }

    /// The commit `name` names, if it names one.
    fn commit_id(&self, root: &Path, name: &str) -> Result<Option<String>, Error> {
        match self.text(
            root,
            &["rev-parse", "-q", "--verify", &format!("{name}^{{commit}}")],
        ) {
            Ok(id) => Ok(Some(id)),
            Err(Error::Failed { code: Some(1), .. }) => Ok(None),
            Err(error) => Err(error),
        }
    }

    fn count(&self, root: &Path, range: &str) -> Result<u32, Error> {
        let count = self.text(root, &["rev-list", "--count", range])?;
        count
            .parse()
            .map_err(|_| Error::Io(format!("git counted “{count}”")))
    }

    /// How `branch` stands against what Tir last heard GitHub has.
    pub fn standing(&self, root: &Path, branch: &str) -> Result<Standing, Error> {
        let tracking = tracking(branch);
        let head = self.commit_id(root, "HEAD")?;
        let heard = self.commit_id(root, &tracking)?;
        let (waiting, behind) = match (&head, &heard) {
            (None, None) => (0, 0),
            (None, Some(_)) => (0, self.count(root, &tracking)?),
            (Some(_), None) => (self.count(root, "HEAD")?, 0),
            (Some(_), Some(_)) => (
                self.count(root, &format!("{tracking}..HEAD"))?,
                self.count(root, &format!("HEAD..{tracking}"))?,
            ),
        };
        let backed_up = match heard {
            Some(_) => {
                let seconds = self.text(root, &["log", "-1", "--format=%ct", &tracking])?;
                seconds.parse::<f64>().ok().map(|seconds| seconds * 1000.0)
            }
            None => None,
        };
        Ok(Standing {
            waiting,
            behind,
            backed_up,
        })
    }

    /// How much of `path`, a project's folder or a draft, GitHub's
    /// `branch` holds as Tir last heard it.
    pub fn coverage(&self, root: &Path, branch: &str, path: &str) -> Result<Coverage, Error> {
        let tracking = tracking(branch);
        if self.commit_id(root, &tracking)?.is_none() {
            return Ok(Coverage::None);
        }
        // Names are taken as they are, never as patterns.
        let path = format!(":(literal){path}");
        let held = self.text(root, &["ls-tree", "--name-only", &tracking, "--", &path])?;
        if held.is_empty() {
            return Ok(Coverage::None);
        }
        let same = match self.run(root, &["diff", "--quiet", &tracking, "--", &path]) {
            Ok(_) => true,
            Err(Error::Failed { code: Some(1), .. }) => false,
            Err(error) => return Err(error),
        };
        let new = self.text(
            root,
            &["ls-files", "--others", "--exclude-standard", "--", &path],
        )?;
        Ok(if same && new.is_empty() {
            Coverage::All
        } else {
            Coverage::Older
        })
    }

    /// Hears what GitHub's `branch` holds now, taking at most `limit`,
    /// without changing the work tree or the branch: only Tir's record of
    /// GitHub's branch moves.
    pub fn fetch(&self, root: &Path, branch: &str, limit: Duration) -> Result<(), Error> {
        let mut command = self.network(root)?;
        let refspec = format!("+refs/heads/{branch}:{}", tracking(branch));
        command.args([
            "fetch",
            "-q",
            "--no-tags",
            "--no-recurse-submodules",
            REMOTE,
            &refspec,
        ]);
        match output(command, limit) {
            Ok(_) => Ok(()),
            // A repository with no commits yet has no branch to fetch.
            Err(Error::Failed { message, .. })
                if message
                    .starts_with(&format!("couldn't find remote ref refs/heads/{branch}")) =>
            {
                Ok(())
            }
            Err(error) => Err(error),
        }
    }

    /// Pushes `branch` to GitHub's branch of that name, only ever adding
    /// commits to it: never forced.
    pub fn push(&self, root: &Path, branch: &str, limit: Duration) -> Result<Pushed, Error> {
        let Some(head) = self.commit_id(root, "HEAD")? else {
            return Ok(Pushed::Done);
        };
        let mut command = self.network(root)?;
        let refspec = format!("refs/heads/{branch}:refs/heads/{branch}");
        command.args(["push", "--porcelain", "--no-verify", REMOTE, &refspec]);
        let ran = exec(command, limit)?;
        let stdout = String::from_utf8_lossy(&ran.stdout);
        // `!` marks a refused ref, its reason last, in brackets.
        if let Some(refused) = stdout.lines().find(|line| line.starts_with('!')) {
            if refused.contains("(fetch first)") || refused.contains("(non-fast-forward)") {
                return Ok(Pushed::Behind);
            }
            let reason = refused.rsplit('\t').next().unwrap_or(refused).trim();
            return Err(Error::Failed {
                code: ran.status.code(),
                message: format!("GitHub refused the backup: {reason}"),
            });
        }
        if !ran.status.success() {
            return Err(failed(&ran));
        }
        // Tir's record of GitHub's branch, which a push moves only when the
        // remote's configuration says to.
        self.run(root, &["update-ref", &tracking(branch), &head])?;
        Ok(Pushed::Done)
    }
}

/// A commit's message from the paths it changes: "Back up" and what they
/// belong to, projects by their folders' names.
fn message<'a>(paths: impl Iterator<Item = &'a str>) -> String {
    let mut projects: Vec<&str> = Vec::new();
    let mut dictionary = false;
    let mut library = false;
    for path in paths {
        match path.split_once('/') {
            Some((folder, _)) => {
                if !projects.contains(&folder) {
                    projects.push(folder);
                }
            }
            None if path == "dictionary.txt" => dictionary = true,
            None => library = true,
        }
    }
    projects.sort_unstable();
    let mut parts: Vec<String> = Vec::new();
    const NAMED: usize = 3;
    for project in projects.iter().take(NAMED) {
        parts.push((*project).to_owned());
    }
    if projects.len() > NAMED {
        let more = projects.len() - NAMED;
        parts.push(format!(
            "{more} more {}",
            if more == 1 { "project" } else { "projects" }
        ));
    }
    if dictionary {
        parts.push("the dictionary".into());
    }
    if library && parts.is_empty() {
        parts.push("the library".into());
    }
    match parts.split_last() {
        Some((last, [])) => format!("Back up {last}"),
        Some((last, rest)) => format!("Back up {} and {last}", rest.join(", ")),
        None => "Back up the library".into(),
    }
}

/// Tir's record of GitHub's `branch`.
fn tracking(branch: &str) -> String {
    format!("refs/remotes/{REMOTE}/{branch}")
}

/// How the branch stands against Tir's record of GitHub's.
#[derive(Debug, PartialEq)]
pub struct Standing {
    /// Commits GitHub has not had.
    pub waiting: u32,
    /// Commits GitHub has that the branch lacks.
    pub behind: u32,
    /// When the newest commit GitHub has was made, in milliseconds since 1970.
    pub backed_up: Option<f64>,
}

/// How much of a project or draft GitHub holds.
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Coverage {
    /// None of it.
    None,
    /// It as it is here.
    All,
    /// An older version, without what changed since.
    Older,
}

/// What a push did.
#[derive(Debug, PartialEq)]
pub enum Pushed {
    /// GitHub has every commit.
    Done,
    /// GitHub has commits the branch lacks, so it refused the push.
    Behind,
}

/// Whether `error` says GitHub could not be reached, as when this machine
/// is offline, rather than that it refused.
pub fn unreachable(error: &Error) -> bool {
    const SIGNS: &[&str] = &[
        "could not resolve",
        "temporary failure in name resolution",
        "name or service not known",
        "failed to connect",
        "could not connect",
        "couldn't connect",
        "network is unreachable",
        "no route to host",
        "connection timed out",
        "operation timed out",
        "timeout was reached",
        "connection refused",
        "connection reset",
        "connection closed",
        "recv failure",
    ];
    match error {
        Error::TimedOut => true,
        Error::Failed { message, .. } => {
            let message = message.to_lowercase();
            SIGNS.iter().any(|sign| message.contains(sign))
        }
        _ => false,
    }
}

/// A command that ran to its end.
struct Ran {
    status: std::process::ExitStatus,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}

fn failed(ran: &Ran) -> Error {
    Error::Failed {
        code: ran.status.code(),
        message: said(&String::from_utf8_lossy(&ran.stderr)),
    }
}

/// Runs `command` for at most `limit`; what it printed, or why it failed.
fn output(command: Command, limit: Duration) -> Result<Vec<u8>, Error> {
    let ran = exec(command, limit)?;
    if ran.status.success() {
        Ok(ran.stdout)
    } else {
        Err(failed(&ran))
    }
}

/// Runs `command` for at most `limit`, whether it succeeds or not.
fn exec(mut command: Command, limit: Duration) -> Result<Ran, Error> {
    let mut child = command.spawn().map_err(|error| match error.kind() {
        io::ErrorKind::NotFound => Error::Missing,
        _ => Error::Io(error.to_string()),
    })?;
    let stdout = read_in_thread(child.stdout.take());
    let stderr = read_in_thread(child.stderr.take());
    let Some(status) = wait(&mut child, limit)? else {
        // Its output is left to its threads: a program git started may
        // hold it open for a while yet.
        return Err(Error::TimedOut);
    };
    Ok(Ran {
        status,
        stdout: stdout.join().unwrap_or_default(),
        stderr: stderr.join().unwrap_or_default(),
    })
}

fn read_in_thread(pipe: Option<impl Read + Send + 'static>) -> thread::JoinHandle<Vec<u8>> {
    thread::spawn(move || {
        let mut bytes = Vec::new();
        if let Some(mut pipe) = pipe {
            let _ = pipe.read_to_end(&mut bytes);
        }
        bytes
    })
}

/// Waits for `child` for at most `limit`, then kills it: its exit status,
/// or `None` when it was killed.
fn wait(child: &mut Child, limit: Duration) -> Result<Option<std::process::ExitStatus>, Error> {
    let deadline = Instant::now() + limit;
    let mut pause = Duration::from_millis(1);
    loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|error| Error::Io(error.to_string()))?
        {
            return Ok(Some(status));
        }
        let now = Instant::now();
        if now >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Ok(None);
        }
        thread::sleep(pause.min(deadline - now));
        pause = (pause * 2).min(Duration::from_millis(50));
    }
}

/// What git said on failing, without its hints: the lines of `stderr` on
/// one line, "fatal: " and "error: " left out, and a full stop where a line
/// ends a sentence without one, before a line starting a new one.
fn said(stderr: &str) -> String {
    let lines: Vec<&str> = stderr
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with("hint:"))
        .map(|line| {
            line.strip_prefix("fatal: ")
                .or_else(|| line.strip_prefix("error: "))
                .unwrap_or(line)
        })
        .collect();
    let mut message = String::new();
    for line in lines.into_iter().map(redact) {
        if !message.is_empty() {
            let ended = message.ends_with(['.', '!', '?', ':', '…']);
            if !ended && line.starts_with(|c: char| c.is_uppercase()) {
                message.push('.');
            }
            message.push(' ');
        }
        message.push_str(&line);
    }
    const LONGEST: usize = 400;
    if message.len() > LONGEST {
        let mut end = LONGEST;
        while !message.is_char_boundary(end) {
            end -= 1;
        }
        message.truncate(end);
        message.push('…');
    }
    message
}

/// `text` without the login any address in it carries, such as a token in
/// `https://TOKEN@github.com/…` from a clone made with one: Tir shows and
/// logs git's words and the repository's address, never a credential. The
/// user of an ssh address, such as `ssh://git@…`, is no secret and stays.
pub fn redact(text: &str) -> String {
    let mut kept = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = rest.find("://") {
        let (head, tail) = rest.split_at(at + 3);
        kept.push_str(head);
        let scheme = head[..at]
            .rsplit(|c: char| !c.is_ascii_alphabetic())
            .next()
            .unwrap_or("")
            .to_ascii_lowercase();
        let end = tail
            .find(|c: char| c == '/' || c.is_whitespace() || c == '\'' || c == '"')
            .unwrap_or(tail.len());
        let authority = &tail[..end];
        match authority.rfind('@') {
            Some(at) if scheme == "http" || scheme == "https" || authority[..at].contains(':') => {
                kept.push_str(&authority[at + 1..]);
            }
            _ => kept.push_str(authority),
        }
        rest = &tail[end..];
    }
    kept.push_str(rest);
    kept
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use crate::files::tests::TempDir;
    use std::os::unix::fs::PermissionsExt;

    /// Git in a sandbox of `dir`'s, reading `dir/gitconfig`.
    pub fn sandboxed(dir: &TempDir) -> Git {
        Git::sandboxed(dir.0.join("gitconfig"))
    }

    /// The subjects of `root`'s commits, newest first.
    pub fn subjects(git: &Git, root: &Path) -> Vec<String> {
        match git.text(root, &["log", "--format=%s"]) {
            Ok(log) => log.lines().map(str::to_owned).collect(),
            // No commit yet.
            Err(Error::Failed { .. }) => Vec::new(),
            Err(error) => panic!("git log: {error}"),
        }
    }

    /// The paths `root`'s last commit holds.
    pub fn committed(git: &Git, root: &Path) -> Vec<String> {
        let tree = git
            .text(root, &["ls-tree", "-r", "--name-only", "HEAD"])
            .unwrap();
        tree.lines().map(str::to_owned).collect()
    }

    /// A library in `parent`, holding "Salt Line".
    pub fn library_in(parent: &Path) -> PathBuf {
        let root = parent.join("Screenplays");
        fs::create_dir_all(root.join("Salt Line/drafts")).unwrap();
        fs::write(root.join("Salt Line/project.json"), "{}\n").unwrap();
        fs::write(root.join("Salt Line/drafts/First Draft.tir"), "{}\n").unwrap();
        fs::write(root.join("Salt Line/drafts/First Draft.fountain"), "INT.\n").unwrap();
        root
    }

    fn library(dir: &TempDir) -> PathBuf {
        library_in(&dir.0)
    }

    #[test]
    fn makes_a_repository_that_records_only_tirs_files() {
        let dir = TempDir::new();
        let git = sandboxed(&dir);
        let root = library(&dir);
        assert_eq!(git.repository(&root), Ok(Repository::None));
        git.init(&root).unwrap();
        assert_eq!(git.repository(&root), Ok(Repository::Branch(BRANCH.into())));
        assert_eq!(fs::read_to_string(root.join(".gitignore")).unwrap(), IGNORE);
        // What a crash leaves, and what the writer puts in the library.
        fs::write(root.join("Salt Line/drafts/First Draft.tir.7-0.tmp"), "{").unwrap();
        fs::create_dir_all(root.join(".deleting.7-0.tmp/drafts")).unwrap();
        fs::write(root.join(".deleting.7-0.tmp/project.json"), "{}\n").unwrap();
        fs::write(root.join("Salt Line/research.pdf"), "%PDF").unwrap();
        fs::write(root.join("notes.txt"), "notes").unwrap();
        fs::write(root.join("dictionary.txt"), "Tomás\n").unwrap();
        assert!(git.changed(&root).unwrap());
        assert_eq!(
            git.commit(&root).unwrap().as_deref(),
            Some("Back up Salt Line and the dictionary")
        );
        assert_eq!(
            committed(&git, &root),
            [
                ".gitignore",
                "Salt Line/drafts/First Draft.fountain",
                "Salt Line/drafts/First Draft.tir",
                "Salt Line/project.json",
                "dictionary.txt",
            ]
        );
        assert!(!git.changed(&root).unwrap());
        assert_eq!(git.commit(&root), Ok(None));
        assert_eq!(subjects(&git, &root).len(), 1);
    }

    #[test]
    fn keeps_a_gitignore_already_there() {
        let dir = TempDir::new();
        let git = sandboxed(&dir);
        let root = library(&dir);
        fs::write(root.join(".gitignore"), "*.pdf\n").unwrap();
        git.init(&root).unwrap();
        assert_eq!(
            fs::read_to_string(root.join(".gitignore")).unwrap(),
            "*.pdf\n"
        );
    }

    #[test]
    fn commits_with_the_writers_name_when_git_has_one() {
        let dir = TempDir::new();
        let git = sandboxed(&dir);
        let root = library(&dir);
        git.init(&root).unwrap();
        git.commit(&root).unwrap();
        assert_eq!(
            git.text(&root, &["log", "-1", "--format=%an <%ae>"])
                .unwrap(),
            "Tir <tir@localhost>"
        );
        fs::write(
            dir.0.join("gitconfig"),
            "[user]\n\tname = Mara Ellison\n\temail = mara@example.com\n",
        )
        .unwrap();
        fs::write(root.join("Salt Line/drafts/First Draft.tir"), "{\"x\":1}\n").unwrap();
        assert_eq!(
            git.commit(&root).unwrap().as_deref(),
            Some("Back up Salt Line")
        );
        assert_eq!(
            git.text(&root, &["log", "-1", "--format=%an <%ae>"])
                .unwrap(),
            "Mara Ellison <mara@example.com>"
        );
    }

    #[test]
    fn runs_no_hook_and_signs_nothing() {
        let dir = TempDir::new();
        let git = sandboxed(&dir);
        let root = library(&dir);
        git.init(&root).unwrap();
        // A hook that would refuse every commit, and signing that cannot work.
        let hooks = dir.0.join("hooks");
        fs::create_dir(&hooks).unwrap();
        let hook = hooks.join("pre-commit");
        fs::write(&hook, "#!/bin/sh\nexit 1\n").unwrap();
        fs::set_permissions(&hook, fs::Permissions::from_mode(0o755)).unwrap();
        fs::write(
            dir.0.join("gitconfig"),
            format!(
                "[core]\n\thooksPath = {}\n[commit]\n\tgpgSign = true\n[gpg]\n\tprogram = /nonexistent/gpg\n",
                hooks.display()
            ),
        )
        .unwrap();
        assert!(git.commit(&root).unwrap().is_some());
    }

    #[test]
    fn stays_in_the_library_inside_another_repository() {
        let dir = TempDir::new();
        let git = sandboxed(&dir);
        let outer = dir.0.join("outer");
        fs::create_dir(&outer).unwrap();
        git.run(&outer, &["init", "-q"]).unwrap();
        // A library inside another repository's work tree is no repository
        // until Tir makes it one of its own.
        let root = library_in(&outer);
        assert_eq!(git.repository(&root), Ok(Repository::None));
        git.init(&root).unwrap();
        git.commit(&root).unwrap();
        assert_eq!(subjects(&git, &root), ["Back up Salt Line"]);
        assert!(subjects(&git, &outer).is_empty());
        assert_eq!(
            git.text(&outer, &["status", "--porcelain"]).unwrap(),
            "?? Screenplays/"
        );
        // Whatever the environment names, each command names the library's
        // repository and nothing else's.
        let command = git.command(&root);
        let envs: Vec<_> = command.get_envs().collect();
        for name in ELSEWHERE {
            let value = envs
                .iter()
                .find(|(key, _)| key == name)
                .map(|(_, value)| *value);
            let expected = match *name {
                "GIT_DIR" => Some(root.join(".git")),
                "GIT_WORK_TREE" => Some(root.clone()),
                _ => None,
            };
            assert_eq!(
                value.map(|value| value.map(PathBuf::from)),
                Some(expected),
                "{name}"
            );
        }
    }

    /// Git that is not there, as on a machine without git.
    pub fn missing(dir: &TempDir) -> Git {
        Git {
            program: dir.0.join("no-git-here"),
            sandbox: Some(dir.0.join("gitconfig")),
        }
    }

    #[test]
    fn reports_a_missing_git() {
        let dir = TempDir::new();
        let git = missing(&dir);
        let root = library(&dir);
        fs::create_dir(root.join(".git")).unwrap();
        assert_eq!(git.repository(&root), Err(Error::Missing));
        assert_eq!(git.commit(&root), Err(Error::Missing));
        assert_eq!(
            Error::Missing.to_string(),
            "Tir could not find git on this machine."
        );
    }

    #[test]
    fn reports_a_damaged_repository() {
        let dir = TempDir::new();
        let git = sandboxed(&dir);
        let root = library(&dir);
        git.init(&root).unwrap();
        git.commit(&root).unwrap();
        fs::remove_file(root.join(".git/HEAD")).unwrap();
        let Err(Error::Failed { message, .. }) = git.repository(&root) else {
            panic!("a repository without HEAD read as whole");
        };
        assert!(message.starts_with("not a git repository"), "{message}");
        // A `.git` file that names no repository.
        let other = dir.0.join("other");
        fs::create_dir(&other).unwrap();
        fs::write(other.join(".git"), "junk\n").unwrap();
        let Err(Error::Failed { message, .. }) = git.repository(&other) else {
            panic!("a broken .git file read as a repository");
        };
        assert!(message.starts_with("invalid gitfile format"), "{message}");
    }

    #[test]
    fn finds_a_detached_head_and_an_operation_under_way() {
        let dir = TempDir::new();
        let git = sandboxed(&dir);
        let root = library(&dir);
        git.init(&root).unwrap();
        git.commit(&root).unwrap();
        git.run(&root, &["checkout", "-q", "--detach"]).unwrap();
        assert_eq!(git.repository(&root), Ok(Repository::Detached));
        git.run(&root, &["checkout", "-q", BRANCH]).unwrap();
        let head = git.text(&root, &["rev-parse", "HEAD"]).unwrap();
        fs::write(root.join(".git/MERGE_HEAD"), format!("{head}\n")).unwrap();
        assert_eq!(git.repository(&root), Ok(Repository::Busy("merge")));
        fs::remove_file(root.join(".git/MERGE_HEAD")).unwrap();
        fs::create_dir(root.join(".git/rebase-merge")).unwrap();
        assert_eq!(git.repository(&root), Ok(Repository::Busy("rebase")));
        fs::remove_dir(root.join(".git/rebase-merge")).unwrap();
        fs::write(root.join(".git/SQUASH_MSG"), "Squashed\n").unwrap();
        assert_eq!(git.repository(&root), Ok(Repository::Busy("squash merge")));
        fs::remove_file(root.join(".git/SQUASH_MSG")).unwrap();
        // A stash popped over other changes leaves its conflict, and no file
        // in .git saying so.
        let draft = root.join("Salt Line/drafts/First Draft.tir");
        fs::write(&draft, "{\"stashed\":1}\n").unwrap();
        git.run(&root, &["stash", "-q"]).unwrap();
        fs::write(&draft, "{\"committed\":1}\n").unwrap();
        git.commit(&root).unwrap();
        assert!(git.run(&root, &["stash", "pop", "-q"]).is_err());
        assert_eq!(git.repository(&root), Ok(Repository::Conflicted));
    }

    #[test]
    fn stops_a_command_that_takes_too_long() {
        let started = Instant::now();
        let mut command = Command::new("sleep");
        command
            .arg("10")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        assert_eq!(
            output(command, Duration::from_millis(200)),
            Err(Error::TimedOut)
        );
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn names_what_a_commit_backs_up() {
        let cases: [(&[&str], &str); 6] = [
            (&["Salt Line/drafts/First Draft.tir"], "Back up Salt Line"),
            (
                &[
                    "Salt Line/project.json",
                    "Low Tide/drafts/A.tir",
                    "Salt Line/drafts/A.tir",
                ],
                "Back up Low Tide and Salt Line",
            ),
            (&["dictionary.txt"], "Back up the dictionary"),
            (&[".gitignore"], "Back up the library"),
            (
                &[
                    "A/project.json",
                    "B/project.json",
                    "C/project.json",
                    "D/project.json",
                    "E/x",
                    "dictionary.txt",
                ],
                "Back up A, B, C, 2 more projects and the dictionary",
            ),
            (
                &["A/x", "B/x", "C/x", "D/x", ".gitignore"],
                "Back up A, B, C and 1 more project",
            ),
        ];
        for (paths, expected) in cases {
            assert_eq!(message(paths.iter().copied()), expected, "{paths:?}");
        }
    }

    #[test]
    fn leaves_out_the_login_an_address_carries() {
        assert_eq!(
            said(
                "fatal: unable to access 'https://mara:ghp_secret@github.com/mara/s.git/': The requested URL returned error: 403\n"
            ),
            "unable to access 'https://github.com/mara/s.git/': The requested URL returned error: 403"
        );
        assert_eq!(
            redact("https://ghp_secret@github.com/mara/s.git"),
            "https://github.com/mara/s.git"
        );
        assert_eq!(
            redact("ssh://git:pass@example.com/s.git"),
            "ssh://example.com/s.git"
        );
        // Users that are no secret, and addresses with no login, stay.
        for kept in [
            "ssh://git@github.com/mara/s.git",
            "git@github.com:mara/s.git",
            "https://github.com/mara/s.git",
            "/home/mara/s.git",
            "",
        ] {
            assert_eq!(redact(kept), kept);
        }
    }

    #[test]
    fn keeps_what_git_said_without_its_hints() {
        assert_eq!(
            said(
                "error: failed to push some refs to 'x'\nhint: Updates were rejected\nhint: use git pull\n"
            ),
            "failed to push some refs to 'x'"
        );
        assert_eq!(
            said(
                "fatal: '/r.git' does not appear to be a git repository\nfatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.\n"
            ),
            "'/r.git' does not appear to be a git repository. Could not read from remote repository. Please make sure you have the correct access rights and the repository exists."
        );
        assert_eq!(
            said(
                "ssh: Could not resolve hostname github.com: Temporary failure in name resolution\nfatal: Could not read from remote repository.\n"
            ),
            "ssh: Could not resolve hostname github.com: Temporary failure in name resolution. Could not read from remote repository."
        );
    }

    /// Runs git as on another machine, or to make a bare repository: in
    /// `cwd`, reading only `dir/gitconfig`, outside any library.
    pub fn elsewhere(dir: &TempDir, cwd: &Path, args: &[&str]) -> String {
        let mut command = Command::new("git");
        for name in ELSEWHERE {
            command.env_remove(name);
        }
        let output = command
            .current_dir(cwd)
            .env("GIT_CONFIG_GLOBAL", dir.0.join("gitconfig"))
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_ALLOW_PROTOCOL", "file")
            .env("LC_ALL", "C")
            .args([
                "-c",
                "user.name=Other",
                "-c",
                "user.email=other@example.com",
            ])
            .args(args)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "git {args:?}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8(output.stdout)
            .unwrap()
            .trim_end()
            .to_owned()
    }

    /// A bare repository standing for GitHub's, `dir/github.git`, empty.
    pub fn github(dir: &TempDir) -> PathBuf {
        let bare = dir.0.join("github.git");
        elsewhere(
            dir,
            &dir.0,
            &[
                "init",
                "-q",
                "--bare",
                "--initial-branch",
                BRANCH,
                "github.git",
            ],
        );
        bare
    }

    /// The library with one commit, connected to `remote`.
    fn connected(dir: &TempDir, git: &Git, remote: &Path) -> PathBuf {
        let root = library(dir);
        git.init(&root).unwrap();
        git.commit(&root).unwrap();
        git.run(&root, &["remote", "add", REMOTE, remote.to_str().unwrap()])
            .unwrap();
        root
    }

    fn edit(root: &Path, text: &str) {
        fs::write(root.join("Salt Line/drafts/First Draft.tir"), text).unwrap();
    }

    #[test]
    fn pushes_to_github_and_counts_what_waits() {
        let dir = TempDir::new();
        let git = sandboxed(&dir);
        let bare = github(&dir);
        let root = connected(&dir, &git, &bare);
        assert_eq!(git.remote(&root).unwrap(), Some(bare.display().to_string()));
        // Never pushed: every commit waits.
        let standing = git.standing(&root, BRANCH).unwrap();
        assert_eq!(
            (standing.waiting, standing.behind, standing.backed_up),
            (1, 0, None)
        );
        // GitHub's repository is empty: there is nothing to hear yet.
        git.fetch(&root, BRANCH, NETWORK).unwrap();
        assert_eq!(git.push(&root, BRANCH, NETWORK), Ok(Pushed::Done));
        let head = git.text(&root, &["rev-parse", "HEAD"]).unwrap();
        assert_eq!(elsewhere(&dir, &bare, &["rev-parse", BRANCH]), head);
        let standing = git.standing(&root, BRANCH).unwrap();
        assert_eq!((standing.waiting, standing.behind), (0, 0));
        let committed = git.text(&root, &["log", "-1", "--format=%ct"]).unwrap();
        assert_eq!(
            standing.backed_up,
            Some(committed.parse::<f64>().unwrap() * 1000.0)
        );
        edit(&root, "{\"two\":2}\n");
        git.commit(&root).unwrap();
        edit(&root, "{\"three\":3}\n");
        git.commit(&root).unwrap();
        assert_eq!(git.standing(&root, BRANCH).unwrap().waiting, 2);
        assert_eq!(git.push(&root, BRANCH, NETWORK), Ok(Pushed::Done));
        assert_eq!(git.standing(&root, BRANCH).unwrap().waiting, 0);
        assert_eq!(
            elsewhere(&dir, &bare, &["rev-list", "--count", BRANCH]),
            "3"
        );
    }

    #[test]
    fn a_github_ahead_refuses_the_push_and_nothing_is_merged() {
        let dir = TempDir::new();
        let git = sandboxed(&dir);
        let bare = github(&dir);
        let root = connected(&dir, &git, &bare);
        git.push(&root, BRANCH, NETWORK).unwrap();
        // The other machine pushes a change to the same draft.
        elsewhere(
            &dir,
            &dir.0,
            &["clone", "-q", bare.to_str().unwrap(), "laptop"],
        );
        let laptop = dir.0.join("laptop");
        edit(&laptop, "{\"laptop\":1}\n");
        elsewhere(&dir, &laptop, &["commit", "-q", "-am", "On the laptop"]);
        elsewhere(&dir, &laptop, &["push", "-q", "origin", BRANCH]);
        // This machine records its own change.
        edit(&root, "{\"desktop\":1}\n");
        git.commit(&root).unwrap();
        let head = git.text(&root, &["rev-parse", "HEAD"]).unwrap();
        assert_eq!(git.push(&root, BRANCH, NETWORK), Ok(Pushed::Behind));
        // Once Tir has heard, it says so too.
        git.fetch(&root, BRANCH, NETWORK).unwrap();
        assert_eq!(git.push(&root, BRANCH, NETWORK), Ok(Pushed::Behind));
        let standing = git.standing(&root, BRANCH).unwrap();
        assert_eq!((standing.waiting, standing.behind), (1, 1));
        // Nothing merged: the branch, the draft and GitHub are as they were.
        assert_eq!(git.text(&root, &["rev-parse", "HEAD"]).unwrap(), head);
        assert_eq!(
            fs::read_to_string(root.join("Salt Line/drafts/First Draft.tir")).unwrap(),
            "{\"desktop\":1}\n"
        );
        assert_eq!(
            elsewhere(&dir, &bare, &["log", "-1", "--format=%s", BRANCH]),
            "On the laptop"
        );
        assert!(!git.changed(&root).unwrap());
    }

    #[test]
    fn an_unreachable_github_fails_until_it_is_back() {
        let dir = TempDir::new();
        let git = sandboxed(&dir);
        let bare = github(&dir);
        let root = connected(&dir, &git, &bare);
        let away = dir.0.join("away.git");
        fs::rename(&bare, &away).unwrap();
        let error = git.push(&root, BRANCH, NETWORK).unwrap_err();
        assert!(
            matches!(&error, Error::Failed { message, .. } if message.contains("does not appear to be a git repository")),
            "{error:?}"
        );
        assert!(git.fetch(&root, BRANCH, NETWORK).is_err());
        assert_eq!(git.standing(&root, BRANCH).unwrap().waiting, 1);
        fs::rename(&away, &bare).unwrap();
        assert_eq!(git.push(&root, BRANCH, NETWORK), Ok(Pushed::Done));
        assert_eq!(git.standing(&root, BRANCH).unwrap().waiting, 0);
    }

    #[test]
    fn tells_an_unreachable_github_from_a_refusal() {
        // What git says, with curl's and ssh's words, offline.
        let offline = [
            "unable to access 'https://github.com/you/screenplays.git/': Could not resolve host: github.com",
            "unable to access 'https://github.com/you/screenplays.git/': Failed to connect to github.com port 443 after 35 ms: Could not connect to server",
            "ssh: Could not resolve hostname github.com: Temporary failure in name resolution Could not read from remote repository.",
            "ssh: connect to host github.com port 22: Network is unreachable Could not read from remote repository.",
            "ssh: connect to host github.com port 22: Connection timed out Could not read from remote repository.",
        ];
        for message in offline {
            let error = Error::Failed {
                code: Some(128),
                message: message.into(),
            };
            assert!(unreachable(&error), "{message}");
        }
        assert!(unreachable(&Error::TimedOut));
        let refused = [
            "git@github.com: Permission denied (publickey). Could not read from remote repository.",
            "remote: Repository not found. repository 'https://github.com/you/screenplays.git/' not found",
            "could not read Username for 'https://github.com': terminal prompts disabled",
            "Host key verification failed. Could not read from remote repository.",
        ];
        for message in refused {
            let error = Error::Failed {
                code: Some(128),
                message: message.into(),
            };
            assert!(!unreachable(&error), "{message}");
        }
        assert!(!unreachable(&Error::Missing));
    }

    #[test]
    fn tells_how_much_of_a_project_or_draft_github_holds() {
        let dir = TempDir::new();
        let git = sandboxed(&dir);
        let bare = github(&dir);
        let root = connected(&dir, &git, &bare);
        let draft = "Salt Line/drafts/First Draft.tir";
        // Never pushed: none of it.
        assert_eq!(
            git.coverage(&root, BRANCH, "Salt Line/").unwrap(),
            Coverage::None
        );
        git.push(&root, BRANCH, NETWORK).unwrap();
        assert_eq!(
            git.coverage(&root, BRANCH, "Salt Line/").unwrap(),
            Coverage::All
        );
        assert_eq!(git.coverage(&root, BRANCH, draft).unwrap(), Coverage::All);
        // Saved since, recorded or not: an older version.
        edit(&root, "{\"later\":1}\n");
        assert_eq!(git.coverage(&root, BRANCH, draft).unwrap(), Coverage::Older);
        git.commit(&root).unwrap();
        assert_eq!(
            git.coverage(&root, BRANCH, "Salt Line/").unwrap(),
            Coverage::Older
        );
        git.push(&root, BRANCH, NETWORK).unwrap();
        assert_eq!(
            git.coverage(&root, BRANCH, "Salt Line/").unwrap(),
            Coverage::All
        );
        // A new draft not yet recorded leaves its project older.
        fs::write(root.join("Salt Line/drafts/Rewrite.tir"), "{}\n").unwrap();
        assert_eq!(
            git.coverage(&root, BRANCH, "Salt Line/").unwrap(),
            Coverage::Older
        );
        assert_eq!(
            git.coverage(&root, BRANCH, "Salt Line/drafts/Rewrite.tir")
                .unwrap(),
            Coverage::None
        );
        // A name with pattern characters is only itself.
        fs::create_dir_all(root.join("[Salt] Line/drafts")).unwrap();
        fs::write(root.join("[Salt] Line/project.json"), "{}\n").unwrap();
        assert_eq!(
            git.coverage(&root, BRANCH, "[Salt] Line/").unwrap(),
            Coverage::None
        );
        assert_eq!(git.coverage(&root, BRANCH, "S*/").unwrap(), Coverage::None);
    }
}
