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
  capability stays `core:default`. It injects a script that replaces
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

All observations on the desktop's Tauri window (WebKitGTK 2.54.2,
Hyprland, 60 Hz, window 931×1010), 2026-11-26, on the 120-page fixture
(`?fixture=spike` in `src/ui/dev-fixtures.ts`: 2,280 elements, a forced
break before each scene) unless a line says otherwise. How to repeat them:
architecture, "Measuring the editor".

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

**A new editor state makes ProseMirror make every plugin's view again**
(prosemirror-view 1.44, `updatePluginViews`): it compares the old and new
states' plugin arrays, and `EditorState.create` always makes a new one, so
`updateState` with a new state destroys each plugin's view and calls its
`view` again; a view that added DOM listeners would add them twice. It
also resets the editable element's own scroll, not the document's. Seen
in the source and in task 1.9's opens, where the scene list and the page
position each followed the new script.

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
