# Tir: architecture

A short map of how Tir is built: the rules the design rests on, where
things live, and how to run and check things. Product behaviour and its
terms are in [brief.md](brief.md); outside-world facts the code depends on
are in [findings.md](findings.md). Where this map and the code disagree,
the code is right: fix the map.

## Design rules

The user delegated these technical choices during planning.

1. **One layout engine decides every line break and page break.** The
   editor, the PDF, page counts and the sidebar's page numbers all use its
   output. The browser never wraps script text: the editor shows the
   engine's breaks. This is what keeps the screen, the PDF and Final Draft
   in agreement.
2. **The script model is the source of truth.** Tir's draft file, Fountain,
   FDX and PDF are each produced from it or read into it by pure functions
   with round-trip tests.
3. **A pure core with a thin shell.** The model, layout engine, file
   formats and checks are plain TypeScript with no DOM, ProseMirror or
   Tauri imports, so they test quickly in Node. The interface is
   TypeScript with ProseMirror. The Rust side only reads and writes files,
   runs git and opens system dialogs.
4. **Tir writes only inside the library**, with one exception: its own
   settings file, kept for each machine in its config directory
   ([Settings](#settings); the user's choice, 2026-11-26). A file opened
   or imported is read and never written to; an export writes a new file.
   The Rust side holds the rule ([File access](#file-access)). WebKitGTK
   keeps its cache and storage for Tir in `~/.local/share/dev.tir.desktop/`,
   which Tir itself never writes.
5. **Tests never touch the real library, the real settings file or
   GitHub.** They use temporary directories and a local bare git
   repository.

## Repository layout

```
docs/         brief, architecture, findings, plan; prototype/ (design pieces; index.html marks the chosen ones)
src/core/     pure TypeScript: format.ts holds every Final Draft format value; the model, draft file,
              project file (project-file.ts), the library's names (file-names.ts), Fountain, FDX,
              line layout, pagination, autocomplete's suggestions (suggestions.ts), the
              clipboard's forms (clipping.ts), the scenes and where each page starts
              (script-map.ts), the settings file's text and the zoom steps (settings.ts) and checks
              join it
src/ui/      the interface: main.ts, app.css, theme.css (colours from docs/prototype/look.css),
              fonts/ (Courier Prime, IBM Plex Sans, Newsreader and their licences); editor-model.ts
              maps the model to and from ProseMirror, projection.ts turns the engine's pages into
              decorations, paragraph styles, sheets and the script map edit by edit, editor.ts is
              the ProseMirror view and the zoom, commands.ts its keys and commands, undo.ts how undo
              groups changes, clipboard.ts copy, cut and paste, autocomplete.ts its autocomplete
              popup, sheets.ts draws the sheets of paper behind it, toolbar.ts the top bar's
              element buttons, sidebar.ts the scene list, page-position.ts "Page N of M" and Go to
              page, jump.ts the caret and scroll for both, desk.ts the window's settings (paper,
              zoom, focus mode, the sidebar's toggle) and their keys, settings-file.ts loads and
              saves them, library.ts reaches the library through the Rust side, saving.ts saves
              the script and holds closing for it, draft-texts.ts (with draft-texts.worker.ts, its
              worker) makes a save's texts, saved-indicator.ts shows the top bar's saved state,
              opening.ts what Tir opens at launch and the file keys, projects-screen.ts the
              Projects screen and projects.ts its rows and what it does (open, make, rename,
              delete, import), draft-menu.ts the draft picker and drafts.ts its actions,
              title-page.ts the title page form and its preview over the mounted editor,
              dev-fixtures.ts holds the scripts `?fixture=NAME` opens, and
              editor-harness.ts runs the editor's state and keys for tests
src-tauri/    Rust: the Tauri shell; src/files.rs writes a file whole or not at all,
              src/settings.rs reads and replaces the settings file, src/library.rs keeps the
              library's folders and files, src/dialogs.rs opens native import, export and message dialogs,
              src/closing.rs holds the window open on closing until the page has saved,
              src/instance.rs keeps a second Tir from opening the same settings and library;
              tauri.conf.json, capabilities/, icons/ (icon.svg is the source)
tools/parity/ the parity check against Final Draft PDFs: pdf-text.ts (reads runs with unpdf),
              rebuild.ts (script from positions), compare.ts (page starts against paginate),
              write-pdf.ts (test PDFs in Final Draft's layout), main.ts (the command)
index.html    the page Vite serves and Tauri loads: the Desk's top bar, sidebar and canvas
flake.nix     the Nix development shell (system libraries); mise.toml pins runtimes and holds the tasks
```

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
  makes one). The Rust side refuses any name that is not one entry of its
  folder or that starts with a dot, and any link where it expects a
  project or `drafts` folder, a project file or a draft, or a link or
  folder where a copy goes, so nothing it reads, writes, moves or deletes
  lies outside the library. It never makes a folder or draft over an
  entry already there: it claims the name first (a new folder, or a new
  empty file, and the copy's name must be free). It deletes only a folder
  with a project file, readable or not, so never a folder of the writer's
  own. Each change to a project carries `was`, the project file's text
  the page made it from, and is refused when the file now differs, so a
  change made from an older reading never undoes a newer one; the
  commands run one at a time, and Tir does not exit while one runs
  (`finish_commands`).
- **Order.** Each change leaves every project whole if Tir stops or fails
  part way: `project.json` names only drafts that are there. A new
  project's `project.json` is written last, after its draft and copy, and
  a project that fails to be made is removed whole; a new draft and its
  copy are written before the project names it, both removed if either
  fails, and kept if naming it fails; a save writes the draft, then its
  copy, so
  the copy is never newer than the draft; a renamed draft is copied to
  its new file with its last-save time before the project names that.
  Renaming or deleting a draft publishes the project file first, then
  cleans up the old files once the new project file is durable. Cleanup
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
created new (the first `n` with no file of that name), which is synced
and renamed over the file, and then the directory is synced so that the
rename reaches the disk. A file Tir did not make is never opened, replaced
or removed. A write that fails removes its temporary file; a crash
between the two can leave one behind, which no later save replaces or
removes. The settings file and the library's files are written this way.
Exports publish the synced temporary file with a hard link instead of a
rename, so an existing name, including a symlink, cannot be replaced.
The destination filesystem must support hard links.
A script's file is read as UTF-8 and refused, rather than read with
replacement characters, when it is not.

## File access

The page's capability (`src-tauri/capabilities/default.json`) grants two
of Tauri's core commands and nothing more: `core:event:allow-listen`, for
`tir://close`, and `core:webview:allow-internal-toggle-devtools`, which
only a debug build's Ctrl+Shift+I uses. The commands Tir defines need no
permission. No file system plugin is registered, the asset protocol is
off, and none of the dialog plugin's commands is granted. So every file
Tir reads or writes
goes through its own Rust commands, which reach three places only: the
settings file in Tir's config directory or `TIR_CONFIG_DIR`
(`read_settings`, `write_settings`); the library, by the folder and file
names `library.rs` checks ([Library on disk](#library-on-disk)); and a
file the writer picks in the system's Open dialog, which is only read,
or the new file picked in its Save dialog (`dialogs.rs`).
The page never names a path, and the Rust side keeps every path it uses;
it tells the page the library's place only to show it (`library_place`,
"~/Screenplays" for the empty library), and no command takes one back. Nor can the
page move the library: `write_settings` refuses settings that name a
library other than the one the file named when Tir started.

## Saving and opening

The script on screen is saved to its draft automatically (brief, "Saving
and backup") by `src/ui/saving.ts`'s `Saver`, which a view plugin
(`savingPlugin`) tells of changes to the editor document and
`title-page.ts` tells of changes to the title page:

- **When.** A second after the last change (`SAVE_DELAY_MS`), and at once
  through `settle`, which waits for the save under way, then saves until
  the draft holds what is on screen: before another script takes the
  screen, on Ctrl+S and before the window closes. Saves go one at a time,
  each writing the script as it is when it starts. The script is saved
  when both its editor document (`Node.eq`) and its title page equal
  those last written, so reverting a change before saving writes
  nothing. After a failed save it counts as not saved until one
  succeeds, since the draft may hold a newer text than its copy.
- **Off the interface thread.** A save takes the model from the document
  on the interface thread (`fromDocument`, which reuses unchanged
  elements), then `draft-texts.worker.ts` writes the draft and its
  Fountain copy (`DraftTexts`) in a Web Worker, since `writeFountain`
  takes a fifth of a second on a long script; the Rust side writes both
  files on its own thread (findings, "Editor"). Should the worker fail,
  the texts are made on the interface thread instead.
- **Where.** A script in the library is saved to its draft
  (`write_draft`); one not there yet, such as the empty script of an empty
  library or a test script, becomes a project at its first save, named
  from its title page's title or "Untitled", with one draft, "First
  Draft". The settings file then names it as the project last shown.
- **Failures.** The top bar shows "Saved", "Saving…" from the first change
  until the draft holds it, and "Not saved" when a save failed
  (`saved-indicator.ts`). A save that fails is tried again after the next
  pause in typing, or after five seconds; the writer hears of it once, in
  a message box, until a save succeeds. A caller of `settle` tells the
  writer itself, or asks it to tell as a save after a pause does
  (`settle(true)`, the Projects screen's).
- **Closing.** Once the page can save, it calls `hold_close`, and the Rust
  side (`closing.rs`) then holds each request to close the window and
  passes it to the page as `tir://close`. The page waits for any draft
  action to finish so it settles the correct draft, stops typing (the
  editor is made read-only), settles, waits for the Projects screen's
  action under way and the settings file's writes, and calls
  `close_window`. When a save fails it asks, in a
  message box, whether to close without it; Cancel makes the editor
  editable again and holds closing again. A page that does not answer
  cannot keep the window open: a request to close five seconds or more
  after the first one held closes it (the user's choice, 2026-11-27,
  over a window only killing Tir closes). Tir exits only once the library's
  command under way has finished (`finish_commands`). Tauri's own
  close-requested event was not used: its listener outlives a page load,
  and closing from the page needs `core:window:allow-destroy`, which the
  capability does not grant (findings, "Desktop stack").

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
and undo history. Export Fountain… serializes the saver's current script
and title page; it does not depend on a successful library save.

The title page's form and preview scroll in a fixed layer over the
mounted script. Hiding the script without unmounting it leaves its
selection and undo history alone. The preview does not use the
editor's page projection.

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
  taken makes no window, says "Tir is already open" and exits, so two
  windows never save over each other's drafts (brief, "Saving and
  backup"). A trial run with its own `TIR_CONFIG_DIR` runs beside. When
  the lock cannot be taken for another reason, Tir runs without it.

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
A draft date that is not shown goes under `Hidden draft date:`. Each
paragraph is checked by reading it back. What a round trip cannot keep is
listed at the top of `write.ts`.

## The editor

One ProseMirror view edits the whole draft; findings ("Editor") records the
technique and what it costs in WebKitGTK. Three constraints follow from
it: the document scrolls (no overflow scroll container around the script),
the page has no touch or wheel listeners, and the editor's focus ring stays
off. Each of the three added work over the whole script to every keystroke.

The window is prototype piece 5's Desk. The top bar and sidebar are fixed
over the scrolling document, and the editor's scroll threshold keeps the
caret clear of them. Under the editor, `sheets.ts` draws each page's paper
and what it prints that no element holds (its number, (MORE), repeated
cues, the automatic (CONT'D)), from the engine's lines and outside the
editable element, redrawing a sheet only when its marks change. In dual
dialogue each column's paragraphs keep to their half of the page, divided
halfway across the gutter, and the shorter column's last paragraph reaches
down to the longer one's end, so a click lands in the column it is in.

Each element's paragraph gets its space above and indent from the
projection as a style. After ProseMirror draws a change, the editor checks
every paragraph's style against its element's, since ProseMirror may draw
an element in the paragraph that showed an equal element elsewhere
(findings, "Editor"). Where an element splits across pages, the page's gap
is a block inside the paragraph, after the last character on the page; the
projection hides the white space the engine drops there, except its last
typed line break, and Up and Down across that gap are Tir's own
(`crossPageGap`), since WebKit's lose the column there.

The keys and the top bar's buttons run ProseMirror commands from
`commands.ts`, so a key's whole effect is a change to the document and
tests check it in the model without a browser. The model keeps text as
typed: a paragraph whose element calls for capitals shows them with CSS,
and the projection exempts each character whose capital is longer ("ß"),
as the engine does, so the screen never shows a line longer than the
engine's.

Autocomplete (`autocomplete.ts`) is a plugin placed before the screenplay's
keys, so its Enter, Tab, arrows and Esc win while its popup is open and
pass through when it is closed. It keeps a tally of every suggestion's uses
(`src/core/suggestions.ts`) that follows each edit by the elements the edit
changed, as the projection does, so a keystroke never reads the whole
script. The popup and its ghost text are drawn in the script's container
beside the editable element, at the caret's coordinates, so they move no
line and WebKit's editing never sees them.

Undo (`undo.ts`) is ProseMirror's history. Commands mark where a step
starts (`newStep`: Enter, Tab starting an element) or a change that is a
step of its own (`ownStep`); an unmarked transaction is typing, which the
history groups by time and place. Copy, cut and paste (`clipboard.ts`)
replace ProseMirror's own handling, whose HTML keeps no element type
(findings, "Editor"). A copy puts the selection on the clipboard as
Fountain text for other applications and as a clipping
(`src/core/clipping.ts`) under Tir's type, `application/x-tir-clipping`,
which WebKitGTK keeps in a clipboard entry of its own that other
applications are not offered. Tests drive the editor's state and key
plugins without a browser through `editor-harness.ts`, which keeps
`editor.ts`'s plugin order.

The sidebar's scene list and the top bar's page position are view plugins
that `mountEditor` hands the projection, so they read its `ScriptMap`
(`src/core/script-map.ts`: each scene's heading and starting page, the
page of any place, each page's first line) as the engine computed it for
the edit, never the screen. They are in the typing path, so each touches
the page only where what it shows changed, and the scene list applies an
edit's changes just after the edit's frame is drawn (findings, "Editor").
The list scrolls on its own inside the fixed sidebar. A jump, from a scene
or Go to page, sets the caret and scrolls to the engine's page and row,
scaled by the zoom.

The zoom scales the script, sheets included, with a CSS transform from its
top left corner (none at 100%), so WebKit lays the script out as at 100%
and every line stays where the engine puts it at any scale; the editor
sizes a frame around it to the scaled size, keeping the page centred and
the document's height right (findings, "Editor", for why not CSS `zoom`).
The autocomplete ghost is inside the script and scales with it; the popup
sits in the frame and keeps the interface's size. `desk.ts` applies the
other settings as classes on the body (focus mode, the sidebar collapsed)
and the paper as `data-theme`, and tells the editor what the bars cover
(`setCovered`) for its scroll threshold. Its keys are caught on the way
down to the focused element, before the editor sees them, because
ProseMirror prevents the default of every Esc in the editor; Esc yields to
the autocomplete popup and to fields such as Go to page's, which close
first, before it leaves focus mode.

Opening a script gives the view a new `EditorState` (`scriptState` and
`Editor.open` in `editor.ts`), so undo starts afresh and autocomplete
counts the new script. It focuses the editor first: taking focus after a
click elsewhere, WebKit puts back the editor's last selection and scrolls
to it (findings, "Editor"), so the new state's selection and the scroll
to the top come after. The projection follows transactions, and a new
state brings none, so `open` rebuilds it, the sheets and the frame before
the view updates, then restyles every paragraph, since ProseMirror keeps
the paragraph of an element equal to the one it showed there. A new state
also makes ProseMirror destroy and make again every plugin's view, so the
toolbar, the scene list and the page position add their DOM listeners
once, when the plugin is made, not in its view.

## Working here

The Nix development shell supplies Tauri's system libraries (WebKitGTK,
GTK, libsoup, OpenSSL) from the nixpkgs revision in `flake.lock`. mise
supplies Node, pnpm and Rust at the versions in `mise.toml`, and runs the
tasks. `mise run dev` and `mise run check` need the shell and enter it
themselves when started outside it (the shell sets `TIR_DEV_SHELL`); other
commands that build the Rust side, such as a bare `cargo build`, must run
inside `nix develop` (`nix develop --command zsh` keeps zsh).

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
4. `mise run check`, then `mise run dev`. The first run downloads the
   nixpkgs revision in `flake.lock` and the crates in `Cargo.lock`, and
   builds the Rust side, which takes some minutes.

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
- The implement and user-code-review skills that agents use come from the
  user's setup repository (`~/.claude/skills`), not from this one.

### Running and checking

- **Nix sees only files git knows.** A flake ignores untracked files, so
  `flake.nix` and `flake.lock` must be committed or at least added with
  `git add -N`.
- **`mise run dev`** starts Vite on port 1420 and opens the Tauri window,
  reloading on change.
- **`mise run check`** runs, in order and stopping at the first failure:
  Biome (lint and format), the type check of the whole project, the type check
  of `src/core/` without the DOM, Vitest, `cargo fmt --check`, clippy with
  warnings as errors, and `cargo test`. Run it once at stage reviews and
  before completing a broad or cross-stack change.
- **`mise run fmt`** formats the TypeScript and Rust and applies Biome's
  safe fixes (import order and the like), which `check` only checks. Run it
  after editing and before `check`; it needs no Nix shell.
- **`mise run parity [files…] [--lines N] [--all] [--show PAGE]`**
  compares Tir's page breaks with Final Draft PDFs (every PDF in the
  ignored `calibration/` folder by default; set-aside ones live in
  `calibration/excluded/`). It reports pages that start differently read
  through from page 1, and, page by page, whether each page ends where
  Final Draft's does when Tir starts it where Final Draft does; then what
  it could not read for certain. `--lines` sets lines per page, `--all`
  lists every page, and `--show` prints one page as Final Draft and Tir set
  it, row by row. It needs no Nix shell. Run one of task 0.8's analyses
  (line widths, split sizes, residual pages) with
  `mise exec -- node calibration/scripts/<name>.ts`.
- **Focused checks are the default.** Inspect docs-only diffs; for
  type-only changes, use `mise exec -- pnpm exec tsc -p tsconfig.json`.
  For behaviour changes, use `mise exec -- pnpm exec vitest run <test-files>`
  with the relevant tests and affected callers' tests. Don't rerun a
  passing check just because review happened; rerun checks affected by
  review fixes.
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
- **Seeing the window from an agent's shell:** the shell may lack
  `HYPRLAND_INSTANCE_SIGNATURE`; set it to the folder name in
  `$XDG_RUNTIME_DIR/hypr/`, and `hyprctl clients -j` lists a window titled
  "Tir" with its position (`at`) and `size`. Screenshot it with
  `nix shell nixpkgs#grim --command grim -g "X,Y WxH" shot.png`, which
  installs nothing. Tiled beside another window it is too narrow for the
  sidebar and a whole page; for a screenshot, float and size it with
  Hyprland 0.57's dispatchers, then tile it again:
  `hyprctl dispatch 'hl.dsp.window.float({action="enable",window="title:^Tir$"})'`,
  then `hl.dsp.window.resize({x=1440,y=900,window="title:^Tir$"})` and
  `hl.dsp.window.move({x=240,y=90,window="title:^Tir$"})` the same way, and
  `action="disable"` afterwards. Prototype pieces open in the same webview
  (and engine) at `http://localhost:1420/docs/prototype/`, for comparing
  side by side. Stop the app with `pkill -x tir`: `pkill -f` also matches
  the shell running it.
- **Rust** builds inside the shell only. The shell sets `RUSTFLAGS` to link
  without Rust's bundled LLD ([findings](findings.md#nixos-development-shell)),
  so a build outside it differs and rebuilds everything.
- **Measuring the editor:** start the app with
  `TIR_CONFIG_DIR=$(mktemp -d) WEBKIT_INSPECTOR_HTTP_SERVER=127.0.0.1:9339 mise run dev`
  (the temporary directory keeps the tools' settings changes out of the
  real settings file, and gives the run a library of its own in
  `$TIR_CONFIG_DIR/Screenplays`; `await import("/src/ui/library.ts")`
  in the page reaches it), then `mise run editor-timing [--pairs N] [--zoom Z]
  [--focus]` (`tools/editor-timing/`) prints the findings ("Editor") table
  for the current code: layout, frame and busy times for each edit in it,
  the last of them typing as automatic saves start and run, at the zoom
  given (100% by default), then for a zoom step and focus mode on and off.
  It sends keys through Hyprland, so it runs on a Hyprland
  desktop with the window open. `mise run editor-placement [--fixture NAME]
  [--zoom Z] [--focus]` checks design rule 1 in the same app, at the
  window's zoom or the one given: every line the engine lays out must start
  where the engine puts it, a click on a line's first or last character
  must land before that character, a click in the blank part of a dual
  dialogue column's row must land at that line's end,
  each paragraph must show the engine's text (`innerText`, which applies
  CSS capitals), and each sheet's page number and marks must sit where the
  engine puts them; it exits 1 on a miss. Both put back the window's
  settings they found, and both drive the page through
  `tools/inspector.ts`. For other probes, connect to
  `ws://127.0.0.1:9339/socket/1/1/WebPage` through that module
  (`Page.evaluate` runs a script and awaits its promise; `ScriptProfiler`
  messages sample JavaScript). In development, `globalThis.tirView` is the
  editor's view, `globalThis.tirDesk` the window's settings
  (`tirDesk.set({ zoom: 1.25 })`), `globalThis.tirSaver` the saver
  (`tirSaver.where`, the draft it saves to) and `globalThis.tirScreen` the
  Projects screen. The app opens the trial library's last project, or the
  Projects screen; `?fixture=spike` opens a 120-page
  script with a forced break before each scene, `?fixture=feature` one
  without forced breaks, `?fixture=every` one with every element type and
  format and some text typed in lower case where capitals apply, and
  `?fixture=sample` prototype piece 5's script, "Salt Line"; a fixture
  becomes a project in the trial library at its first save. For a real click, move the
  pointer with `nix shell nixpkgs#wlrctl --command wlrctl pointer move DX
  DY` (relative to `hyprctl cursorpos`; the window's `at` plus the
  element's client position is its place on screen) and press with `wlrctl
  pointer click left`. Dead-key and Compose sequences go through `wtype`
  (findings, "Editor"): `nix shell nixpkgs#wtype --command wtype -k
  dead_acute -k e` types "é" and `-k Multi_key -k o -k c` types "©".
  `press` in `tools/inspector.ts` takes Hyprland's modifiers, such as
  `press("z", "CTRL SHIFT")`. Read and set the system clipboard with
  `nix shell nixpkgs#wl-clipboard --command wl-paste` (`--list-types`
  lists what a copy offered) and `... wl-copy`. The system's dialogs are
  windows of their own, titled "Open File" or a message box's
  headline: send them keys through the dispatcher by title or by `address:`
  from `hyprctl clients -j` (`wtype -k Return` did not reach a message box),
  and in the Open dialog press Ctrl+L before typing a path with `wtype`.
  Close the window as the writer does, which saves first, with
  `hyprctl dispatch 'hl.dsp.window.close({window="title:^Tir$"})'`.
  Findings ("Editor") lists measuring traps. For WebKit's own time, run the
  binary under `perf` from the Nix shell:
  `nix develop --command bash -c 'exec $(nix build --no-link --print-out-paths nixpkgs#perf)/bin/perf record -e task-clock:u -g --user-callchains -o /tmp/tir.perf -- src-tauri/target/debug/tir'`
  (start Vite with `mise exec -- pnpm exec vite` first). Only user-space
  events work with `perf_event_paranoid` at 2, and `perf -p` cannot attach
  to a running WebKit process under Yama's ptrace scope 1, so launch the
  app under `perf`; libwebkit2gtk carries its symbols.
