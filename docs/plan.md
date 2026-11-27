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
  stage's scope, and rerun checks affected by those fixes. Record in
  `Evidence:` the commit or working-tree state reviewed (`git rev-parse
  HEAD`, plus "uncommitted changes" if any), the findings, and what was
  fixed or deferred. A deferred finding goes under "Known gaps".
- **User check tasks** (titled "User check: …"): stop. Tell the user exactly
  how to run the check, and wait. Check it off only when the user reports
  it passed, quoting them and the date in `Evidence:`. Notes from the user
  become tasks inserted before the next stage, with IDs like `1.11a`.
- **When reality differs from the plan**, split, reorder or add tasks, keep
  the existing IDs, and say why. Do not silently drop or weaken a task.
  Product changes go to the user first (AGENTS.md).

## Current status

- Active: none; stopped after 1.9 as the user asked
- Blockers: none
- Next: 1.10 Review: Stage 1, when the user says to continue

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
    A one-off sweep of 120 generated PDFs matched 1,280 of 1,304 page
    starts, and every differing page was preceded by a note (findings,
    "Reading screenplay PDFs"). `mise run parity -- <three PDFs>` printed
    the per-page report and summary. `mise run check` exited 0 (247 tests).

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

Stage 1 edits one draft file opened directly. Projects and automatic
saving arrive in Stage 2.

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

- [ ] 1.10 — Review: Stage 1
  - Status: todo
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
  - Note (from 1.8): Tir's settings file (architecture, "Settings") is the
    place outside the library for the library's own location; "Limit the
    app's file access" must leave it, and `TIR_CONFIG_DIR`, reachable.

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
  - Note (from 1.9): 1.9's stand-in is `src/ui/files.ts` and
    `src-tauri/src/script_file.rs` (architecture, "Opening and saving").
    Retiring it also removes design rule 4's Stage 1 exception (Tir writing
    `.tir` files outside the library) and the brief's "Until automatic
    saving arrives" bullet. Saves already go through `files::replace`
    (architecture, "Writing files"); a Ctrl+S save of the 120-page draft
    waited 117–172 ms for the Rust side (writing, both syncs and the IPC)
    after 3–9 ms of the page's own work (findings, "Editor").

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
  - Note (from 1.9): Ctrl+O opens a file in 1.9's stand-in (brief, "File
    keys"); the Projects screen takes the key over. Opening a script gives
    the editor a new state (`Editor.open`), which this screen and 2.4's
    draft switch can reuse.

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
  - Note (from 1.9): 1.9's Ctrl+O already reads a Fountain file without
    writing it, but drops `readFountain`'s `leftOut`, so notes, boneyard
    and the like vanish without a report; the import report closes that.

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
  - Note (from 1.8): the settings directory follows Tauri's identifier
    (`dev.tir.desktop` in `tauri.conf.json`); changing the identifier
    moves the settings, and WebKit's storage, to a new directory.

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

Each entry names the task or stage that found it and, if known, the one
that will close it.

- Fountain round trips drop trailing whitespace, indentation outside
  action, a line break in a cue, centring inside a speech, empty lines in
  title page fields, and some mid-word bold and italic crossings (0.3; the
  list heads `src/core/fountain/write.ts`). Accepted: the editor rarely
  produces these. 2.6's export test should use scripts within these limits.
- Page parity (0.8): 23 of 605 checkable calibration pages end
  differently from Final Draft's (findings, "Calibration"): 14 where Final
  Draft left lines empty that its rules would fill (likely manual page
  breaks or kept pages), 5 page-top misreads, 4 unexplained (A Real Pain
  76, Babygirl 87, After the Hunt 12 and 40). Pages ending inside action
  (99) cannot be checked from PDFs at all. More evidence (FDX files of
  calibration scripts, or Beat's rules) would settle them.
- Final Draft's automatic (CONT'D) rule and its dual dialogue splitting are
  unverified (0.8; findings, "Pagination"); Tir adds (CONT'D) after action
  within a scene and never splits dual dialogue.
- About 0.2% of elements wrap differently from Final Draft, whose width
  measurement is not strictly fixed-pitch (0.8; findings, "Line widths").
- The cue width (38) and dual parenthetical widths rest on few samples
  (0.8).
- `writeFountain` takes about 75–100 ms on a 1,500-element script, because
  it checks each paragraph by reading it back (0.3). 2.2 writes the
  Fountain copy on every save; measure it there and speed it up or move it
  off the interface thread if a save is felt. Copying the whole 120-page
  script takes 200–230 ms for the same reason (1.6).
- Dragging a selection within the script, and dropping text from elsewhere,
  still go through ProseMirror's own handling (1.6): by ProseMirror's
  source, a drag carries its own slice, element types included, and places
  it by its rules, not the paste rules, and a drop from elsewhere becomes
  plain paragraphs, so it arrives as action. Neither is checked natively, nor
  middle-click (primary selection) paste. The brief names none of them;
  1.10 to judge.
- Backspace, Delete and typing over a selection across elements join its
  ends into the first element's type, ProseMirror's rule, while cut (1.6)
  removes the elements it covers whole and leaves the last one its type.
  1.10 to judge whether the keys should follow cut.
- Closing the window or reloading the page with changes not saved loses
  them: 1.9's stand-in asks only before opening another file over them.
  2.2 saves on close.
