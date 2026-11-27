# Tir: build plan

The task list for building V1. Intended behaviour is in
[brief.md](brief.md), design rules in [architecture.md](architecture.md),
outside facts in [findings.md](findings.md), and the chosen screens in
[prototype/index.html](prototype/index.html).

Completed Stages 0–2 and their evidence are in [history.md](history.md).

## Current status

- Active: none. [Stage 2](history.md#stage-2-library-projects-and-drafts)
  is finished (user check 2.8 passed).
- Next: [3.1 PDF export](#task-3-1). Stage 3 ends with
  [review 3.3](#task-3-3) and [user check 3.4](#task-3-4).
- Blockers: none. The four [open questions from 1.10](#known-gaps) do not
  block Stage 3.

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

- [ ] 3.1 — PDF export
  - Status: todo
  - Depends on: 2.8
  - Spec: [PDF export](brief.md#pdf-export); findings on
    [Courier Prime](findings.md#courier-prime) and [PDF libraries](findings.md#pdf-libraries).
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
    The [calibration PDFs](architecture.md#setting-up-a-machine) are
    machine-local and not in git.
  - Done when: every page of Tir's PDF starts on the same line as the
    editor's, the text can be selected and searched, and the PDF opens
    correctly in Firefox and in a desktop PDF viewer.

<a id="task-3-3"></a>

- [ ] 3.3 — Review: Stage 3
  - Status: todo
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

<a id="task-3-4"></a>

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
  - Note (from 2.3): the Projects screen's empty library says "bring one
    in from a Fountain file" (`render` in `src/ui/projects-screen.ts`);
    with FDX import it says prototype piece 6's "from a Fountain or Final
    Draft file".

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
  - Note (from 2.1): a crash can leave `NAME.<pid>-<n>.tmp` files
    (`files.rs`) and hidden `.deleting.<pid>-<n>.tmp` folders
    (`library.rs`) in the library; ignore `*.tmp` in its `.gitignore` so
    they never become commits.
  - Note (from 2.3): the Projects screen's last edit is a draft file's
    modification time, which a clone or a pull resets to its own time
    (findings, "Library on disk"); once the library is a repository, a
    committed draft's time can come from `git log` instead.

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
  - Note (from 2.7): a save does not check whether its draft changed on
    disk since Tir read it (`write_draft` takes no `was`; only project
    file changes do), so a draft or project file another program changes
    while Tir shows it, such as a `git pull` the writer runs to bring in
    the other machine's work, is written over at the next save without a
    word. Since 2.7 a second Tir cannot (`instance.rs`). Decide with the
    pause how the other machine's work arrives: with Tir closed, or with
    saves checking what they replace.

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
  - Note (from 2.3): until backup exists, the Projects screen's delete
    confirmation says "Tir has no backup of it yet, so this can't be
    undone" (`deleteProject` in `src/ui/projects-screen.ts`; the user's
    choice, 2026-11-27). Once a project is backed up, it says prototype
    piece 6's "GitHub keeps the backup history, so it can still be
    recovered from there"; choose the wording for a project whose last
    changes are not pushed yet.

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
- A screen reader is not told of autocomplete suggestions: the popup is a
  named listbox, but the editor's root names no active option (1.5, 1.10).
  Attributes on the root change with every popup update, so measure typing
  with them before adding them.
- A style boundary inside one grapheme at the end of a line (a combining
  accent styled apart from its letter) would give the line two line-end
  decorations and an extra row (1.10 review, from the source). The editor
  selects whole graphemes, so only an opened or pasted script could hold
  one.
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
