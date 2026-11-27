# Tir: product brief

What the product should do, as the user has decided it. Points marked
*(agent-selected)* were delegated to the agent and can be reopened; all other
decisions are the user's and change only when the user changes them.
[Findings](findings.md) holds the outside-world facts these rest on. "Tir" is
a working name taken from the project directory.

## Purpose

A personal desktop screenwriting application for one writer, the user, so
they do not have to pay for one. It must be production-ready for real
writing: simple, clean, elegant, pleasant and not distracting. It runs on the
user's own machine first, which runs NixOS; portability to other systems is a
later bonus, not a V1 requirement.

The user writes in Story Architect today and has used Arc Studio and Celtx.
The user does not have Final Draft, so no Final Draft output can come from
them.

## Scope

Only feature-film screenplays. No TV, stage plays, comics, novels, or other
document types.

V1 must have:

- **Real script rendering.** The editor shows the script as it will print,
  not Fountain or markdown source.
- **Final Draft page parity**, as [Page parity](#page-parity) defines it.
- **Multiple projects**, each a screenplay, as [Projects](#projects)
  describes.
- **Drafts**, as [Drafts](#drafts) describes.
- **Scene sidebar** listing every scene for navigation, as
  [Scene sidebar](#scene-sidebar) describes.
- **Element switching** (scene heading, action, character, and so on) from a
  top bar and from keybindings, covering every element a professional
  screenwriting application provides for film, as
  [Elements and keys](#elements-and-keys) describes.
- **Find and replace**, as [Find and replace](#find-and-replace) describes.
- **Formatting check**, as [Formatting check](#formatting-check) describes.
- **Spell check** with a US English dictionary.
- **Title page**, as [Title page](#title-page) describes.
- **Autocomplete** for character names, cue extensions such as (V.O.) and
  (O.S.), scene heading prefixes (INT., EXT.), locations already used, times
  of day, and common transitions.
- **Copy and paste**, as [Copy and paste](#copy-and-paste) describes, and
  undo and redo.
- **Page position**: "Page 14 of 108" in the top bar, and Go to page, as
  [Page position](#page-position) describes.
- **Focus mode**: one key hides the sidebar and top bar.
- **Zoom** for the page.
- **Dark and light themes**, dark by default. Both keep the same dark
  frame; the theme changes only the page: dark paper in the dark theme,
  white paper in the light theme. See [Look](#look).
- **Import report**: when an imported file holds something Tir does not
  keep, such as Fountain notes, Tir lists what it left out.
- **Fountain import and export.**
- **Final Draft (`.fdx`) import and export.** Submissions go out as PDF;
  `.fdx` is for people who need to edit or produce the script, and it is
  the cleanest route for bringing scripts over from Story Architect.
- **PDF export**, as [PDF export](#pdf-export) describes.
- **GitHub backup**, as [Saving and backup](#saving-and-backup) describes.

## Not in V1

No features beyond a good screenwriting application. Extras wait until after
V1.

- Merging or comparing drafts.
- Forking a draft from an earlier point in its history.
- Browsing or restoring backup history inside the app; GitHub holds it.
- Reordering scenes by dragging them in the sidebar.
- Scene numbers and other production features: revision colours, locked
  pages.
- Notes and comments.
- Index cards and outlines.
- Reports and statistics.
- Automatic fixes for formatting-check findings.

The user has said the V1 list above is everything they need.

## Elements and keys

- **Elements**, Final Draft's film set: Scene Heading, Action, Character,
  Parenthetical, Dialogue, Transition, Shot, General. General is rarely
  written but keeps `.fdx` files exact.
- **Formats**: dual dialogue, centred text, forced page break, and bold,
  italic and underline.
- **Shortcuts**, as in Final Draft: Ctrl+1 to Ctrl+7 for Scene Heading,
  Action, Character, Parenthetical, Dialogue, Transition, Shot; Ctrl+0 for
  General. Like the top bar, they change the element holding the caret, or
  every element a selection touches *(agent-selected: Final Draft's keys add
  a new paragraph unless the current one is blank; the brief asks for
  switching)*.
- **Enter** ends the element and starts the next one by Final Draft's
  Return column in [findings](findings.md#final-drafts-default-screenplay-format):
  Scene Heading → Action, Character → Dialogue, Dialogue → Action,
  Transition → Scene Heading. Inside the text it splits the element into two
  of its type, and at its start it opens an empty one of its type above
  *(agent-selected)*.
- **Tab** on an empty element changes its type by Final Draft's Tab column:
  Action → Character → Transition → Scene Heading, and Dialogue ↔
  Parenthetical. At the end of an element's text, Tab starts a new element by
  the same column, except that a cue with a name gives a Parenthetical, as
  Final Draft does ([findings](findings.md#final-drafts-keys)); elsewhere it
  does nothing. Neither Tab nor Shift+Tab moves focus out of the script
  *(agent-selected)*.
- **Top bar** shows all eight elements, highlights the current element's
  type, and changes it on click; the caret stays where it was.
- **Format keys**: Ctrl+B, Ctrl+I and Ctrl+U for bold, italic and
  underline, and Ctrl+Alt+D for dual dialogue, as in Final Draft for
  Windows. Final Draft has no key for centring or a page break: Ctrl+E
  centres and Ctrl+Enter forces a page break *(agent-selected, as word
  processors do)*. Dual dialogue, as Final Draft's, puts the speech holding
  the caret beside the speech after it, or, when none follows, beside the one
  before *(that fallback agent-selected)*; on a speech already beside
  another it puts both back in one column. Centring applies to every element
  a selection touches.
  A forced page break starts the element holding the caret on a new page,
  and the key again removes it, as Final Draft's Page Break does.
- **Automatic**: capitals in scene headings, character cues, transitions
  and shots; parentheses around parentheticals; (MORE) and (CONT'D) where
  dialogue crosses a page break; (CONT'D) on a cue when the same character
  speaks again after action, as Final Draft does by default. The script
  keeps the text as typed; capitals are only how it shows and prints. A
  parenthetical gains its parentheses when it becomes one and loses them
  when it stops being one; typing ")" before the closing one steps over it,
  and Backspace in an empty one removes it *(agent-selected)*.
- **Autocomplete**: while the writer types at the end of a character cue,
  scene heading or transition, a popup below the line lists what continues
  the part being typed, ignoring case, most used in the script first, and
  grey ghost text after the caret shows the rest of the highlighted one
  (prototype piece 5). A cue offers character names, and after a "(" cue
  extensions; a scene heading offers its prefix (INT., EXT., INT./EXT.,
  I/E., EST.), after the prefix and a space the locations already used, and
  after " - " the times of day; a transition offers transitions. Extensions,
  times and transitions start from Final Draft's lists
  ([findings](findings.md#final-drafts-smarttype)). Enter or Tab accepts the
  highlighted suggestion *(Tab: the user's choice, 2026-11-26)*, the arrows
  choose and Esc closes; with the popup closed these keys do what this
  section says above. Accepting a prefix adds the space after it and
  accepting a location adds " - ", so the popup goes on to the next part, as
  Final Draft's Tab does. Only typing or deleting opens the popup; moving
  the caret closes it. *(agent-selected: an accepted suggestion is written
  as the script writes it most often, or as Final Draft's list does; a part
  that already matches a suggestion in full opens nothing, so Enter after a
  whole name starts the dialogue; the arrows wrap round; at most ten
  suggestions show; a click on one accepts it.)*
- **Undo and redo**: Ctrl+Z undoes, Ctrl+Shift+Z and Ctrl+Y redo, and each
  puts the caret back at the change. A burst of typing is one step, and an
  element change is one step. *(agent-selected: a burst ends at a pause of
  more than half a second or when the typing moves elsewhere. Enter, and Tab
  that starts an element, begin a step that the typing straight after joins.
  Every other change is a step of its own, apart from the typing before and
  after it: an element change by key, Tab or the top bar, a format key, an
  accepted autocomplete suggestion, a paste and a cut. So Ctrl+Z after
  accepting a suggestion gives back what was typed, and Enter, Tab and a
  name take three presses to undo. Undo and redo open no autocomplete
  popup.)*

## Formatting check

Flags:

- a character cue with no dialogue under it;
- dialogue or a parenthetical with no character cue above it;
- a scene heading that does not start with INT., EXT., INT./EXT., I/E. or
  EST.;
- an empty element, which adds stray blank lines;
- a scene heading with nothing under it before the next scene heading;
- near-duplicate character names, such as JHON beside JOHN.

Each finding shows as a small mark in the margin beside its element, never
printed or exported, with an explanation on hover or when the cursor is in
the element. The top bar shows the number of findings, and a key jumps to
the next one. What the editor already enforces, such as capitals, is never
flagged.

## Title page

A form with a live preview of the printed page, not free text, so the layout
stays correct and the fields map directly onto Fountain and FDX title pages.

| Field | Position | Default |
| --- | --- | --- |
| Title | centred, a third of the way down, in capitals | |
| Credit | centred below the title | "Written by" |
| Author(s) | centred below the credit | |
| Source | centred below the authors | empty, optional |
| Contact | bottom left | |
| Draft and date | bottom right | off |

The draft date is off by default because spec scripts omit it. The title page
is outside the page numbering. The script starts at page 1, which, by
screenplay convention, shows no number.

## Projects

- On launch Tir opens the last project on its active draft.
- A **Projects** screen (Ctrl+O) lists every project with its title, page
  count and last edit. From it the user creates, opens, renames and deletes
  projects. Deleting asks for confirmation; GitHub's history still holds a
  deleted project.
- **Import** reads a Fountain or FDX file into either a new project (the
  default) or a new draft of the current project, for example when a
  co-writer sends back an edited `.fdx`.
- **Tir edits only files it owns.** An import makes Tir's own copy in the
  library; the original file is never modified, moved or deleted. Exports
  likewise write new files and never overwrite an import's source.
- Scripts come over from Story Architect by exporting each one as FDX there
  and importing it into Tir as a new project.

## Scene sidebar

Each scene shows its number in order (on screen only, never printed), its
heading and the page it starts on. The scene containing the cursor is
highlighted, and clicking a scene jumps to it. The sidebar collapses, and
focus mode hides it.

*(agent-selected)* Every Scene Heading element is a scene, an empty one
included, which shows only its number and page; elements before the first
heading belong to no scene. Headings show in capitals, as they print. A
click puts the caret at the start of the heading, keeps focus in the
script, and scrolls the heading to where page 1's first line sits when the
script opens. A long list scrolls on its own and keeps the current scene in
view.

## Page position

"Page N of M" sits at the right of the top bar: N is the page the caret is
on, M the script's page count *(the user's choice, 2026-11-26: like the
element buttons and the sidebar highlight, it follows the caret; scrolling
leaves it until the caret moves)*.

**Go to page**: Ctrl+G *(agent-selected: Final Draft's key,
[findings](findings.md#final-drafts-keys))*, or a click on "Page N of M",
turns N into a field in place holding the current page
([piece 7](prototype/07-go-to-page.html), A; the user's choice,
2026-11-26). Enter puts the caret at the start of that page's first line
and scrolls the page's top to where page 1's sits when the script opens;
Esc goes back to the script with the caret where it was. *(agent-selected:
a number past the last page goes to the last page; anything but a number
leaves the field open; clicking elsewhere closes it without moving;
switching to another window leaves it open for the return.)*

## Find and replace

Works within the active draft, with match case and whole word options,
Replace and Replace all. Matches are highlighted on the page, and Replace all
undoes as one step. Renaming a character with whole word and match case
changes cues and mentions in action alike, leaving extensions such as (V.O.)
intact.

## Copy and paste

- Within Tir, pasted text keeps its element types exactly.
- Copying to another application gives plain text laid out as Fountain, so a
  scene still reads as a script.
- Text pasted from elsewhere is read as Fountain, so a scene from a Fountain
  file or a plain-text script arrives as elements; anything ambiguous becomes
  Action.
- *(agent-selected)* A selection within one element copies text. One across
  elements copies the elements it covers whole and the part it covers of an
  element at either end, each with its type and formats; a part from an
  element's middle leaves its forced page break and dual with the element's
  start. A parenthetical's parentheses go with it.
- *(agent-selected)* Text, copied from within an element or a single
  paragraph of action from elsewhere such as a line of prose, goes in at the
  caret as typing does, and the element there keeps its type. Elements go
  in whole: in place of an empty element at the caret, before an element
  from its start, after it from its end, and inside its text splitting it as
  Enter does. A copied part of an element joins the text it is pasted
  beside, so cutting and then pasting in the same place restores the
  script. Pasting over a selection puts what is pasted where it was.
- *(agent-selected)* Cutting removes what copying takes: elements the
  selection covers whole go entirely, an element it covers in part keeps the
  rest and its type, and when both ends are covered in part, what is left of
  them joins, as Backspace joins it.
- *(agent-selected)* A paste is part of a script, so it reads no title page
  and never changes the title page: a block of `Key: value` lines arrives as
  script. What an import would leave out (notes, boneyard, sections,
  synopses, scene numbers) is left out, without a report. A paste closes the
  autocomplete popup.

## PDF export

- The title page, included by default, then the script pages exactly as the
  editor shows them.
- Page numbers at the top right from page 2.
- Courier Prime embedded.
- One PDF bookmark per scene, for the viewer's sidebar; invisible on paper.
- File name "Title - Draft.pdf".

## Look

- The editor shows **separate paper sheets**, exactly as they will print,
  with page numbers and (MORE) and (CONT'D) where they fall, rather than a
  continuous scroll with break lines.
- **Courier Prime** for the script, on screen and in the PDF: free, made for
  screenplays, and Courier's width, so pages match. Final Draft's own font
  cannot be bundled.
- **Paper follows the theme.** In the dark theme the page is dark with
  light text; in the light theme it is white with black text. PDFs and
  printing are always black on white. The user first accepted white paper
  in both themes, then reversed it on seeing the prototype: white paper was
  blinding in dark mode.
- The scene sidebar is on the left. The top bar holds the project and draft name at the left, the
  element buttons in the centre, and the page position, finding count and
  saved/backed-up indicator at the right.
- Aesthetic references the user likes: iA Writer, Highland and Arc Studio.
- The look is settled through prototypes before the interface is built.
  [The prototype index](prototype/index.html) lists the pieces.
- **Direction: A, "Desk"** ([piece 1](prototype/01-writing-window.html)).
  The user chose it over B "Ink" and C "Studio" as clearly the best:
  attached scene sidebar and top bar, a full element toolbar, a serif
  project title. The user found its first colour scheme unpolished.
- **Colours: "Ink & Brass"** ([piece 2](prototype/02-desk-colours.html)),
  chosen over Graphite, Slate & Sage and Charcoal & Ember: deep blue-black
  surfaces with a muted brass accent; warnings in coral so they never look
  like the accent. Every text colour meets 4.5:1 contrast.
- **Dark paper: "Night"** ([piece 3](prototype/03-dark-paper.html)),
  chosen over Dusk and Lamplight: page #141920 with ivory text #d6d0c2 on a
  #0a0d11 desk, so the page barely lifts from the background. Find
  highlights, the spelling squiggle, the caret and ghost text are
  recoloured for it.
- **Light theme: the dark frame with white paper**
  ([piece 4](prototype/04-light-theme.html)). The user found Ink & Brass's
  all-light theme too white and chose this over Linen, Sand and Mist. Both
  themes therefore share the Ink & Brass dark chrome, and switching theme
  switches only the paper: Night in the dark theme, white (#fdfcf8) with
  black text in the light theme. The page's on-screen marks (find
  highlights, squiggles, caret) follow the paper.
- **The look is settled** for the writing window:
  [look.css](prototype/look.css) holds the final colours and chrome for the
  remaining pieces and, later, the app.
- **The finished writing window** ([piece 5](prototype/05-writing-window.html)),
  approved by the user: the paper switch in the sidebar footer; a "Title
  page" row at the top of the sidebar opening the title page form beside a
  live preview; the saved/backed-up indicator opening a backup panel for
  each state (backed up, saving, offline, paused, not connected) and the
  one-time GitHub connection, which warns about a public or unreachable
  repository.
- **Projects screen: the list** ([piece 6](prototype/06-projects.html)),
  chosen over a shelf of title-page thumbnails: one row per project with
  its title, active draft, pages, number of drafts and last edit, most
  recent first; New project and Import at the top; Rename and Delete from
  each row's menu; the import dialog, its report and the empty library as
  that piece shows them.
- **Go to page** ([piece 7](prototype/07-go-to-page.html)): "Page N of M"
  turns into a field in place, chosen over a popover under it
  (2026-11-26).
- **The design is complete.** The prototype pieces are the reference for
  every screen; [the plan](plan.md) builds them.

## Page parity

One page in Tir is one page in Final Draft: **every page starts on the same
line** that it would in Final Draft. Matching only the total page count does
not meet this.

Since the user has no Final Draft, a check tool verifies parity against
public screenplay PDFs that Final Draft produced, as their PDF metadata
shows. It reads each PDF's text and positions, infers each element's type
from its indent, rebuilds the script in Tir, paginates it, and compares where
every page starts. These PDFs are other people's copyrighted scripts: they
stay on the user's machine as test data and never enter version control.

Reference implementations to study: Beat (its pagination imitates Final
Draft), afterwriting and Story Architect. The user has already looked at all
three.

## Drafts

- **Fork** creates a new draft from the active draft as it stands now. The
  user names it, for example "Rewrite, Dec 2026", and it becomes active. The
  original draft is left unchanged.
- Drafts are independent after a fork. Nothing links them back together.
- Each draft has its own title page, copied at the fork, so a new draft can
  show a new draft label and date.
- The top bar shows the active draft's name. From it the user switches,
  renames or deletes drafts; deleting asks for confirmation.
- Each project reopens on its last active draft.

## Saving and backup

- **Saving is automatic**, a moment after the user pauses typing. There is
  never unsaved work; Ctrl+S is harmless.
- **One private GitHub repository** holds the whole library. Tir runs the
  system `git` with the user's existing GitHub login and stores no tokens.
  The user gives Tir the repository URL once.
- After a few minutes without changes, and when the app closes, Tir commits
  the changes and pushes them. A **Back up now** command does the same on
  demand.
- **Offline is normal**, not an error: the user is often offline. Commits
  accumulate locally and push when GitHub is reachable again, with automatic
  retry and no nagging.
- **A small top-bar indicator** shows both states at a glance: whether the
  work is saved, and whether it is backed up to GitHub or waiting to be.
- If GitHub has changes this machine lacks, for example from a second
  computer, Tir does not merge. It pauses backup and tells the user.

## Stack

- **Tauri 2** desktop app: a web interface in the system's web engine, with
  a small Rust side for files and the operating system.
- **TypeScript** for the interface and all script logic.
- **ProseMirror** as the editor: a script is a sequence of typed paragraphs,
  which is what ProseMirror models.
- **Our own layout engine**, in plain TypeScript with no interface code. It
  computes line wrapping and page breaks for the on-screen pages, the PDF and
  page counts alike, so all three always agree. Screenplay text is fixed-pitch
  Courier, so layout is exact character and line arithmetic.
- **Our own spell checker** on a standard Hunspell dictionary, so it behaves
  the same everywhere and can learn the script's character names and
  locations.
- Tooling as in the user's other projects: pnpm, Vitest, Biome, mise.
- **NixOS:** the development setup must work on NixOS. Tauri needs system
  libraries (WebKitGTK and others) that mise cannot supply, so the project
  needs a Nix development shell for them.

The user accepted this as the agent's recommendation. Rejected alternatives
are in [findings](findings.md#rejected-designs).

## Storage

- A **library** folder holds every project, for example `~/Screenplays/`.
- Each **project** is a folder in the library, with one file per **draft**.
- Draft files use Tir's own format, which records every element's type
  explicitly, so a script reopens exactly as it was saved.
- Every save also writes a `.fountain` copy of each draft beside it. Tir
  never reads these copies; they keep the scripts readable on GitHub and
  usable without Tir.
- Fountain is otherwise an import and export format only.

The user accepted this as the agent's recommendation.

## Terms

- **Library**: the folder holding all of the user's projects. It is also the
  backed-up git repository.
- **Project**: one feature screenplay, stored as a folder in the library.
- **Draft**: one version of a project's screenplay, stored as one file, with
  its own title page.
- **Active draft**: the draft currently open for editing in a project.
- **Fork**: create a new draft as a copy of the active draft's current state.
- **Element**: one paragraph of the script with a type, such as Scene
  Heading, Action, Character or Dialogue.
- **Saved** means written to the draft file on this machine. **Backed up**
  means pushed to GitHub. The indicator shows them separately.

## Still to settle

No product decision is open. The facts still to establish are tasks in
[the plan](plan.md): Final Draft's remaining pagination details and the
page-number style (0.8), the calibration set (0.8), the draft file's
structure (0.2), the Nix development shell (0.1), and the keys for zoom,
focus mode and the next finding (1.8). None needs the user unless it turns
out to change behaviour described above.
