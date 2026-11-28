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

### FDX import structure

Final Draft writes the script in the root `Content`, as `Paragraph`
elements with a `Type` and styled `Text` runs. Both speakers in dual
dialogue are in a `DualDialogue` inside a wrapper `Paragraph`. Scene
numbers are `Number` on the heading. `ScriptNote` elements can sit among
the runs or in `UnanchoredScriptNotes`. `RevisionID="0"` is unrevised text;
used sets refer to `Revisions/Revision`, and deletions can carry the same ID.

`TitlePage/Content` is positioned text, not named fields. The usual title,
byline, authors and source sit in centred paragraphs separated by blank
paragraphs; contact and draft/date can be distinguished by alignment.
Story Architect's exporter also uses this structure but writes title
paragraphs as `Type="General"`. The title page has its own header and
footer, separate from the title fields.

Evidence: `Maginvox.fdx` and `sample-01.fdx`; [ScriptCraft's comparison
of 51 Final Draft files](https://github.com/NoJuanNobody/scriptcraft/blob/fce1d3c57a1964742d989d6488df638fc97f089d/docs/fdx-format.md);
[Story Architect's FDX exporter](https://github.com/story-apps/starc/blob/1caa60f03b2f907ceaf3a9772b9f1596151eae10/src/corelib/business_layer/export/screenplay/screenplay_fdx_exporter.cpp).
No script text was copied into Tir's fixtures.

Saved files carry their own layout, and it often differs from the default
format above: bold scene headings, right-aligned and highlighted shots,
other indents, 90 and 62 pt margins, `(cont'd)`, a header with the title
and the date in the footer. Final Draft writes runs either bare or with all
their attributes; with them, a cue run says `Style="AllCaps"` and an action
run `Style=""`, so a run's `Style` appears to replace its element's
`FontSpec` style rather than add to it (not checked in Final Draft). Both
Final Draft title pages set the title `Underline+AllCaps`. Evidence:
`Maginvox.fdx`, `sample-01.fdx` and `unclebob/ScriptSchedule/script.fdx`,
read 2026-11-28.

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
- Diagnostic result (`mise run parity`, 2026-11-26): 582 of 605
  reseeded pages end where Final Draft's do. That comparison excludes
  99 pages with ambiguous split action and 13 with blank image gaps.
  From page 1 without reseeding, 270 of 722 starts match; an early
  difference can move every subsequent page. The two comparisons do
  not use the same denominator. For separate evidence, see [Tir's
  editor-to-PDF check](history.md#task-3-2) and the [matched-FDX
  Final Draft acceptance task](plan.md#task-7-3a).
- The 23 differing reseeded pages:
  - 14 where Final Draft left three or more lines its rules would fill,
    likely manual page breaks or pages kept from an earlier pagination: A
    Real Pain 16 and 45, After the Hunt 39, Babygirl 5, Heretic 7, 85 and
    105, Queer 22 and 62, Sing Sing 45, Superman 6, 43, 45 and 113.
  - 5 where a line at the top of a page is read wrongly (a shot, or a
    title-like first page): After the Hunt 1, Heretic 47 and 123, Superman
    22 and 95.
  - 4 unexplained: A Real Pain 76, Babygirl 87, After the Hunt 12 and 40.
- Formatting check, run on all seven rebuilds: 42 findings since the
  Stage 5 review (47 before it). Each finding was inspected in the rebuilt
  elements and checked against the PDF extraction:
  - 32 blank General elements inferred solely from gaps (Babygirl 16,
    Heretic 10, Sing Sing 2, Superman 4). The PDFs cannot say whether
    those gaps are empty elements or deliberate spacing.
  - 5 non-speech lines read as cues from their indent: an end card (After
    the Hunt 98), a title and a sound effect (Babygirl 2 and 30), a log
    and quoted thought (Heretic 28 and 83). The single orphan dialogue
    follows a cue at an Action indent (Queer 37). These are effects of
    reconstructing element types from print, not checks on the FDX types.
  - 3 headings outside the brief's prefixes: INT/EXT. without its first
    period (Babygirl 42), and plain INT or EXT without a period (Babygirl
    86 and Superman 124). Five more, EXT./INT. and combined prefixes with
    a space after the slash (After the Hunt 54 and 81; Babygirl 29, 44 and
    69), were flagged until the user chose to accept them (brief,
    "Formatting check", 2026-11-27). Final Draft permits all eight.
  - 1 one-off short spelling of a repeatedly used name (A Real Pain 68).

## Courier Prime

Courier Prime is under the SIL Open Font License 1.1, so Tir can bundle and
embed it. Every glyph has the same advance, 1228 of 2048 units (0.5996 em).
Courier's nominal 0.6 em gives 7.2 pt per character at 12 pt; Courier Prime
gives 7.195 pt, which is 0.3 pt short across a full 60-character line. Layout
can therefore count characters as Courier does. Final Draft's own "Courier
Final Draft" is proprietary and cannot be bundled. Evidence:
`google/fonts` `ofl/courierprime/CourierPrime-Regular.ttf`, measured with
fontTools on 2026-11-26.

- The OFL's requirement to stay under the licence "does not apply to any
  document created using the fonts", and Courier Prime names no Reserved
  Font Name, so a PDF may carry a subset of it. Evidence: the licence text
  bundled as `src/ui/fonts/OFL-courierprime.txt`, read 2026-11-27.
- All four faces have ascent 1600 and descent 700 of 2048 units, with
  USE_TYPO_METRICS set and no line gap. CSS centres that 13.48 pt content
  area in a 12 pt row, putting the baseline 8.64 pt below the row's top;
  WebKitGTK 2.54.2 at 100% puts it at 12 px (9 pt), rounding the metrics to
  whole pixels. The PDF uses 8.64 pt, 0.36 pt from the screen. Evidence:
  fontkit's reading of the four files, and a zero-size inline block in a
  Courier Prime row in the dev app, 2026-11-27.
- Italic and Bold Italic carry a `liga` table that joins "fi" and "fl"
  into one glyph of one character's width; Regular and Bold have none.
  ProseMirror's stylesheet turns ligatures off in the editor
  (`font-variant-ligatures: none`), and the PDF embeds the faces with
  `liga` off, so every character keeps its cell. Without that, italic
  "final" measured four characters wide in WebKitGTK and in the PDF.
  Evidence: fontkit's feature lists for the four files; widths measured
  in the dev app and read back from a PDF, 2026-11-27.

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
  in Tauri's development build, and Vite emits it as a separate file.
  The installed Nix release also saved and exported a PDF in 7.1;
  the smoke check did not instrument whether a fallback ran.
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

## Git

Observed with git 2.56.0 on the desktop, in temporary directories with
`GIT_CONFIG_GLOBAL` naming an empty file, and in `git.rs`'s tests,
2026-11-27, unless an entry says otherwise.

- `git init` run with `GIT_DIR` and `GIT_WORK_TREE` naming `LIB/.git`
  and `LIB` writes no `core.worktree`, so the writer's own git in the
  library works as in any repository. A folder inside another
  repository's work tree is made a repository of its own, which the
  outer one lists as an untracked folder.
- With `GIT_DIR` set, a repository whose `HEAD` is gone reports "not a
  git repository: 'LIB/.git'" and a `.git` file of junk "invalid gitfile
  format", each with exit code 128. `git symbolic-ref -q HEAD` exits 1
  on a detached HEAD, and prints the branch on a repository with no
  commit yet.
- Git refuses to commit with no name and email in its configuration
  ("Author identity unknown"). `-c core.hooksPath=/dev/null` runs no hook,
  whatever folder the configuration names.
- A `.gitignore` can name what git records instead of what it leaves
  out: `/*` leaves out everything, `!/*/` brings back each top folder,
  and so on down to the files wanted. Git cannot bring back a file whose
  folder is left out, so each level's folders come back first. Evidence:
  `gitignore(5)` of git 2.56.0 ("It is not possible to re-include a file
  if a parent directory of that file is excluded"), and `git.rs`'s tests.
- `git push --porcelain` marks a refused ref with `!` and its reason in
  brackets on standard output: "(fetch first)" when the remote has
  commits this repository never fetched, "(non-fast-forward)" once it
  has; git exits 1 and leaves the branch and work tree as they were.
  Fetching a branch a remote with no commits lacks fails with "couldn't
  find remote ref refs/heads/main". `GIT_ALLOW_PROTOCOL=file` refuses
  any other transport ("transport 'https' not allowed").
- In a network namespace with nothing but a loopback that is down
  (`unshare -rn`), git over HTTPS said "unable to access '…': Failed to
  connect to github.com … Could not connect to server". ssh's words for
  the same ("Could not resolve hostname", "Network is unreachable",
  "Connection timed out") were not observed here; `git::unreachable`
  matches them as ssh writes them.
- Git asks a program for a login in this order: `GIT_ASKPASS`, then
  `core.askPass`, then `SSH_ASKPASS`. Set but empty, `GIT_ASKPASS` stops
  the search: with `SSH_ASKPASS` naming a program that writes a file,
  `GIT_ASKPASS=""` and `GIT_TERMINAL_PROMPT=0`, a fetch over HTTPS from a
  server asking for a login said "could not read Username for '…':
  terminal prompts disabled" and the program never ran (2026-11-28).
- `git stash pop` that conflicts exits 1 and leaves the files unmerged
  (`git ls-files --unmerged`) with no `MERGE_HEAD` or other marker in
  `.git` (`git.rs`'s tests). `git merge --squash` leaves `SQUASH_MSG`
  and no `MERGE_HEAD` until the writer commits (2026-11-28).

## GitHub

How Tir tells whether a repository is public with no stored token
(architecture, "Backup"): it asks GitHub's REST API with no login at all,
`GET https://api.github.com/repos/OWNER/NAME`. Not observed against GitHub
itself, since no test or trial reaches it; the user's check (task 6.5)
connects a private repository for real.

- With no login, the API answers a public repository with the repository,
  whose `private` is `false`, and a private one with `404 Not Found`, "to
  avoid confirming the existence of private repositories", as it answers a
  missing one. Rate limits answer `403` or `429`; Tir counts those, and
  any other answer, as not knowing. A request needs a `User-Agent`.
  Evidence: GitHub Docs, "Troubleshooting the REST API", read 2026-11-27.
- A request with no `X-GitHub-Api-Version` header gets the oldest
  supported version (2022-11-28, supported until March 10, 2028), then the
  next oldest once that one closes; a version that has closed answers
  `410 Gone`. Tir sends none, so its requests never name a closed
  version. Evidence: GitHub Docs, "API Versions", read 2026-11-27.
- Git over HTTPS with no login is no test: since September 2026 GitHub may
  answer an unauthenticated clone or fetch of a public repository with
  `401`, asking for a login, during unusual traffic, as it answers one of
  a private repository. Evidence: GitHub Community discussion #206581
  ("Unauthenticated clone of a public repo intermittently returns 401",
  opened 2026-09-02, with GitHub's answer of 2026-09-03), read 2026-11-27.
- The `soup3` crate (0.5.0), WebKitGTK's HTTP library and already in the
  build through it, makes the request; its library is named `soup`. It is
  never called in tests or trials: in a sandbox git reading
  `gitconfig-anonymous` answers instead. Evidence: `Cargo.lock` (`soup3`
  under `webkit2gtk` and `wry`) and the crate's sources, 2026-11-27.

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
  WebKitGTK, so the writer lives in the core (architecture, "PDF"). It
  embeds and subsets Courier Prime and places text at exact coordinates.
  It has no bookmark or page label API, so Tir writes the outline (PDF
  1.7, section 12.3.3) and page labels (12.4.2) as dictionaries itself.
- Rejected: PDFKit 0.21 has bookmarks and a browser build, but its types
  (`@types/pdfkit` 0.17) lag the browser and byte-output APIs, and the
  latter is marked experimental; jsPDF is browser-first and installs
  html2canvas, canvg and DOMPurify as optional dependencies.
- Evidence: npm metadata and Context7 docs read 2026-11-26; a spike wrote a
  page in Courier Prime with the fork and read back every run's text and
  position with unpdf, which also adds a space run between separate runs.
- `drawText` given a `font` adds a font resource to the page at every call,
  so a run per call doubled a 121-page PDF (437 KB against 195 KB); Tir
  sets a page's font only when the face changes. Subsets are named with a
  random number after the PostScript name, not the six capitals and "+"
  that PDF 1.7 (9.6.4) asks of a subset, so Tir names them itself
  (`customName`); poppler's `pdffonts` then lists them as embedded subsets
  with Unicode maps. With a character spacing set, pdf.js reads each word
  as a run of its own and the spaces between as runs, so the text still
  reads whole. Evidence: the PDF library's `PDFPage.setOrEmbedFont` and
  `CustomFontEmbedder.embedIntoContext`; exports of the 121-page `feature`
  fixture; `pdffonts` 2026-11-27.
- Writing a 121-page script takes 340–450 ms in Node and 560–600 ms in a
  WebKitGTK worker (310–560 ms on the interface thread), most of it
  fontkit shaping each string into glyphs, so the export runs in a worker:
  the interface thread's longest pause while it ran was 8 ms. Evidence: a
  CPU profile in Node and timings in the dev app, 2026-11-27.

## Spell check

- **Dictionary:** SCOWL's US English Hunspell dictionary, release
  2026.02.25 (`hunspell-en_US-2026.02.25.zip` from `en-wl/wordlist` on
  GitHub, the official Hunspell en_US; SCOWL size 60, one spelling of
  each word, accents stripped, so "cafe", not "café"). Its words are
  under SCOWL's notice (copyright Kevin Atkinson: use, copy, modify,
  distribute and sell with the notice kept), its affix file under Geoff
  Kuenning's BSD licence from Ispell; both are in
  `src/ui/dictionary/README_en_US.txt`, which must ship with the files.
  It flags British spellings ("harbour", "grey") and lacks screenplay
  terms such as POV, CONT'D and SFX, which Tir adds (`SCREENPLAY_WORDS`);
  Tir takes an accented word for the dictionary's word without accents.
  Evidence: the release's README and files, read 2026-11-27.
- **The checker is Tir's own** (`src/core/spelling.ts`), as the brief's
  "Stack" asks: it reads the directives that dictionary uses (`SET UTF-8`,
  `TRY`, `ICONV`, `NOSUGGEST`, `ONLYINCOMPOUND`, `REP`, one-character
  flags, and `PFX` and `SFX` rules without affixes of their own), leaves
  aside `WORDCHARS`, `COMPOUNDMIN` and `COMPOUNDRULE` (its compounds only
  build ordinals, and Tir leaves words with digits unchecked), and refuses
  any other. Listing every word its rules make gives 109,922 words.
  Rejected: nspell 2.1.5 (MIT, last published 2022), typo-js 2.0.0
  (BSD-3-Clause; expands words as Tir does, with slow suggestions), and
  Hunspell compiled to WebAssembly (`hunspell-asm` 4.0.2, last published
  2022, 4.9 MB; `hunspell-wasm` 0.3.0, LGPL, GPL or MPL): each is a
  dependency for less than the few hundred lines the one dictionary
  needs. Evidence: npm metadata, 2026-11-27.
- **It agrees with Hunspell** 1.7.5 (libhunspell from nixpkgs, on the same
  files): Hunspell accepts all 109,922 words Tir lists, and of 4.42
  million candidate words the two disagree on 54: 21 mixed-capital words
  Hunspell accepts and Tir refuses ("D'Arezzo", "IPhone", "KHz"), and 33
  all-capital forms Tir accepts and Hunspell refuses ("CD'S", "PMED").
  Hunspell ranks "don't" sixth for "dont"; Tir ranks it first, as it
  scores likeness without apostrophes. Evidence: the Stage 5 review,
  2026-11-27.
- **Cost**, in WebKitGTK 2.54.2's worker: reading the dictionary
  136–162 ms; checking the 120-page spike's 2,280 elements 29–33 ms; a
  suggestion under 1 ms for a short word and up to 80 ms for a ten-letter
  one that needs words two edits away (Node: 95 ms to read it, 9.5 ms to
  check the 122-page `feature` fixture). So the dictionary lives in a
  worker, and the page sends it only the elements an edit changed, after
  a pause (architecture, "The editor"). Words two edits away are tried
  only when one edit finds fewer than three, for words of up to ten
  letters: a 14-letter word took 340 ms in Node.
- **Typing does not wait for it.** Two `mise run editor-timing` runs on
  the desktop, 2026-11-27, with spell check on (median layout, p95 in
  brackets): ordinary typing 10–11 ms (17–25), as in the
  [typing baseline](#typing-baseline); typing as each check's answer and
  squiggles land 10–12 ms (15–20); on the spike with every "the"
  misspelled, 5,280 squiggles, 14 ms (16–31), and 10–13 ms (13–16) as
  checks land. Drawing 5,280 new squiggles at once held the interface for
  150–160 ms, as many find highlights do (see [Editor](#editor)); a
  script's usual handful costs little.
- `vite build` made the `.aff` file, under Vite's 4 KB inlining limit, a
  `data:` URL in the worker, which the release content security policy's
  `connect-src` ('self' and Tauri's IPC) does not list, so Tir imports
  both files with `?url&no-inline`, and the build then emits both as
  files. The installed Nix release showed squiggles and suggestions
  from this dictionary (7.1).

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
- Evidence: the documented corpus used 120 Tir PDFs from 40 original
  scripts with dual dialogue and an empty line, at 48, 54 and 56 lines a
  page (2026-11-26). It rebuilt 65 exactly and matched 1,142 of 1,317
  page starts. Every first difference followed a reconstruction note
  (split action, a shot or an empty line at a page top). [Task
  0.7](history.md#task-0-7) records another count without enough
  provenance to identify it as this run; do not combine the results.

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
- **Many highlights cost their drawing, not typing.** On the 120-page
  spike (2,280 elements, task 5.1), find's query "e" matched 17,040 times
  and took 561 ms to show: 138 ms to build its decoration set, 151 ms for
  ProseMirror to redraw the paragraphs and 272 ms of layout. "ma" (1,080
  matches, replacing "e"'s) took 257 ms, "mara" (600) 75 ms, and removing
  them 58 ms. Typing's median stayed at 10–11 ms with all 17,040 shown,
  since edits map the set and patch the elements they change. A spell
  checker's squiggles meet the same costs.
- **Mapping a decoration set costs every step of the transaction.**
  ProseMirror maps each decoration through each step map, so Replace all,
  one step per match, grew with matches times steps: on the spike, ". "
  (2,040 matches) took 977 ms in the app and "the" (6,720) 3.6 s, undo
  alike; in Node, find's highlights took 1,759 ms and the projection's line
  breaks 694 ms of "the"'s, where making either set afresh took 20–120 ms.
  Since the Stage 5 review both make their sets afresh past 100 steps
  (`MANY_STEPS`): 268 ms and 465 ms in the app, undo alike (2026-11-27).
- **Test input in WebKitGTK as well as editor state.** ProseMirror
  intercepts Esc before a bubbling window listener can use it. Keep
  composition native and check dead and Compose keys at the window.
  ProseMirror's default copy loses element types; WebKitGTK round-trips
  Tir's custom clipboard type within the app while giving other apps
  plain text. A middle click delivered the clipboard, not primary
  selection; see [Known gaps](plan.md#known-gaps) for the open question.

### Typing baseline

[Stage 2.3's three runs](history.md#stage-2-3-timing), including the
review fixes (2026-11-27, WebKitGTK 2.54.2, Hyprland at 60 Hz, 100%
zoom). Layout includes forced layout before paint. Frame also includes
the wait for the rendering update, not compositing or display. Busy is
main-thread blocked time in the 70 ms after the key.

| Edit | Median layout | Median frame | Median busy |
| --- | --- | --- | --- |
| Ordinary typing | 10–12 ms | 17–19 ms | 18–22 ms |
| Add or remove a line | 11–12 ms | 17–20 ms | 17–24 ms |
| Add a page | 15–17 ms | 22–24 ms | 31–32 ms |
| Backspace that removes it | 56–59 ms | 62–64 ms | 63–69 ms |
| Change a line, `feature` fixture | 15–16 ms | 23–25 ms | 27–29 ms |
| Type as a save starts or runs | 10–11 ms | 18–21 ms | 12–14 ms |

Ordinary typing does not reliably fit a 60 Hz frame. Use paired runs
on the same machine before attributing a small difference to a change.
Serializing the 120-page draft and its Fountain copy together took
190–243 ms on the interface thread in task 2.2; the worker kept the
interface busy for only short periods while saving. Full-script copy
still pays the Fountain serialization cost on the interface thread.

Abrupt exit (task 7.3b, 2026-11-28, isolated development WebKitGTK, the
120-page `featureScript(150)` draft): real keys through Hyprland about
every 140 ms without a pause, then `kill -9` about 0.1 s after the last
key. Saves landed every 3.0–3.2 s while typing went on. Each recovered
draft was whole and held exactly the keys typed up to some moment; two
runs lost the last 1.6 s and 3.2 s, the second killed just before a
save landed.

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
- Tauri's npm CLI binding for Linux also needs `liblzma.so.5`. Nix Node
  does not use `nix-ld`'s library path when loading the binding, so the dev
  shell puts nixpkgs' xz library on `LD_LIBRARY_PATH`. Evidence: 7.1's
  missing-library error with Nix Node 24.22.2 and the native development
  launch after adding the library path.

## NixOS release

The package is a Nix flake output, not an AppImage or a copy of a
development binary: nixpkgs supplies and wraps the GTK and WebKitGTK
runtime, pins the build tools, and installs the executable and notices
into a profile. Cargo vendors from `Cargo.lock`, and the fixed-output
pnpm fetch uses `pnpm-lock.yaml` and the repository's supply-chain policy;
the release build itself runs offline. [The flake](../flake.nix) pins
release tools independently of mise. `tauri/custom-protocol` embeds
Vite's production output; without it, Tauri expects the dev server
(`tauri-build` 2.7.6, `is_dev`). The release launched outside the shell
in the [installation trial](history.md#task-7-1).

WebKitGTK 2.54.2's HTTP inspector can advertise a Tauri release page when
`WEBKIT_INSPECTOR_HTTP_SERVER` is inherited, even without Tauri's
devtools feature. The installed wrapper unsets that variable and
`WEBKIT_INSPECTOR_SERVER`; neither endpoint listened in the final Wofi
launch (7.2). This does not disable the inspector in development.

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

Its FDX exporter writes no `ElementSettings` and gives every paragraph an
`Alignment`. It writes `PageLayout` margins as the template's margins in
inches times 76, then two-thirds of that for the top and bottom and a third
for the header and footer, not in points: a one-inch top margin arrives as
about 51 pt, so Tir's import report lists page margins for its files.
General paragraphs, the title page's included, also get indents measured
from Story Architect's text area and a space before in inches. Evidence:
[the exporter](https://github.com/story-apps/starc/blob/1caa60f03b2f907ceaf3a9772b9f1596151eae10/src/corelib/business_layer/export/screenplay/screenplay_fdx_exporter.cpp)
(`writeLine`, `writeSettings`), read 2026-11-28.

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
- **Telling a public repository by git with no login, or by `gh`**
  (task 6.3). Git reading a repository over HTTPS with no login fails for
  a private repository, but since September 2026 can fail for a public one
  too (above, "GitHub"), which would let a public repository pass as
  private. `gh repo view` would use the token `gh` keeps, and Tir stores
  and uses no token. GitHub's REST API asked with no login tells the two
  apart.
- **Pulling the other machine's work with Tir open** (task 6.2): Tir
  would have to read again the draft on screen once a pull changed it,
  with a question when the writer had typed in the second before. The
  user chose to bring work in with Tir closed, with saves refusing to
  write over a changed draft (brief, "Saving and backup").
