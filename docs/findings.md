# Tir: findings

Facts about the outside world that the design depends on but the code cannot
show. Each entry is the finding, what follows from it, and its evidence.
Rewrite an entry when newer evidence contradicts it.

## Final Draft's default screenplay format

Final Draft stores its element formatting inside every `.fdx` file. Three
scripts saved by Final Draft (file versions 1, 5 and 6) carry identical
defaults. The widths come from Final Draft's PDFs (see "Line widths"):

| Element | Left (in) | Right (in) | Width | Space before | Align | Capitals | Return gives | Tab gives |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Scene Heading | 1.50 | 7.50 | 61 chars | 24 pt (2 lines) | left | yes | Action | Action |
| Action | 1.50 | 7.50 | 61 chars | 12 pt (1 line) | left | no | Action | Character |
| Character | 3.50 | 7.25 | 38 chars | 12 pt | left | yes | Dialogue | Transition |
| Parenthetical | 3.00, first line 2.90 | 5.50 | 25 chars (26 on the first line) | 0 | left | no | Dialogue | Dialogue |
| Dialogue | 2.50 | 6.00 | 35 chars | 0 | left | no | Action | Parenthetical |
| Transition | 5.50 | 7.10 | 16 chars | 12 pt | right | yes | Scene Heading | Scene Heading |
| Shot | 1.50 | 7.50 | 61 chars | 24 pt | left | yes | Action | |
| General | 1.50 | 7.50 | 61 chars | 0 | left | no | General | |

- Font: Courier Final Draft 12 pt, printed at 10 characters per inch and 6
  lines per inch. "Capitals" is the `AllCaps` font style.
- Parenthetical has a first-line indent of -0.10 in, so the opening "(" hangs
  one character left of the wrapped lines. Some templates do not hang it
  (two of the calibration scripts start it at 3.0 in).
- Page: US Letter, top and bottom margins 72 pt (1 in), header and footer
  36 pt (0.5 in). The header holds the page number.
- `BreakDialogueAndActionAtSentences="Yes"`: action and dialogue split
  across pages only at sentence ends.
- Mores and continueds: a dialogue split across pages ends with `(MORE)` and
  resumes under the repeated cue with `(CONT'D)`. Automatic character
  continueds are on: a cue gets `(CONT'D)` when the same character speaks
  again after interruption. Scene `CONTINUED` markers are off by default.
- Smart quotes are on, so Final Draft prints `(CONT’D)` with a curly
  apostrophe (seen in five of the calibration scripts).
- Page numbers sit in the header at the top right and end with a period
  ("2."): Babygirl, Heretic, Queer and Superman print them so, A Real Pain
  prints "2". The first script page shows no number unless the writer turns
  that on (Superman does). The title page is outside the sequence.
- Default shortcuts are Ctrl+0 to Ctrl+8: General, Scene Heading, Action,
  Character, Parenthetical, Dialogue, Transition, Shot, Cast List.

Evidence: `ElementSettings`, `PageLayout` and `MoresAndContinueds` in
`unclebob/ScriptSchedule/script.fdx`, `cullvox/bluemetal/Docs/Maginvox.fdx` and
`darrenprx/azkript/examples/sample.fdx` on GitHub, read 2026-11-26; the
`AllCaps` styles re-read in all three the same day (`sample.fdx` has no Shot
or General). One file's Shot was right-aligned with 12 pt before, and its
Scene Heading bold, which look like user edits. `LaPingvino/lexington/fdx/example.fdx` differs (Courier, Character
3.38 in) because a non-Final Draft tool wrote it, so it is excluded. Page
numbers and apostrophes: the calibration PDFs (see "Calibration").

## Final Draft's keys

- **Return** at the end of a paragraph starts a new one by the table's
  column ("General to General, Scene Heading to Action, …").
- **Tab** "supplements the functions of the Return key" by the table's Tab
  column, where Character gives Transition "only when character is blank".
  At the end of a paragraph with text it starts a new paragraph (the status
  bar names what Enter and Tab will insert there, and reads "Ready"
  elsewhere); after a cue with a name it starts a Parenthetical, unless the
  option "Tab Key Transitions to Character Extension" is on, which it is not
  by default. On a blank paragraph a new element replaces it (Enter then
  Tab goes from Dialogue or Action to Character).
- **Ctrl+0 to Ctrl+8** are "an alternative method of adding new
  paragraphs"; on a blank paragraph the new type replaces it. Final Draft 11
  for Windows changes the current paragraph's type with Ctrl+Shift+number;
  Final Draft 13 gives those keys to its outline elements.
- **Formats**: Ctrl+B, Ctrl+I and Ctrl+U for bold, italic and underline;
  Dual Dialogue is Ctrl+Alt+D on Windows (Cmd+D on a Mac), applied with the
  cursor in the first of two consecutive speeches, and undone from either.
  Alignment (applied to every selected paragraph) and Insert > Page Break
  have no default key. Page Break moves the paragraph holding the cursor, or
  the selection's start, to the top of the next page; choosing it again
  there removes it.
- When a parenthetical is added, Final Draft "automatically enters both the
  left and right parentheses and positions the cursor between them".
- **Go To** is Ctrl+G on Windows and Cmd+G on a Mac: a window where a page
  number is typed, or picked from a list, then Return; it also goes to a
  scene, a bookmark and other divisions. The status bar's "Page X of Y"
  gives "the number of the displayed page and the total page count", and on
  a Mac a double-click on it opens Go To.
- **Zoom**: on a Mac, View > Zoom In is Cmd++ and Zoom Out Cmd+−. The
  Windows table lists Ctrl++ and Ctrl+− only for the Beat Board; on Windows
  the script zooms from the status bar's slider, its − and + buttons, or a
  menu of presets, from 50% to 300%. Neither table has a key that resets
  the zoom.
- **Focus Mode** (View > Focus Mode, or an icon in the status bar) hides
  the menu bar, toolbar and other panels; it has no default key, and Escape
  leaves it.
- **Format Assistant**, Final Draft's formatting check, opens from Tools >
  Format Assistant and steps through its findings with Fix and Ignore; it
  has no default key.
- **File**: Open is Ctrl+O on Windows and Cmd+O on a Mac, Save Ctrl+S and
  Cmd+S. Save As is Cmd+Shift+S on a Mac; the Windows table lists no key
  for it (its Ctrl+Shift+P is Save As PDF), and Ctrl+Shift+O there shows
  or hides the outline in the script.
- Evidence: Final Draft's knowledge base, "What keyboard shortcuts can I use
  in Final Draft?" (2024; Go To in both Edit tables, Zoom In and Zoom Out in
  the Mac View table and the Windows Beat Board table), "What info can I
  see in the Status Bar at the bottom of the screen?" (2025), "What's in the
  View Mini-Bar at the bottom right of my screen? (Windows)" (2025; Zoom,
  Focus Mode), "How do I use Focus Mode?" (2024) and "How do I use Format
  Assistant?" (2024), Final Draft's blog "Tech Tips: Go To" (2025), and the
  Final Draft 13 user guide for Windows (Dual Dialogue, Alignment, Page
  Break, the sample script tutorial, the status bar, SmartType options,
  Element Shortcuts, Tab key), all from finaldraft.com; the Final Draft 11
  Windows guide (Reformatting). Read 2026-11-26.

## Final Draft's SmartType

- SmartType, Final Draft's autocomplete, keeps lists of the script's
  character names, character extensions, scene intros, locations, times and
  transitions, adding each new item as it is typed. Typing a letter into a
  character paragraph shows the items starting with it, narrowing as more is
  typed, with "the rest of the first matching item" in light grey after the
  cursor; with no match the window does not appear. Enter (or a
  double-click) inserts the highlighted item "and dismiss[es] the SmartType
  window"; the arrows, or the item's first letter, choose. Lists keep the
  order of entry; an option sorts characters by number of dialogues.
- Typing "(" after a cue's name shows the Character Extension list.
- In a scene heading, Tab accepts the highlighted scene intro and adds a
  period and a space ("i" then Tab gives "INT. "); after a location, Tab
  adds " - " and the Time list appears; Tab on a time accepts it and starts
  an Action: "Press Tab to accept the current selection from a SmartType
  list and move to the next logical element." The separators are "." after
  the intro and " - " before the time by default.
- The lists in an FDX file Final Draft saved (`<SmartType>`, document
  version 3): Extensions (V.O.), (O.S.), (O.C.), (SUBTITLE); Scene Intros
  INT., EXT., INT./EXT.; Times DAY, NIGHT, MORNING, AFTERNOON, EVENING,
  LATER, MOMENTS LATER, CONTINUOUS, THE NEXT DAY; Transitions CUT TO:, FADE
  IN:, FADE OUT, FADE TO:, DISSOLVE TO:, BACK TO:, MATCH CUT TO:, JUMP CUT
  TO:, FADE TO BLACK. These read as the defaults (the file's own script
  added one character and one location), but it is one file from an older
  version. Final Draft 13's tutorial offers "INT. or I/E." for "i", so its
  intros include I/E.; Tir uses the brief's five prefixes.
- Evidence: Final Draft's knowledge base, "What is SmartType and how do I
  use it?" (2024), "I can't type my Scene Headings without the cursor
  jumping to the next line" (2023) and "After I add a character "cont'd"
  with SmartType, it disappears immediately" (2023); the Final Draft 13 user
  guide for Windows (SmartType, Adding Paragraphs with the Tab Key, Typing a
  Sample Script, renumbering scenes), all from finaldraft.com; the FDX file
  `testdata/sample-01.fdx` in github.com/rsdoiel/fdx. Read 2026-11-26.

## Line widths

- Final Draft fits more on a line than its indents and 7.2 pt characters
  give: 61 characters of action in 6.0 in, but exactly 35 of dialogue in
  3.5 in, 26 and 25 for a parenthetical, 16 for a transition and 29 for a
  column of dual dialogue. Every one is what fits if each character
  measures about 7.08 pt (between 7.00 and 7.08), though Final Draft prints
  at 7.2 pt. That rule gives 38 for a cue, which the corpus barely tests.
- Lines break at spaces and after a hyphen inside a word ("blow- | drying",
  "bottle-- | only"), not after an em dash. A hyphen ending a line, inside a
  word, standing alone ("gone -") or ending the text, may hang one
  character past the width.
- About 0.2% of elements still wrap differently, mostly lines of 36
  characters in dialogue that are rich in narrow letters ("only a fraction
  of that billion have"): Final Draft's measurement seems not to be strictly
  fixed-pitch. Tir cannot copy that without the font's own metrics.
- Evidence: the seven calibration scripts (see "Calibration"), 2026-11-26.
  1,260 action lines are 61 characters long and 23 are 62; 1,838 dialogue
  lines are 35 and 47 are 36, 23 of those ending in a hyphen. 101 line
  breaks follow a word hyphen and 51 a double hyphen; the one line ending
  in an em dash has a space after it. With these rules, 6,874 of 6,888
  elements that sit on one page wrap exactly as Final Draft wrapped them.

## Pagination

- A page holds 54 lines (rows 0 to 53). `(MORE)` sits on the line below the
  speech's last, which may be a 55th; the repeated cue `NAME (CONT’D)` sits
  on the line above the next page's first. Neither counts against the 54.
  Scene `CONTINUED:` markers, when on, also sit above the first line (two
  rows up) and below the last.
- A split leaves at least two lines on each page, falls at a sentence end
  (or a line break inside the element), and both parts are wrapped afresh.
- A speech may end a page after dialogue or after a parenthetical, with at
  least two lines of dialogue above `(MORE)` and more of the speech to
  follow. A cue never ends a page.
- A scene heading never ends a page; Tir keeps headings and shots with the
  start of what follows. A transition never starts a page: the element
  before it moves on with it.
- Not yet known: Final Draft's rule for automatic `(CONT'D)` (the scripts'
  own settings vary, and some show none), and how it splits dual dialogue
  (no block in the corpus crosses a page; Tir keeps one whole).
- Evidence: the calibration scripts. Of 35 pages that use a 55th line, 32
  end with `(MORE)` there; every repeated cue in seven scripts sits on row
  -1. In 37 dialogue splits, 36 leave two or more lines before `(MORE)` and
  all leave two or more after; 36 fall at a sentence end and 32 of 41 split
  mid-line. Nine pages end with a parenthetical then `(MORE)`; three times
  Final Draft moved a speech whole rather than leave one line of dialogue
  above `(MORE)`. No page of 941 starts with a transition and none of 702
  ends with a scene heading; Sing Sing page 66 moves a two-line action to
  keep `CUT TO:` with it.

## Dual dialogue

- Two columns, 1.5 to 4.375 in and 4.625 to 7.5 in. Dialogue starts at each
  column's left and holds 29 characters; each cue is centred in its column
  (an automatic `(CONT'D)` is added after centring); parentheticals start a
  quarter inch in (1.75 and 4.875 in) and hold about 23.
- Evidence: dual rows in Babygirl, After the Hunt, Queer, Heretic and The
  Fire Inside: left cues of 3 to 15 letters centre at 211.5 pt and right
  ones at 436 pt; dialogue runs start at 108 and 332 to 333 pt, and no
  column line is longer than 29. The parenthetical width rests on few
  samples.

## Calibration

- The calibration set is seven screenplay PDFs that Final Draft (10 to 13,
  on a Mac) wrote, named as the Creator, in its default format and without
  locked revision pages: A Real Pain, After the Hunt, Babygirl, Heretic,
  Queer, Sing Sing and Superman (studio "For Your Consideration" PDFs, kept
  in the ignored `calibration/` folder). Set aside in `calibration/excluded/`:
  BELEN (A4 paper), Hedda, Unstoppable and The Fire Inside (custom
  templates: shifted indents, one-line scene heading spacing), The Brutalist
  (text off Courier's grid), Dune (locked pages through colour revisions)
  and Transformers One (a picture-lock conform with its own sequence
  element).
- Sources, all downloaded 2026-11-26:
  - A Real Pain: `https://assets.debut.disney.com/documents/A%20REAL%20PAIN_Shooting%20Script%20FINAL%20copy.pdf`
  - After the Hunt: `https://amazonmgmstudiosguilds.com/app/uploads/2025/08/After_The_Hunt_Screenplay_FIN.pdf`
  - Babygirl, Heretic, Queer, Sing Sing: `https://a24awards.com/assets/<name>-screenplay.pdf`
    with `Babygirl`, `Heretic`, `Queer` and `Sing-Sing`
  - Superman: `https://www.superman.com/script/supermanscript.pdf`
  - Set aside: `https://amazonmgmstudiosguilds.com/app/uploads/` followed by
    `2025/09/BELEN_Script_Spanish.pdf`, `2025/08/Hedda_Final-Script.pdf`,
    `2024/08/UNSTOPPABLE_Screenplay.pdf` and
    `2024/08/The_Fire_Inside_Screenplay.pdf`;
    `https://a24awards.com/assets/The-Brutalist-screenplay.pdf`;
    `https://d2bu9v0mnky9ur.cloudfront.net/academy2021/scripts/duneMxFtT98NYwBsMltl20211109/dune_final_shooting_script_6_19_20.pdf`;
    `https://www.indiewire.com/wp-content/uploads/2024/12/TRANSFORMERS-ONE-FSS.pdf`.
- Result (`mise run parity`, 2026-11-26): starting Tir where Final Draft
  starts each page, 582 of 605 pages end where Final Draft's do. Left out
  are 99 pages that end inside action, whose paragraph boundary the PDF does
  not show and the tool reads by pagination's own rules, and 13 pages with
  blank gaps (images). Read through from page 1, 270 of 722 pages start on
  the same line: one early difference moves every page after it.
- The 23 differing pages, which Known gaps lists:
  - 14 where Final Draft left three or more lines its rules would fill,
    likely manual page breaks or pages kept from an earlier pagination: A
    Real Pain 16 and 45, After the Hunt 39, Babygirl 5, Heretic 7, 85 and
    105, Queer 22 and 62, Sing Sing 45, Superman 6, 43, 45 and 113.
  - 5 where a line at the top of a page is read wrongly (a shot, or a
    title-like first page): After the Hunt 1, Heretic 47 and 123, Superman
    22 and 95.
  - 4 unexplained: A Real Pain 76, Babygirl 87, After the Hunt 12 and 40.

## Courier Prime

Courier Prime is under the SIL Open Font License 1.1, so Tir can bundle and
embed it. Every glyph has the same advance, 1228 of 2048 units (0.5996 em).
Courier's nominal 0.6 em gives 7.2 pt per character at 12 pt; Courier Prime
gives 7.195 pt, which is 0.3 pt short across a full 60-character line. Layout
can therefore count characters as Courier does. Final Draft's own "Courier
Final Draft" is proprietary and cannot be bundled. Evidence:
`google/fonts` `ofl/courierprime/CourierPrime-Regular.ttf`, measured with
fontTools on 2026-11-26.

## Title page conventions

Guides agree on a spec-script title page: the title centred in capitals
about a third of the way down, a credit line such as "Written by" beneath it,
then the writer's name. An optional source line ("Based on the novel by")
follows. Contact details (the writer's, or the agent's or manager's if
represented) go at the bottom left. A draft date at the bottom right is
disputed: Final Draft says spec scripts omit it and assignment scripts carry
it. The title page has no page number, and numbering starts on the first
script page. Evidence: Final Draft blog title-page articles, NoFilmSchool and
StudioBinder guides, read 2026-11-26.

## Desktop stack

- Tauri 2.12.7 and wry 0.58.2 were the current stable releases on
  2026-11-26 (crates.io).
- wry 0.58.2 contains no spell-checking code, so on Linux WebKitGTK's own
  spell checker stays off in a Tauri app unless the app turns it on through
  the WebKitGTK API. Evidence: no match for "spell" in the wry 0.58.2 crate
  source.
- tauri-plugin-dialog 2.8.4 (Apache-2.0 or MIT; it brings rfd 0.17.2,
  tauri-plugin 2.7.4 and tauri-plugin-fs 2.7.1, the rest already in the
  build) shows GTK 3 dialogs through rfd by default, run on the main
  thread; its `blocking_*` calls must not be made from the main thread, so
  Tir's commands that call them are `async`. Its permissions gate only the
  page's calls to its own commands; Rust calls need none, and Tir's
  capability grants none of them. It injects a script that replaces
  `window.alert` and `window.confirm` with calls to its `message` command,
  which the capability refuses. Its Save dialog asks before replacing the
  file named in it (`gtk_file_chooser_set_do_overwrite_confirmation`). A
  message box shows its title twice, as the window's title and in bold
  above the message, so Tir titles one with its headline. Hyprland tiled
  the file dialogs beside the window and floated message boxes over it;
  the GTK file chooser printed `Gtk-CRITICAL` assertions about tree models
  while a path was typed, and worked. Evidence: the crate sources
  (`desktop.rs`, `lib.rs`, `init-iife.js`; rfd's `gtk3/file_dialog`), and
  the native check of task 1.9, 2026-11-26.
- The dialog plugin's own commands add a picked path to the file system
  plugin's scope only when that plugin is registered (`try_fs_scope`);
  Tir registers no file system plugin, so the page has no file access of
  its own. Evidence: `tauri-plugin-dialog` 2.8.4 `commands.rs`, read
  2026-11-27.
- Tauri 2.12.7 keeps a window open on a close request only while the page
  listens for `tauri://close-requested`; the JavaScript API's
  `onCloseRequested` then closes the window with `destroy`, which needs
  `core:window:allow-destroy`, not in `core:default` (whose window part
  holds only queries and `internal-toggle-maximize`). A page's event
  listeners stay registered on the Rust side until the webview is
  destroyed, not when the page reloads, so a listener of a page reloaded
  or gone would hold every later request. `WebviewWindow::close` asks to
  close as the window manager does; `destroy` closes without asking. So
  Tir holds closing in Rust itself (architecture, "Saving and opening").
  Evidence: tauri 2.12.7 `src/manager/window.rs` (`on_window_event`),
  `src/event/listener.rs` (`listen_js`, `remove_webview_js_listeners`),
  `permissions/window/autogenerated/reference.md`; `@tauri-apps/api`
  2.12.5 `window.js`; the Tauri 2.0 release notes (Context7), read
  2026-11-27.
- A module Web Worker from the page's own origin
  (`new Worker(new URL(...), { type: "module" })`) runs in WebKitGTK 2.54.2
  in Tauri's development build, and `vite build` makes it a file of its
  own; a release build has not run it yet. Evidence: task 2.2's saves in
  the dev app and `vite build`, 2026-11-27.
- Hyprland 0.57's `hl.dsp.window.close` asks a window to close, which Tauri
  reports as `WindowEvent::CloseRequested`, as the writer's own close key
  does (`hl.bind(... hl.dsp.window.close())` in this desktop's
  configuration). Evidence: task 2.2's native checks, 2026-11-27.
- Tauri 2.12.7 lets any number of the same app run at once, and makes the
  windows `tauri.conf.json` lists before the `setup` hook runs; a window
  with `"create": false` is made only when the app builds it
  (`WebviewWindowBuilder::from_config`). `std::fs::File::try_lock` (Rust
  1.89 and later) takes `flock` on a directory opened read-only, and two
  opens of one directory in one process exclude each other, so a test can
  check the lock in one process. Tir locks its config directory
  (architecture, "Settings"). Evidence: tauri 2.12.7 `src/app.rs`
  (`setup`), `instance.rs`'s test, and task 2.7's native check: a second
  Tir on the same `TIR_CONFIG_DIR` showed "Tir is already open" with no
  window and exited on OK; one on another ran beside, 2026-11-27.

## Library on disk

- Windows refuses `< > : " / \ | ? *` and characters 0–31 in a name,
  keeps `CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `COM¹`–`COM³`,
  `LPT1`–`LPT9` and `LPT¹`–`LPT³` for devices, alone or followed by an
  extension (`NUL.tar.gz` is `NUL`), does not show a name ending in a space
  or a period, and asks programs to treat names differing only in capitals
  as the same. `COM0` and `LPT0` are not on the list. Tir's names follow
  this so the library, a git repository, can be cloned anywhere
  (architecture, "Library on disk"). Evidence: Microsoft's "Naming Files,
  Paths, and Namespaces" (`MicrosoftDocs/win32`,
  `desktop-src/FileIO/naming-a-file.md`), read 2026-11-27.
- On Linux a name is at most 255 bytes: a draft file named with 251
  characters and `.tir` could be made, but `files::replace`'s temporary
  file beside it could not (`ENAMETOOLONG`). Tir's names stop at 120
  bytes. Evidence: `library.rs` tests, 2026-11-27.
- `rename(2)` of a folder onto an empty folder replaces it, and onto a
  folder with anything in it fails. `library.rs` claims a project's new
  folder name by making it empty first (`mkdir` fails when the name is
  taken), then renames over it. Evidence: `rename(2)` (man7.org, read
  2026-11-27); `library.rs` tests, 2026-11-27.
- Git keeps no file times: a clone gives every file the time of the
  clone, and a pull gives each file it changes the time of the pull,
  neither the time it was written on the other machine nor its commit's
  time; files the pull leaves alone keep theirs. So the Projects screen's
  last edit, a draft file's modification time, is right on the machine
  where the writing happened and shows a pull's time elsewhere; `git log
  -1 --format=%ct -- FOLDER` gives the commit's time. Evidence: a local
  bare repository and two clones, a draft changed and its time set back
  in one, pulled in the other (`stat`, `git log`), 2026-11-27.

## Fountain

- Fountain 1.1 has no Shot or General element, no way to force dialogue or a
  parenthetical, and no way to keep two dialogue elements apart under one
  cue. Tir's writer marks such elements with a `[[tir:type]]` note (see
  architecture, "Fountain"). Evidence: fountain.io/syntax, read 2026-11-26.
- The spec gives emphasis as "Markdown-style" and leaves pairing undefined.
  Under Markdown's delimiter rules, some bold and italic spans that cross or
  touch mid-word cannot be written at all (bold "ab" with italic "bc" needs
  a run like `****`, which pairs differently). Spans over whole words always
  can. Evidence: seeded random round trips in
  `src/core/fountain/inline.test.ts`, 2026-11-26.
- A literal `/` before a `**` marker reads as the start of boneyard (`/*`),
  and `[` beside `[` as a note, so the writer escapes both and the reader
  skips escaped characters when it looks for them. Found by the random round
  trip in `src/core/fountain/write.test.ts`, 2026-11-26.

## PDF libraries

- Reading: `unpdf` (2.2), a serverless build of Mozilla's pdf.js with no
  dependencies. pdf.js is the reference text extractor: each run comes with
  its transform, so its position, and it handles PDF font encodings.
  `pdfjs-dist` itself pulls in a native canvas package as an optional
  dependency, which text extraction does not need.
- Writing: `@cantoo/pdf-lib` (2.11) with `@cantoo/fontkit`, the maintained
  fork of pdf-lib (whose last release was 2022). It is pure JavaScript with
  its own types, takes and returns bytes, and runs the same in Node and in
  WebKitGTK, so Stage 3's writer can live beside the core. It embeds and
  subsets Courier Prime (7 KB for a page) and places text at exact
  coordinates. It has no bookmark API: Stage 3 builds the PDF outline
  dictionary itself (PDF 1.7, section 12.3.3).
- Rejected: PDFKit 0.21 has bookmarks and a browser build, but its types
  (`@types/pdfkit` 0.17) lag the browser and byte-output APIs, and the
  latter is marked experimental; jsPDF is browser-first and installs
  html2canvas, canvg and DOMPurify as optional dependencies.
- Evidence: npm metadata and Context7 docs read 2026-11-26; a spike wrote a
  page in Courier Prime with the fork and read back every run's text and
  position with unpdf, which also adds a space run between separate runs.

## Reading screenplay PDFs

What the parity tool (`tools/parity/`) can and cannot recover from a PDF:

- Courier is fixed-pitch, so a run's column is its x over 7.2 pt; styled
  runs can sit off that grid, so runs that do not touch are joined with at
  least one space.
- Final Draft PDFs on a Mac carry the program as Creator, with Quartz as
  Producer. Some offset every line a few points (Hedda, by 8 pt); the tool
  reads past a common offset.
- The page number may sit in the header half an inch down or just above
  the body; the repeated cue sits on the row above the first line.
- A PDF shows no blank line at the top of a page, so where action ends one
  page and starts the next it cannot show whether that is one paragraph
  split at a sentence end or two. The tool reads it by pagination's own
  rules, notes the undecided ones, and leaves such pages out of the
  page-by-page comparison. A lone line in capitals stays its own element.
- A shot at the top of a page reads as action, and the tool notes it. Empty
  elements show only as a wider gap: the tool reads each extra blank line as
  an empty General. Four or more blank lines inside a page are taken for an
  image or spacing and the page is left out.
- A title page centres at least two lines, and half of all its lines, on
  the page.
- Evidence: 120 PDFs generated by Tir from 40 original scripts, each with
  dual dialogue and an empty line, at 48, 54 and 56 lines a page
  (2026-11-26): 65 rebuilt exactly and 1,142 of 1,317 page starts matched
  from page 1; every first difference came after a note on or before its
  page. The rest are action read across a page break the wrong way, a shot
  or empty line at a page top, all of them noted. Then the calibration
  scripts above.

## Editor

This section records the constraints and evidence that still guide the
editor. The [historical measurements and probes](history.md#editor)
include the per-task results. Reproduce with
[Measuring the editor](architecture.md#measuring-the-editor).

### Layout and input constraints

- **Keep one layout engine.** The browser does not wrap script text
  (`white-space: pre`). The projection sets each element's paragraph
  geometry and adds breaks as decorations. Per-line wrappers failed:
  ProseMirror split a line containing a bold word into three rows.
  Mapping and patching decorations also avoided about 33 ms per
  keystroke spent rebuilding the whole set in the first spike.
- **Scroll the document and keep the script out of flex and overflow
  containers.** An overflow scroll container added roughly 3 ms per
  keystroke; sizing the editor as a flex item made WebKit lay out every
  line again. The focused contenteditable's native outline and a page
  touch or wheel listener each added about 5 ms per keystroke in the
  original profiling. `content-visibility: auto` on the paragraphs made
  typing slower, not faster.
- **Scale the script with a transform, not CSS `zoom`.** At 110%, CSS
  `zoom` moved lines 22.6 px off the engine's position by page 121 and
  sent thousands of clicks to the wrong line. `transform: scale()` from
  the top left kept positions within 0.5 px and every click landed.
- **Preserve caret and paragraph placement.** WebKit can scroll to the
  old selection when an editable regains focus, even with
  `preventScroll`; focus before replacing the state or restoring
  scroll. Across a page gap inside a paragraph, native Up/Down can
  skip a line or lose the column. ProseMirror can reuse the DOM of an
  equal paragraph at another position; recheck the projected paragraph
  styles after update rather than assuming equality implies placement.
- **Test decorations together.** The Stage 1 probe placed find
  highlights, spelling underlines, margin dots and a ghost completion
  without moving the script's lines. Overlapping inline decorations
  without `nodeName` share a span, including on a line's last character.
  Building a full-document decoration set took 51 ms in that probe;
  map and patch it after edits.
- **Test input in WebKitGTK as well as editor state.** ProseMirror
  intercepts Esc before a bubbling window listener can use it. Keep
  composition native and check dead and Compose keys at the window.
  ProseMirror's default copy loses element types; WebKitGTK round-trips
  Tir's custom clipboard type within the app while giving other apps
  plain text. A middle click delivered the clipboard, not primary
  selection; see [Known gaps](plan.md#known-gaps) for the open question.

### Typing baseline

Stage 2.3, 2026-11-27: WebKitGTK 2.54.2 on the desktop, Hyprland at
60 Hz, 100% zoom. Three `mise run editor-timing` runs, including the
review fixes. Layout is time through DOM update and forced layout
before paint. Frame also includes the wait for the rendering update;
busy is main-thread blocked time in the 70 ms after the key.

| Edit | Median layout | Median frame | Median busy |
| --- | --- | --- | --- |
| Ordinary typing | 10–12 ms | 17–20 ms | 18–22 ms |
| Add or remove a line | 11–12 ms | 17–20 ms | 17–24 ms |
| Add a page | 15–17 ms | 22–24 ms | 31–32 ms |
| Backspace that removes it | 56–59 ms | 62–64 ms | 63–69 ms |
| Change a line, `feature` fixture | 15–16 ms | 23–25 ms | 27–29 ms |
| Type as a save starts or runs | 10–11 ms | 18–19 ms | 12–14 ms |

Ordinary typing does not reliably fit a 60 Hz frame. Use paired runs
on the same machine before attributing a small difference to a change.
Serializing the 120-page draft and its Fountain copy together took
190–243 ms on the interface thread in task 2.2; the worker kept the
interface busy for only short periods while saving. Full-script copy
still pays the Fountain serialization cost on the interface thread.

### Measuring traps

- Force layout on the element being measured. Reading the body's
  height misses work in a fixed subtree.
- The Hyprland dispatcher's key event timestamp was unusable. Measure
  from `performance.now()` in a capturing `keydown` listener.
- The remote inspector's Timeline returned zero times. Use
  `ScriptProfiler` for JavaScript and `perf` for WebKit. Reconnect
  after Vite replaces the target, and close the previous connection
  before opening another. `tools/inspector.ts` awaits page promises.
- Character boxes can be rounded to whole pixels. Compare within a
  pixel and check actual click placement as well.

## NixOS development shell

- Tauri's Linux prerequisites send NixOS users to the NixOS wiki's Tauri
  page. Its shell uses `pkg-config`, `wrapGAppsHook`, `webkitgtk_4_1` and
  `librsvg`, and sets `XDG_DATA_DIRS` from `GSETTINGS_SCHEMAS_PATH`, which
  it says Wayland needs to report the display scale. Evidence:
  `tauri-apps/tauri-docs` `start/prerequisites.mdx`; wiki.nixos.org/wiki/Tauri
  (revision 35442); both read 2026-11-26.
- Rust 1.99 links Linux binaries with its bundled LLD, which bypasses the Nix
  shell's linker wrapper. The wrapper is what records each library's store
  path in the binary, so the app built but failed at launch with
  `libgdk-3.so.0: cannot open shared object file`. Building with
  `-Clinker-features=-lld` restores the wrapper. Evidence: with rustc 1.99.1
  from mise, `readelf -p .comment` showed `Linker: LLD 23.1.1` and a RUNPATH
  holding only `outputs/out/lib`; with the flag, the RUNPATH listed the GTK
  and WebKit store paths, `ldd` found every library, and the window opened on
  Hyprland. Observed 2026-11-26.

## Reference implementations

| Project | What to learn from it | Licence |
| --- | --- | --- |
| Beat (`lmparppei/Beat`) | Pagination that imitates Final Draft | GPL-3.0 or later |
| afterwriting (`ifrost/afterwriting-labs`) | Fountain to PDF layout | MIT (`package.json`; no licence file) |
| Story Architect (`story-apps/starc`) | FDX, Fountain and PDF import and export | GPL-3.0 |

Reading them for reference is free. Copying code from Beat or Story Architect
would make Tir GPL, which matters only if Tir is ever distributed. Evidence:
GitHub licence metadata and `LICENSE.md`, read 2026-11-26.

## Story Architect

Story Architect, the user's current application, is open source
(`story-apps/starc`, GPL-3.0). Its screenplay exporters write DOCX, FDX,
Fountain and PDF; it imports Celtx, DOCX, FDX, Fountain, KIT Scenarist, PDF
and Trelby. The user's existing scripts can therefore reach Tir as FDX or
Fountain. Evidence: `src/corelib/business_layer/export/screenplay/` and
`.../import/screenplay/` in the repository tree, read 2026-11-26.

## The user's machine

NixOS 26.11, Hyprland on Wayland, Intel integrated graphics (i915 driver),
`nix-ld` enabled. Rust, Node, pnpm, uv, Go and Zig come from mise. The GitHub
CLI is logged in over HTTPS with the system keyring, and an SSH key exists.
No Courier Prime font or Hunspell dictionaries are installed system-wide.
Observed 2026-11-26.

## Rejected designs

- **Fountain as the native format.** Fountain infers element types from
  context and capitalisation, so an all-caps action line followed by text can
  read back as a character cue. Saving and reopening through that inference
  can silently change a script. Fountain stays an import and export format.
- **Electron.** It would run the same editor and has a built-in spell
  checker, but it bundles Chromium (well over 100 MB) where Tauri uses the
  system web engine.
- **A native Rust interface (iced, egui) or Qt.** Each needs a text editor
  written or heavily adapted for typed paragraphs, which means weeks of
  cursor, selection, undo and input-method work before any screenwriting
  feature. A web editor library already provides that.
- **One Tir through GTK's application ID or the single-instance plugin**
  (task 2.7). Tauri's `enableGTKAppId` registers the identifier
  `dev.tir.desktop` on the session bus, so a second launch passes to the
  first and exits; while the installed Tir runs, every development or
  trial run with its own `TIR_CONFIG_DIR` would be refused too.
  `tauri-plugin-single-instance` does the same over D-Bus, keyed on the
  identifier unless its builder is given another bus name, and can bring
  the first window forward, but it is a new dependency (zbus). Tir locks
  its config directory instead. Evidence: tauri-utils 2.10.4
  `enable_gtk_app_id`'s documentation; the plugin's README and
  `platform_impl/linux.rs` (Context7), read 2026-11-27.
