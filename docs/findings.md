# Tir: findings

Facts about the outside world that the design depends on but the code cannot
show. Each entry is the finding, what follows from it, and its evidence.
Rewrite an entry when newer evidence contradicts it.

## Final Draft's default screenplay format

Final Draft stores its element formatting inside every `.fdx` file. Three
scripts saved by Final Draft (file versions 1, 5 and 6) carry identical
defaults:

| Element | Left (in) | Right (in) | Width | Space before | Align | Return gives | Tab gives |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Scene Heading | 1.50 | 7.50 | 60 chars | 24 pt (2 lines) | left | Action | Action |
| Action | 1.50 | 7.50 | 60 chars | 12 pt (1 line) | left | Action | Character |
| Character | 3.50 | 7.25 | 37 chars | 12 pt | left | Dialogue | Transition |
| Parenthetical | 3.00, first line 2.90 | 5.50 | 25 chars | 0 | left | Dialogue | Dialogue |
| Dialogue | 2.50 | 6.00 | 35 chars | 0 | left | Action | Parenthetical |
| Transition | 5.50 | 7.10 | 16 chars | 12 pt | right | Scene Heading | Scene Heading |
| Shot | 1.50 | 7.50 | 60 chars | 24 pt | left | Action | |
| General | 1.50 | 7.50 | 60 chars | 0 | left | General | |

- Font: Courier Final Draft 12 pt, a fixed-pitch Courier: 10 characters per
  inch, 6 lines per inch. Widths above follow from that.
- Parenthetical has a first-line indent of -0.10 in, so the opening "(" hangs
  one character left of the wrapped lines.
- Page: US Letter, top and bottom margins 72 pt (1 in), header and footer
  36 pt (0.5 in). The header holds the page number.
- `BreakDialogueAndActionAtSentences="Yes"`: action and dialogue split
  across pages only at sentence ends.
- Mores and continueds: a dialogue split across pages ends with `(MORE)` and
  resumes under the repeated cue with `(CONT'D)`. Automatic character
  continueds are on: a cue gets `(CONT'D)` when the same character speaks
  again after interruption. Scene `CONTINUED` markers are off by default.
- Smart quotes are on.
- Page numbers sit in the header at the top right. The first script page
  shows no number, so the first number a reader sees is 2. The title page
  is outside the sequence. Final Draft's knowledge base calls this the
  normal screenplay convention and makes showing the first number an option.
  The number is commonly printed with a trailing period ("2."); confirm that
  against Final Draft PDFs.
- Default shortcuts are Ctrl+0 to Ctrl+8: General, Scene Heading, Action,
  Character, Parenthetical, Dialogue, Transition, Shot, Cast List.
- Lines per page: the margins give 9 in of body, which is 54 lines at 12 pt.
  The afterwriting Fountain-to-PDF tool uses 55 for US Letter. Not yet
  settled: needs checking against PDFs Final Draft produced.
- Not yet known: how Final Draft keeps scene headings, character cues and
  parentheticals off the bottom of a page, beyond the settings above.

Evidence: `ElementSettings`, `PageLayout` and `MoresAndContinueds` in
`unclebob/ScriptSchedule/script.fdx`, `cullvox/bluemetal/Docs/Maginvox.fdx` and
`darrenprx/azkript/examples/sample.fdx` on GitHub, read 2026-11-26. One
file's Shot was right-aligned with 12 pt before, which looks like a user
edit. `LaPingvino/lexington/fdx/example.fdx` differs (Courier, Character
3.38 in) because a non-Final Draft tool wrote it, so it is excluded. The
afterwriting values come from `ifrost/afterwriting-labs`
`js/utils/print-profiles.js`.

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
