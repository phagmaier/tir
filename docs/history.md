# Tir: completed work and historical evidence

Use the [live plan](plan.md#current-status) for scope, status and open gaps.
These completed task records describe work as it happened; their commands,
requirements and notes may be superseded. Use the [architecture](architecture.md#working-here)
for current run instructions and [findings](findings.md#editor) for current
editor guidance.

- [Stage 0 · Skeleton and page engine](#stage-0-skeleton-and-page-engine)
- [Stage 1 · Writing](#stage-1-writing)
- [Stage 2 · Library, projects and drafts](#stage-2-library-projects-and-drafts)
- [Stage 3 · PDF](#stage-3-pdf)
- [Stage 4 · Final Draft files](#stage-4-final-draft-files)
- [Stage 5 · Find, formatting check, spell check](#stage-5-find-formatting-check-spell-check)
- [Stage 6 · GitHub backup](#stage-6-github-backup)
- [Stage 7 · Release build and hardening](#stage-7-install-and-finish)
- [Editor experiments and measurements](#editor)

## Stage 0: skeleton and page engine

- [x] 0.1 — Toolchain and app skeleton
  - Status: done
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
  - Evidence: 2026-11-26, inside `nix develop`: `mise run check` exited 0
    (Biome clean, both type checks, 13 Vitest tests, rustfmt, clippy with
    `-D warnings`, cargo test), and exited 1 when a type error was added to
    `src/core/`. Breaking the guard (dropping the Tauri pattern, adding the
    DOM lib to the core) made 5 guard tests fail. `mise run dev` opened a
    "Tir" window on Hyprland (workspace 1); a grim screenshot showed the
    Night page (#141920) on the #0a0d11 desk with slab-serif text, which is
    the bundled Courier Prime since the system's fallbacks are sans-serif.
    The first launch failed with `libgdk-3.so.0` missing; the fix is in
    findings "NixOS development shell". Reviewed with user-code-review:
    removed an unused `@tauri-apps/api`, duplicate package scripts and a
    `.deb` bundle target that pre-empted Stage 7.

- [x] 0.2 — Script model and draft file
  - Status: done
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
  - Evidence: 2026-11-26, `src/core/draft-file.test.ts` (35 tests): the
    `everyFormat` fixture (all eight types, bold, italic, underline, dual
    dialogue, centred, forced page break, line break, empty element,
    non-ASCII, full title page) reads back equal after writing; a small
    script writes exactly a hand-written file; 25 damaged variants (empty,
    truncated, wrong format, bad version, unknown fields, bad spans, bad
    flags, dual on dialogue) and newer versions are refused with messages
    naming the problem, and a file damaged at its last element is refused
    whole. Review added that `writeDraft` throws rather than write a file
    it cannot read back. `mise run check` exited 0 (48 tests).

- [x] 0.3 — Fountain reader and writer
  - Status: done
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
  - Evidence: 2026-11-26, `src/core/fountain/*.test.ts` (135 tests):
    `read.test.ts` has a group with worked examples for every section of
    fountain.io/syntax (headings and scene numbers, action, characters,
    dialogue, parentheticals, dual dialogue, lyrics, transitions, centred
    text, emphasis, title page, page breaks, punctuation, notes, boneyard,
    sections, synopses); `write.test.ts` gives the exact Fountain for 34
    forcing cases (including `BANG\nThe door shakes.` written as
    `!BANG…`), and `everyFormat` (whose all-caps `TIDE TABLE` action would
    read as a cue) survives model → Fountain → model unchanged. A seeded
    random round trip of 300 scripts runs in the suite; a one-off sweep of
    12,000 more across four seeds also passed. Review fixed a `/` before
    `**` opening boneyard, a cue ending in `^` reading as dual, and title
    keys like `constructor:` matching object properties.
    `mise run check` exited 0 (183 tests).

- [x] 0.4 — Line layout
  - Status: done
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
  - Evidence: 2026-11-26, `src/core/layout.test.ts` (33 tests, expected
    lines and positions worked by hand from findings' table): each of the
    eight types' indent, space before and capitals; wrapping at 60, 35, 37,
    26-then-25 and 16 characters, including exact fits; right-aligned
    transitions; centred lines; line breaks; an empty element; words longer
    than a line; composed and decomposed accents, dashes, "ñ" and an emoji
    counting one character each; "ß" kept in capitals. Values live in
    `src/core/format.ts`. `AllCaps` confirmed in the cited FDX files and
    added to findings; dual dialogue columns are provisional and 0.8 now
    measures them and hyphen breaks. Review caught an emoji split by the
    plain-text fast path. `mise run check` exited 0 (216 tests).

- [x] 0.5 — Pagination
  - Status: done
  - Depends on: 0.4
  - Spec: brief "Page parity", "Elements and keys" (automatic); findings
    "Final Draft's default screenplay format"
  - Do: Break the laid-out lines into pages, with lines per page a setting
    until 0.8 settles it. Keep scene headings and shots with what follows.
    Split action and dialogue only at a sentence end, re-wrapping both
    parts. Add (MORE) and (CONT'D) to a split speech, and the automatic
    (CONT'D) for a speaker who returns after action. Honour forced page
    breaks. Number pages from page 2.
  - Done when: unit tests with worked examples pass for each rule, and
    `mise run pagination-timing` shows a median under 16 ms for a
    roughly 120-page script on this machine.
  - Evidence: 2026-11-26, `src/core/paginate.test.ts` (22 tests, worked by
    hand on short pages): space before dropped at a page top; forced breaks
    without a blank first page; headings and shots moved with what follows;
    action split at a sentence end with the rest wrapped afresh, moved whole
    when it has none, and split at a line when longer than a page; dialogue
    split at "Go home." with (MORE) and "MAYA (CONT'D)", moved whole without
    a sentence end, split before but never after a parenthetical, no lone
    cue; automatic (CONT'D) and its four exceptions; dual columns; numbers
    shown from page 2. Speed: an original 122-page script (1,970 elements)
    paginated in 3.6 ms fastest, 4.6 ms median over 40 runs (Node 24, this
    machine). Lines per page is the `linesPerPage` option. Rules still
    provisional are listed in findings for 0.8. `mise run check` exited 0
    (238 tests).

- [x] 0.6 — Review: the core and the page engine
  - Status: done
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
  - Evidence: 2026-11-26, reviewed with user-code-review at HEAD
    `c4a2175bf025d924c0f95d2c30c3a36f7d2866c3` plus uncommitted changes
    (all of 0.1–0.5 is uncommitted). Checklist: `src/core/` imports only
    core modules (Node and Vitest only in tests), and real probe files made
    `mise run check` exit 1 for a ProseMirror import, a Tauri import and
    `document`; no format value outside `format.ts` matches findings'
    table; lockfiles present and not ignored, runtimes pinned exactly,
    `mise run install` passed pnpm's supply-chain check; the speed test's
    script is 122 pages. Findings fixed: no test had a speech longer than a
    page (added one splitting at sentence ends over four pages and one
    splitting at lines); the placeholder's CSS repeated 12 pt (now
    `FONT_SIZE_PT`); the draft file wrote U+2028 and U+2029 raw (now
    escaped, with a test that fails without it); the Fountain reader's
    collapsing of extra blank lines and dropping of title page emphasis
    were undocumented (now in `read.ts`). Nothing deferred beyond Known
    gaps. `mise run check` exited 0 (241 tests); `mise run dev` still shows
    the page.

<a id="task-0-7"></a>

- [x] 0.7 — Parity check tool
  - Status: done
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
  - Evidence: 2026-11-26. Libraries chosen and recorded in findings ("PDF
    libraries"): unpdf to read, @cantoo/pdf-lib with @cantoo/fontkit to
    write (dev dependencies until Stage 3). `tools/parity/parity.test.ts`:
    an original 11-page script, written as a plain PDF and as one with a
    title page, scene numbers, CONTINUEDs and a run per word, is rebuilt
    exactly (`toEqual` the script), page numbers and (MORE)s are found, and
    every page matches; a break forced before a mid-page heading is
    reported as the first differing page, with the pages before it the
    same; a PDF made at 50 lines matches at `--lines 50`; split runs,
    ligatures, double printing and an unknown indent are handled or noted.
    One recorded sweep of 120 generated PDFs matched 1,280 of 1,304 page
    starts, and every differing page was preceded by a note. The
    [documented 40-script corpus](findings.md#reading-screenplay-pdfs) has
    a different denominator; these records do not identify the same run.
    `mise run parity -- <three PDFs>` printed the per-page report and
    summary. `mise run check` exited 0 (247 tests).

- [x] 0.8 — Calibration against Final Draft
  - Status: done
  - Depends on: 0.7
  - Spec: brief "Page parity", "Still to settle"
  - Do: Collect public screenplay PDFs whose metadata names Final Draft as
    the producer, preferring ones without scene numbers or revision marks,
    into the ignored calibration folder. Run the tool, study each mismatch,
    and adjust the engine. Use Beat's pagination as a reference where the
    corpus cannot decide. Settle lines per page, how headings, cues and
    parentheticals are kept off a page's foot, how dual dialogue splits,
    and whether page numbers end with a period. Also measure the dual
    dialogue columns' indents and widths, which 0.4 set provisionally
    because FDX files do not hold them, and whether lines break after
    hyphens and dashes (0.4 breaks only at spaces). Teach the parity tool
    to read dual dialogue once its columns are known (0.7 does not).
  - Done when: findings.md records each of those facts with its evidence,
    and every calibration page starts on the same line as Final Draft's,
    or each remaining mismatch is explained in findings.md and listed
    under Known gaps.
  - Evidence: 2026-11-26. 14 PDFs with Final Draft as Creator downloaded
    from studio awards pages into `calibration/`; 7 kept as the
    calibration set, 7 set aside with reasons (findings, "Calibration").
    Settled and recorded with evidence in findings ("Line widths",
    "Pagination", "Dual dialogue"): 54 lines with (MORE) below and the
    repeated cue above; widths 61/35/38/26/25/16 and 29 in dual columns;
    breaks after hyphens, with a hanging hyphen; two lines each side of a
    split; a parenthetical may end a page above (MORE); transitions stay
    with what precedes them; dual dialogue columns and centred cues; page
    numbers "2.". `mise run parity`: page by page 582 of 605 pages end
    where Final Draft's do (99 pages ending inside action and 13 with
    image gaps left out, as the PDF cannot decide them); 270 of 722 start
    on the same line read from page 1. The 23 differing pages are
    explained by category in findings and listed under Known gaps. Each
    engine change has a test that fails without it (checked by mutating
    each rule). `mise run check` exited 0.

- [x] 0.9 — Review: Stage 0
  - Status: done
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
  - Evidence: 2026-11-26, reviewed with user-code-review at HEAD
    `c4a2175bf025d924c0f95d2c30c3a36f7d2866c3` plus uncommitted changes
    (everything since 0.6, all uncommitted). Checklist: the tool's tests
    cover split runs, ligatures, double printing, off-grid styled runs,
    unknown indents (noted, read as action), page-top shots and ambiguous
    action (noted), image gaps, the page number and repeated cue above the
    body, and hyphens rejoined with or without a space; every engine change
    from 0.8 failed a test when mutated away (transition keep, two-line
    minimum and its relaxation for over-long elements, parenthetical before
    (MORE), two dialogue lines above (MORE), (MORE) and the repeated cue
    outside the 54 lines, widths 61 and 38, hyphen breaks, hanging hyphen,
    off-grid spacing); findings name the PDFs and pages behind each fact;
    `git ls-files` and `git status --ignored` show no PDF or FDX tracked or
    trackable, with `calibration/` ignored. Found and fixed: off-grid
    spacing had no test. Pagination still takes 4.8 ms median for 121
    pages. Not changed: `tools/parity/rebuild.ts` is long (807 lines) but
    holds one job. `mise run check` exited 0 (255 tests).

- [x] 0.10 — User check: Stage 0
  - Status: done
  - Depends on: 0.9
  - Check: in a terminal in the project, the user runs `mise run parity`
    and reads its summary for the calibration scripts, then runs
    `mise run dev` and sees the app's window.
  - Evidence: 2026-11-26. The user's first `mise run dev`, outside the Nix
    shell, failed (`gdk-pixbuf-2.0` not found); `dev` and `check` now enter
    the shell themselves. The user then ran Tir on their laptop and
    reported that it passed the visual check. A copy holding only the files
    git would commit was set up and checked from scratch on the desktop
    ("Setting up a machine" in architecture.md).

## Stage 1: writing

Stage 1 edited one draft file directly. Its opening and saving flow was
superseded by [autosave](#task-2-2) and the [Projects screen](#task-2-3).

- [x] 1.1 — Editor spike: ProseMirror showing the engine's breaks
  - Status: done
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
    measurements; typing a character on a 120-page script re-lays out in
    under 16 ms typically and reaches the screen within about two frames
    (the user accepted this target on 2026-11-26, replacing a full redraw
    in under 16 ms); cursor movement and selection behave as in a normal
    text editor. If any of these fails, stop and bring the alternatives to
    the user.
  - Evidence: 2026-11-26, `mise run check` passed (256 Vitest tests, both
    type checks, Biome and Rust checks). Native WebKitGTK verified caret
    motion and selection across wraps and a page gap, Backspace, undo,
    and dead-key and Compose input. The 120-page typing check measured
    38 ms median and 41 ms p95 before paint. See findings.md, "Editor".
  - Decision (2026-11-26): the user approved keeping one editable
    ProseMirror surface and updating it incrementally. Profile the
    complete edit path before choosing what to optimize; reuse unchanged
    layout and decorations where useful. Recheck the same 120-page
    fixture with ordinary typing and edits that shift a page break, and
    repeat the native editing checks. Do not switch to a windowed editor
    without a new decision. The 16 ms target and stop conditions stand.
  - Evidence: 2026-11-26, second attempt. Profiling found the time in
    `DecorationSet.create` and in WebKitGTK work over the whole editable
    element; the projection is now incremental (`src/ui/projection.ts`),
    line breaks survive styled text, and typing goes from `beforeinput`
    straight to the document. On the 120-page fixture, typing lays out in
    9–11 ms median before paint, but reaches the end of the next rendering
    update in 18–21 ms and keeps the main thread busy 18–25 ms; Backspace
    that removes a page takes 47–63 ms. Native checks passed for caret
    motion and selection across a line break and a page gap, Backspace,
    Ctrl+Backspace, Delete, joining elements, undo, dead keys and Compose.
    `mise run check` passed (264 Vitest tests, both type checks, Biome and
    Rust checks); reviewed with user-code-review (four small fixes to the
    input handler and naming). Measurements and causes: findings.md,
    "Editor".
  - Options (2026-11-26): (a) keep this editor and accept a redraw of about
    one and a half frames, with 50–70 ms when a page in the middle is
    removed; judge the feel on the laptop first. (b) Keep one surface but
    group elements under scene nodes in the ProseMirror document, so
    WebKit lays out about 150 blocks instead of 2,280; the surrounding
    text cost (3.5 ms) stays; needs its own spike. (c) A windowed editor:
    only the pages around the caret are editable, the rest drawn from the
    engine; removes the whole-script costs but needs caret, selection and
    find handling across the window's edge.
  - Decision (2026-11-26): the user chose option (a): "yes that seems like
    an acceptable speed and should be fine. so we can change that to
    acceptable and mark that fine." The measured speed meets the revised
    "Done when" above: 9–11 ms layout and 18–21 ms to the end of the next
    rendering update for typing; the 50–70 ms pause when Backspace removes
    a page mid-script is accepted.

- [x] 1.2 — Review: the editor approach
  - Status: done
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
  - Evidence: 2026-11-26, reviewed with user-code-review at HEAD
    `c9a85c391e66cc0b537aecb1ecfc2748d14a6669` plus uncommitted changes
    (all of 1.1 is uncommitted). The approach holds; no change of approach
    needed. Checklist: design rule 1 measured by a new
    `mise run editor-placement` (every engine line starts within a pixel of
    its engine position and a click there lands before its first
    character): 4,200 lines on the 120-page fixture, 5,040 on
    `?fixture=feature`, and the new `?fixture=every` (dual dialogue,
    centred, transition, parenthetical, styles, typed line breaks), all in
    place; trailing and doubled typed line breaks placed too. One mapping,
    `editor-model.ts`, which the projection also uses; its round-trip test
    now covers all eight types, every format and a 1,970-element script.
    Speed re-measured with `mise run editor-timing`: typing 10–14 ms layout,
    16–22 ms frame, Backspace removing a page 56–57 ms, as in findings. A
    probe plugin with 6,240 find highlights, 1,080 squiggles, 228 margin
    dots and a ghost completion kept every line in place and typing at
    12–13 ms layout, 16–18 ms frame (findings, "Editor"). (MORE), the
    repeated cue and page numbers have their rows reserved by the engine
    and will be drawn outside the editable element (1.3). Fixed:
    `tools/editor-timing` did not await its async setup scripts (the
    inspector returns promises unawaited) and focused the editor with Tab,
    which 1.4 makes an editing key; both fixed, with the shared inspector
    code moved to `tools/inspector.ts`. `mise run check` exited 0 (254
    Vitest tests).

- [x] 1.3 — Pages in the settled look
  - Status: done
  - Depends on: 1.2
  - Spec: brief "Look"; prototype piece 5; docs/prototype/look.css
  - Do: Render the editor as separate sheets: Night paper and white paper,
    page numbers, and (MORE) and (CONT'D) as uneditable marks. Build the
    Desk layout (top bar, sidebar, canvas) from look.css's tokens in
    `src/ui/`.
  - Done when: screenshots of the app match prototype piece 5 in both
    papers at 100% zoom, checked side by side.
  - Note (from 1.1): the Desk layout must keep the document as the
    scroller and add no touch or wheel listeners (architecture, "The
    editor"). Dual dialogue is not drawn side by side yet: the projection
    pulls the right column up with a negative margin, so the right
    column's paragraphs overlap the left column's rows. 1.2's placement
    check found every line placed and clicks on each line's first character
    landing on the `every` fixture; check clicks in the columns again here.
  - Note (from 1.2): draw (MORE), repeated cues, the automatic (CONT'D)
    after a cue and page numbers outside the editable element, at the
    engine's rows, so they add nothing to WebKit's editing work.
  - Evidence: 2026-11-26. Screenshots at 1440×900 and 100% zoom of
    `?fixture=sample` (piece 5's script) beside piece 5 in the same webview,
    Night and white paper, at the top of page 1 and across pages 2 and 3
    and the dual dialogue: the top bar, title, element buttons with the
    current one highlighted, sidebar and canvas chrome, sheet size,
    position, gap and shadow, paper and ink colours, text, the page number
    "3.", (MORE), the repeated cue and the automatic (CONT'D) match; a pixel
    diff at 2% tolerance differs only where listed here. Differs, by
    design: three action paragraphs and where ELLIS's speech splits (the
    prototype's rough paginator wraps action at 60, the engine at 61), dual
    dialogue cues centred in their columns and the right column at
    4.625 in, and (CONT’D)'s curly apostrophe (all per findings); the
    document's scrollbar runs the window's full height beside the top bar,
    since the document scrolls; WebKit's 1 px caret, not the prototype's
    drawn 2 px one. Left for their tasks: clicking an element button (1.4;
    the buttons only show the current element), the scene list (1.7),
    "Page N of M" (1.7), the paper switch and zoom (1.8; white paper is
    `body[data-theme="light"]` until then), the saved indicator (1.9, 2.2),
    the draft name and menu (2.4), the Title page row (2.5), the findings
    count, margin dots and squiggles (Stage 5). `mise run editor-placement`
    on `every`, `feature` (121 pages, 5,040 lines, 83 marks) and `spike`
    (120 pages, 4,200 lines): every line in place, clicks on each line's
    first and last character and in the blank part of both dual columns'
    rows land, and every page number and mark sits at the engine's
    position; the check was seen to fail on a moved page number and on the
    old overlapping columns. `mise run editor-timing`, four runs, and
    alternating runs with the new layers switched off: the Desk leaves each
    edit's times as they were except typing that adds or removes a page,
    about 1 ms slower. Against the findings table, that edit's layout
    (12–14 ms against 10–11) and the `feature` line change's busy time
    (26–28 ms against 20–25) are higher; 1.2's page measured the same day
    11 ms and 27–28 ms (findings, "Editor"). Native: dead acute then `e`
    and Compose `o` `c` entered é and ©; typing with the caret under the
    top bar scrolled it clear. Reviewed with user-code-review at HEAD
    `c9a85c391e66cc0b537aecb1ecfc2748d14a6669` plus uncommitted changes:
    fixed a click beside the shorter dual column landing in the next
    element (the shorter column's last paragraph now reaches the block's
    end) and two stale comments; no other findings. `mise run check`
    passed (257 Vitest tests, both type checks, Biome and Rust checks).

<a id="task-1-4"></a>

- [x] 1.4 — Elements and keys
  - Status: done
  - Depends on: 1.3
  - Spec: brief "Elements and keys"
  - Do: The eight elements; Enter and Tab by Final Draft's table; the
    toolbar highlighting and changing the current element; Ctrl+1 to
    Ctrl+7 and Ctrl+0 (confirm WebKitGTK passes them through); automatic
    capitals and parentheses; bold, italic and underline; commands for dual
    dialogue, centred text and a forced page break. Record any key chosen
    here in brief.md.
  - Done when: table-driven editor-state tests cover the result of each
    key and command in the model. A short native check confirms shortcut
    delivery and that Enter after dialogue, then Tab, gives a new cue.
  - Note (from 1.2): the model keeps text as typed and layout applies
    capitals, keeping a character whose capital is longer ("ß"); a CSS
    capital would make it two ("SS") and move the rest of the line, so
    show capitals without changing any character's count.
  - Note (from 1.3): `src/ui/toolbar.ts` draws the eight buttons and
    highlights the current element's; they have no click handler yet, so a
    click only moves focus out of the editor. Changing the element on click
    should keep the caret in the editor.
  - Evidence: 2026-11-26. `src/ui/commands.test.ts` presses each key
    through the editor's keymap and checks the model, 88 table rows with
    results taken from the brief and Final Draft's table and keys: Enter
    and Tab from each of the eight types (Tab on an empty element and at the
    end of one with text), Enter inside, at the start and over a selection,
    Tab and Shift+Tab claiming the key everywhere, Enter after dialogue then
    Tab giving a cue, Ctrl+1 to Ctrl+7 and Ctrl+0, each top bar button,
    automatic parentheses (added, removed, ")" stepping over, "(" ignored,
    Backspace), capitals (text kept as typed, set in capitals by layout,
    "ß" kept), Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Alt+D (pairing, unpairing and
    three refusals), Ctrl+E and Ctrl+Enter; `projection.test.ts` covers the
    "ß" exemption, also through edits. Native, through the Hyprland
    dispatcher: every key reached the page and did that; Enter after
    dialogue gave an action and Tab made it a cue; Ctrl+= zoomed nothing and
    Ctrl+0 gave General; Shift+Tab and Tab kept focus; in a cue the dead
    acute then `e`, Compose `o` `c` and `ß` entered "é©ß", shown "É©ß"; a
    real click (`wlrctl`) on Transition changed the element and kept the
    caret and focus. `mise run editor-placement` on `every` (now with text
    typed in lower case and "ß"), `feature` (5,040 lines, 83 marks) and
    `spike` (4,200 lines): every line in place and every paragraph showing
    the engine's text; the new shown-text check was seen to fail with the
    "ß" exemption or the capitals switched off. `mise run editor-timing`,
    two full runs (a third was cut short by a source edit reloading the
    page): as in findings ("Editor"), ordinary typing 10–11 ms layout,
    18–19 ms frame, 19–21 ms busy. Screenshots at 1440×900 showed the
    capitals and the top bar after a click. Reviewed with user-code-review
    at HEAD `c9a85c391e66cc0b537aecb1ecfc2748d14a6669` plus uncommitted
    changes: made the commands only the keymap uses private, wrote the top
    bar test's rows out in full, and corrected two document claims (Final
    Draft's element keys; that Ctrl+0 resets no zoom, from Ctrl+= zooming
    nothing). `mise run check` passed (346 Vitest tests, both type checks,
    Biome and Rust checks).

<a id="task-1-5"></a>

- [x] 1.5 — Autocomplete
  - Status: done
  - Depends on: 1.4
  - Spec: brief "Scope" (Autocomplete); prototype piece 1 (autocomplete)
  - Do: Suggest character names, cue extensions, scene heading prefixes,
    locations already used, times of day and common transitions, ranked by
    use. Show the popup and the ghost completion as in the prototype; Enter
    accepts, the arrows choose, Esc closes.
  - Done when: tests cover each suggestion source and the keys, and the
    popup works in the app on both papers.
  - Note (from 1.4): `screenplayKeys` (`src/ui/commands.ts`) claims Enter
    and Tab in every state, so the popup's keys must be handled before it
    (an earlier keymap or plugin). Final Draft's Tab inside a scene heading
    also completes its parts ("INT." then " - " then the time); the brief
    names Enter, the arrows and Esc only.
  - Decision (2026-11-26): asked about Tab, the user chose "Tab accepts,
    exactly like Enter. With the popup closed, Tab stays as in 1.4."
  - Evidence: 2026-11-26. `src/core/suggestions.ts` holds the six sources
    and a tally of uses that follows each edit by the elements it changed;
    `src/ui/autocomplete.ts` is a plugin before `screenplayKeys`, drawing
    the popup and ghost beside the editable element. 57 new tests, expected
    results worked by hand from the brief, Final Draft's SmartType
    (findings, new section) and prototype piece 5:
    `src/core/suggestions.test.ts` types into each source after a small
    script (names ranked by speeches, extensions from "(", the five
    prefixes, locations after the prefix, times after " - ", transitions;
    Final Draft's defaults in its order; a part already in full, or empty,
    opens nothing; the script's most used form; the tally followed through
    edits equals a recount). `src/ui/commands.test.ts`, its harness now
    pressing keys through autocomplete then the screenplay keymap as the
    editor does: piece 5's heading "INT. HALCYON - WHEELHOUSE - " offers
    Time of day with NIGHT (6 uses), CONTINUOUS (3) and Final Draft's other
    seven, ghost "NIGHT"; Enter and Tab accept, Down and Up choose and wrap,
    Esc closes and Enter then starts the dialogue; a name typed in full or a
    new one leaves Enter to start the dialogue; an accepted name is written
    as the script writes it, a prefix as Final Draft does with its space; a
    heading part by part (prefix, then locations, then times); deleting
    reopens; names typed since opening are offered; moving the caret
    closes; arrows and Esc pass through when closed; and all 1.4 rows pass
    unchanged with the plugin in front. Native, on the tiled 931×1010
    window: typing opened the popup, the arrows, Enter, Tab and Esc worked,
    a real click on a suggestion accepted it and kept focus; with the popup
    open in a cue the dead acute then `e` and Compose `o` `c` entered "é©"
    (closing it), as in an action; with it open, all 103 paragraphs of
    `?fixture=sample` sat where they sat with it closed. Screenshots at
    1440×900 of the popup and ghost on Night and white paper beside piece 5:
    same colours, type, spacing and footer; it starts at the caret where the
    prototype's sits about 50 px left of it (its `ch` offset is in the
    popup's font), and it lists Final Draft's times in its order. `mise run
    editor-timing`, two runs plus alternating runs with the plugin removed:
    no change (findings, "Editor"); its new row, typing in a cue with the
    popup open, matches typing in an action. `mise run editor-placement` on
    `every`, `feature` and `spike`: every line in place. Reviewed with
    user-code-review at HEAD `c9a85c391e66cc0b537aecb1ecfc2748d14a6669` plus
    uncommitted changes: fixed the popup running past the window's right
    edge, and `tools/inspector.ts` leaving a socket open when it found no
    target, which kept later connections from the page (findings, measuring
    traps). `mise run check` passed (403 Vitest tests, both type checks,
    Biome and Rust checks).

<a id="task-1-6"></a>

- [x] 1.6 — Undo and redo, copy and paste
  - Status: done
  - Depends on: 1.4
  - Spec: brief "Copy and paste"
  - Do: Undo and redo with sensible grouping (a burst of typing is one
    step; an element change is one step). Copying within Tir keeps element
    types; copying out gives Fountain text; pasting from outside reads
    Fountain, with anything ambiguous becoming Action.
  - Done when: tests cover the undo grouping and the three paste and copy
    paths, including plain prose pasted from elsewhere.
  - Note (from 1.5): accepting a suggestion is one transaction replacing
    the typed part (`accept` in `src/ui/autocomplete.ts`); prosemirror-history
    now joins it to the typing before it or not by its 500 ms rule.
  - Evidence: 2026-11-26. `src/ui/undo.ts` groups undo (commands mark a
    step's start, `newStep`, or a step of its own, `ownStep`);
    `src/ui/clipboard.ts` replaces ProseMirror's clipboard handling, whose
    HTML brought a pasted cue and dialogue back as action (observed);
    `src/core/clipping.ts` holds the clipboard's three forms. Rules in
    brief, "Elements and keys" (Undo and redo) and "Copy and paste", all
    agent-selected. Tests, expected results worked by hand from the brief
    and Fountain's rules: `src/core/clipping.test.ts` (a Fountain scene, a
    line of prose as text, lines and paragraphs of prose, a title page read
    as script, notes and boneyard left out, centring, a break, dual,
    emphasis and Tir's notes; the Fountain written for a scene, forced
    elements, formats, a shot, parts and text; Tir's form read back exactly,
    eight refusals); `src/ui/clipboard.test.ts` (what copying takes; text
    and elements pasted at the caret, over selections and over everything;
    cut, and paste restoring it; the three paths end to end, plain prose
    included; a paste with the popup open; paste and cut each one undo
    step); `src/ui/commands.test.ts` (a burst, pauses of 400 and 600 ms,
    typing elsewhere, Ctrl+Shift+Z and Ctrl+Y, element changes by key and
    top bar, Enter and Tab joined by the typing after, six format keys, an
    accepted suggestion, undo opening no popup); `projection.test.ts` (a
    30-element paste and its undo followed as any edit). With the step marks
    and the history check switched off, 8 grouping tests failed. The test
    harness moved to `src/ui/editor-harness.ts`, with the history and undo
    keys and a clock. Native, through the Hyprland dispatcher, `wl-clipboard`
    and `wtype` on the tiled 931×1010 window: Ctrl+C of a cue and dialogue
    offered only text types, "TEO\nYou said we weren't running tonight.";
    Ctrl+V put them back as cue and dialogue; Ctrl+Z, Ctrl+Shift+Z and
    Ctrl+Y undid and redid it with the caret back at the paste; Ctrl+X of a
    speech with its parenthetical gave its Fountain and Ctrl+Z restored the
    selection; a Fountain scene from `wl-copy` arrived as heading, action,
    cue, parenthetical, dialogue and transition, a line of prose went into
    an action's text, two paragraphs of prose arrived as two actions; a
    centred dialogue and the elements after it kept their types and
    centring through Ctrl+C and Ctrl+V; WebKitGTK delivers these events
    with no Tauri clipboard plugin (findings, "Editor"). The native check
    found that after a redo Ctrl+Z put the caret on the element after a
    paste; the paste now leaves unchanged elements out of its step, and the
    caret came back. The dead acute then `e` and Compose `o` `c` entered
    "é©" in an action and in a cue, and Ctrl+Z took the burst back; with
    the popup open in a new cue, Ctrl+V of "ara" closed it and Enter started
    the dialogue. Pasting the 120-page fixture's Fountain into it took
    308–349 ms to layout and 320–361 ms to the frame, its Ctrl+Z 85–88 and
    91–95 ms (findings, "Editor"). `mise run editor-timing`, two full runs
    and an A/B with the new `appendTransaction` removed: typing as in
    findings. Reviewed with user-code-review at HEAD
    `c9a85c391e66cc0b537aecb1ecfc2748d14a6669` plus uncommitted changes:
    fixed the end part a cut or paste leaves of an element keeping the
    forced break and dual that went with its start; no other findings.
    `mise run check` passed (488 Vitest tests, both type checks, Biome and
    Rust checks). Not run: `mise run editor-placement` (no decoration,
    styling or projection change) and screenshots (nothing visible
    changed). Not checked: drag and drop, and middle-click paste (Known
    gaps).

<a id="task-1-7"></a>

- [x] 1.7 — Scene sidebar, page position, Go to page
  - Status: done
  - Depends on: 1.3
  - Spec: brief "Scene sidebar", "Page position"
  - Do: The sidebar lists scenes with number, heading and starting page,
    highlights the scene holding the cursor, and jumps on click. The top bar
    shows "Page N of M". Go to page has a key, recorded in brief.md.
  - Done when: tests check the scene list and page numbers against the
    engine, and the sidebar and Go to page work in the app.
  - Decision (2026-11-26): asked with prototype piece 7 (new), the user chose
    Go to page in the top bar ("Page N of M" turns into a field, A) over a
    popover, and "Page N of M" following the caret over the scrolled view
    the earlier pieces simulated. Recorded in brief "Page position".
  - Evidence: 2026-11-26. `src/core/script-map.ts` maps the engine's pages:
    each scene's heading (in capitals) and the page and row it starts on,
    the page of any place, each page's first line; the projection builds it
    with every edit. `src/ui/sidebar.ts` and `src/ui/page-position.ts` are
    view plugins handed the projection; `src/ui/jump.ts` sets the caret and
    scrolls to the engine's page and row. Go to page is Ctrl+G, Final
    Draft's Go To (findings, "Final Draft's keys"); the other details are
    agent-selected in brief "Scene sidebar" and "Page position". Tests,
    expected results worked by hand or read from `paginate`'s pages:
    `src/core/script-map.test.ts` (scenes in order with a forced break and
    one mid-page, capitals keeping "ß", a heading that would fall on a
    page's last line starting the next page, an empty heading, no scenes
    and an empty script, the scene holding each element, an action split
    across pages, a split speech whose page starts at its dialogue and not
    the repeated cue, and every line of `featureScript(150)` and
    `everyFormat` against the engine); `src/ui/projection.test.ts` (the
    list, the caret's scene and page and the page count following Ctrl+1
    and a heading typed, Ctrl+Enter, Ctrl+2, a heading deleted, two scenes
    pasted and the paste undone). Native, through the Hyprland dispatcher
    and `wlrctl`, on the 120-page fixture: Ctrl+G reached the page and
    opened the field on the current page; 57 and Enter put the caret at
    page 57's first line (the engine's: element 1,064, offset 0), scrolled
    to 56 × 1,086 px, with focus back in the editor and the next key typed
    there; 999 went to page 120; Esc, and Enter on letters, kept the caret;
    leaving the window kept the field open; real clicks on scenes 7 and 30
    put the caret at their headings with focus kept, highlighted them and
    scrolled to their pages; Down and Up moved the highlight between
    scenes 1 and 2 of `?fixture=sample`, and Down across page 1's gap gave
    "Page 2 of 120"; "Page N of M" read 1 of 120 after Ctrl+Home, 60 of 120
    after a real click on page 60 (the engine's page for that caret) and
    120 of 120 after Ctrl+End; a letter typed in a heading reached its row;
    a MutationObserver saw no write to the sidebar or the top bar in five
    letter-and-Backspace pairs. The dead acute then `e` and Compose `o` `c`
    entered "é©" in a cue and in an action. `mise run editor-timing`, two
    full runs plus alternating runs with parts removed: typing as in task
    1.6 except the page added on the forced-break fixture, 15 ms layout
    against 13, where every later scene's page number changes; the first
    build's 35–38 ms for that edit was traced to the list's rows and cut
    (flex rows, the list's writes after the frame; findings, "Editor"). A
    real click on a scene took 2–2.5 ms to layout and 13.5 ms to the next
    frame, Go to page 4.5–5 ms and 14.5–16.5 ms. `mise run
    editor-placement` on `every`, `feature` (5,040 lines, 83 marks) and
    `spike` (4,200 lines): every line in place. Screenshots at 1440×900
    beside piece 5 on Night and white paper: the scene list's pixels equal
    piece 5's at 2% tolerance once moved up by the Title page row it lacks
    (2.5); "Page 1 of 5" reads alike, at the bar's right end until the
    findings count and saved indicator come (Stage 5, 1.9, 2.2). Reviewed
    with user-code-review at HEAD `ebce3b8` plus uncommitted changes: fixed
    the field closing when the window lost focus, a scene click reading the
    list as it was before an edit, and two comments; no other findings.
    `mise run check` passed (497 Vitest tests, both type checks, Biome and
    Rust checks).

<a id="task-1-8"></a>

- [x] 1.8 — Zoom, focus mode, the paper switch, and settings
  - Status: done
  - Depends on: 1.3
  - Spec: brief "Scope" (Focus mode, Zoom, Dark and light themes), "Still
    to settle" (keys)
  - Do: Zoom keys and the sidebar control; focus mode; the paper switch in
    the sidebar footer. Settle the keys for zoom, focus mode and the next
    finding (Ctrl+0 is General) and record them in brief.md. Remember these
    settings in the user's config directory, not in the library.
  - Done when: each works in the app, survives a restart, and the brief
    lists the keys.
  - Note (from 1.7): `jumpTo` (`src/ui/jump.ts`) scrolls by the engine's
    page and row at 96 px to the inch, and the sidebar is a flex column
    whose scene list takes the space above the footer; zoom must scale the
    jump.
  - Decision (2026-11-26): asked whether settings outside the library
    break design rule 4, the user chose a settings file per machine in
    Tir's config directory over the library (backed up, but every change a
    commit and a pause when both machines change) and WebKit's storage;
    rule 4 and AGENTS.md now name it as the one exception. Asked with
    prototype piece 8 (new), the user chose a toggle at the top bar's left
    end (A) over a rail (B) for collapsing the sidebar. Both recorded in
    brief "Scene sidebar", "Zoom, focus mode and the paper" and "Look".
  - Evidence: 2026-11-26. `src/core/settings.ts` reads and writes the
    settings file and holds the zoom steps (50–200%);
    `src-tauri/src/settings.rs` reads it and replaces it by temporary file
    and rename, at `~/.config/dev.tir.desktop/settings.json` or
    `$TIR_CONFIG_DIR`;
    `src/ui/desk.ts` holds the paper switch, the zoom control, the
    sidebar's toggle and the window's keys; the editor scales the script
    with a transform inside a frame sized to it, since CSS `zoom` moved
    lines off the engine's rows at 90% and 110% (findings, "Editor"). Keys
    (brief, "Elements and keys"; findings, "Final Draft's keys"): Ctrl+=
    and Ctrl+−, Final Draft's Mac zoom keys, no reset (Ctrl+0 is General);
    Ctrl+Shift+F for focus mode and Esc to leave it, as Final Draft's Esc;
    F8 for the next finding (Stage 5). New dependency: `@tauri-apps/api`
    2.12.5 (Apache-2.0 or MIT, no dependencies of its own), for `invoke`;
    no Tauri plugin. Tests, expected results from the brief and worked by
    hand: `src/core/settings.test.ts` (a hand-written file written and read
    back, no file, damaged and foreign files, one unreadable value among
    good ones, unknown fields and versions, the nearest step for a zoom
    that is not one, the steps in and out with their ends),
    `src/ui/desk.test.ts` (each key, Esc yielding to the popup or a field,
    Ctrl+0 and other keys left alone), and five Rust tests in temporary
    directories (round trip, the directory made, no file, a damaged file
    read and replaced, an unwritable place reported). Native, through the
    Hyprland dispatcher, `wlrctl` and `wtype`, with `TIR_CONFIG_DIR` a
    temporary directory (`~/.config/dev.tir.desktop` was never created):
    Ctrl+=, Ctrl+Shift+= and Ctrl+− stepped 100→110→100% with the caret's
    line staying at 987 px; Ctrl+0 left the zoom; Ctrl+Shift+F entered
    focus mode with the toast, the bars faded and the scroll threshold at
    0, focus and caret kept, and Ctrl+Shift+F or Esc left it; in focus
    mode Ctrl+G showed the top bar with its field and Esc closed only the
    field, and with the autocomplete popup open Esc closed only the popup;
    F8 reached the page. Real clicks on the paper switch, − and +, and the
    sidebar's toggle each did their job and kept focus and the caret, and
    the next key typed there. At 125% and 80% a real click on scene 30 and
    Go to page 57 each put the caret at the engine's place and scrolled to
    zoom × ((page − 1) × 1,086 + row × 16) px, its line where page 1's
    first line sits. The dead acute then `e` and Compose `o` `c` entered
    "é©" in a cue, a dialogue and an action at 110%. Left at 125%, white
    paper, focus mode and the sidebar collapsed, the settings file held
    them; after `pkill -x tir` and a fresh start the window opened in that
    state. `mise run editor-placement` on `every`, `feature` (5,040 lines,
    83 marks) and `spike` (4,200 lines) at 100%, at 110% and in focus mode:
    every line, click, shown text and mark in place. `mise run
    editor-timing` at 100% and 110%, and alternating runs for the one row
    that differed, typing that adds a page: typing as in task 1.7 at
    either zoom; a zoom step 2–3 ms to layout and 9–15 ms to the next
    frame, focus mode on or off 9–15 ms and 17–28 ms (findings, "Editor").
    Screenshots at 1440×900 beside piece 5 on both papers: the footer
    equals piece 5's pixel for pixel at 2% tolerance; at 110% and in focus
    mode (page centred in the window, the toast) the page and chrome match;
    the toggle (piece 8) is new at the top bar's left; differences left for
    other tasks as in 1.3 and 1.7. Reviewed with user-code-review at HEAD
    `68209a1` plus uncommitted changes: fixed Esc never leaving focus mode
    while the editor had focus (ProseMirror prevents every Esc's default;
    the keys now act on the way down, found by the native check), the
    current scene out of the list's view after the sidebar came back, an
    unused getter, and a test pinning an incidental key. `vite build`
    built the top-level `await` in `main.ts`. `mise run check` passed (507
    Vitest tests, both type checks, Biome and Rust checks with 5 tests).

- [x] 1.9 — Open and save a draft file
  - Status: done
  - Depends on: 1.6
  - Spec: brief "Storage"
  - Do: Open a draft file or a Fountain file, and save the draft with
    Ctrl+S, writing atomically (a temporary file, then rename). This is
    the stand-in until Stage 2's automatic saving.
  - Done when: a script written in the app saves and reopens identical,
    and an interrupted save never leaves a damaged file (tested).
  - Note (from 1.2): the projection follows transactions; opening a
    script replaces the document, so the projection must be rebuilt then.
  - Note (from 1.7): the sidebar and page position read the projection in
    their plugin views' `update`; a document put in place without a
    transaction must rebuild the projection before the view updates.
  - Decision (2026-11-26): asked where Stage 1 saves, given design rule 4,
    the user chose saving only to files picked (Ctrl+S writes back to the
    `.tir` opened or last saved, the system's Save dialog asks when there
    is none, Ctrl+Shift+S always asks, only `.tir` files are written, and
    rule 4 gains an exception until 2.2) over a library folder set in the
    settings file now and saving only a `.tir` that was opened; Ctrl+O for
    opening until the Projects screen takes it, over Ctrl+Shift+O; a
    question before discarding changes on open; refusals and failed saves
    in a system message box and "Saved · NAME.tir" in the existing toast.
    Recorded in brief "Elements and keys" (File keys) and "Saving and
    backup", architecture rule 4 and "Opening and saving", and AGENTS.md.
  - Evidence: 2026-11-26. `src/ui/files.ts` (the keys, opening, saving,
    the question), `src-tauri/src/script_file.rs` (the dialogs, through
    `tauri-plugin-dialog` from Rust only, and the paths, kept in Rust) and
    `src-tauri/src/files.rs` (temporary file, sync, rename, directory sync,
    the temporary file removed on failure; UTF-8 read strictly), which
    `settings.rs` now uses. `Editor.open` gives the view a new state after
    rebuilding the projection, sheets and frame; the toolbar, scene list
    and page position add their listeners once, since a new state makes
    ProseMirror remake plugin views (findings, "Editor"). New dependency:
    `tauri-plugin-dialog` 2.8.4, Rust only (it brings rfd 0.17.2,
    tauri-plugin 2.7.4 and tauri-plugin-fs 2.7.1), and `serde` made direct
    (already in the build); no JavaScript package; the capability stays
    `core:default`, and the page's `window.confirm`, which the plugin
    rewires, was refused. Tests in temporary directories:
    `src/ui/files.test.ts` (10, through the editor's own `scriptState` and
    the harness): `everyFormat` and the 120-page fixture saved, opened back
    equal with their title, and saved again byte for byte without a
    dialog; a hand-written Fountain file opened as its four elements and
    title; a damaged and a newer draft refused whole with `readDraft`'s
    message, nothing asked, the script and its save target unchanged;
    opening over changes asks and Cancel keeps them, and nothing is asked
    when unchanged, undone back or saved; a cancelled or failed save
    leaves the changes unsaved; after opening, Ctrl+Z changes nothing and
    a cue offers only the opened script's names; the three keys. Dropping
    the title page on open, or the saved mark on save, each failed tests.
    Rust (11 tests): a 200 KB draft-like text replaced and read back
    identical, only the file left; a write failing half way leaves the old
    file whole and no temporary file; a failed rename leaves none;
    Windows-1252 bytes refused as not UTF-8; saving only to `.tir` paths (a
    `.fountain` name gains `.tir`). Native, through the Hyprland
    dispatcher, `wtype` and `wlrctl`, with the settings and drafts in
    temporary directories: Ctrl+O, Ctrl+S and Ctrl+Shift+S reached the
    page and Hyprland binds none; the GTK Open and Save dialogs worked; a
    scene written in the app over `every.tir` (heading, italic, cue,
    dialogue, centred, dual) saved in place, saved as `written.tir`,
    reopened equal (`Node.eq`) and saved again byte for byte; opening
    `spike.fountain` left it unchanged (sha256), its Ctrl+S suggested
    `spike.tir` beside it, and the draft saved from it equals the one
    written from the model; after each open the title, scene list, "Page 1
    of N", the frame at 100% and 125%, the scroll at the top and the caret
    and focus were right, and Ctrl+Z and Ctrl+Shift+Z changed nothing; a
    damaged and a newer draft and a Windows-1252 Fountain file were refused
    in a message box with the script unchanged, and Ctrl+S then still
    saved to the script's own file; Cancel on the question kept the
    changes and Discard opened; cancelled dialogs changed nothing; no
    `.tmp` file was left. After opening, the dead acute then `e` and
    Compose `o` `c` entered "é©" in an action and a cue. `mise run
    editor-timing` at 100%, two runs: typing as in findings, the page added
    (15 and 18 ms) and focus mode on (13–14 ms) measuring the same in
    alternating runs with the file keys' listener off and on. Opening the
    120-page draft took 213–258 ms to layout and 241–378 ms to the frame,
    its Fountain 265–301 and 269–306 ms; Ctrl+S, 3–9 ms in the page and
    117–172 ms in the Rust side (findings, "Editor"). `mise run
    editor-placement` on `every`, `feature` (5,040 lines, 83 marks),
    `spike` (4,200 lines), `spike.tir` opened over `every.tir` and
    `feature.tir` opened over `spike.tir`: every line, click, shown text
    and mark in place. Screenshots of the dialogs, the message boxes, the
    question and the toast. Reviewed with user-code-review at HEAD
    `d78f0c0` plus uncommitted changes: fixed message boxes showing "Tir"
    twice (they now carry a headline), and a path a refused file could
    leave in the Rust side's state (cleared at each open); dropped a test
    of message wording; recorded the 22 ms restyle in an open (findings).
    `vite build` built; `mise run check` passed (517 Vitest tests, both
    type checks, Biome, rustfmt, clippy, 11 Rust tests). Not checked
    natively: a save failing on disk (Rust tests cover it), and the
    laptop.

<a id="task-1-10"></a>

- [x] 1.10 — Review: Stage 1
  - Status: done
  - Depends on: 1.9
  - Scope: everything changed since 1.2's recorded state.
  - Check:
    - Design rule 1 and the single source of truth still hold.
    - The keys match the brief and Final Draft's table. A short native
      WebKitGTK smoke check covers shortcut delivery under Hyprland,
      caret motion across line and page breaks, and composed input;
      don't repeat the editor-state command matrix in the app.
    - Undo grouping is right, including after autocomplete and paste.
    - Performance on a 120-page script, against findings ("Editor"):
      `mise run editor-timing` keeps typing within 1.1's accepted target
      (layout under 16 ms typically, on screen within about two frames)
      and no worse than the table there. Scrolling and the sidebar have no
      agreed target: measure them through the same inspector connection
      (architecture, "Measuring the editor") and bring the numbers to the
      user.
    - Accessibility: toolbar and controls have names, focus is visible,
      and everything is reachable by keyboard.
    - The app matches prototype piece 5 in both papers.
    - WebKitGTK quirks found are recorded in findings.md.
  - Done when: findings are fixed or listed under Known gaps, and
    `mise run check` passes.
  - Note (from 1.5): the autocomplete popup is a named listbox outside the
    editable element, and the editor does not point to it (no
    `aria-expanded` or `aria-activedescendant` on the editable root), so a
    screen reader is not told of suggestions. Attributes on the root change
    with every popup update; measure typing before adding them.
  - Note (from 1.7): a click on a scene keeps focus in the editor, and Tab
    never leaves the script, so no key reaches the scene list's buttons; Go
    to page has Ctrl+G.
  - Note (from 1.8): the paper switch and the sidebar's toggle have no key
    and keep focus in the script when clicked, so no key reaches them;
    zoom and focus mode have keys. In the tiled 931 px window the page is
    wider than the space beside the sidebar at 100%, and than the whole
    window from 110%; the document then scrolls sideways.
  - Evidence: 2026-11-27, reviewed with user-code-review at HEAD
    `ad3301449d05aff1fcd1a423d5e7e282c7e1577a` (clean at the start; Stage 1
    is `c9a85c3..ad33014`; the fixes below are in `30f8d14`), with three
    read-only reviewers (editor core; clipboard and autocomplete; shell,
    files and tools) whose findings were checked against the code or the
    app before acting. Design rule 1 and one source of truth: `mise run
    editor-placement` on `every`, `feature` (5,040 lines, 83 marks),
    `spike` (4,200 lines), and `feature` at 110% in focus mode: every line,
    click, shown text and mark in place. Found and fixed: ProseMirror can
    draw an element in the paragraph of an equal element elsewhere (a
    reviewer's sequence left a line 222 px low), so the editor checks every
    paragraph's style after each change; a typed blank line where an
    element splits across pages put the rest 16 px low, so the projection
    hides the white space the engine drops there (the placement tool now
    expects that); a centred cue ignored its centring in the engine. Keys,
    natively through the dispatcher and `wtype` on `?fixture=feature`: Down
    and Up kept the column across an engine line break and a page break
    between elements, but across a page gap inside an element Down lost
    the column and Up skipped a line (6 of 6); Tir now moves the caret
    there itself, and 6 of 6 keep the column, Shift+Down selecting across.
    Ctrl+3, Ctrl+2, typing, the dead acute then `e` and Compose `o` `c`
    ("é©"), Backspace, Ctrl+Z, Ctrl+Shift+Z, Ctrl+= and Ctrl+−, Ctrl+G and
    Esc, Ctrl+Shift+F and Esc did what the brief says. Fixed in the keys
    (tests in `commands.test.ts`): Ctrl+E or Ctrl+Enter reopening the
    autocomplete popup, so Enter accepted a name; Ctrl+Alt+D marking a
    pair that a forced break keeps apart, and Ctrl+Enter parting a pair
    side by side (both now refuse; brief updated); Backspace in a lone
    empty parenthetical leaving ")". Undo: fixed Enter at an element's
    start not joining the typing after it; natively, accepting TEO from
    "te" then Ctrl+Z gave back "te", a pasted Fountain scene went in as
    four typed elements and one Ctrl+Z took it out, and a burst with
    composed input undid at once. Also fixed: a cut starting at an
    element's end not restored by pasting there; the popup left behind by
    a zoom step (now 3 px below the caret at 100% and 110%); a jump
    keeping the window scrolled sideways; the editor without focus at
    start (the body had it); desk buttons leaving Go to page's field
    open; `files.rs` overwriting and removing an existing `NAME.tmp` it
    did not make (its temporary file is now new to each write; Rust test);
    the tools leaving inspector connections open or settings changed on
    failure. Performance: `mise run editor-timing` at 100%, two runs
    before the fixes and three after, typing as in findings (layout
    10–12 ms, frame 17–21 ms); the paragraph check costs 0.35 ms an edit
    and four alternating runs with it off and on measured alike; making
    the sidebar inert in focus mode, as first done, slowed focus mode by
    12–16 ms and was replaced (findings, "Editor"). The [scripted
    scrolling and sidebar measurements](#stage-1-scroll-probe) had no
    agreed target and were brought to the user.
    Accessibility: every top bar, sidebar and footer control has
    a name (text, `aria-label`) and the editor is a named multi-line
    textbox; controls reached by key show look.css's ring; the editor's
    focus shows only as its 1 px brass caret, its ring off by design; the
    paper switch, the sidebar's toggle and the scene list cannot be
    reached by key (asked the user), and the popup is not announced
    (Known gaps). Screenshots at 1440×900 of `?fixture=sample` beside piece
    5 on both papers: the sidebar footer equal at 2% tolerance, the page
    differing in 0.2–0.35% of pixels (the caret, three action lines
    wrapping at 61 rather than the prototype's 60, the prototype's bar),
    the top bar by design as in 1.3, 1.7 and 1.8. WebKitGTK quirks and a
    measuring trap recorded in findings. Not reproduced: the document
    scrolling past the last sheet below 100% (its height matched the frame
    at 50% and 80%). Dismissed: a scene click read against a list one frame
    stale. Deferred to Known gaps: drag and drop and middle-click paste,
    Backspace across elements against cut, closing with changes, keys for
    the controls (all asked of the user), the popup for screen readers, a
    style boundary inside a grapheme, keys typed during an open's
    question. `vite build` built; `mise run check` passed (532 Vitest
    tests, both type checks, Biome, rustfmt, clippy, 12 Rust tests).

- [x] 1.11 — User check: Stage 1
  - Status: done
  - Depends on: 1.10
  - Check: the user writes a short scene from scratch using only the
    keyboard, then opens a long Fountain script, scrolls and types in it,
    and judges whether it feels right.
  - Evidence: 2026-11-27, the user: "Yes i it feels right from testing
    it's actually suprisingly good and smooth i had no issues." No notes,
    so no tasks were added before Stage 2.

## Stage 2: library, projects and drafts

- [x] 2.1 — Library and project storage
  - Status: done
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
  - Note (from 1.8): Tir's settings file (architecture, "Settings") is the
    place outside the library for the library's own location; "Limit the
    app's file access" must leave it, and `TIR_CONFIG_DIR`, reachable.
  - Decision (2026-11-27): asked after 2.1 how the library's place is
    changed, the user kept editing the settings file's `library` (no
    control in Tir) over a folder picker; recorded in brief "Storage".
  - Evidence: 2026-11-27. `src/core/file-names.ts` (names from titles),
    `src/core/project-file.ts` (`project.json` and the changes to a
    project), `src/core/json.ts` (shared with the draft file),
    `src/ui/library.ts` (the page's side) and `src-tauri/src/library.rs`
    (the folders and files, eight commands); the settings file's
    `library` in `settings.ts` and `settings.rs`; architecture "Library on
    disk" and "File access". The page still names no path: a project by
    its folder, a draft by its file, each checked in Rust; the capability
    stays `core:default`. New direct dependency: `serde_json` 1, already
    in the build through Tauri (Cargo.lock gains only the edge). Tests in
    temporary libraries (`library.rs`, 16 of 28 Rust tests): a project
    made with its first draft, and the library and its parent folders
    with it; listing with a damaged, missing, non-UTF-8 and linked project
    file each reported, and hidden entries, files and links not projects;
    a project renamed with its folder and never over another; deleted
    alone with nothing hidden left, a damaged one deletable, a folder
    without a project file never; drafts added, renamed with their
    Fountain copy and deleted, never over a file or a copy's name;
    failures part way leave the project as it was; a change made from an
    older reading refused; `..`, paths, `.git`, NUL, overlong and
    non-draft names, and links out of the library, refused with nothing
    outside touched. Unsafe titles (`file-names.test.ts`): slashes, `..`,
    leading dots, Windows' reserved names and characters, controls and
    bidirectional marks, trailing dots, the 120-byte cut between
    characters, accents composed, duplicates by capitals, by accents'
    encoding and by Greek sigma. A damaged `project.json`
    (`project-file.test.ts`): 17 damaged files, 9 unsafe draft files and
    a newer version refused whole, and each change worked by hand. The
    settings: an old file reads with no library and a set one survives
    every save (`settings.test.ts`, `settings.rs`); `library::root`
    places the library (set, `~/`, `TIR_CONFIG_DIR`, home). Native, with
    `TIR_CONFIG_DIR` temporary, calling `src/ui/library.ts` in the running
    app through the inspector, before the review fixes: titles
    "../Salt/Line: Redux", "Salt Line", "salt line" and ".git" made the
    folders "-Salt-Line - Redux", "Salt Line", "salt line 2" and "git"
    (draft "Con" in "Con_.tir"); a project rename, fork, draft rename,
    draft delete and project delete left on disk what `find` and the files
    showed; the last draft was refused; raw `invoke` with `..`,
    `/tmp/escape`, `.git` and `../../escape.tir` was refused; damaged,
    newer and missing project files were listed with their reasons and
    left byte for byte. After the fixes: a settings file naming another
    library put projects there, a zoom change kept the field, and moving
    or dropping the library through `write_settings` was refused;
    changes from a stale reading and deleting a folder of the user's were
    refused. `~/Screenplays` and `~/.config/dev.tir.desktop` were never
    made. Reviewed with user-code-review, with one read-only reviewer, at
    HEAD `06431b9` plus uncommitted changes: fixed reads through links (a
    linked project file listed, a linked draft copied into the library by
    a rename), the page able to move the library by saving settings,
    deleting any folder, a new draft removed when naming it failed after
    the project file was in place, changes from stale readings (now
    checked against `was`, the commands one at a time), the library's new
    folders not synced, names differing only by Greek sigma counted apart,
    and `COM0`/`LPT0` taken as reserved. Deferred: case-only renames on a
    case-insensitive volume (Known gaps). `mise run check` passed (551
    Vitest tests, both type checks, Biome, rustfmt, clippy, 28 Rust
    tests). Not checked: the laptop.

<a id="task-2-2"></a>

- [x] 2.2 — Automatic saving and the Fountain copy
  - Status: done
  - Depends on: 2.1
  - Spec: brief "Saving and backup", "Storage", "Projects"
  - Do: Save a moment after typing pauses, and on switching drafts or
    projects and on closing. Write the `.fountain` copy beside each draft on
    every save. Drive the top bar's saved state. Retire 1.9's Ctrl+S save;
    Ctrl+S stays harmless. On launch, reopen the last project on its
    active draft (moved here from 2.3, below).
  - Done when: tests show saves happen after a pause and on close, the
    Fountain copy always matches the draft, and closing mid-save loses
    nothing; on launch Tir shows the project it showed when it closed.
  - Decision (2026-11-27): saving into the library needs a project to save
    into, and saving is pointless if the next launch does not show the
    project again, so reopening the last project at launch moved from 2.3
    to here. Asked how a script reaches the library until 2.3, the user
    chose: at launch the project last open on this machine (remembered in
    the settings file), over the one edited last on either machine; with
    an empty library an empty script that becomes the project "Untitled"
    at its first save; and until the Projects screen takes Ctrl+O, Ctrl+O
    opens a Tir draft or Fountain file as a new project (named from its
    title, else its file name, with one draft "First Draft"), never
    writing the file, over Ctrl+O doing nothing until 2.3.
  - Decision (2026-11-27, after 2.2): asked whether a second request to
    close, five or more seconds after the first, may close Tir without the
    page (losing what it had not saved) or whether only killing Tir should
    close a page that stops answering, the user kept the five-second
    fallback; recorded in brief "Saving and backup".
  - Note (from 1.9): 1.9's stand-in is `src/ui/files.ts` and
    `src-tauri/src/script_file.rs` (architecture, "Opening and saving").
    Retiring it also removes design rule 4's Stage 1 exception (Tir writing
    `.tir` files outside the library) and the brief's "Until automatic
    saving arrives" bullet. Saves already go through `files::replace`
    (architecture, "Writing files"); a Ctrl+S save of the 120-page draft
    waited 117–172 ms for the Rust side (writing, both syncs and the IPC)
    after 3–9 ms of the page's own work (findings, "Editor").
  - Note (from 2.1): the library's side is `src/ui/library.ts` over
    `src-tauri/src/library.rs` (architecture, "Library on disk"); nothing
    calls it yet. No command reads or writes a draft's text: add them
    there with the same checks (one `.tir` entry of a real `drafts/`, not
    a link). The copy's file is `copyOf` in `project-file.ts`; its name is
    kept free whenever a draft is made or renamed. A project change sends
    `was`, so a save that also changes `project.json` must keep the
    project's text current (`Project.text`).
  - Evidence: 2026-11-27. `src/ui/saving.ts` (the `Saver`: a save a
    second after the last change, `settle` before a switch, on Ctrl+S and
    on closing, one save at a time, a failure told once and tried again;
    `closer`; `textsInWorker`), `src/ui/draft-texts.ts` and its worker (a
    draft's and its Fountain copy's texts, off the interface thread),
    `src/ui/saved-indicator.ts`, `src/ui/opening.ts` (launch, Ctrl+O's
    stand-in, the keys); `src-tauri/src/library.rs` (`read_draft`,
    `write_draft`, and the copy written with every new project and draft),
    `src-tauri/src/closing.rs` (the window's close held for the page) and
    `src-tauri/src/dialogs.rs`; the settings file's `project`. 1.9's
    `src/ui/files.ts` and `src-tauri/src/script_file.rs` are gone, with
    rule 4's exception and the brief's "Until automatic saving arrives".
    No new dependency (`@tauri-apps/api/event` is in the package already);
    the capability stays `core:default`. Tests: `saving.test.ts` (13) on a
    temporary folder: nothing written while typing goes on, a save a
    second after it stops; after each of two saves of `everyFormat` and of
    the 120-page fixture, the Fountain copy reads as the draft and the
    draft as the screen; nothing written after undoing back; one save at
    a time, what is typed during a save saved after it; a project made at
    the first save of a script not in the library; a failure told once,
    tried again and cleared; a save that wrote the draft but not its copy
    written again after an undo (fails without the review's fix); a dead
    worker's saves made on the interface thread; closing mid-save closing
    only once the save under way and the typing since are written, a
    second request ignored; a failed save on close closing only when the
    writer chooses. `opening.test.ts` (11): the last project on its active
    draft, the first when none or gone, an empty script for an empty
    library, a damaged project or newer or missing draft reported, never
    written; Ctrl+O saving first, naming the project from the title or
    the file, saving what is typed while the project is made, refusing a
    damaged draft, and keeping the script on screen when it cannot be
    saved. Rust (31): a save writes the draft then its copy, never makes a
    draft, refuses a link or folder where the copy goes, and links and
    unsafe names for reads and saves; new projects and drafts get their
    copies, or are removed whole when a copy cannot be written. Native,
    with `TIR_CONFIG_DIR` temporary: an empty library showed an empty
    script and wrote nothing until typing, then "Untitled" with draft,
    copy and the settings' `project`; Ctrl+O on `spike.fountain` saved
    "Untitled" first and made "spike"; `every.tir` twice made "Salt Line"
    and "Salt Line 2"; a damaged draft and a Windows-1252 Fountain file
    were refused in message boxes with nothing made; every source file
    unchanged (sha256, mtime); Ctrl+S saved within half a second; closing
    while a save of the 120-page draft ran saved the letter typed after it
    and closed within a quarter second, and Tir reopened on it; closing a
    script not yet in the library 50 ms after typing made its project and
    settings before exiting, and Tir reopened on it; with the drafts folder
    read-only, "Not saved" in the warning colour and one message box over
    repeated failures, closing asked Close without saving or Cancel,
    Cancel let typing go on, and the save went through once writable;
    every draft's copy equal to `writeFountain` of its draft (8 projects);
    no temporary file left. A save of the 120-page draft blocked the page
    1–4 ms, against 190–243 ms for its texts on the interface thread
    (findings, "Editor"). `mise run editor-timing` at 100%, two runs and a
    third after the review's fixes: as task 1.10's, and typing as saves
    start and run as ordinary typing. `mise run editor-placement` on
    `every`, `feature` (5,040 lines, 83 marks) and `spike` (4,200 lines):
    nothing out of place. In the page, the editor still has no scroll
    container around it and its outline off. Screenshots of "Saved",
    "Saving…" and "Not saved" beside prototype piece 5 at 1440×900, and of
    the message boxes. Reviewed with user-code-review, with one read-only
    reviewer, at HEAD `06431b9` plus uncommitted changes: fixed a failed
    worker leaving every later save waiting for ever, a draft written
    without its copy counted as saved after an undo, a failure while
    closing not holding the next close for the page, the settings'
    `project` not written before Tir exits, and a wrong message when
    Ctrl+O made a project but could not show it; a save now writes to the
    place it started with. Deferred to Known gaps: Ctrl+O's new project
    each time, the five-second patience, the copy a save behind after a
    failure. `vite build` built (the worker as a file of its own); `mise
    run check` passed (566 Vitest tests, both type checks, Biome, rustfmt,
    clippy, 31 Rust tests). Not checked: the laptop, a release build.

<a id="task-2-3"></a>

- [x] 2.3 — Projects screen
  - Status: done
  - Depends on: 2.2
  - Spec: brief "Projects", "Look" (Projects screen); prototype piece 6
    (list)
  - Do: The list layout with New project, Rename and Delete (with
    confirmation), and the empty library state; Ctrl+O. (Reopening the
    last project at launch moved to 2.2.)
  - Done when: each action works in the app against a temporary library,
    and the screen matches prototype piece 6's list.
  - Note (from 1.9): Opening a script gives the editor a new state
    (`Editor.open`), which this screen and 2.4's draft switch can reuse.
  - Note (from 2.2): Ctrl+O is `FileOpener` in `src/ui/opening.ts`, the
    stand-in that opens a file as a new project (brief, "Projects"); this
    screen takes the key, and 2.6's import takes the opening of a file.
    Showing another project goes as Ctrl+O's does: `saver.settle()` (false
    means the script on screen could not be saved: keep it and say why),
    then, with nothing awaited in between, `editor.open` and `shown` in
    `main.ts`, which calls `saver.show` and records the project in the
    settings file's `project`. A project renamed here must update that
    field and the `Place` the saver holds (`saver.where`), or the next save
    writes to a folder that is gone. `openAtLaunch` already reopens the
    last project; its empty script for an empty library becomes the
    project "Untitled" at its first save, which the empty state may
    replace.
  - Note (from 2.1): `listLibrary` gives the projects and, as
    `unreadable`, folders whose project file is missing, damaged, newer
    or a link, with the reason; the Rust side deletes only a folder with a
    project file. `createProject` and `renameProject` take the listing for
    the names already in the library. No command gives a draft's page
    count, last edit or the library's place for the empty state's "Your
    library lives in ~/Screenplays" (`library::root` knows it).
  - Decision (2026-11-27): asked what Tir shows at launch with no project
    to open (an empty library, or the last project's draft unreadable),
    the user chose the Projects screen (the empty library, or the list
    with a message box) over 2.2's empty script that became "Untitled" at
    its first save; recorded in brief "Projects".
  - Decision (2026-11-27): asked about deleting before backup exists, the
    user chose deleting for good with the confirmation saying so ("Its 2
    drafts will be deleted from this machine. Tir has no backup of it yet,
    so this can't be undone.") over keeping deleted projects in a hidden
    folder of the library; piece 6's GitHub sentence returns with backup
    (note on 6.3).
  - Evidence: 2026-11-27. `src/ui/projects-screen.ts` (the screen: its
    top bar, the list, the empty library, the row menu, the New project,
    Rename and Delete dialogs as `<dialog>`s, its keys) and
    `src/ui/projects.ts` (rows most recent first, then folders Tir cannot
    read with why; last edit and its words; `PageCounter`; `Projects`:
    open, create, rename, remove and Import…, one at a time); `main.ts`
    (Ctrl+O and the top bar's project name, now a button, show the screen;
    launch with nothing to open shows it); `openAtLaunch` opens nothing
    instead of an empty script; 2.2's `FileOpener` became
    `Projects.importFile` (Import… until 2.6); `Saver.move`,
    `Saver.settle(report)`; `Editor.open` focuses first; `library.rs`: each
    draft file's time in the listing (`edited`), `library_place` for the
    empty library, and a rename or delete reported done once the folder
    has moved. Choices: last edit is the newest draft file's modification
    time (no format change, no extra write; a git pull resets it, findings
    "Library on disk", note on 6.1); pages are counted on the interface
    thread after the list shows and kept until the file changes (findings,
    "Editor": a few milliseconds a project, so no worker); the screen
    covers the writing window in the same page, which stays mounted and
    hidden; the empty library says "from a Fountain file" until FDX (note
    on 4.1). No new dependency; the capability stays `core:default`.
    Tests: `projects.test.ts` (25): order by last edit, ties by name, then
    unreadable folders; last edit from the drafts the project names; the
    words ("Just now" to "Oct 14, 2025", yesterday across midnight); the
    120-page fixture counted 120 pages, read again only after its time
    changes, nothing for a missing or damaged draft; open, create and
    import saving the script on screen first and keeping it when they
    cannot; rename of the project on screen settling first, waiting for a
    save under way, refused when it cannot save, and its next save going to
    the new folder; another project renamed or deleted without touching
    the saver; delete of the project on screen after its save under way,
    even when that save fails, and a failed delete saying so with the
    failed save; one action at a time, and `idle` waiting for them.
    `opening.test.ts`: nothing opens for an empty library, an unreadable
    draft or an unreadable library. `saving.test.ts`: `settle(true)` tells
    a failure once. Rust (34): draft times listed without copies, links,
    folders or notes, a save later and a project rename no edit; the
    library shown from `~`; a project out of the library deleted even when
    its files stay. Native, with `TIR_CONFIG_DIR` temporary: eight
    projects of 113–118 pages listed most recent first with pages, drafts,
    last edit and the Open tag; Ctrl+O and a real click on the project's
    name ("Projects · Ctrl+O") showed it; Esc and a click on the open row
    went back with the scroll (77,724 and 20,000 px), caret and undo as
    they were; Ctrl+= and Ctrl+Shift+F did nothing on it; a real click on
    another row opened it at its top, caret at its start, settings'
    `project` following; New project "Harbor Lights" with draft "Draft
    One" made its folder, project file, draft and copy, with an empty title
    page, and opened it; typing then Ctrl+O at once saved before listing;
    renaming the open project "Harbor Lights: Redux" moved its folder to
    "Harbor Lights - Redux", the settings and the saver, and the next save
    went there; Delete's Cancel (focused) kept a project, Delete project
    removed it; a damaged project file and a folder without one listed
    with why; the damaged one deleted, the other refused in a message box
    and kept; deleting the open project left the screen up with nothing
    open, Esc doing nothing and the settings without `project`; deleting
    the rest showed the empty library with the library's place; Import…
    there opened a Fountain file as "Night Ferry", the file unchanged
    (sha256, mtime); with the drafts folder read-only, switching and
    renaming were refused in message boxes, the script staying and "Not
    saved" on the screen; closing with the screen up right after typing
    saved the typing; launching with the last draft damaged showed the
    list and a message box, and an empty library the empty library,
    writing nothing; Esc and a click on the dimmed window cancelled a
    dialog; the menu's arrows, Esc and a click away. Screenshots of the
    list, empty library, menu and the three dialogs beside piece 6's, the
    top bar's name, unreadable folders, "Not saved" and the message boxes.
    Showing the screen over 120 pages takes about 80 ms (findings,
    "Editor"). `mise run editor-placement` on `every`, `feature` and
    `spike`: nothing out of place; `mise run editor-timing` at 100%, two
    runs and a third after the review's fixes: as task 2.2's (findings,
    "Editor"). In the page, the editor still has no scroll container
    around it, no touch or wheel listener and its outline off. Reviewed
    with user-code-review, with one read-only reviewer, at HEAD `06431b9`
    plus uncommitted changes: fixed a save failing as the screen opened
    told to no one (and every retry after it silent), a failed delete not
    saying the project's save had failed too, the last showing's rows live
    while listing (going back to the wrong project, or reopening the open
    one and losing its undo), a rename or delete reported failed after the
    folder had moved (the saver left saving to a folder gone), and closing
    during an action not waiting for it (the settings naming the old
    folder); found natively, a switch after a click on the project's name
    scrolling the new script to the old caret's place, and going back
    scrolling to the caret. Deferred to Known gaps: a new project whose
    library folder cannot be synced reported not made. `vite build`
    built; `mise run check` passed (588 Vitest tests, both type checks,
    Biome, rustfmt, clippy, 34 Rust tests). Not checked: the laptop, a
    release build, the empty library's "~/Screenplays" in the app (no
    library in the home folder on this machine; `shown`'s test covers it),
    a screen reader.

- [x] 2.4 — Drafts
  - Status: done
  - Depends on: 2.3
  - Spec: brief "Drafts"; prototype pieces 1 and 5 (draft menu)
  - Do: The draft menu: fork (copies the active draft's current state and
    title page), switch, rename and delete (with confirmation; the last
    draft cannot be deleted). Remember each project's active draft.
  - Done when: tests show a fork is independent of its original, and the
    menu works in the app.
  - Evidence: 2026-11-27. Five focused Vitest files passed (59 tests),
    including a fork of pending edits and its title page, independent saves
    after switching, failed saves and an unreadable replacement. TypeScript
    and changed-file Biome checks passed. Rustfmt and 28 focused Rust tests
    passed; rename preserves the last-save time and cleanup errors after
    deletion do not keep the saver on the old file.
    In the Tauri/WebKit app with a temporary library, the menu showed
    dates and dismissed on Escape, fork copied the script and title page,
    switching kept each draft's own edits, rename retargeted both saved
    files, and reloading opened the renamed draft. Cancel kept both files;
    confirmed delete removed them and made the other draft active; the last
    draft's Delete was disabled. Reviewed with user-code-review; tightened
    the compact toolbar so both names were visible at 931 px and verified
    the menu was clickable over the sidebar. See architecture, "Saving and
    opening".

<a id="task-2-5"></a>

- [x] 2.5 — Title page form
  - Status: done
  - Depends on: 2.4
  - Spec: brief "Title page"; findings "Title page conventions"; prototype
    piece 5 (title page)
  - Do: The sidebar's Title page row, the form with live preview, the
    draft-and-date toggle, and Esc back to the script. The title page
    belongs to the draft.
  - Done when: edits save with the draft and survive a fork, and the view
    matches prototype piece 5.
  - Evidence: 2026-11-27. Four focused Vitest files passed (47 tests),
    including title-page-only saves, an edit during a write, and a fork
    with unsaved title-page changes. TypeScript and Biome passed. In
    Tauri/WebKitGTK with a temporary library, the form matched prototype
    piece 5. Native input verified the live preview, date toggle, paper
    and zoom, Esc restoring the caret and page count, autosave to disk,
    and switching back to the original after editing the fork.
    Reviewed with user-code-review; corrected preview whitespace that
    moved the title down two lines in WebKitGTK.

<a id="task-2-6"></a>

- [x] 2.6 — Fountain import and export
  - Status: done
  - Depends on: 2.5
  - Spec: brief "Projects" (Import; Tir edits only files it owns), "Scope"
    (Import report); prototype piece 6 (import)
  - Do: Import as a new project or as a new draft of a chosen project,
    then show the import report. Open the source read-only and never write
    to it. Export a draft to Fountain at a path the user picks.
  - Done when: tests show an import leaves the source byte-for-byte
    unchanged with the same modification time, the report lists what was
    left out, and export then import gives the same script.
  - Evidence: 2026-11-27. Focused Biome and TypeScript checks passed,
    along with 151 Vitest tests and 30 Rust tests; `cargo fmt --check`
    passed. In an isolated Tauri run, imported a Fountain file as a new
    project and saw all six kinds of omissions in the report. Exported
    through the native Save dialog, then reimported into the same project
    as an independent draft; both drafts held the same script and title
    page. Both sources kept their bytes and modification times. Rust tests
    also verified that export refuses existing files and symlinks.
    Reviewed the 2.6 working-tree changes over `db8aaef` with
    user-code-review; no unresolved in-scope findings.

<a id="task-2-7"></a>

- [x] 2.7 — Review: Stage 2
  - Status: done
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
    - Saving on close cannot be skipped (2.2's `closing.rs` holds a close
      for the page, but gives up after five seconds; Known gaps).
    - A damaged project or draft file is reported, not overwritten.
    - Tauri's capabilities and file scopes are as narrow as possible.
    - Tests never touch `~/Screenplays`.
  - Done when: findings are fixed or listed under Known gaps, and
    `mise run check` passes.
  - Evidence: 2026-11-27, reviewed with user-code-review at HEAD
    `db8aaeff91340a6ac5e6fec4dc460fac33ccf1a8` plus uncommitted changes
    (2.4–2.6 and four untracked files: `drafts.ts`, `drafts.test.ts`,
    `draft-menu.ts`, `title-page.ts`), scope `git diff 30f8d14` (1.10's
    fixes), with three read-only reviewers (the Rust side and Tauri's
    configuration; saving, closing, opening and the Projects screen;
    drafts, the title page, import and export) whose findings were checked
    against the code or the app before acting. The checklist: every write
    goes through `files::replace`, `publish` or `create_new` (a hard link,
    so an export never replaces a file or link), and only an export the
    writer picked lands outside the library; an import source is read with
    `fs::read` only (its test now makes the source read-only first); names
    cannot leave the library (`entry`, `lstat` on every folder and file);
    a draft or project is deleted only after a confirmation with Cancel
    focused, the last draft never; a fork shares only immutable elements
    and title page; closing waits for the draft action, the Projects
    action and the settings, apart from the five-second fallback; damaged
    and newer files are refused, never written; no test reaches
    `~/Screenplays` or the real settings (Rust tests take paths as
    arguments or use `TempDir`; page tests use fakes or `mkdtemp`;
    `~/Screenplays` does not exist after `mise run check`). Found and
    fixed: a second Tir on the same library could save its older script
    over the first's newer work (nothing stopped a second process, by
    Tauri's source, and `write_draft` takes no `was`), so Tir now locks
    its config directory and makes its window only then (`instance.rs`,
    `"create": false`; brief "Saving and backup", findings "Desktop stack"
    and "Rejected designs"); renaming the draft on screen moved the saver
    to the project's active draft rather than the renamed one, so when
    they differed its next save went into the other draft (a reviewer's
    scratch test), now `renameDraft` gives the new file; a project file in
    place whose folder then failed to sync was reported not changed for a
    switch, fork, import as a draft, a rename keeping its name and a
    project rename, leaving the page's reading stale (`publish_project`);
    "ẞ" counted apart from "ß" and "ss" in names; a relative
    `TIR_CONFIG_DIR` failed the first project; a close request dropped
    when showing a draft action's result threw; the Projects screen able
    to start an action while closing (now inert). The capability went
    from `core:default` to `core:event:allow-listen` and the debug build's
    devtools key (architecture, "File access"). Tests added: one Tir per
    config directory (Rust), deleting projects holding links out of the
    library leaves what they reach, a draft renamed while another is
    active saves to its new file, a delete removes only the draft on
    screen and never the last, "ẞ" names. Native, with `TIR_CONFIG_DIR`
    temporary: a second Tir on it showed "Tir is already open" with no
    window and exited on OK (screenshot), one on another directory ran
    beside; with the narrowed capability, a project's draft forked, renamed
    "Polish" (saver and menu on `Polish.tir`, copy renamed), text typed and
    the window closed 33 ms later left the text in `Polish.tir`, the
    settings naming the project and no `.tmp` file. Deferred to Known
    gaps: export to drives without hard links, a foreign `project.json`
    deletable when `library` names a broad folder, projects with the same
    name looking alike, a failed folder move in a project rename, the
    draft menu and Title page row without keys; to 6.2: saves not checking
    what they replace on disk. Dismissed: the link checks' gap between
    check and use, reachable only by another program changing the library
    during a command; an export reported failed when only removing its
    temporary name failed. `mise run check` passed (593 Vitest tests, both
    type checks, Biome, rustfmt, clippy, 38 Rust tests). Not checked: the
    laptop, a release build, an export to a FAT drive.

<a id="task-2-8"></a>

- [x] 2.8 — User check: Stage 2
  - Status: done
  - Depends on: 2.7
  - Check: the user exports one of their Story Architect scripts as
    Fountain and imports it, forks a draft, edits both drafts, switches
    between them, restarts the app, and finds everything as they left it.
  - Evidence: 2026-11-27, the user: "just did that and wow i'm impressed it
    looks good, it feels good and everything appears to be working i'm very
    pleased." No notes, so no tasks were added before Stage 3.

## Stage 3: PDF

<a id="task-3-1"></a>

- [x] 3.1 — PDF export. 2026-11-27: readback tests checked hand-worked
  positions, the 7.2 pt grid, engine lines and marks, the title page,
  labels, bookmarks, metadata, subset embedding and worker fallback.
  In isolated WebKitGTK, native export made three pages with the title
  page, two without; `pdffonts` showed four embedded subsets with
  Unicode maps. A 121-page worker export took 564–597 ms; the longest
  main-thread pause was 8 ms. Review found italic ligatures breaking the
  grid; disabling them passed a regression test that failed without the
  fix. `mise run check` and `vite build` passed. Neither the release nor
  the laptop was tried. Dependency rationale: `percent-encoding` for
  the export-name header; `@cantoo/pdf-lib` and `@cantoo/fontkit` moved
  from development to runtime.

<a id="task-3-2"></a>

- [x] 3.2 — PDF verified against the engine. 2026-11-27: a one-off Node
  comparison read the first body row's text and baseline on each of
  Tir's exported pages (excluding repeated cues) against `paginate`,
  which also drives the editor. All 839 script-page starts matched:
  716 from seven reconstructed calibration scripts, two from Salt Line
  and 121 from the seeded feature fixture. This did **not** compare
  Tir's output to Final Draft's pages. Firefox 160.0.1 and Papers 51.1
  both rendered the script, allowed text selection/copy, and found
  "No boats after dark" on script page 2.

<a id="task-3-3"></a>

- [x] 3.3 — Review: Stage 3. 2026-11-27: reviewed
  `1425e2df9f41de6237291a0079d19512309f2b40` plus uncommitted changes,
  with `da76a1f` as the [2.7](#task-2-7) snapshot. Checked shared
  layout, exact positions, embedding and the OFL, metadata, navigation
  and native new-file writes. Reproduced and fixed two regressions: long
  project names clipping the draft name, and title fields with tabs
  shifting between preview and export. Both had regression cases and
  isolated native verification. `mise run check` passed. Reused 3.1's
  performance evidence; the export worker path did not change.

<a id="task-3-4"></a>

- [x] 3.4 — User check: Stage 3. 2026-11-27: after comparing a PDF to the
  editor, the user reported “everything worked as intended and looks
  good”. No issues reported.

## Stage 4: Final Draft files

<a id="task-4-1"></a>

- [x] 4.1 — FDX import. 2026-11-27: focused codec, Projects and native
  dialog tests passed, along with type checks, Biome, rustfmt and clippy.
  Isolated native import retained emphasis and dual dialogue, reported
  four omission kinds, and left the source hash unchanged. A DOCTYPE
  fixture was refused without writing to the library.

<a id="task-4-2"></a>

- [x] 4.2 — FDX export. 2026-11-27: focused Vitest, type checks, Biome,
  rustfmt and native dialog tests passed. The native Save dialog used
  the project and draft name, wrote a new file and returned focus to the
  editor. The file decoded to the on-screen draft, including literal
  XML punctuation. Final Draft was not run.

<a id="task-4-3"></a>

- [x] 4.3 — Review: Stage 4. 2026-11-27: reviewed
  `1425e2df9f41de6237291a0079d19512309f2b40` plus uncommitted changes,
  excluding work covered by 3.3. Reviewed XML limits, escaping and
  defaults, omission reports and original fixtures. Fixed and tested
  omissions on dual-dialogue wrappers and title paragraphs. The isolated
  native flow again left the source unchanged and exported a new file
  matching the draft. `mise run check` passed.

<a id="task-4-4"></a>

- [x] 4.4 — User check: Stage 4. 2026-11-27: for the Story Architect FDX
  versus Fountain import check, the user reported “I did the final draft
  check it's fine”. No notes. This did not test opening Tir's export
  in Final Draft. The user waived waiting for this check before Stage 5
  started; Stage 5 initially depended on 4.3.

## Stage 5: find, formatting check, spell check

<a id="task-5-1"></a>

- [x] 5.1 — Find and replace. 2026-11-27: focused logic and UI-state
  Vitest, type checks and Biome passed. Cases covered whole words,
  punctuation, capitals, one-step Replace all and incremental
  highlights. Isolated native checks covered real navigation, undo and
  redo, both paper settings and focus return. Cost of thousands of
  highlights justified searching after a pause; see
  [Editor findings](findings.md#editor). Review corrected selection
  seeding, stale pending searches and navigation to a lone match. The
  full check and the laptop were not run. For the Find bar's composition,
  see [piece 5](prototype/05-writing-window.html), not the earlier piece 1.

<a id="task-5-2"></a>

- [x] 5.2 — Formatting check. 2026-11-27: focused tests, type checks and
  Biome passed. Accounted for all 47 findings in seven reconstructed
  calibration scripts; see [Calibration](findings.md#calibration) for
  the later run. In isolated WebKitGTK, F8 wrapped across pages, marks
  followed edits and Undo, and simultaneous dual-dialogue marks and
  their tips were visible on both papers. Review fixed overlapping
  tips and gutter placement. Native Save dialogs were not exercised.

<a id="task-5-3"></a>

- [x] 5.3 — Spell check. 2026-11-27: reviewed `41bfe96` plus uncommitted
  changes. Core and plugin cases covered the actual Hunspell dictionary,
  learned names, suggestions, undo and persistence. In isolated
  WebKitGTK, real right-click and F7 opened the menu, adding a word
  persisted across reload, and placement had no misses with squiggles.
  The [spell-check findings](findings.md#spell-check) record the
  licences, rejected libraries, worker timings and Vite asset-inlining
  fix. Review fixed stale/split squiggles, suggestions, mapping cost,
  popup key precedence and hit testing. `mise run check` and `vite build`
  passed; the release and laptop were not tried. The user delegated
  remaining dictionary choices: accept screenplay terms and accented
  equivalents, but keep US English spellings.

<a id="task-5-4"></a>

- [x] 5.4 — Review: Stage 5. 2026-11-27: reviewed `751797f..ec7f6ea`
  (`41bfe96`, `cc213fd`, `ec7f6ea`; no uncommitted changes) with three
  independent reviewers. Verified literal escaping, whole-word matching,
  30,000 random edits against a fresh search, one-step Replace all and
  exclusion of marks from exports. Fixed large-transaction decoration
  mapping cost; timings and limitations are in [Editor findings](findings.md#editor).
  The user accepted EXT./INT. and a space after a combined prefix's
  slash; the new calibration run had 42 explained flags. Fixed live-empty
  element warnings, zoomed tips, focus and spelling suggestion issues.
  The user kept learning each word of character names and locations.
  `mise run check` passed. Native checks of mark-button presses were
  synthetic; neither the laptop nor the release was tried. A subsequent
  focused regression check confirmed that adding a word drops stale
  squiggles even when a recheck never answers.

<a id="task-5-5"></a>

- [x] 5.5 — User check: Stage 5. 2026-11-27, the user delegated the
  check: “I'm not at my computer right now I'll check later shouldn't
  you be able to see if it passes or not though? if so you check”.
  Isolated native WebKitGTK, using real keys and clicks: Replace all
  changed cues and action, Undo and Redo worked; F8 went to the flagged
  cue and fixing it reduced the count; the right-click spelling menu
  corrected a typo and supported Undo and Redo. After normal close the
  Fountain copy held the corrected names, cue and spelling. No user
  trial was claimed.

## Stage 6: GitHub backup

<a id="task-6-1"></a>

- [x] 6.1 — Git in the library. 2026-11-27: Rust tests, clippy and
  rustfmt passed. Temporary libraries covered quiet and close commits,
  repository creation and damaged, missing or busy repositories. In an
  isolated trial normal close committed only `.gitignore`, the project
  file, the draft and its copy.

<a id="task-6-2"></a>

- [x] 6.2 — Push, offline and pause. 2026-11-27: the user chose to bring
  in the other machine's work with Tir closed and to refuse a stale
  save. Rust tests with file-only transport plus clippy and rustfmt
  passed. Local bare repositories verified a normal push, retry and
  recovery, pause when a remote was ahead, and no automatic merge. In
  an isolated native trial a changed-on-disk draft was not overwritten
  and close asked whether to leave without saving.

<a id="task-6-3"></a>

- [x] 6.3 — Connect dialog and backup panel. 2026-11-28: Rust, Vitest,
  both type checks, Biome, clippy and rustfmt passed. The isolated native
  trial used a sandbox in place of GitHub to exercise connect refusals,
  successful connection, backup states, offline recovery, resume,
  keyboard focus and deletion warnings. No live public-repository
  request was made; see [GitHub findings](findings.md#github).

<a id="task-6-4"></a>

- [x] 6.4 — Review: Stage 6. 2026-11-28: reviewed `2526989` plus
  uncommitted changes (`ec7f6ea..HEAD`, including carry-over `18c0b37`
  and `1179b46`) with two independent reviewers. Verified library-only
  Git operation using argument lists, no automatic merges or forced
  pushes, offline behavior and privacy checks against test doubles.
  Fixed credential redaction and prompts, foreign-tree and conflict
  guards, sandbox configuration isolation, copy-failure recovery,
  concurrent connect, blocking-thread use and focus/status races.
  `mise run check` passed. In an isolated native trial the connect
  dialog kept Ctrl+O; during an eight-second push a second Enter opened
  nothing, focus returned to Back up now, and close committed and pushed.
  Public GitHub verification remained open; transport and data-safety
  follow-ups are recorded in 6.5a and the [live gaps](plan.md#known-gaps).

<a id="task-6-5"></a>

- [x] 6.5 — User check: Stage 6. The laptop's backup reached GitHub with
  both files. The user reported that an ordinary action appeared as
  `!Testing 1 2 3 testing.  [[tir:action]]` in its Fountain copy.
  After retesting 6.5a on the laptop (2026-11-28): “Yup that worked and
  seemed to work fine.” Asked whether Tir showed an offline queue and
  the commit arrived automatically after reconnecting, the user replied
  on 2026-11-28: “Yes i think so.”

<a id="task-6-5a"></a>

- [x] 6.5a — Fountain copy fix and backup review. Two independent
  reviewers covered saving, Git storage and transport, the worker and
  the panel. Fixed redundant Fountain markers, destination and privacy
  checks, unrelated staged and historical paths, escaped `.git`
  storage, subprocess timeouts, retries, pause and close handling,
  manual save-before-backup, and misleading status and delete warnings.
  Focused Vitest (238) and Rust (78) tests, TypeScript, Biome, clippy and
  rustfmt passed. In an isolated native trial Back up now changed
  Backup pending to Backed up; the bare repository held the action
  without redundant markup. No real library or backup repository was
  used in agent verification.

## Stage 7: install and finish

<a id="task-7-1"></a>

- [x] 7.1 — Release build and installation on NixOS. 2026-11-28:
  `nix profile add --profile "$trial/profile" .#tir` installed the
  release in a new profile. It opened Projects on Hyprland outside
  `nix develop` using isolated settings, WebKit storage and library.
  The identifier stayed `dev.tir.desktop`. All font and dictionary
  notices matched; the app wrote both draft files, showed squiggles
  and F7 suggestions, and exported a two-page US Letter PDF with the
  title page and an embedded Courier Prime subset. Tools: `pdfinfo`,
  `pdftotext`, `pdffonts`. A separate dev trial opened Projects after
  fixing the native CLI binding's missing liblzma.

<a id="task-7-2"></a>

- [x] 7.2 — Desktop entry, icon and release hardening. 2026-11-28:
  `desktop-file-validate` and installed icon comparisons passed; Wofi
  launched the isolated release. WebKitGTK still advertised the page
  when an inspector variable was inherited; the package wrapper now
  strips both inspector variables, and neither port listened on
  relaunch. Devtools keys opened nothing. The observed response CSP
  denied by default, allowed bundled scripts, workers, fonts and IPC,
  and allowed neither Vite WebSocket nor inline scripts or eval. The
  wrapper used a byte-identical executable; the selected local
  capability granted event listening only. Rechecked layout, spelling,
  autosave, PDF export and backup; the edit made just before close
  reached the Fountain copy and the isolated bare repository.

The [live plan](plan.md#task-7-3) holds the rest of Stage 7.

## Editor

Unless noted, observations used the desktop's Tauri window (WebKitGTK
2.54.2, Hyprland, 60 Hz, 931×1010) and `?fixture=spike`, the 120-page
fixture with 2,280 elements and a forced break before each scene. These
probes span 2026-11-26–27. See [Measuring the editor](architecture.md#measuring-the-editor).

**Technique (task 1.1).** One ProseMirror text block holds each element;
the browser never wraps (`white-space: pre`). The editor sets each
paragraph's space above and first-line indent as a style; each later line
starts after an inline decoration on the previous line's last character
(grapheme) whose `::after` is a line break, or a block of the page gap's
height where an element splits across pages; a line indented differently
from the first gets a margin on its first character. Per-line wrapper
spans (the first spike) fail with styles: ProseMirror wraps each text node
separately, so a bold word inside a line made it three rows (observed).
Each edit re-paginates the whole script with a `LayoutCache`, then maps the
decoration set and replaces only changed elements' decorations and styles.

**Where a keystroke's time went** (profiles: the WebKit inspector's
sampling profiler for JavaScript, `perf` for WebKit; the first spike
measured 38 ms before paint):

- `DecorationSet.create` was 73% of the JavaScript: its cost grows with
  elements times decorations, about 33 ms per keystroke here. Mapping the
  set and patching changed elements removed it; `paginate` with the cache
  is about 1.5 ms.
- WebKitGTK's Adwaita focus ring for a focused contenteditable traces every
  line of it on each repaint: 86% of tile painting, about 5 ms per
  keystroke. `outline: none` on the editor removed it.
- With any touch listener in the page (ProseMirror adds `touchstart` and
  `touchmove`), WebKitGTK recomputes a layer's event region after each
  repaint by walking the whole layer: about 5 ms per keystroke. Dropping
  those listeners cut the rendering update from 6 to 1 ms. Tir must add no
  touch or wheel listeners (wheel listeners have the same effect in WebKit's
  source, `RenderLayerBacking::maintainsEventRegion`).
- An overflow scroll container (`position: fixed; overflow: auto`) costs a
  scrolling-tree update with scrollbar painting each frame, about 2.9 ms per
  keystroke; scrolling the document instead lowered the main thread's busy
  time from 16 to 11 ms in one comparison.
- A flex container around the editor makes WebKit lay out every line again
  to size it (`FlexFormattingContext::flexBaseSizeForFlexItem`); a block
  container does not.
- Each layout pass walks all 2,280 paragraphs, about 3 ms. Moving the
  paragraphs below an edit up costs far more than moving them down: in a
  plain page of 2,280 paragraphs, moving the rest up 238 px took 57 to 62 ms
  and down 5 ms; a move that a later paragraph's space cancels took 9 ms.
  The editor therefore restyles unchanged paragraphs before ProseMirror
  redraws, so one layout sees only the net change.
- Native typing ran WebKit's typing command, which lays out and computes
  its editing state before ProseMirror sees the change. Applying plain
  `insertText` and deletions from `beforeinput` (the browser's target
  ranges decide what a deletion removes; composition stays native) cut a
  line-wrapping keystroke from 19 to 11 ms before paint.
- On every edit and selection change WebKitGTK computes the input method's
  surrounding text as the plain text of the whole editable element
  (`WebPage::getPlatformEditorState`): about 3.5 ms at 120 pages. One
  editable surface cannot avoid it.
- `content-visibility: auto` on the paragraphs made typing slower (29 to
  34 ms before paint): WebKit's editing lays out skipped paragraphs.

**Result: the redraw misses 16 ms.** Measured from the `keydown` listener:
*layout* is to ProseMirror's DOM update plus a forced style and layout of
the editor, before paint; *frame* is to a zero-delay timer set in the next
animation frame, after the main thread's rendering update (paint recording
and editing state; compositing and display excluded), so it includes the
wait for that frame; *busy* is the main thread's blocked time in the 70 ms
after `keydown`, measured with message-channel tasks. Fifteen `x` and
Backspace pairs each:

| Edit | Layout median (p95) | Frame median | Busy median |
| --- | --- | --- | --- |
| Ordinary typing in an action | 9–11 ms (11–23) | 18–21 ms | 18–20 ms |
| Typing that adds or removes a line | 10–13 ms (12–20) | 17–21 ms | 21–25 ms |
| Typing that adds a page | 10–11 ms (13–19) | 19–20 ms | 19 ms |
| Backspace that removes that page | 47–63 ms (64–72) | 51–67 ms | 71 ms |
| Line change, `?fixture=feature` (no forced breaks, 1,970 elements) | 13–16 ms (20–25) | 19–25 ms | 20–25 ms |

Layout meets 16 ms for typing; the rendering update adds 4 to 6 ms, so the
whole redraw does not fit a 60 Hz frame reliably, and a page removed in
the middle of the script costs 50 to 70 ms. What remains is WebKitGTK's
work over the whole editable element (each layout pass, the surrounding
text, moving later paragraphs), not the projection.

**The Desk adds at most a millisecond, and only when a page comes or goes**
(task 1.3: the fixed top bar and sidebar, and the sheets with their marks
in a layer under the editor). Four full runs of `mise run editor-timing`
gave ordinary typing 10–11 ms layout (p95 13–19), 16–19 ms frame, 14–20 ms
busy; a line added or removed 11–12 ms (12–18), 17–21 ms, 18–22 ms; the
`feature` line change 14–17 ms (17–21), 22–25 ms, 26–28 ms; all as with the
new layers switched off in the same session. Typing that adds a page, in
alternating runs of 40 pairs, measured 12–13 ms layout (12–14 in the full
runs), 19–21 ms frame and 18–22 ms busy with the Desk, and 11 ms, 18–20 ms
and 18–21 ms with the sheets, their updates and both bars switched off and
the paper painted on the editor as in 1.2; the Backspace that removes the
page, 57–59, 61–63 and 66–69 ms against 56–57, 60–61 and 66–68 ms.
Switching off only the bars or only the sheets made no difference, nor
did skipping the sheets' updates (so not the JavaScript), dropping their
shadows, `contain: strict` on each sheet, a sheet layer whose height does
not follow the script's, or sheets in normal flow rather than positioned.
A millisecond is the timer's resolution here, so the cause was not traced
further. In the same session 1.2's page measured 11 ms layout for typing
that adds a page, the top of the table's 10–11, and 27–28 ms busy for the
`feature` line change, above the table's 20–25: the machine varies by
that much between days.

Task 1.4's keys and CSS capitals left these times as they were. Two full
runs gave ordinary typing 10–11 ms layout (p95 14–19), 18–19 ms frame,
19–21 ms busy; a line added or removed 11 ms (13–14), 18 ms, 18–22 ms;
a page added 13 ms (17–22), 20–21 ms, 22 ms, and the Backspace removing it
56–58, 61–63 and 67–69 ms; the `feature` line change 15 ms (17–19),
22–23 ms, 24–27 ms. The timed edits are in action; in the page, inserting a
letter in a cue (shown in capitals) took 5–7 ms to layout, as in an action.

Task 1.5's autocomplete left them as they were too. Two full runs gave
ordinary typing 10–11 ms layout (p95 14–21), 17–18 ms frame, 18–23 ms busy;
a line added or removed 11 ms (13–17), 17–19 ms, 17–21 ms; a page added
13 ms (15–19), 21 ms, 18–19 ms, and the Backspace removing it 57–58, 62–63
and 66–71 ms; the `feature` line change 15–17 ms (17–24), 22–26 ms,
27–28 ms. The tool's new row, typing in a cue with the popup open (a letter
and Backspace each redraw it and its ghost), measured 11 ms (12–18),
17–19 ms, 20–22 ms, as typing in an action does. In the same session,
alternating runs with the plugin removed from the editor's state measured
the same: typing in an action 10–11 ms layout, 16–18 ms frame and 19–23 ms
busy with it, 10–11, 17–18 and 15–24 ms without; the `feature` line change
15–16, 23–24 and 29–32 ms with it, 15–16, 22–24 and 28–31 ms without. So
the `feature` busy time, at or above earlier days' 24–28 ms, is the day's,
not the plugin's.

Task 1.6's undo grouping, an `appendTransaction` that every transaction
passes, left them as they were. Two full runs gave ordinary typing 10–11 ms
layout (p95 12–23), 16–20 ms frame, 19–21 ms busy; a line added or removed
11 ms (14–22), 18–20 ms, 20–22 ms; a page added 13 ms (17–18), 20 ms,
22–23 ms, and the Backspace removing it 58 ms (62–70), 63 ms, 59–64 ms; the
`feature` line change 15–17 ms (17–20), 23–25 ms, 26–27 ms; typing in a cue
with the popup open 11 ms (15–17), 17–20 ms, 19–23 ms. The page added's busy
time, above task 1.5's 18–19 ms, measured the same in 40-pair runs with the
plugin removed (23 ms) and restored (24 ms), as every other row did: it is
the day's.

**The scene sidebar and the page position leave typing as it was, once the
list waits for the frame** (task 1.7). Both follow the projection's map of
scenes and pages and touch the page only when what they show changes. Two
full runs gave ordinary typing 11 ms layout (p95 14–21), 18 ms frame,
16–21 ms busy; a line added or removed 11–12 ms (13–26), 18–20 ms,
21–22 ms; a page added 15 ms (20–22), 22–23 ms, 29–30 ms, and the Backspace
removing it 58–59 ms (62–63), 64 ms, 60–65 ms; the `feature` line change
15–17 ms (18–23), 23–25 ms, 27–29 ms; typing in a cue with the popup open
11 ms (12–19), 18–19 ms, 15–21 ms. Only the page added differs from task
1.6's, by 2 ms of layout and 7 ms of busy time: on this fixture every later
scene's page number changes then (and the page count), and alternating
20-pair runs measured 15–16 ms layout with the sidebar and 13 ms with it
and the page position removed. As first built, writing those 119 rows with
the keystroke took that edit to 35–38 ms layout, 46–48 ms frame. Removing
parts in turn placed all of it in the list's rows: the list as a scroll
container added 4–6 ms, and the rows' layout the rest. In the page, setting
120 page numbers and laying the list out took 9–10 ms with the prototype's
grid rows and 4–5 ms with flex rows, which draw the same pixels, so the
rows are flex. Flex rows with `content-visibility: auto` brought the
keystroke to 18–22 ms, still above, and any layout of the fixed sidebar
took about 2 ms even for one changed row. So the list applies an edit's
changes in a timeout set in the next animation frame, after that frame is
drawn, without `content-visibility`; with nothing but the caret moving,
the highlight moves at once.

**Zoom, focus mode and the paper switch leave typing as it was, at any
zoom** (task 1.8; the window's keys catch every keystroke on its way to
the editor, and the zoom is a transform). Two full runs of `mise run
editor-timing` at 100%, the second after the last change, gave ordinary
typing 10–11 ms layout (p95 12–26), 17 ms frame, 21–22 ms busy; a line
added or removed 11–12 ms (14–16), 18–19 ms, 15–23 ms; a page added 15 ms
(25), 23–24 ms, 30–32 ms, and the Backspace removing it 57–59 ms (64),
62–64 ms, 65 ms; the `feature` line change 15–16 ms (18–21), 22–24 ms,
24–27 ms; typing in a cue with the popup open 11 ms (13–17), 17–20 ms,
21–22 ms, all as in task 1.7's runs. Two runs at 110% (`--zoom 1.1`) gave
the same but for the page added, 16–18 ms layout, which alternating 20-pair
runs placed in the day's variance (below). From the `keydown` to the
layout after the window's listener, the next frame, and busy over 150 ms,
with the caret mid-script on the 120-page fixture, five runs of fifteen
pairs at 100% and 110%: a zoom step 2–3 ms (p95 4), 9–15 ms (p95 18–20),
7–12 ms; focus mode on 9–12 ms (15), 17–19 ms (23–30), 17–22 ms; off
10–15 ms (16), 19–28 ms (29–51), 19–25 ms. Focus mode's change of the
space around the page costs several times a zoom step; the cause was not
traced.

**Opening and saving leave typing as it was** (task 1.9; a capturing
`keydown` listener for the file keys is all they add to a keystroke). Two
full runs of `mise run editor-timing` at 100% gave ordinary typing
10–11 ms layout (p95 14–25), 17–19 ms frame, 15–23 ms busy; a line added
or removed 11–12 ms (14–22), 18–20 ms, 21–23 ms; a page added 15 and
18 ms (21–24), 23–28 ms, 29 ms, and the Backspace removing it 57–58 ms
(61), 62 ms, 67–68 ms; the `feature` line change 15–16 ms (18–21),
23–24 ms, 23–29 ms; typing in a cue with the popup open 11–12 ms (13–17),
17–19 ms, 22–24 ms; a zoom step 3–4 ms (4), 9–11 ms, 9–10 ms; focus mode
on 13–14 ms (14–15), 20 ms, 22 ms, off 11–14 ms (16), 20–24 ms,
25–26 ms. The page added and focus mode on, above task 1.8's runs,
measured the same in alternating 20-pair runs with the file keys'
listener switched off (16 and 16 ms; 12 and 12 ms) and on (15, 16 and
17 ms; 13, 13 and 12 ms): the day's, not the change.

**The review's fixes leave typing as it was** (task 1.10). Before them,
two full runs of `mise run editor-timing` at 100% gave ordinary typing
10–11 ms layout (p95 13–25), 17–18 ms frame, 19–22 ms busy; a line added
or removed 11–12 ms (13–22), 18–19 ms, 20–22 ms; a page added 15–16 ms
(20–23), 23–25 ms, 29–33 ms, and the Backspace removing it 56–58 ms
(62–64), 61–63 ms, 68 ms; the `feature` line change 15–16 ms (18–23),
22–25 ms, 27–30 ms; typing in a cue with the popup open 11 ms (13–17),
18–21 ms, 22–23 ms; a zoom step 3 ms (4–5), 9–10 ms; focus mode on
13–14 ms, 20–21 ms, off 15 ms, 28 ms. After them (every paragraph's style
checked after each change, Up and Down across a page gap, the white space
hidden at a split, the popup following a zoom step), three runs gave
ordinary typing 11–12 ms (p95 15–23), 17–21 ms, 18–21 ms; a line 11–12 ms,
18–20 ms, 22–24 ms; a page added 16–17 ms, 24–26 ms, 24–37 ms, and its
Backspace 57–59 ms, 62–65 ms, 67–70 ms; the `feature` line change
15–17 ms, 22–25 ms, 28–31 ms; typing in a cue 11–12 ms, 18–20 ms,
20–23 ms; a zoom step 2–3 ms, 9–13 ms; focus mode on 13 ms, 20 ms and off
15 ms, 28 ms in the last run. Checking every paragraph took 0.35 ms an
edit in the page (2,280 paragraphs), and four alternating runs with the
check off and on measured alike to the timer's millisecond: ordinary
typing 10–11 and 11 ms layout, 17 and 17–19 ms frame; a page added 16–18
and 17–18 ms. Making the sidebar inert in focus mode, as first built, took
focus mode on to 25 ms layout and off to 31 ms (13 and 15 ms without), so
a bar holding focus shows itself instead.

**Opening the 120-page script takes a quarter of a second, and saving it
waits on the disk** (task 1.9, through the real dialogs, timed in the page
from the reply to `open_script`, which brings the file's text; five opens
of each file, each after opening `every.tir`, so the whole document was
new):

| File | Reading the text | New state, projection, sheets | View update | Layout | Frame |
| --- | --- | --- | --- | --- | --- |
| `spike.tir`, the fixture's draft (270 KB) | 6–10 ms | 29–65 ms | 149–158 ms | 213–258 ms | 241–378 ms |
| `spike.fountain`, its Fountain (196 KB) | 50–84 ms | 26–31 ms | 146–150 ms | 265–301 ms | 269–306 ms |

*Reading the text* is `readDraft` or `readFountain` with the check for
changes not saved; *view update* is ProseMirror's `updateState`, drawing
2,280 new paragraphs; *layout* and *frame* run from the reply to a forced
layout of the editor after `Editor.open`, and to the next frame. In that
build about 22 ms of the layout was restyling every paragraph after the
update: `nodeDOM` walks the document's children from the start each time,
so 2,280 calls took 21–24 ms in the page; since task 1.10 the editor walks
the paragraphs once instead (not timed for an open). The reply came within
5 ms of the window's `focus` event as the dialog closed, so the Rust side's
read and the IPC are a few milliseconds. A Ctrl+S save of the
same draft, ten times: 3–9 ms of the page's work (`fromDocument`, and
`writeDraft` reading its output back), then 117–172 ms until the Rust side
replied (the write, both syncs and the IPC), which the page awaits without
blocking.

**Saving the 120-page script costs typing a few milliseconds, once the
Fountain is written in a worker** (task 2.2, timed in the page, eight saves
each after a one-letter change). Taking the model from the document
(`fromDocument`, which reuses unchanged elements) took 0–1 ms, handing it
to the worker 1–2 ms, the worker's draft and Fountain texts 202–261 ms,
starting the Rust command 1–2 ms (466 KB of JSON), and its reply, with
both files written and synced, 136–181 ms; the main thread was never
blocked more than 2–4 ms while a save ran. The same two texts made on the
main thread took 190–243 ms, which a keystroke landing then would wait
for (plan, "Known gaps"). Three full runs of `mise run editor-timing` at
100%, the third after the review's fixes, gave ordinary typing 11 ms
layout (p95 16–26), 17–19 ms frame, 20–22 ms busy; a line added or
removed 11–12 ms (14–17), 17–20 ms, 16–25 ms; a page added 13–17 ms
(20–26), 20–26 ms, 30–33 ms, and its Backspace 55–59 ms (61–64), 60–64 ms,
66–68 ms; the `feature` line change 16–17 ms (19–23), 23–24 ms,
21–30 ms; typing in a cue 11–12 ms (13–18), 18–19 ms, 22–24 ms; a zoom
step 3 ms, 7–12 ms; focus mode on 14 ms, 20–21 ms and off 15 ms, 28 ms:
as in task 1.10's runs. The tool's new row presses each key 1 to 2.2
seconds after the one before, so that it lands as a save starts, while it
runs or after it (37–38 saves finished in each run): 9–11 ms layout (p95
14–18), 17–20 ms frame and 14–16 ms busy, as ordinary typing.

**A new editor state makes ProseMirror make every plugin's view again**
(prosemirror-view 1.44, `updatePluginViews`): it compares the old and new
states' plugin arrays, and `EditorState.create` always makes a new one, so
`updateState` with a new state destroys each plugin's view and calls its
`view` again; a view that added DOM listeners would add them twice. It
also resets the editable element's own scroll, not the document's. Seen
in the source and in task 1.9's opens, where the scene list and the page
position each followed the new script.

**WebKit scrolls to an editable's last selection when it takes focus
back** (task 2.3, real clicks through `wlrctl`): with the caret deep in a
120-page script, a click on the top bar's project name (a button) took
focus out of the editor; when `Editor.open` then gave the view a new
state, scrolled to the top and focused the editor, the document scrolled
to where the old caret had been (78,160 px), even through ProseMirror's
`focus({ preventScroll })`, and a click on the open project's row,
focusing the editor, scrolled from where the writer had scrolled to the
caret. With Ctrl+O, which moves focus by script, neither happened.
Focusing first, then setting the state and the scroll, keeps the top, and
going back restores the scroll after focusing.

**Counting the Projects screen's pages costs a few milliseconds a project**
(task 2.3, eight projects of 113–118 pages, `featureScript`, in the dev
app): reading each active draft through `read_draft` took 14–15 ms of
waiting (43 ms the first), then `readDraft` 0–2 ms and `paginate` 5–9 ms
on the interface thread (17 ms the first, before the JIT); the eight
together 167–226 ms, the interface thread busy 49–75 ms of it, in pieces
of under 20 ms between the reads. So the screen counts on the interface
thread, one project at a time after its list shows, rather than in a
worker, and keeps each count until the draft's file time changes.

**Showing the Projects screen over the 120-page script takes 80 ms, nearly
all hiding the writing window** (task 2.3, `?fixture=spike` scrolled to
40,000 px, five times each): from `show` to a forced layout of the
screen 75–80 ms, to the next frame 77–83 ms; leaving it, focusing the
editor and restoring the scroll, 42–79 ms and 48–84 ms. With the writing
window left visible under the screen, 12/24 ms and 8–10/25–28 ms: the
rest is the style change of `visibility: hidden` over every paragraph.
Hiding the document's scrollbar (`overflow: hidden` on the root) added
nothing measurable. Kept, since hidden content takes no focus, no clicks
and no screen reader's attention; the scroll came back to the pixel each
time.

<a id="stage-2-3-timing"></a>

**The Projects screen leaves typing as it was** (task 2.3; while hidden it
adds no listener, and the saved state's listener only remembers the state
for it). Three full runs of `mise run editor-timing` at 100%, the third
after the review's fixes, gave ordinary typing 10–12 ms layout (p95
15–23), 17–19 ms frame, 18–22 ms busy; a line added or removed 11–12 ms
(14–21), 17–20 ms, 17–24 ms; a page added 15–17 ms (20–21), 22–24 ms,
31–32 ms, and its Backspace 56–59 ms (60–66), 62–64 ms, 63–69 ms; the
`feature` line change 15–16 ms (19–24), 23–25 ms, 27–29 ms; typing in a
cue 11 ms (12–17), 18–20 ms, 21–23 ms; typing as saves start and run
10–11 ms (14–19), 18–21 ms, 12–14 ms; a zoom step 2–4 ms, 9–13 ms; focus
mode on 13–14 ms, 19 ms and off 12–15 ms, 20–28 ms: as in task 2.2's
runs. `mise run editor-placement` on `every`, `feature` and `spike`:
nothing out of place.

**The file keys reach the page** (task 1.9, the Hyprland dispatcher):
WebKitGTK and Tauri deliver Ctrl+O, Ctrl+S and Ctrl+Shift+S to the
page's `keydown`. This Hyprland binds no Ctrl or Ctrl+Shift key but
Ctrl+Print (`hyprctl binds`, 2026-11-26).

**A jump to a scene or a page takes a frame** (task 1.7, real clicks
through `wlrctl` and keys through the dispatcher, timed as above from the
`click` or the Enter `keydown`, busy over 150 ms; two runs of twelve jumps
back and forth across the 120-page fixture): a click on a scene 2–2.5 ms
to layout (at most 4), 13.5 ms to the frame (at most 23), 14.5–15 ms busy
(at most 33); Go to page 4.5–5 ms (at most 7), 14.5–16.5 ms (at most 26),
16–17 ms (at most 27). Every jump landed on the engine's scroll position,
(page − 1) × 1,086 px plus the row. WebKitGTK and Tauri deliver Ctrl+G to
the page's `keydown`.

<a id="stage-1-scroll-probe"></a>

**Scrolling keeps 60 Hz; a scene click and bringing the sidebar back take
longer** (task 1.10, through the inspector on the 120-page fixture at 100%
in the tiled 931×1010 window; no target is agreed). Scrolling the
document from `requestAnimationFrame`, 120 frames at 40 px a frame (2,400
px a second) down from the top, up, and mid-script, and at 150 px a frame,
drew every frame 17 ms after the one before (none over 20 ms), with the
main thread busy 1–4% of the time and never more than 4–10 ms at once.
Scrolling the scene list 20 px a frame did the same. With the caret in the
script, PageDown and PageUp reached the next frame in 13–16 ms (p95 19)
with 12–17 ms busy (at most 63), and Down from line to line in 6–9 ms (at
most 15), the scene list's highlight moving at headings. A real click on a
scene took 8 ms to layout (at most 11), 26–27 ms to the next frame (p95
29–32) and 29–32 ms busy, and a synthetic click the same; Go to page
5–6 ms (at most 7), 16–21 ms (at most 27) and 16–19 ms busy. Task 1.7
recorded 2–2.5 ms and 13.5 ms for the click, and 4.5–5 ms and 14.5–16.5 ms
for Go to page; patching the page put 5 ms of the click in the selection's
change with the bars' updates and 4 ms in the scroll, each with its layout
forced, and the difference from task 1.7 was not traced. Collapsing the
sidebar took 3–11 ms to layout and 9–18 ms to the frame; bringing it back
48–54 ms and 51–58 ms in nine of ten (once 22 and 25 ms), not traced
either. Two runs, before and after the review's fixes, measured alike.

**CSS `zoom` moves lines off the engine's rows; a transform keeps them**
(task 1.8, `mise run editor-placement`'s check with positions scaled,
before the zoom was built in). With `zoom` on the script, every line on
`?fixture=feature` sat where the engine puts it at 75% and 125%, where a
row (16 px) stays a whole number of pixels, but at 90% and 110% lines
drifted up about 0.2 px a page, 22.6 px by page 121 at 110% and 25.9 px at
90%, and clicks on 3,507 and 3,938 of 5,040 lines landed on the wrong one
(likely WebKit rounding each scaled line box; not traced). With `transform:
scale()` from the script's top left corner, WebKit lays the script out at
100% and only paints it scaled: at 110% every line was within 0.5 px and
every click landed. Changing the zoom also costs far less that way, on the
120-page fixture: 2 ms to layout and 10–13 ms to the next frame for a
transform, against 103–140 ms and 106–143 ms for `zoom`, which lays the
whole script out again. A transform leaves the script's layout box at
100%, so Tir sizes a frame around it to the scaled size (architecture,
"The editor"). Typing measured the same with either and at 100%; in
alternating 20-pair runs the page-adding keystroke took 15–16 ms to layout
at 100%, 14–15 ms at 110% and 15–16 ms at 90%, and `will-change:
transform`, which makes the script a composited layer, changed nothing.

**The window's keys reach the page** (task 1.8, the Hyprland dispatcher):
WebKitGTK and Tauri deliver Ctrl+=, Ctrl+Shift+= (as "+"), Ctrl+−,
Ctrl+Shift+F, Esc and F8 to the page's `keydown`, and none of them zooms
or does anything else of WebKit's own. This Hyprland binds no Ctrl or
Ctrl+Shift key but Ctrl+Print, and no bare F8 or Esc (`hyprctl binds`).
Its dispatcher knows no key named `plus`; send `equal` with Shift.
ProseMirror prevents the default of every Esc and Enter in the editor
(`captureKeyDown` in prosemirror-view 1.44), so a listener after the
editor cannot tell an Esc that closed the autocomplete popup from one
that closed nothing: Tir's window keys are caught on the way down
instead. ProseMirror scrolls a transaction's selection into view only when
the DOM selection is already in the editor, so a script that sets the
caret must focus the editor first. Tauri's `invoke` reached commands the
app defines with the capability left at `core:default`.

**Pasting 120 pages and undoing it take a third and a tenth of a second**
(task 1.6, timed from the key's `keydown` as above, three runs): the
120-page fixture's Fountain (195,866 characters, 2,281 elements, its title
page read as an action) pasted at the end of the middle element of the
same fixture spent 307–347 ms in the paste handler, 242–270 ms of it in
dispatching the transaction and the rest reading the Fountain; it reached
layout in 308–349 ms and the next frame in 320–361 ms, with 359–413 ms
busy. Ctrl+Z then took 85–88 ms to layout, 91–95 ms to the frame, 131–169 ms
busy. Copying the whole script took 200–230 ms in the copy handler, nearly
all `writeFountain` (plan, "Known gaps"), and cutting it 230 ms.

**The autocomplete popup moves no line and leaves composition alone**
(task 1.5, the Hyprland dispatcher, `wtype` and `wlrctl`): on
`?fixture=sample`, with the popup and its ghost open on a cue, all 103
paragraphs' boxes were those after Esc closed it; the ghost's text box
matched the caret line's characters to the pixel vertically and started at
the caret. Typing opened the popup, the arrows moved the highlight round
the list, Enter and Tab accepted, Esc closed it and Enter then started the
dialogue; a real click on a suggestion accepted it and kept focus and the
caret. In a cue whose popup offered JOSÉ, the dead acute then `e` entered
"é" and closed the popup, Compose `o` `c` entered "©", and two Backspaces
opened it again; in an action the same sequences entered "é©".

**The clipboard reaches the page, and ProseMirror's own handling loses
element types** (task 1.6, the Hyprland dispatcher and `wl-clipboard`):
WebKitGTK and Tauri deliver `copy`, `cut` and `paste` events for Ctrl+C,
Ctrl+X and Ctrl+V with no Tauri clipboard plugin (the capability is
`core:default`). With ProseMirror's own handling, a copied cue and dialogue
pasted at an action's start came back as an action, then the dialogue's
text joined to the action's: the schema's `toDOM` writes a bare `<p>`.
A type of Tir's own set in `copy`, `application/x-tir-clipping`, came back
whole (U+2028 included) in a paste in the same page; other applications are
offered only the text types and WebKit's
`org.webkitgtk.WebKit.custom-pasteboard-data` (`wl-paste --list-types`),
and a paste of text from `wl-copy` brings only `text/plain`. HTML is handed
on with WebKit's inline styles added, both ProseMirror's going out and
other applications' coming in. Once ProseMirror's history is empty, Ctrl+Z
changed nothing, even after composed input that WebKit inserted itself.

**Native editing still works** (Hyprland dispatcher and `wtype`, after the
changes above): Up and Down kept the caret's column across an engine line
break and across the gap between pages 1 and 2, which on that fixture falls
between two elements, and Shift+Down selected across both; typing,
Backspace, Ctrl+Backspace (a word), Delete, typing
over a selection, Backspace at an element's start (joining it to the
previous one) and Ctrl+Z each changed the ProseMirror document as expected;
the dead acute then `e`, and Compose then `o` `c`, entered `é` and `©`.
This proves the input sequences, not how they feel on the laptop. On the
Desk (task 1.3), the dead key and Compose sequences still entered `é` and
`©`, and Backspace through the dispatcher removed them.

**WebKit's Up and Down mishandle a page gap inside an element** (task
1.10, the Hyprland dispatcher on `?fixture=feature`): where an action or a
speech splits across pages, the gap is a block inside the paragraph
(`.page-gap::after`), and in six of six such elements Down from the last
line on a page landed at the start of the next page's line, losing the
column, and Up from there went two lines up, skipping the line above the
gap. Across a page break between two elements (a paragraph's padding) both
kept the column. Tir moves the caret across such a gap itself, to the
engine's line beyond it at the caret's place across (`crossPageGap` in
`editor.ts`); the block keeps every line box one row high.

**ProseMirror can draw an element in the paragraph of an equal one**
(task 1.10; prosemirror-view 1.44, `ViewTreeUpdater`): after matching the
unchanged end of the document by node identity, ProseMirror gives a node
the first of the next few paragraphs whose node is equal (`Node.eq`), and a
change that replaces an element with an equal one (the same text typed
over it in one step) keeps the paragraph with its old node, so the identity
match stops there next time. With 26 one-line actions and three actions
"Same.", the last one's text replaced by itself, deleting actions 25 and 26
left the last "Same." in the paragraph that had been page 2's first, 222 px
too low (`mise run editor-placement`). The editor now checks every
paragraph's block after ProseMirror draws a change, setting only those
that differ.

**Typed line breaks where an element splits across pages** (task 1.10):
the engine drops the white space where it splits an action or a speech,
typed line breaks included, and each typed break ends a line in a
`white-space: pre` paragraph, so a blank line at the split ("Five.\n\nSix.")
put every later line of the element 16 px below the engine's
(`editor-placement`). The projection hides that white space but its last
line break, which carries the page's gap.

**A middle click pastes the clipboard, not the primary selection** (task
1.10, `wl-copy`, `wl-copy --primary` and `wlrctl pointer click middle`):
with "clipboardtext" on the clipboard and "primarytext" selected, a middle
click in the script inserted "clipboardtext" at the caret. WebKitGTK sends
the page a `paste` event for a middle click, carrying the clipboard's data
(by the WebKitGTK 2.54.2 source, `Editor::paste` with the global
selection's pasteboard dispatches it first), and Tir's paste handler,
which cancels the native insertion, read it as any paste.

**The script's keys reach the page** (task 1.4, the Hyprland dispatcher):
WebKitGTK and Tauri deliver Enter, Tab, Shift+Tab, Ctrl+0 to Ctrl+7,
Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+E, Ctrl+Enter and Ctrl+Alt+D to the page's
`keydown`, and each did what the brief says. Ctrl+=, which Tir leaves
alone, reached the page too and zoomed nothing (`devicePixelRatio` stayed 1
and `innerWidth` 931), so neither WebKitGTK nor Tauri has zoom keys here and
Ctrl+0 resets nothing. Tauri zooms only with `zoomHotkeysEnabled`, off by
default, and then by an injected script for Ctrl+- and Ctrl+= (`config.rs`
in tauri-utils 2.10.4). This Hyprland binds no Ctrl or Ctrl+Alt key but
Ctrl+Print. In a cue, the dead acute then `e`, Compose then
`o` `c`, and a typed `ß` entered `é©ß`, which the script kept in lower case
and the editor showed as `É©ß`. A real click on a top bar button (through
`wlrctl`, see architecture, "Measuring the editor") changed the element,
left the caret and focus where they were, and the next key typed there.

**Capitals show through CSS, with "ß" left alone** (task 1.4): each
paragraph whose element calls for capitals has `text-transform: uppercase`,
and the projection puts `text-transform: none` on each character whose
capital is longer (102 code points, "ß" among them; none is shorter), as
the engine keeps them. WebKitGTK's `innerText` applies `text-transform`, so
`mise run editor-placement` compares each paragraph's shown text with the
engine's. With the exception switched off, "große straße" showed as
"GROSSE STRASSE" and a click on its last character landed two characters
off; with the capitals switched off, four elements showed lower case: the
check reported both.

**Every line sits where the engine puts it** (task 1.2, `mise run
editor-placement`): on the 120-page fixture all 4,200 lines, on
`?fixture=feature` all 5,040 lines of 121 pages (split speeches, automatic
(CONT'D)s), and on `?fixture=every` (dual dialogue, centred text, a
transition, a parenthetical, styled text, typed line breaks) every line
starts within a pixel of the engine's position, and a click there puts the
caret before its first character. Text ending in a typed line break also
gets its empty last line: ProseMirror adds a trailing `<br>` to a text
block whose text ends in `\n`. Task 1.3 found the same on the Desk, with
clicks on each line's last character too, and the sheets' page numbers
and marks (83 on `feature`) where the engine puts them. With the right
column pulled up over the left's rows, as before 1.3, those clicks still
landed, but a click beside a dual column's text landed in the other
column's paragraph or in the space above the next element.

**Decorations the later stages need fit the technique** (task 1.2, a probe
plugin on the 120-page fixture): 6,240 find highlights and 1,080 wavy
underlines as inline decorations, 228 margin dots as absolutely positioned
widgets and a ghost completion as an inline widget left every line in
place, and typing measured 12–13 ms layout and 16–18 ms to the next frame
(10 and 17–18 ms without them). ProseMirror merges overlapping inline
decorations that name no `nodeName` into one span (`computeOuterDeco` in
prosemirror-view), so a highlight over a line's last character keeps its
`line-end` class. Creating that set at once took 51 ms, so a set covering
the whole script should be made once and then mapped, as the projection
is.

For test keys under this Hyprland, use
`hyprctl dispatch 'hl.dsp.send_shortcut({window="title:^Tir$",mods="",key="Down"})'`,
with modifiers such as `mods="CTRL SHIFT"` (Ctrl+Shift+Z and Ctrl+Alt+D
reached the page so).
`wtype -k Down` produced `key=ArrowDown` but `code=Escape` in WebKitGTK and
scrolled without moving the caret; `wtype` works for dead and Compose key
sequences.

**Measuring traps** (2026-11-26):

- `document.body.offsetHeight` did not lay out a `position: fixed`
  subtree, so expensive layouts there read as 0–2 ms; the editor's own
  `getBoundingClientRect()` gave the true 45–80 ms. Likewise, with text
  changed in the fixed sidebar, the editor's `getBoundingClientRect()` took
  0 ms and a sidebar element's 2–4 ms. Force layout on the element being
  measured.
- Key events sent by the Hyprland dispatcher carry an unusable
  `event.timeStamp` (about 2⁶⁴); take `performance.now()` in a capturing
  `keydown` listener instead. `performance.now()` resolves to 1 ms here.
- The remote inspector's Timeline records arrived with every start and end
  time at 0; use its `ScriptProfiler` for JavaScript and `perf` for WebKit.
- Reloading the page (Vite reloads it after a source edit) replaces the
  inspector's target; connect again.
- WebKit reports a character's box on whole pixels: a cue centred at
  262.8 px reads 262. Compare positions to within a pixel.
- WebKitGTK's `Runtime.evaluate` returns a promise only as a reference,
  without awaiting it; await it with `Runtime.awaitPromise`
  (`tools/inspector.ts` does).
- While a connection to the page's inspector socket stayed open, a new one
  was not sent `Target.targetCreated`, so it could not reach the page; close
  every connection before opening the next (`tools/inspector.ts` closes
  every one it does not hand back, and the tools close theirs on failure).
- `wlrctl pointer scroll` (0.2.2) moved nothing in Tir's window (at 1, 15
  and 120 units the document stayed at the top) while `wlrctl pointer
  click` worked, so no real wheel scrolling could be sent; scrolling was
  measured by scrolling the document from `requestAnimationFrame`.

