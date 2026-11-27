# Tir: architecture

A short map of how Tir is built: the rules the design rests on, where
things live, and how to run and check things. Product behaviour and its
terms are in [brief.md](brief.md); outside-world facts the code depends on
are in [findings.md](findings.md). Where this map and the code disagree,
the code is right: fix the map.

The library section below is still a plan, which Stage 2 builds.

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
   ([Settings](#settings); the user's choice, 2026-11-26). An import reads
   its source file and never writes to it; an export writes a new file.
   WebKitGTK keeps its cache and storage for Tir in
   `~/.local/share/dev.tir.desktop/`, which Tir itself never writes.
5. **Tests never touch the real library, the real settings file or
   GitHub.** They use temporary directories and a local bare git
   repository.

## Repository layout

```
docs/         brief, architecture, findings, plan; prototype/ (design pieces; index.html marks the chosen ones)
src/core/     pure TypeScript: format.ts holds every Final Draft format value; the model, draft file,
              Fountain, FDX, line layout, pagination, autocomplete's suggestions (suggestions.ts),
              the clipboard's forms (clipping.ts), the scenes and where each page starts
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
              saves them, dev-fixtures.ts holds the scripts `?fixture=NAME` opens, and
              editor-harness.ts runs the editor's state and keys for tests
src-tauri/    Rust: the Tauri shell; src/settings.rs reads and replaces the settings file;
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

## Library on disk (planned)

```
~/Screenplays/                  the library, and the backed-up git repository
  Salt Line/                    one project
    project.json                its name, drafts and active draft
    drafts/
      rewrite-nov-2026.tir      a draft: title page and elements
      rewrite-nov-2026.fountain the copy written on every save; Tir never reads it
```

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
  the model; `project.json` in Stage 2).

## Settings

The window's settings (brief, "Zoom, focus mode and the paper") live in
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
  "sidebar": "open"
}
```

- `src/core/settings.ts` reads and writes the text. Reading never fails: a
  missing or damaged file gives the defaults, a value it cannot read the
  default for that field, and a zoom that is not a step the nearest step;
  fields it does not know are ignored.
- The Rust side (`src-tauri/src/settings.rs`, the `read_settings` and
  `write_settings` commands) only reads the file and replaces it: written
  to `settings.json.tmp`, then renamed over it, off the interface thread.
- `src/ui/settings-file.ts` loads the settings before the editor mounts,
  so the script opens at its zoom, and saves each change, one write at a
  time and the last change last.

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
  real settings file), then `mise run editor-timing [--pairs N] [--zoom Z]
  [--focus]` (`tools/editor-timing/`) prints the findings ("Editor") table
  for the current code: layout, frame and busy times for each edit in it,
  at the zoom given (100% by default), then for a zoom step and focus mode
  on and off. It sends keys through Hyprland, so it runs on a Hyprland
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
  editor's view and `globalThis.tirDesk` the window's settings
  (`tirDesk.set({ zoom: 1.25 })`). The app opens a 120-page script with a
  forced break before each scene (`?fixture=spike`); `?fixture=feature`
  opens one without forced breaks, `?fixture=every` one with every element
  type and format and some
  text typed in lower case where capitals apply, and `?fixture=sample`
  prototype piece 5's script, "Salt Line". For a real click, move the
  pointer with `nix shell nixpkgs#wlrctl --command wlrctl pointer move DX
  DY` (relative to `hyprctl cursorpos`; the window's `at` plus the
  element's client position is its place on screen) and press with `wlrctl
  pointer click left`. Dead-key and Compose sequences go through `wtype`
  (findings, "Editor"): `nix shell nixpkgs#wtype --command wtype -k
  dead_acute -k e` types "é" and `-k Multi_key -k o -k c` types "©".
  `press` in `tools/inspector.ts` takes Hyprland's modifiers, such as
  `press("z", "CTRL SHIFT")`. Read and set the system clipboard with
  `nix shell nixpkgs#wl-clipboard --command wl-paste` (`--list-types`
  lists what a copy offered) and `... wl-copy`.
  Findings ("Editor") lists measuring traps. For WebKit's own time, run the
  binary under `perf` from the Nix shell:
  `nix develop --command bash -c 'exec $(nix build --no-link --print-out-paths nixpkgs#perf)/bin/perf record -e task-clock:u -g --user-callchains -o /tmp/tir.perf -- src-tauri/target/debug/tir'`
  (start Vite with `mise exec -- pnpm exec vite` first). Only user-space
  events work with `perf_event_paranoid` at 2, and `perf -p` cannot attach
  to a running WebKit process under Yama's ptrace scope 1, so launch the
  app under `perf`; libwebkit2gtk carries its symbols.
