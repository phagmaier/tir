# Tir: architecture

A short map of how Tir is built: the rules the design rests on, where
things live, and how to run and check things. Product behaviour and its
terms are in [brief.md](brief.md); outside-world facts the code depends on
are in [findings.md](findings.md). Correct stale descriptions of the
implementation, but do not treat a violation of a design rule as a
change to the rule.

## Design rules

The user delegated these technical choices during planning.

1. **One layout engine decides every line break and page break.** The
   editor, PDF, page counts and sidebar use its output; the browser
   never wraps script text. This is a Tir invariant, not evidence of
   [Final Draft page parity](brief.md#page-parity).
2. **The script model is the source of truth.** The `.tir` draft is the
   authoritative on-disk representation. Fountain, FDX and PDF are
   interchange or presentation formats, not alternative drafts.
3. **A pure core with a thin shell.** The model, layout engine, file
   formats and checks are plain TypeScript with no DOM, ProseMirror or
   Tauri imports, so they test quickly in Node. The interface is
   TypeScript with ProseMirror. The Rust side only reads and writes files,
   runs git and opens system dialogs.
4. **Tir writes inside the library or its own settings file.** An export
   may also create a new file at the destination the writer picks in the
   native Save dialog; it never replaces an existing file. Import sources
   are read-only. The Rust side enforces the boundary ([File access](#file-access)).
   WebKitGTK keeps its own cache and storage for Tir under
   `~/.local/share/dev.tir.desktop/`.
5. **Tests never touch the real library, the real settings file or
   GitHub.** They use temporary directories and a local bare git
   repository.

## Repository layout

| Path | Responsibility |
| --- | --- |
| `src/core/` | Pure TypeScript script model, disk formats and the PDF, layout and pagination, and derived data such as the scene and page map |
| `src/ui/`, `index.html` | The Desk, ProseMirror and the engine's page projection; saving, projects, drafts, and the bridge to the shell |
| `src-tauri/` | Tauri and its capabilities; Rust owns settings, library access, backup with git, native dialogs, and window closing |
| `tools/` | Final Draft PDF parity and native editor placement and timing checks |
| `docs/`, `docs/prototype/` | Product decisions, architecture, findings, active plan, and approved visual references |
| `flake.nix`, `mise.toml` | Nix release, system libraries, pinned runtimes and development tasks |

Tests sit beside the code they test as `*.test.ts`.

**The core's purity guard** (design rule 3) has two parts. Biome's
`noRestrictedImports`, in `biome.json`'s override for `src/core/`, refuses
ProseMirror, Tauri, `ui/` and Node imports; core tests are exempt so they can
read fixtures. `src/core/tsconfig.json` type-checks the core without the DOM
library or ambient types, so `document`, `window` or `process` fail.
`src/core/purity.test.ts` proves both parts still fire.

## Library on disk

```
~/Screenplays/                    the library, and the backed-up git repository
  .git/                           the repository, made by Tir unless the library already is one
  .gitignore                      what git leaves out: everything but Tir's own files ([Backup](#backup))
  dictionary.txt                  the words the writer added to spell check's dictionary, one a line
  Salt Line/                      one project, its folder named from its name
    project.json                  its name, drafts and active draft
    drafts/
      First Draft.tir             a draft: title page and elements, its file named from its name
      First Draft.fountain        its Fountain copy, written with it every time; Tir never reads it
      Rewrite, Nov 2026.tir
      Rewrite, Nov 2026.fountain
```

```json
{
  "format": "tir-project",
  "version": 1,
  "name": "Salt Line",
  "activeDraft": "Rewrite, Nov 2026.tir",
  "drafts": [
    {"name":"First Draft","file":"First Draft.tir"},
    {"name":"Rewrite, Nov 2026","file":"Rewrite, Nov 2026.tir"}
  ]
}
```

- **Where.** The library is the folder the settings file's `library`
  names ([Settings](#settings)); otherwise `Screenplays` in the home
  folder, or in `TIR_CONFIG_DIR` when that is set, so a trial run gets a
  library of its own. The Rust side finds it at start
  (`library::root`) and makes it, and syncs each folder it makes, with
  the first project.
- **The project file** is read and written by `src/core/project-file.ts`
  as the draft file is: keys in a fixed order, one draft per line, and a
  damaged or newer file refused whole with a readable message, so Tir
  never writes over a project it could not read. A draft's `file` must be
  one `.tir` entry of `drafts/`. Raise `PROJECT_VERSION` for any change an
  older Tir would misread. The same module gives a project as each change
  leaves it (`newProject`, `withNewDraft`, `withDraftRenamed`,
  `withoutDraft`, `withActiveDraft`): a project keeps at least one draft,
  and deleting the active one makes the draft before it, or else after it,
  active.
- **Names.** A project's folder and a draft's file are named from the
  names the writer gives them (`src/core/file-names.ts`), readable on
  GitHub, accents kept (NFC), but one entry of a folder on any system the
  library may be cloned to: `/ \ |` and `:` become dashes, `"` an
  apostrophe, `* ? < >` go, as do control and bidirectional characters, a
  leading dot (so never `.`, `..` or `.git`) and trailing dots and spaces;
  Windows' device names gain `_`; at most 120 bytes; "Untitled" when
  nothing is left (findings, "Library on disk"). A name already in the
  folder, ignoring capitals and how accents are encoded (compared through
  small letters, capitals and back, so Greek "σ" and "ς" meet, as do "ß",
  "ẞ" and "ss"), gets " 2", " 3" and so
  on; a draft's file is free only when its Fountain copy's name is too.
  Renaming a project or draft renames its folder or file.
- **Who does what.** `src/ui/library.ts` makes every name and every
  file's text from the core and calls the Rust side's commands
  (`src-tauri/src/library.rs`), naming a project by its folder and a
  draft by its file. A draft's text always goes with its Fountain copy's
  (`DraftTexts`): making a project or a draft writes both, and so does a
  save (`write_draft`, which only replaces a draft that is there, never
  makes one, nor replaces one that has changed since Tir saw it:
  [Backup](#backup), "Paused"). The Rust side refuses any name that is not one entry of its
  folder or that starts with a dot, and any link where it expects a
  project or `drafts` folder, a project file or a draft, or a link or
  folder where a copy goes. These checks assume nobody else is changing
  the library's directory entries while Tir is using them. It never makes
  a folder or draft over an existing entry: it claims the name first
  (a new folder, or a new empty file, and the copy's name must be free).
  Project deletion requires a `project.json` file and refuses an explicit
  foreign format, but permits deletion when the file is damaged. Use a
  dedicated folder: see the [foreign project caveat](plan.md#known-gaps).
  A change to a project that depends on its manifest sends `was`, the text
  the page used, and is refused when the file now differs, so a
  change made from an older reading never undoes a newer one; the
  commands run one at a time, and Tir does not exit while one runs
  (`finish_commands`).
- **Order.** Each change leaves every project whole if Tir stops or fails
  part way: `project.json` names only drafts that are there. A new
  project's `project.json` is written last, after its draft and copy, and
  a project that fails to be made is removed whole; a new draft and its
  copy are written before the project names it, both removed if either
  fails, and kept if naming it fails; a save writes the draft, then its
  copy, so the copy is never newer than the draft. A renamed draft and its
  Fountain copy, if present, are copied to the new names and synced before
  the project names the new draft. Renaming or deleting a draft cleans up
  the old files only once the new project file is durable. Cleanup
  failures cannot undo a published change: the saver must use the new place.
  A project folder is renamed over an empty folder claimed first, and a
  deleted project is first moved to a hidden `.deleting.<pid>-<n>.tmp`
  folder, then removed. Once a renamed project is in its new folder, or a
  deleted one has left the library, the change is reported done even if
  syncing the library's folder or removing the files fails after, since
  the page would otherwise keep saving to a folder that is gone; and once
  a new project file is in place (`publish_project`), the change it makes
  is reported done even if syncing its folder fails, since the page would
  otherwise keep a reading the file no longer holds. A draft
  the project does not name harms nothing: its name stays taken.
- **Listing** (`list_library`) gives every entry's name that is not
  hidden, and for each folder that is not a link its `project.json` text,
  the entries of its `drafts/`, and when each draft file there was last
  written (`edited`, the file's modification time, for the draft menu's
  dates and the Projects screen's last edit); `listLibrary` reads each.
  A folder whose project file is missing, damaged, newer or a link comes back with the
  reason, never silently dropped. After a change fails, listing again
  shows what is there.
- **The writer's dictionary** is `dictionary.txt` in the library
  (`read_dictionary`, `add_to_dictionary`): plain text, one word a line,
  which the writer may edit. Adding a word appends a line unless one holds
  it, making the library if need be, so a word may come before the first
  project; a word with white space or control characters, or over 100
  bytes, is refused, as is a link or folder of that name. The listing
  names it, so no project folder takes the name.

## The draft file

A draft is one `.tir` file, read and written by `src/core/draft-file.ts`
from the model in `src/core/model.ts`. It is a single JSON document with its
keys always in the same order and each element on its own line, so a git
diff of a draft reads like the script:

```json
{
  "format": "tir-draft",
  "version": 1,
  "titlePage": {
    "title": "Salt Line",
    "credit": "Written by",
    "authors": "Mara Ellison",
    "source": "",
    "contact": "",
    "draftDate": "",
    "showDraftDate": false
  },
  "elements": [
    {"type":"sceneHeading","text":"INT. HARBOUR OFFICE - NIGHT","pageBreakBefore":true},
    {"type":"action","text":"The gate is locked.","bold":[[12,18]],"centred":true},
    {"type":"character","text":"TOMÁS","dual":true},
    {"type":"dialogue","text":"Line one\nline two"}
  ]
}
```

- `type` is one of `sceneHeading`, `action`, `character`, `parenthetical`,
  `dialogue`, `transition`, `shot`, `general`.
- `text` is as typed. Layout applies capitals; a parenthetical keeps its
  parentheses in the text. `\n` is a line break inside the element.
- `bold`, `italic` and `underline` list spans `[start, end)` in UTF-16 code
  units, sorted and merged; an unstyled element has none.
- `centred`, `dual` and `pageBreakBefore` appear only when true. `dual` is
  allowed only on a character cue: its speech sits beside the one before it.
- Reading refuses the whole file, with a readable message, when it is not
  complete JSON, not a Tir draft, from a newer format version, or holds an
  unknown field or a value out of range. Writing reads its own output back
  and throws rather than save a file Tir would refuse. Raise `DRAFT_VERSION`
  for any change an older Tir would misread.
- A draft's name is not in its file: the project records it (`DraftInfo` in
  the model; [Library on disk](#library-on-disk)).

## Writing files

`src-tauri/src/files.rs` replaces a file so that it is always whole, old or
new: the bytes go to a temporary file beside it, `NAME.<pid>-<n>.tmp`
created new and owner-only (the first `n` with no file of that name).
Tir syncs it, renames it over the file, then syncs the directory so the
rename reaches disk. Existing files at candidate temporary names
are never opened, replaced or removed. A failed write removes its own
temporary file; a crash can leave it behind without a later save
reusing it. Settings and library files use this replacement path.
Exports publish the synced temporary file with a hard link instead of a
rename, so an existing name, including a symlink, cannot be replaced.
The destination filesystem must support hard links.
A script's file is read as UTF-8 and refused, rather than read with
replacement characters, when it is not.

## File access

The explicitly selected local `main` window capability
(`src-tauri/capabilities/default.json`) grants only `core:event:allow-listen`
for `tir://close` and `tir://backup`. Tir's own commands are available to
the bundled page. No file system plugin is registered, the asset protocol
is off, and none of the dialog plugin's commands is granted. User data
goes through Tir's Rust commands: the settings file (`read_settings`,
`write_settings`); the library, by the names `library.rs` checks
([Library on disk](#library-on-disk)); and paths picked through native
dialogs (`dialogs.rs`). Open and import only read the source. Exports
create a new file at the chosen path and refuse to replace anything
already there, including a symlink.
The page never names a path, and the Rust side keeps every path it uses;
it tells the page the library's place only to show it (`library_place`,
"~/Screenplays" for the empty library), and no command takes one back. Nor can the
page move the library: `write_settings` refuses settings that name a
library other than the one the file named when Tir started.

The release CSP denies by default, permits bundled scripts, styles, fonts
and workers, and permits connections only to the app's origin and Tauri
IPC. Only individual style attributes may be inline, for the editor's
engine-computed positions; no inline script or eval is allowed. Vite's
development policy is separate. The release does not build Tauri's
devtools feature, and the installed wrapper removes WebKitGTK's remote
inspector environment variables. The development inspector remains
available through the explicit environment in [Measuring the editor](#measuring-the-editor).

## Saving and opening

`src/ui/saving.ts` owns the [save flow](brief.md#saving-and-backup) for
both the editor document and title page:

- **Save the right snapshot.** One save runs at a time. `settle` waits
  for it and saves until the draft and copy hold the current script.
  Returning to the already saved state needs no write, except after a
  failure: the draft may be newer than the copy.
- **Bound the loss.** A change waits for a one-second pause, but no more
  than `SAVE_WITHIN_MS` (3 s) after the first change no save has taken.
  Only one timer-started save waits behind a save under way, so a slow
  save does not queue one save per key. See the [abrupt-exit measurement](findings.md#typing-baseline).
- **Say what a conflict needs.** `write_draft` reports `changed` when the
  draft has changed since Tir saw it (`library::changed`), and
  `saveDraft` rejects with `DraftChanged`. The saver's message then tells
  how to keep the script on screen and promises no retry. Other failures
  say Tir tries again.
- **Keep serialization off the interface thread.** The page extracts
  the model with unchanged elements reused; `draft-texts.worker.ts`
  writes both texts, falling back to the interface thread if needed.
  Rust publishes both files. See the [timings](findings.md#typing-baseline).
- **Keep close ordering.** `closing.rs` holds the window for the page to
  stop edits, settle the right draft and finish project/settings actions.
  Cancel leaves the editor usable after a save error; a deliberate
  second close after five seconds can still discard unsaved edits.
  Rust finishes any library command already under way before backup and
  exit. Tauri's built-in listener outlives a page load and its `destroy`
  needs a capability Tir does not grant ([Desktop stack](findings.md#desktop-stack)).

What Tir opens is `src/ui/opening.ts`'s. At launch (`openAtLaunch`) it is
the active draft of the project the settings file's `project` names, else
of the library's first project; with none, or when the draft cannot be
read, nothing opens and the Projects screen shows instead, the editor
holding an empty script, not in the library, unseen behind it. A project
or draft that cannot be read is reported in a message box and never
written.

The Projects screen (`projects-screen.ts`; Ctrl+O or the top bar's project
name) is part of the same page. It covers the writing window, which
stays mounted beneath it with `visibility: hidden`, so going back (Esc, or
the open project's row) finds the script, caret, undo and scroll as they
were; the document keeps its scroll, its scrollbar hidden. The screen's
list scrolls in a container of its own, apart from the script, and its
one key listener is added only while it shows, catching the writing
window's keys on the way down so they do nothing there. It saves the
script on screen before it lists the library, so the open project's row
is current. Each row's pages are counted by reading and paginating the
project's active draft on the interface thread, one project at a time
after the list shows, and kept until the draft's file time changes
(`PageCounter`); its last edit is the newest of its drafts' file times.
A project whose name another row shares shows its folder (`Row.showFolder`),
which no two share, in its row and Delete confirmation; Import's list of
projects does the same among its choices (`repeated`).

What the screen does is `projects.ts`'s `Projects`, one action at a time.
Opening or making a project first settles the saver (`false` keeps the
script on screen and says why), then shows the new script (`Editor.open`,
`Saver.show`, the settings file's `project`). Renaming the project on
screen settles first, then
moves the saver to the new folder (`Saver.move`) and records it in the
settings. Deleting the project on screen waits for its save under way or
waiting, then leaves no script open: the editor gets an empty script not
in the library, the settings name no project, and the screen offers no
way back. Import… opens the native file chooser via `dialogs.rs`, then
the Projects screen's destination and report dialogs. `Projects` commits
the parsed script as a new project or inactive draft of a selected
project; Open it reads that draft and makes it active. Failures are
message boxes.

The draft menu (`draft-menu.ts`) takes dates from the library listing.
While an action (`drafts.ts`) settles and commits, the writing window
cannot edit or open another script. Switch and delete read the draft
that will take the screen before changing the project file, so an
unreadable replacement leaves the draft on screen and the library
unchanged. Fork uses the saver's current script and title page. Rename
moves the saver without replacing the editor state, keeping the caret
and undo history. Export PDF… and Export Fountain… write the saver's
current script and title page; neither depends on a successful library
save.

The title page's form and preview scroll in a fixed layer over the
mounted script. Hiding the script without unmounting it leaves its
selection and undo history alone. The preview does not use the
editor's page projection; its places come from `TITLE_PAGE` and `PAGE`
in `src/core/format.ts`, which the PDF uses too.

## Backup

Backup (brief, "Saving and backup") is `src-tauri/src/backup.rs`'s, on a
thread of its own, so neither git nor GitHub ever holds up the interface;
`git.rs` runs git. Its times are `backup::TIMING`.

- **When.** Each library command that may change the library tells
  backup (`change` in `library.rs`'s commands), and backup records the
  changes as one commit once the library has had no change for three
  minutes (`quiet`), then pushes. Back up now (`back_up_now`) records and
  pushes at once. At closing, on `RunEvent::Exit` after the library's
  command under way has finished (`finish_commands`), backup records what
  is left and attempts one last sync. Tir holds the instance lock through
  that sync: another instance must not fetch or push while this one still
  updates the tracking ref. A check already under way finishes first.
  At launch, changes git has not recorded, made while Tir was closed or
  left by a Tir that stopped, are recorded after the quiet spell, and backup asks
  GitHub at once. Backup holds the library's command lock
  (`Library::busy`) while it records, never while it talks to GitHub, so
  no save writes mid-commit and none waits for the network. The commands
  that wait for backup (`back_up_now`, `resume_backup`,
  `connect_repository`) run on a blocking thread (`blocking` in `lib.rs`),
  never on one the async runtime shares.
- **GitHub.** The connected repository is the remote `origin`, which a
  clone names too. With none, the state is `off` and Tir records locally.
  A sync verifies that fetch and push address the same GitHub repository,
  fetches the current branch into its tracking ref only, and checks
  privacy again before uploading. An absent branch clears the tracking
  ref; a network failure leaves it alone. Tir checks the paths in outgoing
  commits, then pushes that exact commit, the current branch only, without
  force, tags or submodules. The fetch and push share one network budget.
  Tir also checks at launch and every five minutes while all is well.
- **Offline and failures.** A push or check that fails is tried again
  after 30 seconds, doubling to five minutes. The failure is `offline`
  when git's words say GitHub could not be reached or git ran past its
  two-minute limit (`git::unreachable`), and `failing` otherwise, with
  git's words as the `reason`, less any credentials an address carries
  (`git::redact`). Offline is shown even when nothing waits. Nothing asks
  the writer anything: git's ssh runs in batch mode,
  `ssh -o BatchMode=yes -o ConnectTimeout=20`, unless the writer's
  environment or configuration names another command, so it never waits
  for a passphrase or a host
  question, and an empty `GIT_ASKPASS` (git then skips `core.askPass`
  and `SSH_ASKPASS` too; findings, "Git"), `SSH_ASKPASS_REQUIRE=never`
  and `GCM_INTERACTIVE=never` keep any program from opening a window for
  a login.
- **Paused.** Tir keeps committing locally and pushes nothing until
  Resume rechecks the remote. Use the [close–pull–reopen handoff](brief.md#saving-and-backup):
  the panel's pull command names the current branch on `origin` and
  specifies a merge, so it works without an upstream. Tir itself never
  merges, rebases, resets or forces. `Library::holds` checks the draft
  fingerprint from the last opening read or write. It detects stale
  saves, but is not a lock against a concurrent external write.
- **The repository.** A library with no `.git` is made a repository on
  the branch `main` (`git init`), with `git::IGNORE` as its `.gitignore`,
  written first, unless one is there; a repository the writer made gets
  it too. Independently of the ignore rules, Tir refuses
  to commit unrelated paths and non-regular files and refuses to push
  unrelated paths even if they have since been deleted from the branch.
  The allowed paths are each project's `project.json`, its drafts and
  their Fountain copies, `dictionary.txt` and `.gitignore`. Tir makes no
  repository of a folder holding anything but its projects, the
  dictionary, hidden entries and temporary files
  (`library::foreign_entry`), and records nothing in one, checking before
  every commit (`backup::owned`), so a `library` set to a folder such as
  the home folder is never backed up, even when it is already a
  repository of the writer's; backup reports the first such entry
  instead. A folder with a `project.json` or a `drafts` folder counts as
  a project.
- **Running git.** `git.rs` runs the system's `git` from an argument
  list, never a shell, in the library, with `GIT_DIR` and
  `GIT_WORK_TREE` naming the library's `.git` and the library, and the
  variables that would point git elsewhere removed (`ELSEWHERE`), so git
  never finds a repository above the library. Its input is empty,
  `GIT_TERMINAL_PROMPT=0` keeps it from prompting, `LC_ALL=C` keeps its
  messages recognisable, and a command is stopped after a time limit.
  Hooks and the file system monitor are off. Tir refuses a `.git` file,
  link, or shared common directory. A deadline bounds both the Git process
  and its output collection; expiry stops its process group. A commit is
  unsigned (`commit.gpgSign=false`) and falls back to `Tir <tir@localhost>`
  when git has no name or email for the writer.
  The commit message names what it backs up ("Back up Salt Line and the
  dictionary").
- **What stops it.** Nothing is recorded while the repository's HEAD is
  detached, a merge, squash merge, rebase, cherry-pick or revert is under
  way in it, or files are left in conflict, as a popped stash leaves them
  (`git::Repository`), since a commit would finish or bury the writer's
  operation. A missing git, a repository git cannot read, a folder backup
  will not record, and a failed commit become the status's `problem`
  (`backup::Status`), tried again after the quiet spell; once one is
  mended, backup asks GitHub and pushes what waited. The page reads the
  status with `backup_status` and hears each change as `tir://backup`.
- **Connecting** (`Backup::connect`, the `connect_repository` command,
  one at a time)
  takes only a GitHub address (`github::parse`: `git@github.com:`,
  `ssh://git@github.com/` or `https://github.com/`, then owner and name),
  and gives git that address rebuilt from the names. It makes the library
  a repository if need be, then refuses, with why, a repository this
  machine's git login cannot list (`git ls-remote`; offline told apart),
  one anyone can read (`github::Anonymous`: GitHub's REST API asked with
  no login, which answers a private or missing repository "Not Found";
  findings, "GitHub"), and one holding a commit the branch lacks, such as
  a README GitHub made, since pushing would then need a merge. Only then
  does backup's thread set `origin` (`git::connect`, which drops Tir's
  tracking refs for the repository it replaces), record and sync, so no
  push to the old repository is under way while it changes.
- **The page.** [Saving and backup](brief.md#saving-and-backup) defines
  the states. Back up now and Resume settle the draft before asking Rust
  to sync. Pending local changes and unpushed commits are separate.
  Deletion warnings compare the path with the last-known remote tip;
  they distinguish an unverified backup from no backup found.
- **In a sandbox** (`TIR_CONFIG_DIR` set; tests use the same), git reads
  only `$TIR_CONFIG_DIR/gitconfig` (`GIT_CONFIG_GLOBAL`, with
  `GIT_CONFIG_NOSYSTEM`, `XDG_CONFIG_HOME` set to `$TIR_CONFIG_DIR`, and
  no configuration passed down in `GIT_CONFIG_PARAMETERS`) and may use
  only the `file` transport (`GIT_ALLOW_PROTOCOL`), so a trial never
  reads the writer's git configuration, ignore files or login, nor
  reaches GitHub. What anyone can read is what git reaches reading only
  `$TIR_CONFIG_DIR/gitconfig-anonymous`.
  A trial stands local bare repositories in for GitHub with `insteadOf`
  rules ([Running and checking](#running-and-checking)).

## Settings

The window's settings (brief, "Zoom, focus mode and the paper"), and the
project last shown, which Tir opens at launch, live in
one file per machine, outside the library, so they never become backup
commits and each screen keeps its own zoom:
`~/.config/dev.tir.desktop/settings.json` (Tauri's config directory for
Tir's identifier, under `$XDG_CONFIG_HOME` when that is set), or
`$TIR_CONFIG_DIR/settings.json` when `TIR_CONFIG_DIR` is set, which tests
and trial runs use for a temporary directory.

```json
{
  "format": "tir-settings",
  "version": 1,
  "zoom": 1.25,
  "theme": "light",
  "focus": false,
  "sidebar": "open",
  "project": "Salt Line",
  "library": "~/Scripts/Tir"
}
```

- `src/core/settings.ts` reads and writes the text. Reading never fails: a
  missing or damaged file gives the defaults, a value it cannot read the
  default for that field, and a zoom that is not a step the nearest step;
  fields it does not know are ignored.
- `project` is the folder of the project last shown on this machine, there
  once Tir has shown one and gone once the Projects screen deletes it
  ([Saving and opening](#saving-and-opening)).
- `library` is there only when the writer set it, by editing the file
  while Tir is closed (an edit made while Tir runs is lost at its next
  save of the settings): a full path, or one starting `~/`. The Rust
  side reads it at start (`settings::library`); anything else names no
  library and the default is used
  ([Library on disk](#library-on-disk)). The page only keeps it, so that
  saving the window's settings never drops it, and the Rust side refuses
  a save that changes it ([File access](#file-access)).
- The Rust side (`src-tauri/src/settings.rs`, the `read_settings` and
  `write_settings` commands) reads the file for the page and replaces it
  ([Writing files](#writing-files)), off the interface thread.
- `src/ui/settings-file.ts` loads the settings before the editor mounts,
  so the script opens at its zoom, and saves each change, one write at a
  time and the last change last; closing waits for its writes.
- **One Tir for each config directory** (`src-tauri/src/instance.rs`): at
  start Tir makes the directory and locks it (`flock`, let go when the
  process ends, however it ends), then makes its window
  (`"create": false` in `tauri.conf.json`). A second Tir finding the lock
  taken opens no writing window, says "Tir is already open" and exits.
  A trial run with its own `TIR_CONFIG_DIR` and library can run beside.
  If the lock cannot be taken for another reason, Tir reports the error
  and exits without opening the library for writing or backup.

## Fountain

`src/core/fountain/` reads Fountain 1.1 into the model (`read.ts`) and writes
it back (`write.ts`); `inline.ts` handles emphasis and escapes, and
`syntax.ts` holds the line rules both use. Reading reports what Tir does not
keep (notes, boneyard, sections, synopses, scene numbers, unknown title page
fields), each with the element it sat beside, for the import report. A
paste reads with `titlePage: false`, so an opening `Key: value` block is
script.

The writer uses plain Fountain where inference reads an element back
correctly, a forcing character (`!`, `.`, `>`, `@`) where needed, and
otherwise appends Tir's type note, such as `[[tir:shot]]`, which other
Fountain apps hide as a note and Tir's reader treats as the element's type.
Trailing spaces are not part of the Fountain reader's text: they do not
cause the writer to force an otherwise plain action or add a type note.
A draft date that is not shown goes under `Hidden draft date:`. Each
paragraph is checked by reading it back. What a round trip cannot keep is
listed at the top of `write.ts`.

## Final Draft files

The Projects screen uses the same native picker and copy flow for `.fdx`
and `.fountain`. Both are limited to 8 MiB. Fountain must be UTF-8; the
shell also accepts BOM-marked UTF-16 for FDX. `src/core/fdx/read.ts`
uses Saxes to validate XML without a DOM or a file or network resolver.
It rejects DOCTYPE declarations and limits nesting to 64 levels, retained
records to 50,000 and import-report rows to 5,000.

The reader puts typed paragraphs and emphasis into the model and uses
the title page's alignment and conventional byline/source wording for
its fixed fields. It reports notes, explicit scene numbers and revision
sets used on the draft, not the unused defaults. Unknown paragraph types
are reported; their text becomes Action. Document-level layout settings
do not override Tir's layout engine.

Tir's title-page labels win for their own fields; unlabelled fields are
still read from the visible layout. The import report resolves an omitted
item's body-element anchor to its first script page, without giving
unanchored metadata a script-page number.

Export Final Draft… in the draft menu serializes the draft on screen with
`src/core/fdx/write.ts` and opens the native Save dialog via `export_fdx`.
The receiving app lays out the editable script with Final Draft's default
element settings, page layout and mores and continueds. The title page
uses centred paragraphs and bottom-aligned contact and draft/date lines.
FDX has no named title fields; Tir labels the text runs for a lossless
round trip. A hidden draft date is kept in an XML attribute, not printed
on the title page. An unpaired cue marked dual retains its mark in an
attribute until it is paired. Other apps may discard these attributes on save.

## PDF

`src/core/pdf.ts` writes a draft's PDF (brief, "PDF export") from the
script with `@cantoo/pdf-lib` and `@cantoo/fontkit` (findings, "PDF
libraries"), taking Courier Prime's four font files as bytes, so the core
reads no file. It does no layout of its own: it paginates the elements and
sets each of the engine's lines at its `x` and row, the page number, and
what the sheets print besides the elements ((MORE), repeated cues, the
automatic (CONT'D)), unstyled as on screen. Bold, italic and underline
split a line into runs, each on the engine's character grid: a character
spacing makes every character take its 7.2 pt cell, where Courier Prime's
own advance is 7.195 pt, and ligatures are off, as in the editor. The
baseline sits where CSS puts it in a 12 pt row, from the font's ascent and
descent (findings, "Courier Prime"). The title page follows the preview's
rules: the title always takes its line, empty fields close up, and a line
break ending a field starts no line. Both expand tabs to eight-cell stops
before aligning a field; the saved text is unchanged.
Each face the script uses is embedded once as a subset; the outline (one
bookmark per scene, from `ScriptMap`) and the page labels are written as
PDF dictionaries, since the library has neither. Text is black on white
whatever the paper.

Export PDF… in the draft menu asks whether to include the title page,
then `pdf-export.ts` makes the PDF in a worker of its own
(`pdf.worker.ts`), since a 120-page script takes over half a second; it
falls back to the interface thread if no worker runs. Both load the fonts
through `pdf-fonts.ts`, which fetches the files the editor's `@font-face`
rules use. The page passes the PDF to `export_pdf` (`dialogs.rs`) as the
request's raw body, with its suggested name, percent-encoded, in the
`tir-name` header; the Rust side shows the Save dialog and publishes a new
file as Export Fountain… does ([Writing files](#writing-files)).
Draft exports sanitize and clip the project and draft name separately, so
a long project name cannot hide the draft name or leave no room for the
extension and the atomic write's temporary suffix.

## The editor

One ProseMirror view edits the whole draft. The approved
[writing window](prototype/05-writing-window.html) supplies the
composition, with focused visual references for [Go to page](prototype/07-go-to-page.html?open=1)
and [sidebar collapse](prototype/08-sidebar-collapse.html?v=A).
The [brief](brief.md) governs behaviour.

- **Layout (`editor.ts`, `projection.ts`, `sheets.ts`).** The projection
  turns engine breaks and positions into paragraph styles and inline
  decorations, never browser wrapping. `sheets.ts` paints page numbers
  and generated continuation marks outside the editable root. Keep dual
  dialogue's hit areas in their own columns, even below the shorter
  speech. Adjust native Up/Down at page gaps: WebKit can lose the column.
  ProseMirror can reuse equal paragraph DOM across positions, so recheck
  geometry after drawing. Keep text as typed; display capitals must not
  expand a character into extra cells.
- **WebKit performance.** Scroll the document, not an overflow container.
  Keep touch/wheel listeners off the page and the editor's native outline
  off; all three otherwise add whole-draft work per keystroke. Use a
  top-left CSS transform, not CSS `zoom`, to keep the engine's line
  positions and click targets. See [why and how to measure](findings.md#editor).
- **State and input (`commands.ts`, `editor-harness.ts`).** The key and
  toolbar commands share model tests. Keep test and production plugin
  precedence aligned: open suggestion menus own their keys before
  screenplay commands, and Escape closes the innermost control before
  leaving focus mode. New drafts get fresh editor state and undo history.
  Focus before replacing selection or scrolling; WebKit otherwise
  restores the old selection and scroll.
- **Undo and clipboard (`undo.ts`, `clipboard.ts`).** Distinguish typing
  groups from deliberate one-step changes. Copy exposes a typed Tir
  clipping (`application/x-tir-clipping`) for exact paste inside Tir and
  Fountain text for other apps. Default ProseMirror copy loses types.
- **Derived views (`autocomplete.ts`, `find.ts`, `formatting-check.ts`,
  `spelling.ts`).** Keep incremental work on edited elements; rebuild
  decoration sets rather than mapping through huge transactions.
  Spelling uses a worker for dictionary work and draws answers against
  current nodes, with learned names and locations from the suggestion
  tally. Menus and find, formatting and spelling marks do not become
  part of the script or its exports.
- **Navigation (`script-map.ts`, `page-position.ts`, `jump.ts`).** Scene
  navigation and the page indicator read the same map from the engine.
  The indicator follows the caret when text or selection changes,
  otherwise vertical scroll; decoration-only updates must not jump it
  back to the caret. The scene list defers large DOM updates until
  after the edit's frame.

### Desktop UI checks

Use the approved [prototype](prototype/index.html) for composition and
the existing CSS in `src/ui/` for implementation. In the native window,
check the changed flow with the keyboard: controls have accessible names,
focus is visible outside the script, dialogs contain and return focus as
appropriate, and Escape reaches the innermost open popup or dialog
first. Don't use colour alone to convey a state. Preserve the script's
own shortcuts, caret, and engine-owned layout.

## Working here

The Nix development shell supplies Tauri's system libraries (WebKitGTK,
GTK, libsoup, OpenSSL) from the nixpkgs revision in `flake.lock`. mise
supplies Node, pnpm and Rust at the versions in `mise.toml`, and runs the
tasks. `mise run dev` and `mise run check` need the shell and enter it
themselves when started outside it (the shell sets `TIR_DEV_SHELL`); other
commands that build the Rust side, such as a bare `cargo build`, must run
inside `nix develop` (`nix develop --command zsh` keeps zsh).

### Installing the release

On x86-64 NixOS, run `nix profile add .#tir` from the Tir source
checkout, not the library. Run `tir` from the profile's `bin` directory
on `PATH`; no development shell, mise, Node or Rust is needed to launch.
The package also exports `tir.desktop` and the brass app icon; open
Hyprland's app launcher, search for **Tir**, and press Enter. If the
launcher started before a newly created profile was visible to the
session, open it from a fresh login so it sees the profile on `PATH`
and the profile's `share` directory in `XDG_DATA_DIRS`.
Update the source checkout and run `nix profile upgrade tir` to upgrade
that installation. The release uses the same `dev.tir.desktop` settings
and library as the development build. The font and dictionary notices
are under `share/licenses/tir/` in the package.

For an agent release trial, use the [isolated launch](#isolated-native-trial)
and replace `mise run dev` in its subshell with:

```sh
nix profile add --profile "$trial/profile" .#tir &&
  "$trial/profile/bin/tir"
```

Never install test releases into the writer's profile.

### Setting up a machine

The user works on two NixOS machines, a desktop (often remotely) and a
laptop, and moves work between them through GitHub. A clone holds
everything else the build needs, or fetches it in the steps below; "Not in
git" lists the rest. Keep both lists current when a change needs something
new.

The machine's NixOS configuration must provide:

- Flakes: `nix.settings.experimental-features = [ "nix-command" "flakes" ];`
- nix-ld: `programs.nix-ld.enable = true;`. mise downloads prebuilt Node
  and Rust (through rustup), which need a standard dynamic loader on NixOS.
- `mise` and `git` on the PATH, from the system or home-manager packages.
- A Wayland desktop to see the window (both machines run Hyprland).

Then, in a fresh clone:

1. `mise trust`: mise ignores a project's `mise.toml` until trusted.
2. `mise install`: Node, pnpm, and Rust with clippy and rustfmt, at the
   versions in `mise.toml`.
3. `mise run install`: the JavaScript packages in `pnpm-lock.yaml`.
4. `mise run check`, then [launch an isolated trial](#isolated-native-trial).
   The first run downloads the nixpkgs revision in `flake.lock` and the
   crates in `Cargo.lock`, and builds the Rust side.

After a pull, repeat steps 2 and 3 if `mise.toml` or `pnpm-lock.yaml`
changed. `flake.lock` pins nixpkgs to the desktop's NixOS revision, so
WebKitGTK uses the same Mesa as the desktop's graphics driver. The laptop,
on its own revision, ran the window on 2026-11-26; if a machine's window
opens blank or WebKit reports EGL or DRI errors, compare
`nixos-version --revision` with `flake.lock` first.

Not in git:

- `calibration/`, ignored because it holds other people's scripts. Only
  `mise run parity` needs it. It lives on the desktop: copy it with
  `rsync -a desktop:Code/tir/calibration/ calibration/` (use the desktop's
  SSH host name), or download the PDFs that findings ("Calibration") lists.
  It also holds `calibration/scripts/`, task 0.8's one-off analyses.
- Things each machine fetches or generates: `node_modules/`,
  `src-tauri/target/`, `src-tauri/gen/` (Tauri's schemas, rewritten by each
  build) and `dist/`.

### Running and checking

- **Nix sees only files git knows.** A flake ignores untracked files, so
  `flake.nix` and `flake.lock` must be committed or at least added with
  `git add -N`.
- **A trial with backup** stands bare repositories in for GitHub. Make
  them with `git init --bare` as `"$trial/remotes/OWNER/NAME.git"`, and
  write `"$trial/gitconfig"` with `[url "$trial/remotes/"]` and the lines
  `insteadOf = git@github.com:` and `insteadOf = https://github.com/`, so
  GitHub addresses pasted in the connect dialog reach them. A repository
  is public when `"$trial/public/OWNER/NAME.git"` reaches it (a link
  does), with `"$trial/gitconfig-anonymous"` holding
  `[url "$trial/public/"]` and `insteadOf = https://github.com/`. To go
  offline, give the library's remote a `receivepack` (and `uploadpack`)
  that says what ssh says offline and fails:
  `git -C "$trial/Screenplays" config remote.origin.receivepack "echo 'ssh: Could not resolve hostname github.com' >&2; exit 1; :"`;
  unset it to come back. A clone of a bare repository, committing and
  pushing, stands in for the other machine.
- **`mise run check`** runs, in order and stopping at the first failure:
  Biome (lint and format), the type check of the whole project, the type check
  of `src/core/` without the DOM, Vitest, `cargo fmt --check`, clippy with
  warnings as errors, and `cargo test`. Run it once at stage reviews and
  before completing a broad or cross-stack change.
- **`mise run fmt`** formats the TypeScript and Rust and applies Biome's
  safe fixes (import order and the like) across the repository; it needs
  no Nix shell.
- **`mise run parity [files…] [--lines N] [--all] [--show PAGE]`** is a
  diagnostic, not a Final Draft acceptance check. It rebuilds the PDFs
  in ignored `calibration/` by default and reports straight-through page
  starts and reseeded page ends separately, with extraction warnings.
  `--show` prints one page row by row. See [Calibration](findings.md#calibration)
  and the [acceptance task](plan.md#task-7-3a). Run the one-off analyses
  with `mise exec -- node calibration/scripts/<name>.ts`. Neither needs Nix.
- **Focused checks are the default.** Inspect docs-only changes and
  affected links. For type-only changes use
  `mise exec -- pnpm exec tsc -p tsconfig.json`; for TypeScript behaviour,
  `mise exec -- pnpm exec vitest run <test-files>` for the changed code
  and its callers. Example focused Rust check:
  `nix develop --command cargo test --manifest-path src-tauri/Cargo.toml --locked library::tests`.
  Rerun only checks affected by review fixes.
- **`mise run pagination-timing`** measures the median time to paginate a
  roughly 120-page draft against a 16 ms target. Run it on the same machine
  when pagination performance is in scope; it is not part of `check` and
  needs no Nix shell.
- **TypeScript** is strict, and imports use explicit `.ts` extensions with
  only erasable syntax (no enums or parameter properties), so Node runs a
  tool directly: `node tools/<tool>.ts`. TypeScript 7 ships only the native
  `tsc`, without a JavaScript API.
- **pnpm's supply-chain settings** are in `pnpm-workspace.yaml`. Install
  scripts are off; allow one by name under `allowBuilds` only when a package
  needs it.
- **Inspect the trial window** with the window helpers in
  `tools/inspector.ts`. `trialWindows` finds the trial's windows, native
  dialogs included, by their `TIR_CONFIG_DIR`, and each helper targets a
  window by address, never the shared title "Tir": `screenshot`,
  `sendKey` (a Hyprland shortcut; in a GTK file dialog `wtype`'s `-k` and
  `-M` keys did not arrive), `typeText` (`wtype` text), `click` and
  `closeWindow`, which closes normally so Tir saves. They take Hyprland's
  instance from `$XDG_RUNTIME_DIR/hypr/` when the shell lacks
  `HYPRLAND_INSTANCE_SIGNATURE`. This Hyprland takes Lua dispatcher calls,
  such as `hyprctl dispatch 'hl.dsp.window.close({ window = "address:0x…" })'`.
  If needed, float and resize a window for the screenshot and put it back
  afterwards. If Vite is already running, the prototypes are at
  `http://localhost:1420/docs/prototype/`; otherwise use the
  [standalone prototype index](prototype/index.html). After closing the
  trial window, stop the dev command you started; do not kill Tir
  processes by name.
- **Rust** builds inside the shell only. The shell sets `RUSTFLAGS` to link
  without Rust's bundled LLD ([findings](findings.md#nixos-development-shell)),
  so a build outside it differs and rebuilds everything.

### Isolated native trial

Start here for every agent-run native check. Use a fresh trial directory;
do not copy the writer's settings into it. A `library` set in a copied
settings file overrides the trial's default library.

```sh
trial=$(mktemp -d) &&
  (
    export MISE_DATA_DIR="${MISE_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/mise}" \
      TIR_CONFIG_DIR="$trial" XDG_DATA_HOME="$trial/data" XDG_CACHE_HOME="$trial/cache"
    mise run dev
  )
```

`MISE_DATA_DIR`, set first, keeps mise's installed tools: without it,
mise follows `XDG_DATA_HOME` into the trial and reinstalls every tool it
manages there before it starts Tir.

Settings, WebKit data/cache and the default library (`"$trial/Screenplays"`)
are isolated. Trial Git reads only sandbox configuration and reaches
only local files. Use trial paths for import fixtures and export
destinations. Vite uses fixed port 1420: only one dev launch at a time.
If the port is occupied, do not stop someone else's server. Never
launch bare `mise run dev` for an agent trial.

### Measuring the editor

Use the [isolated launch](#isolated-native-trial) with
`WEBKIT_INSPECTOR_HTTP_SERVER=127.0.0.1:9339 mise run dev` as the command
inside the subshell.

Run the automated editor tools only when the trial is the only window
titled "Tir" on that Hyprland desktop. Their focus and keyboard commands
target that title, not the inspector's process. If the writer's app is
open, leave it alone and use address-targeted manual checks instead.

- `mise run editor-timing [--pairs N] [--zoom Z] [--focus]` measures
  layout, frame and busy times while editing, as automatic saves start
  and run, as spell checks land, and among thousands of squiggles. See the
  [dated baseline](findings.md#typing-baseline).
- `mise run editor-placement [--fixture NAME] [--zoom Z] [--focus]`
  checks engine line and mark positions, rendered text, and click
  placement (including the blank part of a dual dialogue row). It exits
  1 on a miss.

Both tools restore the window settings they found.
`tools/inspector.ts` discovers the page from the loopback inspector.
`globalThis.tirView`, `tirDesk`, `tirSaver` and `tirScreen` expose
the dev app's editor, settings, saver and Projects screen. `?fixture=spike`
opens a 120-page script with forced scene breaks, `feature` one without
them, `every` every element type and format, and `sample` the prototype's
"Salt Line". A fixture becomes a project in the trial library on its
first save.

For a real click, use `click` from `tools/inspector.ts` with the element's
client coordinates. Use `wtype -k dead_acute -k e` for "é" or
`wtype -k Multi_key -k o -k c` for "©", but use the Hyprland dispatcher
for arrow keys. These tools, and `wl-copy` and `wl-paste` for clipboard
checks, are available through `nix shell` (`wl-clipboard` for the latter
two). `trialWindows` lists native dialogs too; check the dialog's title
before sending keys. In the Open dialog, press Ctrl+L before typing a
path. Close only the trial window.

See the [measuring traps](findings.md#measuring-traps). For WebKit
profiling, start Vite with `mise exec -- pnpm exec vite`, then use the
[isolated launch](#isolated-native-trial) with this command in place of
`mise run dev`:

```sh
nix develop --command bash -c '
    perf=$(nix build --no-link --print-out-paths nixpkgs#perf) || exit
    exec "$perf/bin/perf" record -e task-clock:u -g --user-callchains \
      -o "$TIR_CONFIG_DIR/tir.perf" -- src-tauri/target/debug/tir
  '
```

With `perf_event_paranoid` at 2, only user-space events work. With Yama's
ptrace scope at 1, start the app under `perf` instead of attaching with
`perf -p`. libwebkit2gtk carries its symbols.
