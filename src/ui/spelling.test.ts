import { readFileSync } from "node:fs";
import type { Node } from "prosemirror-model";
import { type EditorState, TextSelection } from "prosemirror-state";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ElementType } from "../core/model.ts";
import { Dictionary, misspelled, SCREENPLAY_WORDS } from "../core/spelling.ts";
import {
  action,
  apply,
  cue,
  dialogue,
  heading,
  press,
  run,
  show,
  stateOf,
} from "./editor-harness.ts";
import {
  applySpelling,
  drawSquiggles,
  learnedWords,
  nextMisspelling,
  openSpellingMenu,
  spellingMenu,
  squigglesOf,
} from "./spelling.ts";

let dictionary: Dictionary;
beforeAll(() => {
  const read = (name: string) =>
    readFileSync(new URL(`./dictionary/${name}`, import.meta.url), "utf8");
  dictionary = Dictionary.parse(read("en_US.aff"), read("en_US.dic"));
  for (const word of SCREENPLAY_WORDS) dictionary.add(word);
});

/** `state` with its squiggles drawn as spell check draws them once every element is checked. */
function checked(state: EditorState, writers: readonly string[] = []) {
  const flagged = (node: Node) =>
    misspelled(dictionary, node.attrs.type as ElementType, node.textContent);
  const known = new Set([...learnedWords(state), ...writers]);
  const { tr, held } = drawSquiggles(state, flagged, known);
  return { state: tr ? apply(state, tr) : state, held };
}

/** The words under the squiggles, in order. */
const squiggled = (state: EditorState) =>
  [...squigglesOf(state)]
    .sort((a, b) => a.from - b.from)
    .map(({ from, to }) => state.doc.textBetween(from, to));

describe("spell check's squiggles", () => {
  const script = [
    heading("EXT./ INT. HARBOUR OFFICE - NIGHT"),
    action("Okafor recieves the Halcyon’s log at the harbour.|"),
    cue("OKAFOR"),
    dialogue("Teh tide is wrong."),
  ];

  it("learns the script's character names and locations, and marks the rest", () => {
    // HARBOUR is a location and OKAFOR a character, so neither is marked anywhere.
    expect(squiggled(checked(stateOf(script)).state)).toEqual(["recieves", "Halcyon’s", "Teh"]);
    // The writer's dictionary holds "halcyon", in any capitals, and so its possessive.
    expect(squiggled(checked(stateOf(script), ["halcyon"]).state)).toEqual(["recieves", "Teh"]);
  });

  it("holds the word the caret ends until the caret leaves it", () => {
    const typing = checked(stateOf([action("The tide is wrnog|")]));
    expect(squiggled(typing.state)).toEqual([]);
    // F7 still goes to it.
    const held = nextMisspelling(typing.state, typing.held);
    expect(held && typing.state.doc.textBetween(held.from, held.to)).toBe("wrnog");
    const { state } = typing;
    const moved = apply(state, state.tr.setSelection(TextSelection.create(state.doc, 1)));
    const left = checked(moved);
    expect(left.held).toBeNull();
    expect(squiggled(left.state)).toEqual(["wrnog"]);
    // Typing before or just after a squiggle moves or keeps it with its word
    // until the next check; typing inside the word removes it.
    const before = apply(left.state, left.state.tr.insertText("Now ", 1));
    expect(squiggled(before)).toEqual(["wrnog"]);
    const end = before.doc.content.size - 1;
    expect(squiggled(apply(before, before.tr.insertText("s", end)))).toEqual(["wrnog"]);
    expect(squiggled(apply(before, before.tr.insertText("o", end - 3)))).toEqual([]);
  });

  it("drops a squiggle when Enter splits its word", () => {
    const { state } = checked(stateOf([action("Mara rec|ieves it.")]));
    expect(squiggled(state)).toEqual(["recieves"]);
    const split = press(state, "Enter").state;
    expect(split.doc.childCount).toBe(2);
    expect(squiggled(split)).toEqual([]);
  });

  it("goes with F7 to the misspelling the caret is in, else the next, round the script", () => {
    const { state } = checked(stateOf([action("|Teh tide is wrnog."), dialogue("Halcyn waits.")]));
    const visit = (from: number, to = from) => {
      const at = apply(state, state.tr.setSelection(TextSelection.create(state.doc, from, to)));
      const next = nextMisspelling(at, null);
      return next && at.doc.textBetween(next.from, next.to);
    };
    const [teh, wrnog, halcyn] = [...squigglesOf(state)].sort((a, b) => a.from - b.from);
    if (!teh || !wrnog || !halcyn) throw new Error("Three squiggles expected");
    expect(visit(1)).toBe("Teh");
    expect(visit(teh.from, teh.to)).toBe("wrnog");
    expect(visit(wrnog.to + 1)).toBe("Halcyn");
    expect(visit(halcyn.from, halcyn.to)).toBe("Teh");
  });

  it("draws nothing again when nothing changed", () => {
    const { state } = checked(stateOf(script));
    const flagged = (node: Node) =>
      misspelled(dictionary, node.attrs.type as ElementType, node.textContent);
    expect(drawSquiggles(state, flagged, learnedWords(state)).tr).toBeNull();
  });

  it("drops the squiggles of a word just added, even in an element no check has answered for", () => {
    const { state } = checked(stateOf([action("Halcyn waits.|"), dialogue("Teh Halcyn.")]));
    expect(squiggled(state)).toEqual(["Halcyn", "Teh", "Halcyn"]);
    // Typing at the first element's end leaves it unchecked until the next pause.
    const edited = apply(state, state.tr.insertText("!", state.doc.child(0).nodeSize - 1));
    const first = edited.doc.child(0);
    const flagged = (node: Node) =>
      node === first
        ? undefined
        : misspelled(dictionary, node.attrs.type as ElementType, node.textContent);
    const { tr } = drawSquiggles(edited, flagged, new Set(["halcyn"]));
    expect(squiggled(tr ? apply(edited, tr) : edited)).toEqual(["Teh"]);
  });
});

describe("the spelling menu", () => {
  /** "Mara recieves it.", its misspelling in bold, with the menu open on it. */
  function opened(): EditorState {
    const { state } = checked(stateOf([action("|Mara recieves it.", { bold: [[5, 13]] })]));
    const [squiggle] = squigglesOf(state);
    if (!squiggle) throw new Error("No squiggle");
    const word = state.doc.textBetween(squiggle.from, squiggle.to);
    return run(state, openSpellingMenu(squiggle.from, squiggle.to, dictionary.suggest(word)));
  }

  it("replaces the word with the chosen spelling, keeping its formats, as one undo step", () => {
    const state = opened();
    expect(spellingMenu(state)?.options[0]).toBe("receives");
    expect(show(state)).toEqual([action("Mara {recieves} it.", { bold: [[5, 13]] })]);
    const replaced = press(state, "Enter");
    expect(replaced.handled).toBe(true);
    expect(show(replaced.state)).toEqual([action("Mara receives| it.", { bold: [[5, 13]] })]);
    expect(spellingMenu(replaced.state)).toBeNull();
    // Its squiggle went with the word it was under.
    expect(squiggled(replaced.state)).toEqual([]);
    const undone = press(replaced.state, "Ctrl-z").state;
    expect(fromText(undone)).toBe("Mara recieves it.");
  });

  it("chooses with the arrows, round the list, and closes on Esc", () => {
    const state = opened();
    const options = spellingMenu(state)?.options ?? [];
    const second = press(press(state, "ArrowDown").state, "Enter").state;
    expect(fromText(second)).toBe(`Mara ${options[1]} it.`);
    // Up from the first row is "Add to dictionary", the last.
    expect(spellingMenu(press(state, "ArrowUp").state)?.chosen).toBe(options.length);
    const closed = press(state, "Escape");
    expect(closed.handled).toBe(true);
    expect(spellingMenu(closed.state)).toBeNull();
    expect(fromText(closed.state)).toBe("Mara recieves it.");
    // With the menu closed, the keys are the screenplay's again.
    expect(press(closed.state, "ArrowDown").handled).toBe(false);
  });

  it("hands the word to the writer's dictionary from its last row", () => {
    const state = opened();
    const add = vi.fn();
    const added = run(state, applySpelling(spellingMenu(state)?.options.length ?? -1, add));
    expect(add).toHaveBeenCalledWith("recieves");
    expect(spellingMenu(added)).toBeNull();
    expect(fromText(added)).toBe("Mara recieves it.");
  });

  it("closes when the selection leaves the word or the script changes", () => {
    const state = opened();
    const moved = apply(state, state.tr.setSelection(TextSelection.create(state.doc, 1)));
    expect(spellingMenu(moved)).toBeNull();
    expect(spellingMenu(apply(state, state.tr.insertText("Now ", 1)))).toBeNull();
  });
});

const fromText = (state: EditorState) => state.doc.textContent;
