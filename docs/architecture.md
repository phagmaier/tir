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
4. **Tir writes only inside the library.** An import reads its source file
   and never writes to it; an export writes a new file.
5. **Tests never touch the real library or GitHub.** They use temporary
   directories and a local bare git repository.

## Repository layout

```
docs/         brief, architecture, findings, plan; prototype/ (design pieces; index.html marks the chosen ones)
src/core/     pure TypeScript: format.ts holds every Final Draft format value; the model, draft file,
              Fountain, FDX, line layout, pagination and checks join it
src/ui/       the interface: main.ts (a placeholder page until Stage 1), app.css, theme.css (colours
              from docs/prototype/look.css), fonts/ (Courier Prime and its licence)
src-tauri/    Rust: the Tauri shell; tauri.conf.json, capabilities/, icons/ (icon.svg is the source)
tools/parity/ the parity check against Final Draft PDFs: pdf-text.ts (reads runs with unpdf),
              rebuild.ts (script from positions), compare.ts (page starts against paginate),
              write-pdf.ts (test PDFs in Final Draft's layout), main.ts (the command)
index.html    the page Vite serves and Tauri loads
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

## Fountain

`src/core/fountain/` reads Fountain 1.1 into the model (`read.ts`) and writes
it back (`write.ts`); `inline.ts` handles emphasis and escapes, and
`syntax.ts` holds the line rules both use. Reading reports what Tir does not
keep (notes, boneyard, sections, synopses, scene numbers, unknown title page
fields), each with the element it sat beside, for the import report.

The writer uses plain Fountain where inference reads an element back
correctly, a forcing character (`!`, `.`, `>`, `@`) where needed, and
otherwise appends Tir's type note, such as `[[tir:shot]]`, which other
Fountain apps hide as a note and Tir's reader treats as the element's type.
A draft date that is not shown goes under `Hidden draft date:`. Each
paragraph is checked by reading it back. What a round trip cannot keep is
listed at the top of `write.ts`.

## Working here

Everything runs inside the Nix development shell, which supplies Tauri's
system libraries (WebKitGTK, GTK, libsoup, OpenSSL) from the nixpkgs revision
in `flake.lock`. mise supplies Node, pnpm and Rust at the versions in
`mise.toml`, and runs the tasks.

- **First time:** `mise trust`, then `nix develop`, then `mise run install`.
  `nix develop` starts bash; `nix develop --command zsh` keeps zsh.
- **Nix sees only files git knows.** A flake ignores untracked files, so
  `flake.nix` and `flake.lock` must be committed or at least added with
  `git add -N`.
- **`mise run dev`** starts Vite on port 1420 and opens the Tauri window,
  reloading on change.
- **`mise run check`** runs, in order and stopping at the first failure:
  Biome (lint and format), the type check of the whole project, the type check
  of `src/core/` without the DOM, Vitest, `cargo fmt --check`, clippy with
  warnings as errors, and `cargo test`. It must pass before a task is done.
- **`mise run parity [files…] [--lines N] [--all] [--show PAGE]`**
  compares Tir's page breaks with Final Draft PDFs (every PDF in the
  ignored `calibration/` folder by default; set-aside ones live in
  `calibration/excluded/`). It reports pages that start differently read
  through from page 1, and, page by page, whether each page ends where
  Final Draft's does when Tir starts it where Final Draft does; then what
  it could not read for certain. `--lines` sets lines per page, `--all`
  lists every page, and `--show` prints one page as Final Draft and Tir set
  it, row by row. It needs no Nix shell. The one-off analyses behind
  task 0.8 (line widths, split sizes, residual pages) are in
  `calibration/scripts/`, which git ignores: run one with
  `mise exec -- node calibration/scripts/<name>.ts`.
- **Single steps:** `mise exec -- pnpm exec vitest run src/core` runs some
  tests; `mise exec -- pnpm exec biome check --write .` fixes formatting.
- **TypeScript** is strict, and imports use explicit `.ts` extensions with
  only erasable syntax (no enums or parameter properties), so Node runs a
  tool directly: `node tools/<tool>.ts`. TypeScript 7 ships only the native
  `tsc`, without a JavaScript API.
- **pnpm's supply-chain settings** are in `pnpm-workspace.yaml`. Install
  scripts are off; allow one by name under `allowBuilds` only when a package
  needs it.
- **Rust** builds inside the shell only. The shell sets `RUSTFLAGS` to link
  without Rust's bundled LLD ([findings](findings.md#nixos-development-shell)),
  so a build outside it differs and rebuilds everything.
