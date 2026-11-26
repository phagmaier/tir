# Tir: build plan

The task list for building V1. Intended behaviour is in
[brief.md](brief.md), design rules in [architecture.md](architecture.md),
outside facts in [findings.md](findings.md), and the chosen screens in
[prototype/index.html](prototype/index.html).

## How to work this plan

- **Work strictly in order.** Take the first unchecked task. Every task
  depends only on earlier ones. The implement skill works directly from
  this file.
- **Starting a task:** set its `Status:` to `in progress` and update
  "Current status".
- **Finishing a task:** only when its "Done when" is verified, check the
  box, set `Status: done`, and add an `Evidence:` line saying what you ran
  or observed and the result. Then update "Current status". Never check off
  unverified work; use `Status: blocked (why)` or `verification pending
  (what is missing)` instead.
- **Review tasks** (titled "Review: …") are tasks like any other. Run the
  user-code-review skill (not the bundled `/code-review`) on the scope the
  task names, work through its checklist, fix concrete findings within the
  stage's scope, and rerun the affected checks. Record in `Evidence:` the
  commit or working-tree state reviewed (`git rev-parse HEAD`, plus
  "uncommitted changes" if any), the findings, and what was fixed or
  deferred. A deferred finding goes under "Known gaps".
- **User check tasks** (titled "User check: …"): stop. Tell the user exactly
  how to run the check, and wait. Check it off only when the user reports
  it passed, quoting them and the date in `Evidence:`. Notes from the user
  become tasks inserted before the next stage, with IDs like `1.11a`.
- **When reality differs from the plan**, split, reorder or add tasks, keep
  the existing IDs, and say why. Do not silently drop or weaken a task.
  Product changes go to the user first (AGENTS.md).

## Current status

- Active: none
- Blockers: none
- Next: 0.1 Toolchain and app skeleton

## Stages

| Stage | Result | Ends with |
| --- | --- | --- |
| 0. Skeleton and page engine | Toolchain, script model, Fountain, layout and pagination checked against Final Draft PDFs | 0.10 |
| 1. Writing | The editor, in the settled look | 1.11 |
| 2. Library, projects and drafts | Saving, projects, drafts, title page, Fountain import and export | 2.8 |
| 3. PDF | PDF export matching the editor | 3.4 |
| 4. Final Draft files | FDX import and export | 4.4 |
| 5. Find, formatting check, spell check | The three checks | 5.5 |
| 6. GitHub backup | Automatic backup to a private repository | 6.5 |
| 7. Install and finish | Tir installed on NixOS; a final review of V1 | 7.4 |

Risk comes first. Page parity and an editor that shows the engine's
breaks could each sink the design, so Stages 0 and 1 prove them before
anything else. V1 is done when 7.4 is checked.

## Stage 0: skeleton and page engine

- [ ] 0.1 — Toolchain and app skeleton
  - Status: todo
  - Depends on: none
  - Spec: brief "Stack"; architecture "Repository layout", "Working here"
  - Do: Pin Node, pnpm and Rust in `mise.toml`. Add a Nix flake
    development shell with Tauri's Linux libraries, following Tauri's
    NixOS prerequisites (look them up in Context7). Create the Vite,
    TypeScript and Tauri 2 app with pnpm, applying the pnpm supply-chain
    settings from the user's coding instructions. Add Biome, Vitest,
    strict TypeScript, `cargo clippy` and `cargo test`. Add `mise run
    check` (lint, type check, tests, Rust checks) and `mise run dev`.
    Add a `.gitignore` for build output and dependencies that also
    excludes the calibration folder (0.8); the repository and its GitHub
    remote already exist. Make `src/core/` unable to import the DOM,
    ProseMirror or Tauri (a lint rule or a test). Turn architecture.md's
    planned layout into the built one and write "Working here".
  - Done when: inside the development shell, `mise run check` passes, and
    `mise run dev` opens a Tauri window on Hyprland showing a placeholder
    page in Courier Prime in look.css's colours; architecture.md gives the
    commands.

- [ ] 0.2 — Script model and draft file
  - Status: todo
  - Depends on: 0.1
  - Spec: brief "Elements and keys", "Title page", "Storage", "Terms"
  - Do: Define the model: elements of the eight types with inline bold,
    italic and underline; dual dialogue; centred text; forced page breaks;
    the title page; project and draft metadata. Define the draft file:
    JSON with a format version and one element per line, so a git diff
    reads like the script. Write pure read and write functions with
    validation. Record the format in architecture.md.
  - Done when: a fixture using every element type and format survives
    model → file → model unchanged, and a damaged file, or one from a newer
    format version, is refused with a readable message instead of being
    partly loaded.

- [ ] 0.3 — Fountain reader and writer
  - Status: todo
  - Depends on: 0.2
  - Spec: brief "Storage", "Import report"; the Fountain 1.1 spec
  - Do: Read Fountain into the model: title page keys, forced elements,
    dual dialogue, centred text, emphasis, page breaks and lyrics. Report
    notes, boneyard, sections and synopses as left out. Write the model as
    Fountain, forcing an element's type wherever Fountain's inference would
    read it differently.
  - Done when: tests cover each rule of the Fountain spec with worked
    examples, and every fixture survives model → Fountain → model
    unchanged, including all-caps action lines that inference would read as
    character cues.

- [ ] 0.4 — Line layout
  - Status: todo
  - Depends on: 0.2
  - Spec: architecture design rule 1; findings "Final Draft's default
    screenplay format"
  - Do: Lay out each element at Final Draft's indents and widths: spacing
    before, capitals, the parenthetical's hanging "(", right-aligned
    transitions, centred text, dual dialogue columns, and words longer than
    a line. Keep every format value in one place, citing findings.md.
  - Done when: unit tests with hand-worked expected lines pass for every
    element type and edge case, including empty elements, long words, and
    accented and other non-ASCII characters.

- [ ] 0.5 — Pagination
  - Status: todo
  - Depends on: 0.4
  - Spec: brief "Page parity", "Elements and keys" (automatic); findings
    "Final Draft's default screenplay format"
  - Do: Break the laid-out lines into pages, with lines per page a setting
    until 0.8 settles it. Keep scene headings and shots with what follows.
    Split action and dialogue only at a sentence end, re-wrapping both
    parts. Add (MORE) and (CONT'D) to a split speech, and the automatic
    (CONT'D) for a speaker who returns after action. Honour forced page
    breaks. Number pages from page 2.
  - Done when: unit tests with worked examples pass for each rule, and a
    test shows paginating a 120-page script takes under 16 ms on this
    machine.

- [ ] 0.6 — Review: the core and the page engine
  - Status: todo
  - Depends on: 0.5
  - Scope: everything built in 0.1–0.5.
  - Check:
    - `src/core/` imports nothing from the DOM, ProseMirror or Tauri, and
      the guard from 0.1 really fails when one is added.
    - Every Final Draft format value comes from one place and matches
      findings.md.
    - Tests' expected values are hand-worked, not produced by the code
      under test; edge cases (empty, long words, non-ASCII, a speech longer
      than a page) are covered.
    - The draft file refuses damaged and newer files, writes keys in a
      stable order, and keeps one element per line.
    - The Fountain writer forces types where inference would misread, and
      the left-out report is complete.
    - The performance test measures a realistic 120-page script.
    - Toolchain: versions pinned, lockfiles committed or ready to commit,
      pnpm supply-chain settings in place, and `mise run check` covers
      everything.
  - Done when: findings are fixed or listed under Known gaps, and
    `mise run check` passes.

- [ ] 0.7 — Parity check tool
  - Status: todo
  - Depends on: 0.6
  - Spec: brief "Page parity"; findings "Final Draft's default screenplay
    format"
  - Do: Choose the PDF libraries for reading text with positions and for
    writing PDFs, and record the choice and reasons in findings.md (this
    tool's fixtures need PDFs; Stage 3 writes the real ones). Build `mise
    run parity`. It reads a PDF and rebuilds the script by mapping each
    line's indent to an element type, joining wrapped lines and recognising
    page numbers, (MORE), (CONT'D), scene numbers and CONTINUED. It then
    paginates the script with the engine and reports, page by page,
    whether each page starts on the same line, with a summary.
  - Done when: given test PDFs generated from known scripts, the tool
    rebuilds each script exactly and reports every page break that was
    deliberately moved.

- [ ] 0.8 — Calibration against Final Draft
  - Status: todo
  - Depends on: 0.7
  - Spec: brief "Page parity", "Still to settle"
  - Do: Collect public screenplay PDFs whose metadata names Final Draft as
    the producer, preferring ones without scene numbers or revision marks,
    into the ignored calibration folder. Run the tool, study each mismatch,
    and adjust the engine. Use Beat's pagination as a reference where the
    corpus cannot decide. Settle lines per page, how headings, cues and
    parentheticals are kept off a page's foot, how dual dialogue splits,
    and whether page numbers end with a period.
  - Done when: findings.md records each of those facts with its evidence,
    and every calibration page starts on the same line as Final Draft's,
    or each remaining mismatch is explained in findings.md and listed
    under Known gaps.

- [ ] 0.9 — Review: Stage 0
  - Status: todo
  - Depends on: 0.8
  - Scope: everything changed since 0.6's recorded state.
  - Check:
    - The parity tool copes with real PDF quirks (split text runs,
      ligatures, odd spacing) and reports rather than guesses when it
      cannot classify a line.
    - Every engine change made during calibration has a test that fails
      without it.
    - findings.md entries cite their evidence (which PDFs, which pages).
    - No calibration PDF or other copyrighted script is tracked by git
      (`git status --ignored`, `git ls-files`).
  - Done when: findings are fixed or listed under Known gaps, and
    `mise run check` passes.

- [ ] 0.10 — User check: Stage 0
  - Status: todo
  - Depends on: 0.9
  - Check: in the development shell, the user runs `mise run parity` and
    reads its summary for the calibration scripts, then runs `mise run dev`
    and sees the app's window.

## Stage 1: writing

Stage 1 edits one draft file opened directly. Projects and automatic
saving arrive in Stage 2.

- [ ] 1.1 — Editor spike: ProseMirror showing the engine's breaks
  - Status: todo
  - Depends on: 0.10
  - Spec: architecture design rule 1
  - Do: Build a minimal ProseMirror editor over the model whose text is
    never wrapped by the browser. Line breaks and page gaps come from the
    engine, for example as decorations over `white-space: pre`
    paragraphs. Try it on a 120-page script: typing, Backspace across
    elements, the cursor moving up and down across engine line breaks and
    page gaps, selection, undo, and composed characters (dead keys and the
    compose key) under WebKitGTK.
  - Done when: findings.md ("Editor") records the technique and
    measurements; typing a character on a 120-page script re-lays out and
    redraws in under 16 ms typically; cursor movement and selection behave
    as in a normal text editor. If any of these fails, stop and bring the
    alternatives to the user.

- [ ] 1.2 — Review: the editor approach
  - Status: todo
  - Depends on: 1.1
  - Scope: the spike from 1.1. This is a design review before building on
    it.
  - Check:
    - Design rule 1 holds: no script text is wrapped by the browser.
    - The script has one source of truth; there is a single, tested
      mapping between the ProseMirror document and the model.
    - Re-layout is incremental or fast enough for long scripts, measured.
    - The technique survives the needs ahead: autocomplete popups, find
      highlights, margin marks, spelling squiggles, (MORE) and (CONT'D).
  - Done when: findings are fixed, or the user has decided on a change of
    approach.

- [ ] 1.3 — Pages in the settled look
  - Status: todo
  - Depends on: 1.2
  - Spec: brief "Look"; prototype piece 5; docs/prototype/look.css
  - Do: Render the editor as separate sheets: Night paper and white paper,
    page numbers, and (MORE) and (CONT'D) as uneditable marks. Build the
    Desk layout (top bar, sidebar, canvas) from look.css's tokens in
    `src/ui/`.
  - Done when: screenshots of the app match prototype piece 5 in both
    papers at 100% zoom, checked side by side.

- [ ] 1.4 — Elements and keys
  - Status: todo
  - Depends on: 1.3
  - Spec: brief "Elements and keys"
  - Do: The eight elements; Enter and Tab by Final Draft's table; the
    toolbar highlighting and changing the current element; Ctrl+1 to
    Ctrl+7 and Ctrl+0 (confirm WebKitGTK passes them through); automatic
    capitals and parentheses; bold, italic and underline; commands for dual
    dialogue, centred text and a forced page break. Record any key chosen
    here in brief.md.
  - Done when: tests drive each key and command through the editor and
    check the resulting model, and the user's flow (Enter after dialogue,
    then Tab, gives a new cue) works in the app.

- [ ] 1.5 — Autocomplete
  - Status: todo
  - Depends on: 1.4
  - Spec: brief "Scope" (Autocomplete); prototype piece 1 (autocomplete)
  - Do: Suggest character names, cue extensions, scene heading prefixes,
    locations already used, times of day and common transitions, ranked by
    use. Show the popup and the ghost completion as in the prototype; Enter
    accepts, the arrows choose, Esc closes.
  - Done when: tests cover each suggestion source and the keys, and the
    popup works in the app on both papers.

- [ ] 1.6 — Undo and redo, copy and paste
  - Status: todo
  - Depends on: 1.4
  - Spec: brief "Copy and paste"
  - Do: Undo and redo with sensible grouping (a burst of typing is one
    step; an element change is one step). Copying within Tir keeps element
    types; copying out gives Fountain text; pasting from outside reads
    Fountain, with anything ambiguous becoming Action.
  - Done when: tests cover the undo grouping and the three paste and copy
    paths, including plain prose pasted from elsewhere.

- [ ] 1.7 — Scene sidebar, page position, Go to page
  - Status: todo
  - Depends on: 1.3
  - Spec: brief "Scene sidebar", "Scope" (Page position)
  - Do: The sidebar lists scenes with number, heading and starting page,
    highlights the scene holding the cursor, and jumps on click. The top bar
    shows "Page N of M". Go to page has a key, recorded in brief.md.
  - Done when: tests check the scene list and page numbers against the
    engine, and the sidebar and Go to page work in the app.

- [ ] 1.8 — Zoom, focus mode, the paper switch, and settings
  - Status: todo
  - Depends on: 1.3
  - Spec: brief "Scope" (Focus mode, Zoom, Dark and light themes), "Still
    to settle" (keys)
  - Do: Zoom keys and the sidebar control; focus mode; the paper switch in
    the sidebar footer. Settle the keys for zoom, focus mode and the next
    finding (Ctrl+0 is General) and record them in brief.md. Remember these
    settings in the user's config directory, not in the library.
  - Done when: each works in the app, survives a restart, and the brief
    lists the keys.

- [ ] 1.9 — Open and save a draft file
  - Status: todo
  - Depends on: 1.6
  - Spec: brief "Storage"
  - Do: Open a draft file or a Fountain file, and save the draft with
    Ctrl+S, writing atomically (a temporary file, then rename). This is
    the stand-in until Stage 2's automatic saving.
  - Done when: a script written in the app saves and reopens identical,
    and an interrupted save never leaves a damaged file (tested).

- [ ] 1.10 — Review: Stage 1
  - Status: todo
  - Depends on: 1.9
  - Scope: everything changed since 1.2's recorded state.
  - Check:
    - Design rule 1 and the single source of truth still hold.
    - The keys match the brief and Final Draft's table; nothing conflicts
      with WebKitGTK or Hyprland.
    - Undo grouping is right, including after autocomplete and paste.
    - Performance: typing, scrolling and the sidebar on a 120-page
      script.
    - Accessibility: toolbar and controls have names, focus is visible,
      and everything is reachable by keyboard.
    - The app matches prototype piece 5 in both papers.
    - WebKitGTK quirks found are recorded in findings.md.
  - Done when: findings are fixed or listed under Known gaps, and
    `mise run check` passes.

- [ ] 1.11 — User check: Stage 1
  - Status: todo
  - Depends on: 1.10
  - Check: the user writes a short scene from scratch using only the
    keyboard, then opens a long Fountain script, scrolls and types in it,
    and judges whether it feels right.

## Stage 2: library, projects and drafts

- [ ] 2.1 — Library and project storage
  - Status: todo
  - Depends on: 1.11
  - Spec: brief "Storage", "Projects"; architecture "Library on disk",
    design rules 4 and 5
  - Do: The library (default `~/Screenplays`, configurable) and the
    project layout: folders, `project.json`, and draft files. Make folder
    names safe from titles (slashes, `..`, reserved and duplicate names,
    non-ASCII). Write atomically. Limit the app's file access to the
    library and to paths the user picks in a dialog.
  - Done when: tests with temporary libraries cover creating, listing,
    renaming and deleting projects and drafts, unsafe titles, and a
    damaged `project.json`.

- [ ] 2.2 — Automatic saving and the Fountain copy
  - Status: todo
  - Depends on: 2.1
  - Spec: brief "Saving and backup", "Storage"
  - Do: Save a moment after typing pauses, and on switching drafts or
    projects and on closing. Write the `.fountain` copy beside each draft on
    every save. Drive the top bar's saved state. Retire 1.9's Ctrl+S save;
    Ctrl+S stays harmless.
  - Done when: tests show saves happen after a pause and on close, the
    Fountain copy always matches the draft, and closing mid-save loses
    nothing.

- [ ] 2.3 — Projects screen
  - Status: todo
  - Depends on: 2.2
  - Spec: brief "Projects", "Look" (Projects screen); prototype piece 6
    (list)
  - Do: The list layout with New project, Rename and Delete (with
    confirmation), and the empty library state; Ctrl+O. On launch, reopen
    the last project on its active draft.
  - Done when: each action works in the app against a temporary library,
    and the screen matches prototype piece 6's list.

- [ ] 2.4 — Drafts
  - Status: todo
  - Depends on: 2.3
  - Spec: brief "Drafts"; prototype piece 1 (draft menu)
  - Do: The draft menu: fork (copies the active draft's current state and
    title page), switch, rename and delete (with confirmation; the last
    draft cannot be deleted). Remember each project's active draft.
  - Done when: tests show a fork is independent of its original, and the
    menu works in the app.

- [ ] 2.5 — Title page form
  - Status: todo
  - Depends on: 2.4
  - Spec: brief "Title page"; findings "Title page conventions"; prototype
    piece 5 (title page)
  - Do: The sidebar's Title page row, the form with live preview, the
    draft-and-date toggle, and Esc back to the script. The title page
    belongs to the draft.
  - Done when: edits save with the draft and survive a fork, and the view
    matches prototype piece 5.

- [ ] 2.6 — Fountain import and export
  - Status: todo
  - Depends on: 2.5
  - Spec: brief "Projects" (Import; Tir edits only files it owns), "Scope"
    (Import report); prototype piece 6 (import)
  - Do: Import as a new project or as a new draft of a chosen project,
    then show the import report. Open the source read-only and never write
    to it. Export a draft to Fountain at a path the user picks.
  - Done when: tests show an import leaves the source byte-for-byte
    unchanged with the same modification time, the report lists what was
    left out, and export then import gives the same script.

- [ ] 2.7 — Review: Stage 2
  - Status: todo
  - Depends on: 2.6
  - Scope: everything changed since 1.10's recorded state.
  - Check (data safety first):
    - Every write is atomic, and none lands outside the library except an
      export the user chose.
    - Import sources are never opened for writing.
    - Unsafe titles cannot escape the library or collide.
    - Deleting removes only the intended project or draft, after
      confirmation.
    - Forked drafts share nothing mutable.
    - Saving on close cannot be skipped.
    - A damaged project or draft file is reported, not overwritten.
    - Tauri's capabilities and file scopes are as narrow as possible.
    - Tests never touch `~/Screenplays`.
  - Done when: findings are fixed or listed under Known gaps, and
    `mise run check` passes.

- [ ] 2.8 — User check: Stage 2
  - Status: todo
  - Depends on: 2.7
  - Check: the user exports one of their Story Architect scripts as
    Fountain and imports it, forks a draft, edits both drafts, switches
    between them, restarts the app, and finds everything as they left it.

## Stage 3: PDF

- [ ] 3.1 — PDF export
  - Status: todo
  - Depends on: 2.8
  - Spec: brief "PDF export"; findings "Courier Prime"
  - Do: Write the PDF from the engine's pages, with no layout of its own:
    the title page, page numbers, embedded Courier Prime, one bookmark per
    scene, and the file name "Title - Draft.pdf". Always black on white,
    whatever the paper setting.
  - Done when: tests check positions, page count, bookmarks and the
    embedded font on fixtures.

- [ ] 3.2 — PDF verified against the engine
  - Status: todo
  - Depends on: 3.1
  - Spec: brief "Page parity"
  - Do: Run the parity tool on Tir's own PDFs of the calibration scripts
    and fixtures.
  - Done when: every page of Tir's PDF starts on the same line as the
    editor's, the text can be selected and searched, and the PDF opens
    correctly in Firefox and in a desktop PDF viewer.

- [ ] 3.3 — Review: Stage 3
  - Status: todo
  - Depends on: 3.2
  - Scope: everything changed since 2.7's recorded state.
  - Check:
    - The PDF code does no wrapping or pagination of its own.
    - Inch-to-point positions are exact at the margins and indents.
    - The title page matches the editor's preview.
    - Fonts are embedded and subset, with the OFL licence respected.
    - Metadata, bookmarks and page numbers are correct.
    - File names are made safe.
    - Exporting a 120-page script is fast enough not to stall the window.
  - Done when: findings are fixed or listed under Known gaps, and
    `mise run check` passes.

- [ ] 3.4 — User check: Stage 3
  - Status: todo
  - Depends on: 3.3
  - Check: the user exports a script, opens the PDF, and compares it with
    the editor page by page.

## Stage 4: Final Draft files

- [ ] 4.1 — FDX import
  - Status: todo
  - Depends on: 3.4
  - Spec: brief "Scope" (FDX import and export, Import report); findings
    "Final Draft's default screenplay format"
  - Do: Read FDX into the model: element types including General and Shot,
    the title page, dual dialogue and emphasis. Report script notes,
    revisions, scene numbers and unknown element types as left out, and
    turn unknown types into Action. Parse XML safely: no external entities
    and a size limit. Wire it into the import dialog.
  - Done when: tests on original fixtures cover each mapping and each
    left-out kind, and a malicious XML fixture is refused.

- [ ] 4.2 — FDX export
  - Status: todo
  - Depends on: 4.1
  - Spec: brief "Scope" (FDX); findings "Final Draft's default screenplay
    format"
  - Do: Write FDX with Final Draft's default element settings, page layout
    and mores-and-continueds, plus the title page, dual dialogue and
    emphasis, escaping text correctly.
  - Done when: export then import gives the same script for every fixture,
    and the written settings match findings.md's table.

- [ ] 4.3 — Review: Stage 4
  - Status: todo
  - Depends on: 4.2
  - Scope: everything changed since 3.3's recorded state.
  - Check:
    - XML safety: no entity expansion, and size limits.
    - Escaping of every text field.
    - The round-trip tests' completeness.
    - The import report's completeness.
    - Fixtures are original: no other people's FDX files are committed.
  - Done when: findings are fixed or listed under Known gaps, and
    `mise run check` passes.

- [ ] 4.4 — User check: Stage 4
  - Status: todo
  - Depends on: 4.3
  - Check: the user exports a Story Architect script as FDX, imports it,
    and compares it with the Fountain import of the same script.

## Stage 5: find, formatting check, spell check

- [ ] 5.1 — Find and replace
  - Status: todo
  - Depends on: 4.4
  - Spec: brief "Find and replace"; prototype piece 1 (find)
  - Do: Find and replace in the active draft, with match case and whole
    word, next and previous, Replace, and Replace all as one undo step.
    Highlight matches on both papers.
  - Done when: tests cover regex-special characters in the query, whole
    words next to apostrophes and non-ASCII letters, cues with extensions,
    and the single undo; it works in the app.

- [ ] 5.2 — Formatting check
  - Status: todo
  - Depends on: 5.1
  - Spec: brief "Formatting check"; prototype piece 1 (findings)
  - Do: The six rules; margin marks with explanations on hover or when the
    cursor is in the element; the count in the top bar; the next-finding
    key. Marks never reach a PDF, FDX or Fountain export.
  - Done when: each rule has tests for flagged and not-flagged cases, and a
    run on the calibration scripts produces no false positives (or each is
    examined and explained).

- [ ] 5.3 — Spell check
  - Status: todo
  - Depends on: 5.2
  - Spec: brief "Scope" (Spell check), "Stack"
  - Do: Choose the spell-check library and a US English Hunspell
    dictionary, and record both and their licences in findings.md. Check as
    you type without blocking typing. Learn the script's character names
    and locations. Offer suggestions and "add to dictionary", keeping added
    words in the library so they are backed up. Draw squiggles on both
    papers, never in exports.
  - Done when: tests cover learned names and suggestions, and checking a
    120-page script never delays typing (measured).

- [ ] 5.4 — Review: Stage 5
  - Status: todo
  - Depends on: 5.3
  - Scope: everything changed since 4.3's recorded state.
  - Check:
    - Query escaping, and whole-word matching across scripts and
      punctuation.
    - Replace all is a single undo step.
    - The rules' false positives on real scripts.
    - Spell check performance and that it stays off the typing path.
    - Dictionary licences are recorded.
    - No marks reach exports.
  - Done when: findings are fixed or listed under Known gaps, and
    `mise run check` passes.

- [ ] 5.5 — User check: Stage 5
  - Status: todo
  - Depends on: 5.4
  - Check: the user renames a character with Replace all, fixes a flagged
    cue, and corrects a misspelling from its suggestions.

## Stage 6: GitHub backup

- [ ] 6.1 — Git in the library
  - Status: todo
  - Depends on: 5.5
  - Spec: brief "Saving and backup"; architecture design rule 5
  - Do: Run the system's git from Rust with argument lists, never a shell.
    Make the library a repository if it is not one. Commit after a few
    quiet minutes and on closing.
  - Done when: tests against temporary libraries show commits happen at
    those moments, and that a missing git or a damaged repository is
    reported, not crashed on.

- [ ] 6.2 — Push, offline and pause
  - Status: todo
  - Depends on: 6.1
  - Spec: brief "Saving and backup"
  - Do: Push after each commit and on Back up now. While offline, keep
    commits and retry with back-off. When GitHub has commits this machine
    lacks, pause and show why. Never merge, rebase or force-push.
  - Done when: tests against a local bare repository cover a normal push,
    an unreachable remote and later recovery, and a remote that is ahead
    (paused, nothing merged); no test touches the network.

- [ ] 6.3 — Connect dialog and backup panel
  - Status: todo
  - Depends on: 6.2
  - Spec: brief "Saving and backup"; prototype piece 5 (backup panel and
    connect dialog)
  - Do: The connect dialog checks that this machine's git login can reach
    the repository, and warns when the repository is public (find a way
    that needs no stored token, and record it in findings.md). Add the
    top-bar indicator's states and the backup panel with its actions,
    including Resume.
  - Done when: each state and warning works in the app against local
    test repositories, and the views match prototype piece 5.

- [ ] 6.4 — Review: Stage 6
  - Status: todo
  - Depends on: 6.3
  - Scope: everything changed since 5.4's recorded state.
  - Check (security and safety first):
    - No shell interpolation anywhere.
    - No credentials stored or logged.
    - No merge, rebase, reset or force-push in any code path.
    - Git only ever runs inside the library.
    - Behaviour with a dirty tree, a detached HEAD, a rejected push and a
      missing git binary.
    - Offline never blocks the interface.
    - Tests never use the network.
    - The privacy check is correct for public, private and missing
      repositories.
  - Done when: findings are fixed or listed under Known gaps, and
    `mise run check` passes.

- [ ] 6.5 — User check: Stage 6
  - Status: todo
  - Depends on: 6.4
  - Check: the user connects a new private repository, writes for a while,
    goes offline and back online, and sees the backups arrive on GitHub.

## Stage 7: install and finish

- [ ] 7.1 — Release build and installation on NixOS
  - Status: todo
  - Depends on: 6.5
  - Spec: brief "Purpose"
  - Do: Package the release build with Nix (preferred) or a documented
    install task. Record the choice and its reasons in findings.md. The
    development shell must keep working.
  - Done when: a clean install from the repository gives a `tir` that
    starts outside the development shell.

- [ ] 7.2 — Desktop entry, icon and release hardening
  - Status: todo
  - Depends on: 7.1
  - Do: A desktop entry and an icon in the brass accent, so Tir appears in
    the application launcher. In release builds: developer tools off, a
    strict content security policy, and minimal Tauri capabilities.
  - Done when: Tir starts from the launcher on Hyprland, and the release
    build's settings are confirmed.

- [ ] 7.3 — Review: V1
  - Status: todo
  - Depends on: 7.2
  - Scope: the whole repository.
  - Check:
    - Trace every item in the brief's "V1 must have" list to working,
      tested behaviour, and list any gap.
    - Security: Tauri capabilities, file scopes, the content security
      policy, git, and XML parsing.
    - Data safety, again across the whole app.
    - Performance on a 120-page script: opening, typing, scrolling,
      exporting.
    - Documents describe the present: architecture.md matches the code,
      and findings.md and Known gaps are current.
  - Done when: findings are fixed or listed under Known gaps with the
    user's agreement, and `mise run check` passes.

- [ ] 7.4 — User check: V1
  - Status: todo
  - Depends on: 7.3
  - Check: the user installs Tir, starts it from the launcher, and writes
    in it for a session.

## Known gaps

None yet. Each entry names the task or stage that found it and, if
known, the one that will close it.
