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
            command
                .env("GIT_CONFIG_GLOBAL", config)
                .env("GIT_CONFIG_NOSYSTEM", "1")
                .env("GIT_ALLOW_PROTOCOL", "file");
        }
        command
    }

    /// Runs git with `args` in `root`; what it printed.
    pub fn run(&self, root: &Path, args: &[&str]) -> Result<Vec<u8>, Error> {
        // Git would start nowhere else, and the failure would read as no git.
        if !root.is_dir() {
            return Err(Error::Io(format!("{} is not a folder", root.display())));
        }
        let mut command = self.command(root);
        command.args(args);
        output(command, LOCAL)
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
        const UNDER_WAY: [(&str, &str); 5] = [
            ("MERGE_HEAD", "merge"),
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
        Ok(Repository::Branch(branch))
    }

    /// Makes `root` a repository on `BRANCH`, ignoring what `IGNORE` says
    /// unless it already has a `.gitignore`.
    pub fn init(&self, root: &Path) -> Result<(), Error> {
        self.run(root, &["init", "-q", "--initial-branch", BRANCH])?;
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

/// Runs `command` for at most `limit`; what it printed, or why it failed.
fn output(mut command: Command, limit: Duration) -> Result<Vec<u8>, Error> {
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
    let stdout = stdout.join().unwrap_or_default();
    let stderr = stderr.join().unwrap_or_default();
    if status.success() {
        Ok(stdout)
    } else {
        Err(Error::Failed {
            code: status.code(),
            message: said(&String::from_utf8_lossy(&stderr)),
        })
    }
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
/// one line, "fatal: " and "error: " left out.
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
    let mut message = lines.join(" ");
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
            "'/r.git' does not appear to be a git repository Could not read from remote repository. Please make sure you have the correct access rights and the repository exists."
        );
    }
}
