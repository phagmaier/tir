# Tir: build plan

The task list for building V1. Intended behaviour is in
[brief.md](brief.md), design rules in [architecture.md](architecture.md),
outside facts in [findings.md](findings.md), and the chosen screens in
[prototype/index.html](prototype/index.html).

Completed Stages 0–2 and their evidence are in [history.md](history.md).

## Current status

- Active: 6.5, the user's check of Stage 6 (the user asked for 6.1 to
  6.4, stopping at 6.5): waiting for the user's report.
- Next: Stage 7, once 6.5 passes.
- Blockers: none.

## How to work this plan

- **Select only authorized work.** For planned implementation, take the
  first unchecked task unless the user names another ready task. Respect
  dependencies and do not start a new stage before the preceding user
  check passes. Continue to another task only if the user requested it.
- **Starting a task:** set its `Status:` to `in progress` and update
  "Current status".
- **Before finishing:** use the [smallest check that covers the change](architecture.md#running-and-checking),
  review the implementation and tests with the adopted review method in
  [AGENTS.md](../AGENTS.md#planned-implementation), and keep the relevant
  documents current. Report what was and was not checked.
- **Finishing a task:** only when its "Done when" is verified, check the
  box, set `Status: done`, and add an `Evidence:` line saying what you ran
  or observed and the result. Search "Known gaps" and the other tasks'
  notes for the task's ID, and delete or rewrite what it closed. Then
  update "Current status". Never check off unverified work; use
  `Status: blocked (why)` or `verification pending (what is missing)`
  instead.
- **Review tasks** (titled "Review: …") add a deeper scheduled review.
  Review the named scope against its checklist, fix concrete findings
  within the stage, and rerun affected checks. In `Evidence:`, record the
  reviewed commit (`git rev-parse HEAD`, plus "uncommitted changes" if
  any), findings, and fixes or deferrals. Put deferred findings in
  "Known gaps".
- **User check tasks** (titled "User check: …"): stop. Tell the user exactly
  how to run the check, and wait. Check it off only when the user reports
  it passed, quoting them and the date in `Evidence:`. Notes from the user
  become tasks inserted before the next stage, with IDs like `1.11a`.
- **When reality differs from the plan**, keep existing task IDs and say
  why a task was split, reordered or added. Do not silently drop or weaken
  scope. If a premise or design rule does not hold, stop that task,
  record the finding, update the plan, and tell the user. Ask before
  changing a settled product decision.

## Stages

| Stage | Result | Ends with |
| --- | --- | --- |
| [0. Skeleton and page engine](history.md#stage-0-skeleton-and-page-engine) | Toolchain, script model, Fountain, layout and pagination checked against Final Draft PDFs | 0.10 |
| [1. Writing](history.md#stage-1-writing) | The editor, in the settled look | 1.11 |
| [2. Library, projects and drafts](history.md#stage-2-library-projects-and-drafts) | Saving, projects, drafts, title page, Fountain import and export | 2.8 |
| [3. PDF](#stage-3-pdf) | PDF export matching the editor | 3.4 |
| [4. Final Draft files](#stage-4-final-draft-files) | FDX import and export | 4.4 |
| [5. Find, formatting check, spell check](#stage-5-find-formatting-check-spell-check) | The three checks | 5.5 |
| [6. GitHub backup](#stage-6-github-backup) | Automatic backup to a private repository | 6.5 |
| [7. Install and finish](#stage-7-install-and-finish) | Tir installed on NixOS; a final review of V1 | 7.4 |

Risk comes first. Page parity and an editor that shows the engine's
breaks could each sink the design, so Stages 0 and 1 prove them before
anything else. V1 is done when 7.4 is checked.

## Stage 3: PDF

<a id="task-3-1"></a>

- [x] 3.1 — PDF export
  - Status: done
  - Depends on: 2.8
  - Spec: [PDF export](brief.md#pdf-export); findings on
    [Courier Prime](findings.md#courier-prime) and [PDF libraries](findings.md#pdf-libraries).
  - Do: Write the PDF from the engine's pages, with no layout of its own:
    the title page, page numbers, embedded Courier Prime, one bookmark per
    scene, and the file name "Title - Draft.pdf". Always black on white,
    whatever the paper setting.
  - Done when: tests check positions, page count, bookmarks and the
    embedded font on fixtures.
  - Evidence: 2026-11-27. `src/core/pdf.ts` sets the engine's pages in
    Courier Prime; Export PDF… in the draft menu asks whether to include
    the title page (the user's choice, brief "PDF export"), makes the PDF
    in a worker and `export_pdf` writes it as a new file. Eleven tests in
    `src/core/pdf.test.ts` and `src/ui/pdf-export.test.ts` read PDFs back
    with pdf.js and the PDF library against hand-worked points: lines at
    exact points (1.5 in = 108 pt, dual cues centred in their columns, a
    transition ending at 7.1 in, "2." ending at 7.5 in half an inch down,
    numbering unchanged by the title page), every engine line, (MORE) and
    (CONT’D) included, at its row with the engine's page count; styled
    runs in the four faces on the 7.2 pt grid with underlines; only the
    faces used, embedded as subsets; the title page at the preview's
    places; bookmarks' titles, pages and tops; page labels; metadata; the
    interface-thread fallback. `drafts.test.ts` covers the name, the
    latest script and the title page choice. In an isolated trial the
    dialog and Save dialog ("Salt Line - First Draft.pdf") wrote a PDF that
    read back with three pages, labels, three bookmarks and metadata;
    `pdffonts` listed four embedded subsets with Unicode maps, and
    `pdftoppm` drew it as the editor shows it; unticked gave two pages.
    The preview's trailing line break and baseline were measured there
    (findings, "Courier Prime"). 121 pages took 564–597 ms in the worker,
    the interface thread's longest pause 8 ms. Reviewed with
    user-code-review and one independent reviewer: found italic "fi" and
    "fl" ligatures pulling characters off the grid, fixed (`liga` off) with
    a test shown failing without it; added the fallback test and an
    unstyled automatic (CONT’D) check. `mise run check` passed (605 Vitest
    tests, both type checks, Biome, rustfmt, clippy, 39 Rust tests);
    `vite build` built the worker with the font files the CSS uses.
    Dependencies: `percent-encoding` added to `Cargo.toml` for the name
    header (already in the build through Tauri); `@cantoo/pdf-lib` and
    `@cantoo/fontkit` moved from development to runtime dependencies.
    Not checked: a release build or the laptop. Viewer checks are in 3.2.

<a id="task-3-2"></a>

- [x] 3.2 — PDF verified against the engine
  - Status: done
  - Depends on: 3.1
  - Spec: brief "Page parity"
  - Do: Run the parity tool on Tir's own PDFs of the calibration scripts
    and fixtures.
    The [calibration PDFs](architecture.md#setting-up-a-machine) are
    machine-local and not in git.
  - Done when: every page of Tir's PDF starts on the same line as the
    editor's, the text can be selected and searched, and the PDF opens
    correctly in Firefox and in a desktop PDF viewer.
  - Evidence: 2026-11-27. A one-off Node check used the parity tool's
    PDF reader and script rebuilder, wrote the seven calibration scripts
    with `writePdf`, and compared each exported page's first body row
    (text and baseline, excluding any repeated cue) with `paginate`, which
    the editor also uses. All 716 calibration page starts matched Tir,
    as did both script pages of the original Salt Line fixture (with a
    title page) and all 121 of the seeded feature fixture (without one):
    839 of 839 script pages. This compares Tir's PDF with Tir's editor,
    not the reconstructed script with the original Final Draft pages.
    In Firefox 160.0.1 and Papers 51.1, Salt Line rendered with its
    script formatting and page labels; text selected and copied
    (`boats` and `Tomás`, respectively), and "No boats after dark" found
    one match on script page 2 in each. Reviewed the comparison against
    the editor projection and the existing PDF tests; no code changes.

<a id="task-3-3"></a>

- [x] 3.3 — Review: Stage 3
  - Status: done
  - Depends on: 3.2
  - Scope: everything changed since [2.7's recorded state](history.md#stage-2-library-projects-and-drafts).
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
  - Evidence: 2026-11-27. Reviewed with user-code-review at
    `1425e2df9f41de6237291a0079d19512309f2b40` plus uncommitted changes,
    using `da76a1f` as the committed snapshot of the 2.7 work. Confirmed
    that the export uses the engine's rows and points, and reviewed
    title-page placement, subset embedding and the OFL, metadata, scene
    destinations, page labels and the native new-file write. Fixed two
    findings: a long project name could clip off the draft name in both
    export suggestions; tabs in title fields shifted text between the
    preview and the PDF. Reproduced both on the original code and added
    regression cases. In isolated WebKitGTK the long accented suggestion
    kept "First Draft", the preview retained the raw tab in the field
    and placed both letters within 1 pt of the exported title, and native
    Save wrote a PDF with three pages, the expected labels and two
    bookmarks. `mise run check` passed (607 Vitest and 39 Rust tests,
    both type checks, Biome, rustfmt and clippy). Used 3.1's 121-page
    timing (8 ms longest interface-thread pause); the worker path did
    not change. Release checks remain in 7.1; see Known gaps.

<a id="task-3-4"></a>

- [x] 3.4 — User check: Stage 3
  - Status: done
  - Depends on: 3.3
  - Check: the user exports a script, opens the PDF, and compares it with
    the editor page by page.
  - Evidence: 2026-11-27, the user reported that “everything worked as
    intended and looks good”. No issues reported.

## Stage 4: Final Draft files

- [x] 4.1 — FDX import
  - Status: done
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
  - Evidence: 2026-11-27. Reviewed the XML boundary, model mapping,
    omission report and read-only copy flow. Both type checks, focused
    Biome, rustfmt and clippy passed; 144 Vitest cases (FDX, Fountain and
    Projects) and four Rust dialog tests passed. In an isolated WebKitGTK
    trial, the native chooser imported an original FDX as a project. The
    report listed all four omission kinds; the opened draft showed
    emphasis and dual dialogue, and the source hash was unchanged. The
    native flow refused a DOCTYPE-bearing fixture without a library write.

- [x] 4.2 — FDX export
  - Status: done
  - Depends on: 4.1
  - Spec: brief "Scope" (FDX); findings "Final Draft's default screenplay
    format"
  - Do: Write FDX with Final Draft's default element settings, page layout
    and mores-and-continueds, plus the title page, dual dialogue and
    emphasis, escaping text correctly.
  - Done when: export then import gives the same script for every fixture,
    and the written settings match findings.md's table.
  - Evidence: 2026-11-27. Reviewed escaping, title field mapping, dual
    dialogue and the native new-file boundary. 54 focused Vitest cases
    passed, including both original FDX fixtures and the default settings;
    both TypeScript checks, focused Biome, rustfmt and four Rust dialog
    tests passed. In an isolated WebKitGTK trial, Export Final Draft…
    suggested the project and draft name, saved to a new `.fdx`, and
    returned focus to the editor. The exported file decoded to the exact
    on-screen draft, including literal XML punctuation. Final Draft itself
    was not run.

- [x] 4.3 — Review: Stage 4
  - Status: done
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
  - Evidence: 2026-11-27. Reviewed with user-code-review at
    `1425e2df9f41de6237291a0079d19512309f2b40` plus uncommitted changes,
    distinguishing the work already covered by 3.3. Checked DOCTYPE
    refusal, file and nesting limits, the XML fields and defaults, and
    original inline fixtures; no `.fdx` files are tracked or proposed for
    tracking. Reproduced and fixed missed notes and revisions on dual
    dialogue wrappers and missed title paragraph revisions. Added a
    regression case and exercised XML punctuation in every title field.
    `mise run check` passed (631 Vitest and 40 Rust tests, both type checks,
    Biome, rustfmt and clippy). In isolated WebKitGTK, native import
    reported both revisions, the note and the scene number without
    altering the source. Scrolling changed the page indicator without
    moving the caret. Native export wrote a new `.fdx` that read back as
    the open draft and returned focus to the editor.

- [x] 4.4 — User check: Stage 4
  - Status: done
  - Depends on: 4.3
  - Check: the user exports a Story Architect script as FDX, imports it,
    and compares it with the Fountain import of the same script.
  - Evidence: 2026-11-27, the user reported "I did the final draft check
    it's fine". No notes, so no 4.4a… tasks.

## Stage 5: find, formatting check, spell check

- [x] 5.1 — Find and replace
  - Status: done
  - Depends on: 4.3 (4.4 waived for Stage 5's start by the user,
    2026-11-27)
  - Spec: brief "Find and replace"; prototype piece 1 (find)
  - Do: Find and replace in the active draft, with match case and whole
    word, next and previous, Replace, and Replace all as one undo step.
    Highlight matches on both papers.
  - Done when: tests cover regex-special characters in the query, whole
    words next to apostrophes and non-ASCII letters, cues with extensions,
    and the single undo; it works in the app.
  - Evidence: 2026-11-27. `src/core/find.ts` matches a query in the text
    as the page shows it (capitals), a word being letters, accents and
    digits in any script; `src/ui/find.ts` keeps the matches and their
    highlights, patching them per edit through `changedElements` (now
    shared with the projection), and holds Next, Previous, Replace and
    Replace all; `src/ui/find-bar.ts` is prototype piece 5's bar, opened by
    Ctrl+F. 48 Vitest cases: regex-special characters; match case on shown
    capitals and "ß"; whole words next to straight and curly apostrophes and
    to accented, combining, Cyrillic and astral letters; renaming a
    character in cues with extensions and in action; one Ctrl+Z for Replace
    all, apart from the typing before it; formats kept; Replace as its own
    step; wrapping; no autocomplete popup; the selection as the query; and
    highlights after typing, Enter, a type change, a node inserted beside
    itself and a deletion equal to a fresh search's (two patch mutations
    shown failing). In isolated WebKitGTK on Salt Line: Ctrl+F, typing,
    Enter and Shift+Enter wrapping to page 5 with the page position and
    scene following, the toggles, Replace by Enter and button, Replace all
    of 12 cues with its message, Ctrl+Z on the button restoring them and
    Ctrl+Shift+Z redoing, Esc back to the script with the match selected
    and ahead of focus mode's Esc, the title page and Projects screen hiding
    the bar and a fork closing it; screenshots on dark and white paper. On
    the 120-page spike, typing's median layout stayed 10–11 ms with 17,040
    highlights, while showing them took 561 ms (600 matches: 75 ms;
    findings, "Editor"), so the bar searches once typing pauses; "mara"
    typed quickly searched once. Reviewed with user-code-review and one
    independent reviewer; fixed a query seeded from a cue's typed small
    letters (now its capitals), Ctrl+F after Ctrl+A throwing, a waiting
    search moving a caret clicked into the script, and Enter not bringing
    a lone match back into view, each checked in tests or the app. Both
    type checks, Biome on `src` and Vitest on `src/ui` with the core find
    and purity tests (308) passed. Not checked: `mise run check` (no Rust
    changed) and the laptop.

- [x] 5.2 — Formatting check
  - Status: done
  - Depends on: 5.1
  - Spec: brief "Formatting check"; prototype piece 1 (findings)
  - Do: The six rules; margin marks with explanations on hover or when the
    cursor is in the element; the count in the top bar; the next-finding
    key. Marks never reach a PDF, FDX or Fountain export.
  - Done when: each rule has tests for flagged and not-flagged cases, and a
    run on the calibration scripts produces no false positives (or each is
    examined and explained).
  - Evidence: 2026-11-27. The pure check has positive and negative cases
    for all six rules. Focused Vitest (59 tests across formatting, script
    map, projection, draft actions and PDF), both TypeScript checks and
    Biome on the changed sources passed. Ran the check after PDF
    reconstruction on all seven calibration scripts and accounted for all
    47 flags ([findings, "Calibration"](findings.md#calibration)).
    In isolated WebKitGTK, verified F8 across pages and wrapping,
    count-button navigation, return from the title page, no jump in
    Projects, and the count and marks following a cue correction and Undo.
    At desktop size in WebKit, verified caret and hover explanations on
    both papers and separate marks for simultaneous dual dialogue. Review
    fixed tooltip overlap on hover and kept right-column marks inside the
    visible gutter. Marks sit outside the editable root and do not enter
    the export model; the native Save dialogs were not exercised.

- [x] 5.3 — Spell check
  - Status: done
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
  - Evidence: 2026-11-27. Tir's own checker (`src/core/spelling.ts`) on
    SCOWL's en_US Hunspell dictionary, 2026.02.25, vendored with its
    notices in `src/ui/dictionary/`; choice, rejected libraries and
    licences in [findings, "Spell check"](findings.md#spell-check). The
    dictionary lives in a worker; the page checks only elements an edit
    changed, after a 300 ms pause, and learns cue names and heading
    locations from autocomplete's tally. Right click or F7 opens the
    spellings and "Add to dictionary", which appends to `dictionary.txt`
    in the library (`add_to_dictionary`). Tests: 16 core cases (a
    hand-worked affix file for each rule and Hunspell's capitals; the real
    dictionary's flags and suggestions, names ahead of the dictionary's,
    accents, possessives, curly apostrophes), 9 plugin cases (learned names
    and locations unmarked, the word being typed held, squiggles following
    and dropping with edits including Enter, F7's order, a spelling as one
    undo step keeping its bold), the worker's fallback, and two Rust tests
    (appending, making the library, refusing non-words and links). In
    isolated WebKitGTK on the sample: squiggles on dark and white paper,
    F7 and a real right click opening the menu with no native one, Enter
    replacing and Ctrl+Z restoring, a real click adding "OKAFOR" to
    `dictionary.txt` and its squiggle going, after a reload too, the add
    failure's message box, Esc closing the menu before focus mode, a word
    marked only once the caret left it, and `mise run editor-placement`
    with squiggles shown: 0 misses. Two `mise run editor-timing` runs,
    the second after review fixes, with new spell-check scenarios: typing
    10–12 ms median layout as checks land and 14 ms among 5,280 squiggles
    (findings). Reviewed with user-code-review at `41bfe96` plus
    uncommitted changes, and by one independent reviewer: fixed F7
    skipping the word just typed, a squiggle surviving Enter inside its
    word (which a spelling could then use to join two elements), accented
    and possessive suggestions, curly apostrophes, misses of the right
    click off a line's end, a mapping cost quadratic in a transaction's
    steps, the `.aff` file inlined as a `data:` URL the release policy
    would refuse, Esc reaching focus mode first, and the timing tool's
    autocomplete check matching the menu. `mise run check` passed (724
    Vitest and 42 Rust tests, both type checks, Biome, rustfmt, clippy);
    `vite build` emitted the worker and both dictionary files. No
    dependency added. Not checked: a release build (7.1) and the laptop.
  - Follow-up, 2026-11-27: the user left the dictionary's open choices to
    the agent. Screenplay terms the dictionary lacks (PRE-LAP, SFX, VFX,
    MOS, OFFSCREEN and the like) became words, and an accented word is
    right when the dictionary has it without accents; British spellings
    stay marked, as the brief asks for US English. Core spelling tests
    cover both.

- [x] 5.4 — Review: Stage 5
  - Status: done
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
  - Evidence: 2026-11-27. Reviewed `ec7f6ea` (751797f..ec7f6ea: 41bfe96,
    cc213fd, ec7f6ea; no uncommitted changes) with user-code-review and
    three independent reviewers, one each for find, the formatting check
    and spell check, whose findings were checked against the code. By
    item: (1) escaping and whole words held: every syntax character, a
    replacement taken literally, apostrophes, hyphens, combining, Cyrillic,
    astral, Thai and CJK letters, and capitals that would change length;
    30,000 random edits gave the highlights a fresh search gives. (2)
    Replace all is one undo step, but its cost grew with matches times
    steps, since find and the projection mapped their decorations through
    each replacement's step; past 100 steps (`MANY_STEPS`) both now make
    their sets afresh: in isolated WebKitGTK on the spike, ". " (2,040
    matches) from 977 to 268 ms and "the" (6,720) from 3.6 s to 465 ms,
    undo alike (findings, "Editor"). (3) The calibration run gave 42
    findings, all explained (findings, "Calibration"), after the user
    chose to accept EXT./INT. and a space after a combined prefix's slash
    (five of its eight heading flags). Also fixed: an empty element just
    made was flagged at each pause, its explanation over the next lines
    while the caret stayed in it (prototype piece 1 exempts it); the
    explanation scaled with the zoom; pressing a mark or the count button
    took focus from the script; "()"'s and the heading's explanations
    misdescribed the finding. (4) The typing path was unchanged, so the
    5.3 measurements stand (findings, "Spell check"); fixed: F7 straight
    after typing skipped the word not yet checked (it now waits for the
    check), a name the dictionary has came in small letters ("mcdonnell"),
    "dont" did not offer "don't", and a name one letter off ("Teo")
    ranked above two letters swapped ("the" for "teh"); the "Add" row now
    shows the word's capitals. (5) The vendored files match the release
    byte for byte and the notices are recorded; the word count reads
    109,922. (6) Marks are decorations or siblings of the editable root;
    exports come from the saver's model, the clipboard from the selection.
    The find bar now replaces nothing while the editor is not editable.
    The user kept learning every word of names and locations. New tests:
    the empty element being written, accepted and refused prefixes, names
    apart by length, punctuation or a stored accent, contractions, names'
    capitals and rank, and Replace all and its undo past `MANY_STEPS` for
    find and the projection (each shown failing without its fix, except
    find's, which matches a fresh search either way). In isolated WebKitGTK
    on the sample: no mark after Enter and a pause, the mark once the
    caret left and its tip on returning, the tip 270 px wide at 50%, 100%
    and 200%, mousedown on a mark and the count button prevented
    (synthetic events), and F7 at once after typing "teh" and "dont"
    opening their menus with "the" and "don't" first. `mise run check`
    passed (736 Vitest and 42 Rust tests, both type checks, Biome,
    rustfmt, clippy). Not checked: a real pointer press on a mark, the
    laptop, a release build (7.1).
  - Follow-up, 2026-11-27: the user left spell check's remaining gap to
    the agent. After "Add to dictionary", an element edited but not yet
    checked kept the word's squiggle until its check answered, and for
    good once spell check had turned itself off; `drawSquiggles` now
    drops an unchecked element's squiggles for words now known. A new
    spelling test, failing without the fix, covers it; that file, Biome
    and the type check passed.

- [x] 5.5 — User check: Stage 5
  - Status: done
  - Depends on: 5.4
  - Check: the user renames a character with Replace all, fixes a flagged
    cue, and corrects a misspelling from its suggestions.
  - Evidence: 2026-11-27, the user handed the check to the agent: "I'm not
    at my computer right now I'll check later shouldn't you be able to see
    if it passes or not though? if so you check". Run by the agent in
    isolated WebKitGTK on the sample, with real key presses, typing and
    pointer clicks (Hyprland, wtype, wlrctl). Renaming MARA: Ctrl+F, "MARA"
    with Aa and Word on, NADIA, a click on Replace all showed "Replaced 12
    · one Undo reverses it" and changed the 11 cues and the introduction,
    and "Mara" to "Nadia" changed the 10 mentions in action and dialogue,
    "Nadia's" and "Aunt Nadia" included; one Ctrl+Z in the script undid
    the second pass alone and Ctrl+Shift+Z redid it. The flagged cue: F8
    went to "ELIS" with its explanation ("Did you mean “ELLIS”?") at the
    caret; retyping it as ELLIS took the count from 3 to 2. The
    misspelling: a right click on "recieve" opened the spelling menu, no
    native one, with "receive" first; Enter replaced it and its squiggle
    went, Ctrl+Z restored it and Ctrl+Shift+Z redid it. After a normal
    close, the saved draft's Fountain copy held NADIA and Nadia, no Mara,
    no ELIS, and "We receive". The user's own run may still add notes,
    which become 5.5a tasks.

## Stage 6: GitHub backup

- [x] 6.1 — Git in the library
  - Status: done
  - Depends on: 5.5
  - Spec: brief "Saving and backup"; architecture design rule 5
  - Do: Run the system's git from Rust with argument lists, never a shell.
    Make the library a repository if it is not one. Commit after a few
    quiet minutes and on closing.
  - Done when: tests against temporary libraries show commits happen at
    those moments, and that a missing git or a damaged repository is
    reported, not crashed on.
  - Evidence: 2026-11-27, `cargo test` passed (63), with `cargo clippy -D
    warnings` and `cargo fmt --check` clean. `backup.rs`'s tests against
    temporary libraries show a commit only once the library has been quiet
    (none half a quiet spell after the last change), one at closing, one
    at launch for changes made while Tir was closed, and the library made
    a repository; a missing git, a damaged repository (no `HEAD`), no
    home folder for the library, a detached HEAD and a merge under way
    are reported in the status, with nothing recorded, and recording
    resumes once the merge is gone; a folder holding other files is never
    made a repository. `git.rs`'s tests show the `.gitignore` keeps `*.tmp`
    files and folders and the writer's own files out of commits, hooks and
    signing off, a library inside another repository kept apart, a junk
    `.git` file reported, and a command over its time limit stopped. In an
    isolated trial, text typed into a library made beforehand was saved,
    and closing the window normally left one commit, "Back up Salt Line" by
    `Tir <tir@localhost>`, holding `.gitignore`, the project file, the
    draft and its copy. The 2.3 note on last-edit times went to Known
    gaps.

- [x] 6.2 — Push, offline and pause
  - Status: done
  - Depends on: 6.1
  - Spec: brief "Saving and backup"
  - Do: Push after each commit and on Back up now. While offline, keep
    commits and retry with back-off. When GitHub has commits this machine
    lacks, pause and show why. Never merge, rebase or force-push.
  - Done when: tests against a local bare repository cover a normal push,
    an unreachable remote and later recovery, and a remote that is ahead
    (paused, nothing merged); no test touches the network.
  - Decision (the 2.7 note's question, the user's choice, 2026-11-27): the
    other machine's work arrives with Tir closed, and a save refuses to
    write over a draft that changed on disk since Tir opened it (brief,
    "Saving and backup").
  - Evidence: 2026-11-27, `cargo test` passed (75), with clippy and
    `cargo fmt --check` clean; the sandboxed git the tests use allows only
    the file transport, so no test touches the network. Against local bare
    repositories, `git.rs`'s tests push and count the commits waiting, see
    a push refused when GitHub is ahead with the branch, the draft and
    GitHub unchanged, and see pushes fail while the repository is gone and
    work once it is back. `backup.rs`'s tests push what waits at launch and
    each commit after; Back up now pushes without waiting for quiet; a
    push past its time limit reads offline, a missing repository failing,
    and the commit arrives by itself once it is back; GitHub holding the
    laptop's commit pauses backup, recording goes on and nothing is pushed
    or merged until the writer's `git pull` and Resume, then it all
    arrives; a pause is found at launch; closing commits, then pushes.
    `library.rs`'s tests show a save refused over a draft changed since
    Tir saw it, the draft and copy untouched. In an isolated trial
    connected to a local bare repository, launch pushed the waiting
    commit; the open draft changed on disk, typing then made the save fail
    with a message naming the change and nothing written over it; closing
    asked whether to close without saving, and Tir then committed and
    pushed before it exited.

- [x] 6.3 — Connect dialog and backup panel
  - Status: done
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
  - Evidence: 2026-11-28, `cargo test` (86), clippy, `cargo fmt --check`,
    Biome, both type checks and Vitest (748, `backup.test.ts`'s words for
    each state among them) passed. `backup.rs`'s tests connect a private
    empty repository and back up to it, refuse a public one, a missing one,
    one holding a README commit and an address not on GitHub, connect the
    repository a library came from, move backup to another repository, and
    report no git; `github.rs`'s read GitHub's address forms and the API's
    answers; `git.rs`'s tell how much of a project or draft GitHub holds.
    The public check needs no token: GitHub's REST API asked with no login
    (findings, "GitHub"). In an isolated trial whose sandbox stood bare
    repositories in for GitHub, with real clicks, keys and typing, the
    indicator and panel showed not connected (with Connect a repository…);
    the connect dialog said to paste an address, that "screenplays" is no
    GitHub address, that a missing repository was out of reach (with
    git's words), that a public one was public, and that one with a README
    already held work; a private empty one connected ("1 project and 1
    draft"), Done closed it with "Connected. Backups now go to GitHub."
    and the first backup arrived. Then backed up with the private badge,
    Back up now ("Backed up just now"), offline ("Offline, 1 waiting",
    "Still offline…") and back by itself within a minute of coming back,
    failing in the warning colour with git's words and back on Back up
    now, paused at launch once the laptop had pushed, with the git pull
    note and Resume ("GitHub still has changes…"). Esc closed the panel
    and the dialog, focus back on the indicator. The Projects screen's bar
    showed "Backup paused"; its delete warnings, and the draft menu's, said
    GitHub keeps the history (pushed), has none (new project, new draft),
    or lacks the latest changes (edited since). Closing while paused
    committed and pushed nothing. Screenshots matched prototype piece 5's
    none, ok, offline and paused panels and its connect dialog. The 2.3
    note's wording for a project not fully pushed is in the brief.

- [x] 6.4 — Review: Stage 6
  - Status: done
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
  - Evidence: 2026-11-28, reviewed 2526989 plus uncommitted changes
    (`ec7f6ea..HEAD`: the Stage 5 review fixes 18c0b37 and 1179b46, then
    6.1–6.3) with the adopted code-review method, two independent
    reviewers (Rust and safety; page and carry-over) and each finding
    checked against the code. The checklist: git runs from argument
    lists, the only command line Tir gives it being the constant ssh
    command; Tir stores no login, and git's words in the status and log
    now lose any login an address carries (`git::redact`); no code path
    merges, rebases, resets or forces; git runs only in the library, and
    the guard against a folder of the writer's other files now runs
    before every commit, so a home folder already a repository is never
    recorded (before, only before `git init`); a dirty tree, a detached
    HEAD, a merge, a rejected push and a missing git behaved as specified,
    but a squash merge and a popped stash's conflict would have been
    committed over, and are now waited out (`Repository::Busy`,
    `Conflicted`), and a mended problem now pushes what waited; offline
    never blocks the page, and the three commands that wait for backup
    moved off the async runtime's shared threads (`blocking`); tests use
    only the `file` transport, and the sandbox now also keeps out the
    writer's XDG git files and configuration passed down in the
    environment; the privacy check refuses public (the API's answer),
    missing and unreachable repositories (ls-remote with the machine's
    login) and any answer it cannot read, in tests (real GitHub is a known
    gap). Also fixed: no program may open a window asking for a login
    (empty `GIT_ASKPASS`, findings "Git"); a Tir-made `.gitignore` is
    written before `git init` and into a repository the writer made; a
    save whose copy failed no longer made the next save look like one
    over a pull (`Library::save`); one connect at a time, in the dialog
    and in backup, so two checks cannot connect two repositories; the
    connect dialog keeps Ctrl+O, Ctrl+S, F7 and F8; the indicator's icon
    keeps a 16 px box so the bar no longer moves at each save; Back up
    now and Resume keep focus in the panel while they wait; no draft
    delete warning over the Projects screen; no stale first status after
    an event; the panel stays shut while Tir closes. Carry-over: the
    writer's own small-letter words are suggested as written (5.4's
    change capitalised them as names), and spell check's chain of checks
    no longer grows. `mise run check` passed: Biome, both type checks,
    Vitest (748), `cargo fmt --check`, clippy and `cargo test` (91, new:
    saving after a failed copy and never over a pull, a mended problem
    pushing, a repository holding other files, a `.gitignore` for the
    writer's repository, a squash merge and a stash conflict; the
    detached-HEAD test waits instead of sleeping). In an isolated trial
    with real keys and clicks, the connect dialog kept Ctrl+O (which
    showed the Projects screen once the dialog had closed; F7 and F8 pass
    the same guard), and during an
    eight-second push Back up now left focus on the panel, a second Enter
    opened nothing, and focus came back to Back up now; closing
    committed and pushed. Deferred to Known gaps: closing behind a push
    under way, the refused save's wording, push addresses the writer's
    git configuration rewrites, unbounded waits for git's output, and
    the panel in focus mode.

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
  - Note (from 3.1): the save and PDF workers have run only in the
    development build, and the PDF worker fetches Courier Prime from the
    page's own origin (`pdf-fonts.ts`); check a save and Export PDF… in
    the release build, under its content security policy.
  - Note (from 5.3): the spelling worker fetches the dictionary from the
    page's own origin too (`dictionary.ts`, never as a `data:` URL; see
    findings, "Spell check"); check that squiggles appear in the release
    build.

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
  produces these.
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
- `writeFountain` takes about 75–100 ms on a 1,500-element script, and
  190–243 ms in the page on the 120-page one, because it checks each
  paragraph by reading it back (0.3). Since 2.2 saves make it in a worker
  (findings, "Editor"), but copying the whole 120-page script still takes
  200–230 ms for the same reason (1.6).
- Dragging a selection within the script, and dropping text from elsewhere,
  still go through ProseMirror's own handling (1.6): by ProseMirror's
  source, a drag carries its own slice, element types included, and places
  it by its rules, not the paste rules (text dragged into an element can
  join it and take its type), and a drop from elsewhere becomes plain
  paragraphs, so it arrives as action. Neither is checked natively. A
  middle click pastes the clipboard's text, not the primary selection,
  through the paste rules (1.10, findings "Editor"). The brief names none
  of them; 1.10 asked the user (2026-11-27).
- Backspace, Delete and typing over a selection across elements join its
  ends into the first element's type, ProseMirror's rule, while cut (1.6)
  removes the elements it covers whole and leaves a part-covered last one
  its type: a selection from an element's start into the next leaves the
  rest as the first's type by the keys and the second's by cut, and one
  ending at an element's start joins that element on by the keys and not
  by cut. 1.10 asked the user (2026-11-27) whether the keys should follow
  cut.
- Since 2.2 closing saves first, and asks only when a save fails (brief,
  "Saving and backup"). What a close still loses: a page reloaded in
  development, or Tir killed, loses what was typed in the second before a
  save; and a request to close five or more seconds after the first one
  the page held closes the window without the page, losing what it had
  not saved (`closing.rs`), so a page that hangs cannot keep Tir open, but
  neither can the "could not save" question once the writer asks to close
  again after that long (2.2; kept by the user's choice, 2026-11-27). 1.10
  asked the user (2026-11-27) whether to ask before closing with changes
  not saved; since 2.2 a close leaves none unless a save fails.
- The paper switch, the sidebar's toggle and the scene list have no key,
  nor, since 2.4 and 2.5, the draft menu and the Title page row (2.7
  review), and Tab never leaves the script (brief, "Elements and keys"),
  so no key reaches them from the script; Shift+Tab from the title page's
  form reaches the last two. Zoom, focus mode and Go to page have keys
  (1.10). 1.10 asked the user (2026-11-27) how they should be reached.
- A screen reader is not told of autocomplete suggestions or of the
  spelling menu's: each is a named listbox, but the editor's root names
  no active option (1.5, 1.10, 5.3); nor is it told of a squiggle.
  Attributes on the root change with every popup update, so measure
  typing with them before adding them.
- A style boundary inside one grapheme at the end of a line (a combining
  accent styled apart from its letter) would give the line two line-end
  decorations and an extra row (1.10 review, from the source), and so
  would a find highlight ending inside one there, such as "Jose" found in
  a stored "Jose" and U+0301 (5.4 review). The editor selects whole
  graphemes, so only an opened or pasted script could hold one.
- Projects with the same name, such as one Fountain file imported twice
  as a new project (folders "Salt Line" and "Salt Line 2"), look the same
  in the Projects screen's list, its Delete confirmation and Import's
  choice of project; only their order and last edit tell them apart (2.7
  review). Each action takes the row chosen.
- After a save wrote the draft but failed on its Fountain copy, the copy
  stays a save behind the draft until a save succeeds; the indicator shows
  "Not saved" meanwhile (2.2, by design: the draft is written first).
- Renaming a project or draft to a name differing only in capitals
  (`salt line` to `Salt Line`) is refused as already there when the
  library is on a case-insensitive volume, since the Rust side claims the
  new name before moving (2.1 review). The desktop's home is on btrfs,
  which is case-sensitive; there it works.
- A new project whose project file is written but whose library folder
  then fails to sync is reported as not made, though it is there and the
  Projects screen lists it; making it again makes "Name 2" (2.3 review).
  A rename or delete is reported done once its folder has moved, since
  the saver must follow it, and any other change once its project file is
  in place (2.7); a new project leaves the saver as it was, so only the
  message is wrong. A project rename whose folder move fails after its
  project file took the new name leaves the project in its old folder
  under the new name, and the next change from the screen refused as made
  from an older reading until it is opened again (2.7 review). Rare:
  syncing a folder or moving one within the library fails only on a disk
  error.
- Export publishes its file with a hard link, so it fails, with the
  system's "Operation not permitted", on drives without hard links (FAT
  and exFAT USB sticks, some network mounts); exporting to the computer's
  own disk and copying works (2.6; 2.7 review). A fallback that writes the
  new file in place (`OpenOptions::create_new`, which also never replaces
  a file or link) would lose only the all-or-nothing write.
- `delete_project` takes any folder with a `project.json` file as a
  project, readable or not, so damaged ones can go. With `library` set to
  a folder holding other things (such as the home folder), a folder with
  another program's `project.json` lists as a project Tir cannot read and
  Delete removes it after its confirmation (2.7 review). The default
  library, `~/Screenplays`, holds only Tir's projects.
- Courier Prime holds 384 characters: Latin, with no Greek, Cyrillic,
  combining accents, "ẞ" or emoji. The screen draws those in a fallback
  font; the PDF embeds only Courier Prime, so they print as its missing
  glyph (3.1). Embedding a fallback font for them would close it.
- A literal tab in script text from a hand-edited `.tir` draft or FDX
  import occupies one engine cell but renders as a tab stop in the
  editor and expands to four spaces in the PDF (3.3, 4.3). Fountain body
  import already expands tabs before building elements.
- Courier Prime's OFL notice is in `src/ui/fonts/OFL-courierprime.txt`,
  and the spell-check dictionary's SCOWL and BSD notices in
  `src/ui/dictionary/README_en_US.txt`. The distributable app does not
  exist yet; the installed package must include both notices alongside
  the bundled fonts and dictionary (3.3, 5.3; 7.1).
- FDX export's default settings are verified in the XML, not in Final
  Draft itself (4.3). The Stage 4 user check covers Story Architect's
  exports, not how Final Draft opens Tir's files.
- FDX export refuses an emphasis span that splits the two UTF-16 code
  units of one character, which can occur in a hand-edited `.tir` draft
  (4.3). XML cannot carry either half in a separate text run.
- Find compares text as stored, so an accent stored as a separate
  combining mark ("a" and U+0301, as some macOS files hold it) does not
  match the single "á" typed in the find bar, nor the other way round
  (5.1). Normalising both before matching would need offsets mapped back
  to the text as stored.
- The views of find, the formatting check and spell check have no
  automated tests, since Vitest here has no DOM: the find bar, the marks,
  F8, and spell check's scheduling, F7 and menu are checked in the app
  only (5.1–5.4). Their commands and states are tested.
- A clone or a pull gives each file it writes the time of the clone or
  pull (findings, "Library on disk"), so the Projects screen's last edit
  and the draft menu's dates show a draft brought from the other machine
  as written then (2.3; left by 6.1). For a draft git holds unchanged,
  the earlier of its file's time and its last commit's time would be
  right; reading that walks the history at each listing unless it is
  kept until HEAD moves.
- The public check against GitHub itself, GitHub's REST API asked with no
  login through libsoup (`github.rs`'s `get`), runs in no test or trial,
  which never reach the network; tests read sample answers and trials ask
  a sandbox git instead (6.3; findings, "GitHub"). The user's check (6.5)
  connects a private repository through it; connecting a public one
  would show its warning.
- A push or check under way when Tir closes finishes before closing's
  own record and push, within git's two-minute limit (architecture,
  "Backup"): the window has gone, but Tir may take three minutes to exit
  and a new Tir is refused until the instance lock goes after the record
  (6.4).
- A save refused because the draft changed on disk says to close Tir
  and open it again, then, like any failed save, "Tir tries again in a
  moment." (`main.ts` and `backup.ts`), though no retry can succeed
  before reopening. The page cannot tell this refusal from other
  failures, which reach it as text (6.4).
- Connecting checks the address `origin` fetches from; a
  `remote.origin.pushurl` or a `url.*.pushInsteadOf` rule in the
  writer's own git configuration could send pushes elsewhere, unchecked
  (6.4).
- A git command past its time limit is killed, but its output is read
  until the pipes close (`git::output`): a program git started that keeps
  them open, such as an ssh connection left to share, holds backup's
  thread until it exits. ssh's `ConnectTimeout=20` bounds the usual case
  (6.4).
- In focus mode the top bar fades while the backup panel under it stays
  open (`app.css`'s focus rules apply to the bar, the panel lives in the
  page's body); Esc closes it (6.4).
