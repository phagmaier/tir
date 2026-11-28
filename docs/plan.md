# Tir: build plan

The task list for building V1. Intended behaviour is in
[brief.md](brief.md), design rules in [architecture.md](architecture.md),
outside facts in [findings.md](findings.md), and the chosen screens in
[prototype/index.html](prototype/index.html).

Completed Stages 0–6 and tasks 7.1–7.2 are in [history.md](history.md).

## Current status

- Next ready: [7.3d — PDF fidelity](#task-7-3d). Also ready:
  [7.3e — selection and keyboard access](#task-7-3e).
  [7.3b](#task-7-3b) is done; [7.3c](#task-7-3c)'s local work is done.
- Not tested in Final Draft: the user has no copy and deferred
  [7.3a](#task-7-3a) and 7.3c's [Final Draft check](#final-draft-evidence)
  (2026-11-28). Both are under [Known gaps](#known-gaps).
- Release gate: the [V1 review](#task-7-3) stays open until 7.3d and 7.3e
  are verified. Then run the [user writing check](#task-7-4).

## How to work this plan

- **Select only authorized work.** Take the first ready task within the
  request unless the user names another ready task. Respect dependencies
  and stage gates. Continue to another task only if the user requested it.
- **Starting a task:** set its `Status:` to `in progress` and update
  "Current status".
- **Before finishing:** use the [smallest check that covers the change](architecture.md#running-and-checking),
  review the implementation and tests with the adopted review method in
  [AGENTS.md](../AGENTS.md#planned-implementation), and keep the relevant
  documents current. Report what was and was not checked.
- **Finishing a task:** check the box only when its "Done when" is
  verified. Remove `Status:` and add concise `Evidence:`: what ran or
  was observed, the result, and any limits. Keep open issues on the task
  that owns them; update "Known gaps" and "Current status". Use
  `Status: blocked (why)` or `verification pending (what is missing)`
  for unfinished work. Archive completed stages in [history.md](history.md),
  keeping task anchors, reviewed revisions, and user sign-offs.
- **Review tasks** (titled "Review: …") add a deeper scheduled review.
  Review the named scope against its checklist, fix concrete findings
  within the stage, and rerun affected checks. In `Evidence:`, record the
  reviewed commit (`git rev-parse HEAD`, plus "uncommitted changes" if
  any), findings, and fixes or deferrals. Put deferred findings in
  "Known gaps". Commit verified fixes even while the review stays open,
  so the tasks after it start from a clean tree.
- **User check tasks** (titled "User check: …"): give the user exact
  steps and wait for their report. Only the user can delegate the check
  or waive the gate. Record their words and date, and the observed result
  of any delegated check. Turn notes into follow-ups with IDs like `1.11a`.
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
| [3. PDF](history.md#stage-3-pdf) | PDF export matching the editor | 3.4 |
| [4. Final Draft files](history.md#stage-4-final-draft-files) | FDX import and export | 4.4 |
| [5. Find, formatting check, spell check](history.md#stage-5-find-formatting-check-spell-check) | The three checks | 5.5 |
| [6. GitHub backup](history.md#stage-6-github-backup) | Automatic backup to a private repository | 6.5 |
| [7. Install and finish](#stage-7-install-and-finish) | Tir installed on NixOS; a final review of V1 | 7.4 |

V1 is done when [7.4](#task-7-4) passes.

## Stage 7: install and finish

<a id="task-7-3"></a>

- [ ] 7.3 — Review: V1
  - Status: verification pending (7.3d, 7.3e and disposition of remaining gaps)
  - Depends on: [7.2](history.md#task-7-2), 7.3b, 7.3d and 7.3e. The
    user deferred the Final Draft checks of 7.3a and 7.3c (Known gaps).
    None of the follow-ups waits for this review to close.
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
  - Done when: 7.3b, 7.3d and 7.3e are verified, the Final Draft checks
    and remaining findings have explicit deferrals under Known gaps with
    the user's agreement, and `mise run check` passes on the resulting V1.
  - Scope reviewed: `920cc30c096e5567f72ee9a2b328a951937ec0ca` plus
    uncommitted changes, using the adopted review method and independent
    product and data-safety reviews. V1 trace:
    - Script rendering and parity: `layout`, `paginate` and `projection`
      tests and [native placement](history.md#task-1-10).
      [PDF matches Tir's editor](history.md#task-3-2) in the tested set,
      not necessarily Final Draft; see [7.3a](#task-7-3a).
    - Projects and drafts: `projects`, `opening` and `drafts` tests and
      the [user's import, fork, switch and reopen check](history.md#task-2-8).
    - Sidebar, page position and Go to page: `script-map` and `projection`
      tests, native navigation ([1.7](history.md#task-1-7),
      [4.3](history.md#task-4-3) and 7.3).
    - Element switching and autocomplete: `commands` and `suggestions`
      tests and native typing ([1.4](history.md#task-1-4),
      [1.5](history.md#task-1-5) and [1.10](history.md#task-1-10)).
    - Find, formatting and US English spelling: `find`, `formatting-check`
      and `spelling` tests, [native check](history.md#task-5-5), and
      [release spelling](history.md#task-7-2).
    - Title page and PDF: `pdf` and `drafts` tests, [native preview and
      restart](history.md#task-2-5), [PDF viewer](history.md#task-3-2)
      and [user check](history.md#task-3-4).
    - Copy/paste and undo/redo: `clipboard` and `commands` tests and
      [cross-application clipboard trial](history.md#task-1-6).
    - Focus mode, zoom and both papers: `desk` and `settings` tests and
      native layout and restart ([1.8](history.md#task-1-8) and
      [1.10](history.md#task-1-10)).
    - Import report and Fountain/FDX import and export: codec and
      `projects` tests, native new-file export and unchanged imports
      ([2.6](history.md#task-2-6), [4.1–4.3](history.md#stage-4-final-draft-files)).
      The [user check](history.md#task-4-4) covered Story Architect import,
      not opening Tir's export in Final Draft.
    - GitHub backup: [Stage 6 evidence](history.md#stage-6-github-backup);
      [7.2](history.md#task-7-2) checked release events, save on close and
      backup to a bare repository. Did not repeat the Stage 6 review.
  - Performance, 2026-11-28: isolated WebKitGTK development build, original
    120-page spike (2,280 elements). Opening a saved draft from Projects
    took 246 ms to layout, 263 ms through the next frame and timer. Twelve
    real typing/delete keys had 13 ms median layout and 21 ms median frame
    and timer. Scrolling to page 91 took 26 ms through a frame and timer;
    the caret did not move. Confirming Export PDF to the native chooser
    took 1,418 ms; `pdfinfo` counted 121 pages (one title page), and
    `pdftotext` found `INT. STATION 120 - NIGHT` on the last page. This
    includes the chooser opening; it is not a new interface-thread
    stall measurement. See the [short-draft release trial](history.md#task-7-2).
  - Review fixes: the page indicator no longer jumps back to the caret
    when squiggles arrive, the spelling menu owns the arrows beside a
    page gap, accepted combined headings teach autocomplete and spell
    check their locations, and a blank new draft opens without a stray
    line warning. Tightened the toolbar's compact spacing. Fountain keeps
    literal private-use characters; FDX preserves unlabelled title-page
    fields beside Tir labels and bounds its parsed output. Import reports
    gave the first script page of the element holding an anchored
    omission; 7.3c gives the omission's own page. Both native imports cap input
    bytes. File publication is owner-only; a draft rename prepares both
    files before publication; Delete refuses a declared foreign project
    format; and startup refuses to write without an instance lock.
  - Verification: `mise run check` passed (Biome, both TypeScript checks,
    759 Vitest tests, rustfmt, clippy and 100 Rust tests); the Nix flake
    passed `nixfmt --check`. In isolated development WebKitGTK, Down
    selected the next spelling suggestion at an internal page gap without
    moving the selection. After typing, the new squiggle arrived while
    the view was scrolled to page 2 and the caret was still on page 1;
    the indicator stayed on page 2.
    The rebuilt Nix package installed in a new profile and opened
    outside the dev shell. In a 931 px Hyprland tile a new draft showed
    zero findings with the caret in its blank heading; Ctrl+S wrote both
    files. A native Fountain import reported a note on page 2, left the
    source SHA-256 unchanged, and created a mode-0600 draft. Pointing
    the release at a temporary file in place of its settings directory
    opened only the startup error dialog and exited with status 1.

<a id="task-7-3a"></a>

- [ ] 7.3a — Final Draft page parity
  - Status: deferred by the user: implemented, not tested in Final Draft.
    On 2026-11-28 the user, who has no copy of Final Draft, said: “Just
    mark it as not tested on final draft but that it's implemented and
    should work i guess”. Tir follows Final Draft's documented default
    format, calibrated against Final Draft PDFs ([Calibration](findings.md#calibration));
    exact parity is unverified. Run the steps below if access appears.
  - Depends on: [7.2](history.md#task-7-2) and the matched references
    described under [Final Draft evidence](#final-draft-evidence).
  - Spec: [Page parity](brief.md#page-parity). Target the default US Letter
    feature screenplay template at Normal spacing. Custom templates,
    locked production pages and revision numbering remain outside V1.
  - Current gap: PDF reconstruction is [diagnostic](findings.md#calibration).
    Automatic `(CONT'D)` and splitting dual dialogue are unverified;
    some elements wrap differently, with few cue and dual-parenthetical
    width samples.
  - Do: Have Final Draft save the original FDX and export its PDF from the
    same script and settings. Cover a feature-length script and focused
    cases for action splits, continuation cues, dual dialogue across a
    page boundary, and borderline wraps in dialogue, cues and dual
    parentheticals. Use the FDX source to distinguish an authored break
    from automatic pagination. Use only original test scripts.
  - Done when: Tir, given the reference scripts, matches the first script
    line of every page from page 1, without reseeding, including page
    count. Record the version, settings, fixtures and comparison results.
    If references cannot be obtained, leave the task open. Matching Tir's
    editor to Tir's PDF does not verify Final Draft parity.

<a id="task-7-3b"></a>

- [x] 7.3b — Bound autosave loss and clarify destructive actions
  - Depends on: [7.2](history.md#task-7-2).
  - Spec: [Saving and backup](brief.md#saving-and-backup),
    [Projects](brief.md#projects).
  - Gap closed: a one-second pause started a save, with no loss bound
    during continuous typing; the stale-draft error did not say how to
    keep the edits, and promised a retry that could not help.
  - Do: Keep the one-second pause save and also save during uninterrupted
    writing. Target at most five seconds of lost edits after an abrupt
    exit on working local storage; a save failure must still be visible.
    Keep Ctrl+S, save before switching or closing, and the deliberate
    second-close escape. Keep the close–pull–reopen handoff; do not add
    live sync or redo Stage 6.
  - Do: When a draft changed on disk, explain how to preserve the
    on-screen edits before reopening. Do not promise a retry will fix the
    conflict. Make same-named projects distinguishable in the Projects
    list, Delete confirmation and Import destination.
  - Done when: an isolated continuous-typing and abrupt-exit test shows
    the recovered draft meets the target; normal close saves; a stale
    save leaves the changed file intact and gives actionable guidance;
    and the writer can tell duplicate projects apart before acting.
  - Evidence (2026-11-28, `d34f0c8` plus uncommitted changes): `mise run check`
    passed (Biome, both TypeScript checks, 763 Vitest tests, rustfmt,
    clippy, 100 Rust tests). New tests cover saving unbroken typing within
    `SAVE_WITHIN_MS`, a single save queued behind a long one (the test
    fails with the guard disabled), the changed-draft message, folders for
    repeated names, and `library::changed`. In isolated development
    WebKitGTK on the 120-page `featureScript(150)` draft, real keys every
    ~140 ms and then `kill -9` lost 1.6 s and 3.2 s; each recovered draft
    was a whole prefix ([findings](findings.md#typing-baseline)). After a
    simulated pull of the open draft, typing showed the refusal with the
    Export Fountain… advice and no retry promise; the pulled file stayed
    byte-identical. Following the advice (export, Close without saving,
    relaunch on the pulled draft, Import… as a new draft) restored all
    1,970 on-screen elements as draft "kept". Two "Salt Line" projects
    showed their folders in the list, the Delete confirmation and
    Import's list. Closing the window 0.6 s after typing saved the keys.

<a id="task-7-3c"></a>

- [ ] 7.3c — Import accuracy and editable FDX exchange
  - Status: local work done; the Final Draft check is deferred by the user
    (2026-11-28, as for [7.3a](#task-7-3a)): implemented, not tested in
    Final Draft.
  - Depends on: [7.2](history.md#task-7-2), not on completing 7.3a.
  - Spec: [Scope](brief.md#scope) (FDX, Fountain and the import report).
  - Do: Keep titles and author names out of the credit field when they
    end in “by”. Keep Tir's fixed layout, but disclose unsupported
    layout or formatting discarded on import rather than saying
    “Nothing was left out”. Report the location of an anchored omission
    accurately, or label the page number as the element's starting page.
    Keep imports read-only and exports non-overwriting.
  - Local verification: focused fixtures cover title-field mapping and
    report accuracy, including a note in an element that crosses a page.
  - Done when: local verification passes and Final Draft itself opens and
    can edit a Tir-exported original screenplay. Check its title page,
    element types, emphasis, dual dialogue, explicit breaks and default
    settings. Record the receiving version and observations. Tir reading
    its own export and the Story Architect import check do not substitute.
  - Evidence, local (2026-11-28, `5b2fc875c954257041ea2c8d68e0b6125c0e5fc3`
    plus uncommitted changes): `mise run check` passed (Biome, both
    TypeScript checks, 774 Vitest tests, rustfmt, clippy, 100 Rust tests).
    New fixtures cover a two-line title ending in “By”, an author named
    “Ren By”, a second credit kept among the authors, each kind of layout
    and formatting disclosure, Final Draft's defaults written out in full
    (nothing reported), Fountain title-page emphasis and extra blank lines,
    note places through Fountain syntax, and, in both formats, a note late
    in an action split across pages 1 and 2. The title, disclosure and
    note-place tests failed against the readers at that revision. Three
    public Final Draft files gave the rows [findings](findings.md#fdx-import-structure)
    describes. In isolated development WebKitGTK, a native FDX import
    reported “late note (on page 2)” from an element starting on page 1,
    “Formatting: strikeout” and “Layout: page margins”; it read the title
    “The Man Who / Stood By”, credit “Written by” and authors “Jo Vale /
    Ren By”, and left the source's SHA-256 unchanged. Story Architect's
    exporter writes margins that are not points, so its imports list page
    margins ([findings](findings.md#story-architect)). Not done: the Final
    Draft check.

<a id="task-7-3d"></a>

- [ ] 7.3d — PDF fidelity for submitted scripts
  - Status: todo
  - Depends on: [7.2](history.md#task-7-2).
  - Spec: [PDF export](brief.md#pdf-export).
  - Current gap: the PDF embeds only Courier Prime; missing glyphs, body
    tabs and overlong dual dialogue can silently misrender.
  - Do: Print accented Latin text correctly in body and title fields,
    including pasted decomposed accents. Use the same body-tab layout
    in the editor and PDF. Do not silently clip overlong dual dialogue
    or emit missing glyphs: render the text correctly or explain what
    prevents export and where to find it. Full multilingual typesetting
    and right-to-left layout are outside this task.
  - Done when: fixtures check editor and PDF agreement for body tabs and
    accented Latin text, and an overlong dual pair and an unsupported
    character either render completely or produce an actionable message
    before any misleading PDF is written.

<a id="task-7-3e"></a>

- [ ] 7.3e — Predictable selection edits and keyboard access
  - Status: todo
  - Depends on: [7.2](history.md#task-7-2).
  - Spec: [Elements and keys](brief.md#elements-and-keys),
    [Copy and paste](brief.md#copy-and-paste).
  - Do: Use Cut's element-boundary rules for Backspace, Delete and typing
    over a selection across elements, preserving the types of surviving
    text as Cut does. Keep ordinary collapsed-caret editing and Tab's
    screenplay behavior. Give the main controls a discoverable keyboard
    route with visible focus, including the sidebar, scenes, paper switch,
    draft menu and Title page. Expose the active autocomplete and spelling
    choices to a screen reader.
  - Done when: selection tests cover matching boundaries and clean Undo,
    and an isolated native check reaches the controls without a pointer,
    returns focus to the script and verifies suggestion announcements.
    Defer drag/drop, primary-selection paste and a broader accessibility
    audit.

<a id="task-7-4"></a>

- [ ] 7.4 — User check: V1
  - Status: blocked on 7.3.
  - Depends on: 7.3
  - Check: the user installs Tir, starts it from the launcher, and writes
    in it for a session.
  - Use [Installing the release](architecture.md#installing-the-release).
    Start Tir from the Hyprland launcher, write in a draft, and close and
    reopen it. Report whether the draft reopened with the edits; note
    anything that lagged or interrupted the session.

### Final Draft evidence

Arrange access to a named desktop Final Draft version in one handoff.
Use only original test scripts and record the version for each check:

- [7.3a](#task-7-3a): **Final Draft → Tir**. Save the original FDX and
  export a matched PDF from Final Draft with the same template and
  settings. Compare Tir's page starts against that PDF.
- [7.3c](#task-7-3c): **Tir → Final Draft**. Open and edit Tir's exported
  FDX in Final Draft and inspect the fields and settings named in the task.
  These observations do not verify page parity.

Neither check can substitute for the other. Both are deferred by the user
(2026-11-28, no copy of Final Draft); run them if access appears.

## Known gaps

This list holds limitations not owned by an open task. Remaining V1
blockers and their acceptance criteria are on [7.3d–7.3e](#task-7-3d).

- Not tested in Final Draft (the user's choice, 2026-11-28; see
  [7.3a](#task-7-3a)). Page parity follows Final Draft's documented
  default format and the calibration against its PDFs, but Final Draft
  has never paginated a matched script for comparison: automatic
  `(CONT'D)`, dual dialogue split across pages and some borderline wraps
  are unverified. Tir's FDX export follows the structure of files Final
  Draft saved, and Tir reads it back exactly, but Final Draft has not
  opened or edited one. Defer; run [Final Draft evidence](#final-draft-evidence)
  if access appears.
- Fountain round trips have whitespace and emphasis losses, including
  tabs and empty first or last element lines (0.3; full list in
  `src/core/fountain/write.ts`). Defer: the `.tir` draft is authoritative;
  the Fountain copy is readable interchange, not a fidelity format.
- Full-script copy took 200–230 ms in the 120-page trial (1.6); explicit
  Fountain export also serializes on the interface thread. The
  190–243 ms measurement was for both save texts together, not Fountain
  alone. Autosave normally serializes in a worker (2.2). Defer unless
  whole-draft copy or export disrupts writing.
- Dragging a selection within the script, and dropping text from elsewhere,
  still go through ProseMirror's own handling (1.6): by ProseMirror's
  source, a drag carries its own slice, element types included, and places
  it by its rules, not the paste rules (text dragged into an element can
  join it and take its type). Neither drop path is verified natively.
  Middle click pastes clipboard text instead of the primary selection
  (1.10, findings "Editor"). Defer; use the Cut and Paste commands.
- Announcing inline spelling squiggles to a screen reader and a broader
  accessibility audit are deferred beyond [7.3e](#task-7-3e).
- A style boundary inside one grapheme at the end of a line (a combining
  accent styled apart from its letter) would give the line two line-end
  decorations and an extra row (1.10 review, from the source), and so
  would a find highlight ending inside one there, such as "Jose" found in
  a stored "Jose" and U+0301 (5.4 review). Defer the general decoration
  fix, except where needed for accented-Latin rendering in 7.3d.
- After a save wrote the draft but failed on its Fountain copy, the copy
  stays a save behind the draft until a save succeeds; the indicator shows
  "Not saved" meanwhile (2.2, by design: the draft is written first).
  Defer a two-file transaction; the `.tir` draft is authoritative.
- Renaming a project or draft to a name differing only in capitals
  (`salt line` to `Salt Line`) is refused as already there when the
  library is on a case-insensitive volume, since the Rust side claims the
  new name before moving (2.1 review). The desktop's home is on btrfs,
  which is case-sensitive; there it works.
  Defer for the supported local library.
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
  Defer these rare disk-error paths.
- Export publishes its file with a hard link, so it fails, with the
  system's "Operation not permitted", on drives without hard links (FAT
  and exFAT USB sticks, some network mounts); exporting to the computer's
  own disk and copying works (2.6; 2.7 review). Defer direct export to
  these drives; preserve non-overwrite and atomic publication.
- Use a dedicated library. Tir refuses to delete a folder with a
  `project.json` declaring another format, but an unrecognisable or
  format-less project file can still be deleted after confirmation so a
  damaged Tir project can be removed (2.7, narrowed in 7.3).
- Full multilingual PDF typesetting and right-to-left layout are
  outside [7.3d](#task-7-3d).
- FDX export refuses an emphasis span that splits the two UTF-16 code
  units of one character, which can occur in a hand-edited `.tir` draft
  (4.3). XML cannot carry either half in a separate text run.
  Defer; export refuses rather than writing invalid XML.
- Find compares text as stored, so an accent stored as a separate
  combining mark ("a" and U+0301, as some macOS files hold it) does not
  match the single "á" typed in the find bar, nor the other way round
  (5.1). Normalising both before matching would need offsets mapped back
  to the text as stored.
  Defer canonical-equivalent Find.
- The views of find, the formatting check and spell check have no
  automated tests, since Vitest here has no DOM: the find bar, the marks,
  F8, and spell check's scheduling, F7 and menu are checked in the app
  only (5.1–5.4). Their commands and states are tested.
  Defer broad view automation; keep focused native checks.
- Long-draft averages omit known pauses around removing a page and
  very common Find/Replace all queries (history and findings, "Editor").
  Narrow tiles can scroll sideways at higher zoom (1.10). Defer unless
  these interrupt writing. Fountain caps input bytes but not parsed
  records or report rows; defer stricter limits for unusually large
  imports.
- A clone or a pull gives each file it writes the time of the clone or
  pull (findings, "Library on disk"), so the Projects screen's last edit
  and the draft menu's dates show a draft brought from the other machine
  as written then (2.3; left by 6.1). For a draft git holds unchanged,
  the earlier of its file's time and its last commit's time would be
  right; reading that walks the history at each listing unless it is
  kept until HEAD moves.
  Defer; this affects dates and ordering, not text.
- The public check against GitHub itself, GitHub's REST API asked with no
  login through libsoup (`github.rs`'s `get`), runs in no test or trial,
  which never reach the network; tests read sample answers and trials ask
  a sandbox git instead (6.3; findings, "GitHub"). The user's check (6.5)
  connects a private repository through it. Defer a live public-repository
  check; it has not been verified.
- Closing still waits behind a sync already under way, then makes its
  own final attempt. The window is gone during the wait; a new Tir must
  wait for the old instance to release the lock (6.5a).
  Defer unless this makes normal relaunch disruptive.
- Backup trusts the writer's local Git installation and configuration,
  including credential helpers and clean filters. Destination and file
  checks do not make arbitrary local Git configuration safe (6.5a).
  Defer arbitrary Git configurations; use the writer's trusted setup.
- Deletion warnings compare the current path with the last known remote
  tip. They do not search old paths after a rename or prove a version
  recoverable from history (6.5a).
  Defer history lookup and in-app restoration.
- Use a local library only this user can write. The instance lock is per
  settings directory, not per library; don't point multiple instances at
  one library. Name and symlink checks assume other programs do not
  replace directory entries while Tir uses them. Close Tir before a
  manual `git pull` or other external edit: a save can race a replacement
  after its fingerprint check, and a deletion confirmation is not a
  guarantee that on-disk drafts are still the versions it showed
  (6.5a, 7.3).
  The background startup check cannot guarantee a warning before writing
  starts. Defer concurrent writers and live sync; use one Tir per library
  and pull with it closed.
- In focus mode the top bar fades while the backup panel under it stays
  open (`app.css`'s focus rules apply to the bar, the panel lives in the
  page's body); Esc closes it (6.4).
  Defer.
