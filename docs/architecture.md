# Tir: architecture

A short map of how Tir is built: the rules the design rests on, where
things live, and how to run and check things. Product behaviour and its
terms are in [brief.md](brief.md); outside-world facts the code depends on
are in [findings.md](findings.md). Where this map and the code disagree,
the code is right: fix the map.

No code exists yet. The layout and library sections below are the plan for
tasks 0.1 and 0.2, which replace them with what was built.

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

## Repository layout (planned)

```
docs/        brief, architecture, findings, plan; prototype/ (design pieces; index.html marks the chosen ones)
src/core/    model, draft file, Fountain, FDX, line layout, pagination, checks (pure TypeScript)
src/ui/      the ProseMirror editor and the screens; styles from docs/prototype/look.css
src-tauri/   Rust: files, git, system dialogs
tools/       the parity check against Final Draft PDFs
```

## Library on disk (planned)

```
~/Screenplays/                  the library, and the backed-up git repository
  Salt Line/                    one project
    project.json                its name, drafts and active draft
    drafts/
      rewrite-nov-2026.tir      a draft: title page and elements
      rewrite-nov-2026.fountain the copy written on every save; Tir never reads it
```

## Working here

Written by task 0.1: entering the Nix development shell, setup, running the
app, and `mise run check`.
