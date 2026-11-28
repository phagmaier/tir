/**
 * Copy, cut and paste in the model (brief, "Copy and paste"), with expected
 * results worked from the brief's rules by hand. In element text, "|" is
 * the caret, and "{" and "}" the ends of a selection.
 */
import { AllSelection, type EditorState } from "prosemirror-state";
import { describe, expect, test } from "vitest";
import {
  type Clipping,
  clippingFromFountain,
  clippingToFountain,
  readClipping,
  writeClipping,
} from "../core/clipping.ts";
import type { Element } from "../core/model.ts";
import { popupOf } from "./autocomplete.ts";
import { clippingOf, cut, paste } from "./clipboard.ts";
import {
  action,
  apply,
  cue,
  dialogue,
  heading,
  paren,
  press,
  run,
  shot,
  show,
  stateOf,
  type,
  typeEach,
} from "./editor-harness.ts";

const elements = (...list: Element[]): Clipping => ({
  elements: list,
  openStart: false,
  openEnd: false,
});
const text = (piece: Element): Clipping => ({ elements: [piece], openStart: true, openEnd: true });

const selectAll = (state: EditorState) =>
  apply(state, state.tr.setSelection(new AllSelection(state.doc)));

describe("copying takes", () => {
  test.each<[string, EditorState, Clipping | null]>([
    ["text, from within an element", stateOf([action("The {old} door.")]), text(action("old"))],
    [
      "text, from all of an element's text, without its formats",
      stateOf([cue("{MARA}", { dual: true })]),
      text(cue("MARA")),
    ],
    [
      "whole elements, with their formats",
      stateOf([
        heading("{INT. HOUSE - DAY", { pageBreakBefore: true }),
        action("Dark.}", { centred: true }),
      ]),
      elements(
        heading("INT. HOUSE - DAY", { pageBreakBefore: true }),
        action("Dark.", { centred: true }),
      ),
    ],
    [
      "parts of elements, the end part without its start's break",
      stateOf([
        action("Rain f{alls.", { centred: true, pageBreakBefore: true }),
        cue("MA}RA", { dual: true }),
      ]),
      {
        elements: [action("alls.", { centred: true }), cue("MA", { dual: true })],
        openStart: true,
        openEnd: true,
      },
    ],
    [
      "nothing of an element the selection only leaves from its end",
      stateOf([action("Rain.{"), cue("MA}RA")]),
      { elements: [cue("MA")], openStart: false, openEnd: true },
    ],
    [
      "nothing of an element the selection only reaches the start of",
      stateOf([cue("{MARA"), dialogue("Hi."), action("}Rain.")]),
      elements(cue("MARA"), dialogue("Hi.")),
    ],
    [
      "a parenthetical whole from just after its (",
      stateOf([paren("({quietly)"), dialogue("Hi.}")]),
      elements(paren("(quietly)"), dialogue("Hi.")),
    ],
    [
      "every element, with select all",
      selectAll(stateOf([heading("INT. HOUSE - DAY|"), action("Dark.")])),
      elements(heading("INT. HOUSE - DAY"), action("Dark.")),
    ],
    [
      "nothing, from only the break between two elements",
      stateOf([action("Rain.{"), action("}Wind.")]),
      null,
    ],
  ])("%s", (_name, state, expected) => {
    expect(clippingOf(state)).toEqual(expected);
  });
});

/** Pastes `clipping` into `before` and shows the result. */
const pasted = (before: readonly Element[], clipping: Clipping) =>
  show(run(stateOf(before), paste(clipping)));

describe("pasting text puts it in at the caret, as typing does", () => {
  test.each<[string, Element[], Clipping, Element[]]>([
    [
      "in the element there, which keeps its type",
      [cue("MA|")],
      text(action("RA")),
      [cue("MARA|")],
    ],
    [
      "with its own styles",
      [action("The | door.")],
      text(action("old", { italic: [[0, 3]] })),
      [action("The old| door.", { italic: [[4, 7]] })],
    ],
    [
      "in place of a selection",
      [action("The {red} door.")],
      text(action("old")),
      [action("The old| door.")],
    ],
    [
      "in place of a selection across elements, joining them as typing does",
      [action("Ra{in."), cue("MA}RA")],
      text(action("x")),
      [action("Rax|RA")],
    ],
  ])("%s", (_name, before, clipping, after) => {
    expect(pasted(before, clipping)).toEqual(after);
  });
});

describe("pasting elements puts them in whole, with their types", () => {
  const speech = elements(cue("MARA"), dialogue("Hi."));
  test.each<[string, Element[], Clipping, Element[]]>([
    [
      "in place of an empty element",
      [action("Rain."), action("|")],
      speech,
      [action("Rain."), cue("MARA"), dialogue("Hi.|")],
    ],
    [
      "in place of an empty parenthetical",
      [cue("TEO"), paren("(|)")],
      speech,
      [cue("TEO"), cue("MARA"), dialogue("Hi.|")],
    ],
    [
      "before an element, from its start",
      [action("|Rain.")],
      elements(heading("INT. HOUSE - DAY")),
      [heading("INT. HOUSE - DAY|"), action("Rain.")],
    ],
    [
      "after an element, from its end",
      [action("Rain.|")],
      speech,
      [action("Rain."), cue("MARA"), dialogue("Hi.|")],
    ],
    [
      "after a parenthetical, from before its )",
      [paren("(quietly|)")],
      elements(dialogue("Hi.")),
      [paren("(quietly)"), dialogue("Hi.|")],
    ],
    [
      "inside an element's text, splitting it as Enter does",
      [action("Rain| falls.", { centred: true, pageBreakBefore: true })],
      elements(shot("CLOSE ON MARA")),
      [
        action("Rain", { centred: true, pageBreakBefore: true }),
        shot("CLOSE ON MARA|"),
        action(" falls.", { centred: true }),
      ],
    ],
    [
      "in place of a selection within an element",
      [action("Rain {and wind} falls.")],
      elements(shot("CLOSE ON MARA")),
      [action("Rain "), shot("CLOSE ON MARA|"), action(" falls.")],
    ],
    [
      "in place of whole elements",
      [action("Rain."), cue("{MARA"), dialogue("Hi.}"), action("Wind.")],
      elements(cue("TEO"), dialogue("No.")),
      [action("Rain."), cue("TEO"), dialogue("No.|"), action("Wind.")],
    ],
    [
      "between what a selection leaves of two elements, each keeping its type",
      [action("Rain {falls."), cue("MA}RA")],
      elements(shot("CLOSE ON MARA")),
      [action("Rain "), shot("CLOSE ON MARA|"), cue("RA")],
    ],
  ])("%s", (_name, before, clipping, after) => {
    expect(pasted(before, clipping)).toEqual(after);
  });

  test("in place of everything, with select all", () => {
    const all = selectAll(stateOf([heading("INT.|"), action("Dark.")]));
    expect(show(run(all, paste(speech)))).toEqual([cue("MARA"), dialogue("Hi.|")]);
  });

  test.each<[string, Element[], Clipping, Element[]]>([
    [
      "a part element's text joins the text before the caret, in the element there",
      [cue("TEO|")],
      { elements: [action("alls."), cue("MARA")], openStart: true, openEnd: false },
      [cue("TEOalls."), cue("MARA|")],
    ],
    [
      "a start part takes in the text after the caret, keeping its own type",
      [action("Rain| falls.")],
      { elements: [cue("MARA"), dialogue("Hi")], openStart: false, openEnd: true },
      [action("Rain"), cue("MARA"), dialogue("Hi| falls.")],
    ],
  ])("%s", (_name, before, clipping, after) => {
    expect(pasted(before, clipping)).toEqual(after);
  });
});

describe("cutting removes what copying takes", () => {
  test.each<[string, EditorState, Element[]]>([
    [
      "text within an element",
      stateOf([action("Rain {and wind} falls.")]),
      [action("Rain | falls.")],
    ],
    [
      "whole elements entirely, leaving the next one its type",
      stateOf([cue("{MARA"), dialogue("Hi."), action("}Rain.")]),
      [action("|Rain.")],
    ],
    [
      "an element covered from its start, the rest of the last keeping its type but not dual",
      stateOf([action("{Rain."), cue("MA}RA", { dual: true })]),
      [cue("|RA")],
    ],
    [
      "parts of two elements, joining what is left as Backspace does",
      stateOf([action("Rain f{alls."), cue("MA}RA")]),
      [action("Rain f|RA")],
    ],
    [
      "everything, leaving one empty element of the first's type",
      selectAll(stateOf([heading("INT. HOUSE - DAY|"), action("Dark.")])),
      [heading("|")],
    ],
  ])("%s", (_name, state, after) => {
    expect(show(run(state, cut))).toEqual(after);
  });

  test("nothing from only the break between two elements", () => {
    const state = stateOf([action("Rain.{"), action("}Wind.")]);
    expect(cut(state)).toBe(false);
  });

  test("and pasting it back where it was restores the script", () => {
    const script = [action("Rain f{alls."), cue("MARA"), dialogue("Hi} there.")];
    const state = stateOf(script);
    const clipping = clippingOf(state) as Clipping;
    const removed = run(state, cut);
    expect(show(removed)).toEqual([action("Rain f| there.")]);
    expect(show(run(removed, paste(clipping)))).toEqual([
      action("Rain falls."),
      cue("MARA"),
      dialogue("Hi| there."),
    ]);
  });

  test("and pasting it back restores the script when the cut starts at an element's end", () => {
    const script = [action("Rain.{"), cue("MA}RA", { centred: true, pageBreakBefore: true })];
    const state = stateOf(script);
    const clipping = clippingOf(state) as Clipping;
    const removed = run(state, cut);
    expect(show(removed)).toEqual([action("Rain."), cue("|RA", { centred: true })]);
    expect(show(run(removed, paste(clipping)))).toEqual([
      action("Rain."),
      cue("MA|RA", { centred: true, pageBreakBefore: true }),
    ]);
  });
});

describe("Backspace, Delete and typing over a selection across elements remove what cutting does", () => {
  // Each script, what Backspace and Delete leave (as cutting leaves it), and what typing "x" leaves.
  test.each<[string, Element[], Element[], Element[]]>([
    [
      "from an element's start, the rest of the last keeping its type but not dual",
      [action("{Rain."), cue("MA}RA", { dual: true })],
      [cue("|RA")],
      [cue("x|RA")],
    ],
    [
      "parts of two elements, joining what is left as Backspace does",
      [action("Rain f{alls."), cue("MA}RA")],
      [action("Rain f|RA")],
      [action("Rain fx|RA")],
    ],
    [
      "from an element's end, the first untouched and the last keeping its type",
      [action("Rain.{"), cue("MA}RA", { centred: true, pageBreakBefore: true })],
      [action("Rain."), cue("|RA", { centred: true })],
      [action("Rain."), cue("x|RA", { centred: true })],
    ],
    [
      "part of one element and the whole of those after it",
      [action("Rain f{alls."), cue("MARA"), dialogue("Hi.}"), action("After.")],
      [action("Rain f|"), action("After.")],
      [action("Rain fx|"), action("After.")],
    ],
    [
      "whole elements, typing taking the first one's place and type",
      [action("Before."), cue("{MARA", { dual: true }), dialogue("Hi.}"), action("Rain.")],
      [action("Before."), action("|Rain.")],
      [action("Before."), cue("x|"), action("Rain.")],
    ],
    [
      "a whole parenthetical from just after its (, typing between new parentheses",
      [paren("({quietly)"), dialogue("Hi.}"), action("Go.")],
      [action("|Go.")],
      [paren("(x|)"), action("Go.")],
    ],
  ])("%s", (_name, script, removed, typed) => {
    const state = stateOf(script);
    // Cutting leaves what these say, as its own tests above work out.
    expect(show(run(state, cut))).toEqual(removed);
    for (const key of ["Backspace", "Delete", "Ctrl-Backspace", "Ctrl-Delete"]) {
      expect(show(press(state, key).state), key).toEqual(removed);
    }
    expect(show(type(state, "x"))).toEqual(typed);
  });

  test("everything, with select all, leaving the first element's type", () => {
    const state = selectAll(stateOf([heading("INT. HOUSE - DAY|"), action("Dark.")]));
    expect(show(press(state, "Backspace").state)).toEqual([heading("|")]);
    expect(show(type(state, "x"))).toEqual([heading("x|")]);
  });

  test("but within an element, over only the break between two, or at a caret, as ever", () => {
    // The editor's usual deletion takes these keys then.
    for (const script of [[cue("MA{RA}")], [action("Rain.{"), cue("}MARA")], [action("Ra|in.")]]) {
      expect(press(stateOf(script), "Backspace").handled).toBe(false);
      expect(press(stateOf(script), "Delete").handled).toBe(false);
    }
    expect(show(type(stateOf([cue("MA{RA}")]), "Y"))).toEqual([cue("MAY|")]);
    // Over the break alone, typing joins the two as Backspace does.
    expect(show(type(stateOf([action("Rain.{"), cue("}MARA")]), "x"))).toEqual([
      action("Rain.x|MARA"),
    ]);
  });

  test("and Ctrl+Z takes either back in one step, with the selection", () => {
    const undo = (state: EditorState) => press(state, "Ctrl-z").state;
    const script = [action("{Rain."), cue("MA}RA", { dual: true }), dialogue("Hi.")];
    const deleted = press(stateOf(script), "Backspace").state;
    expect(show(deleted)).toEqual([cue("|RA"), dialogue("Hi.")]);
    expect(show(undo(deleted))).toEqual(script);
    const typed = typeEach(stateOf(script), "JO");
    expect(show(typed)).toEqual([cue("JO|RA"), dialogue("Hi.")]);
    expect(show(undo(typed))).toEqual(script);
  });
});

describe("the three paths", () => {
  test("within Tir, pasted elements keep types, dual dialogue, centring, forced breaks and styles", () => {
    const source = stateOf([
      cue("{MAYA"),
      dialogue("Six.", { centred: true }),
      cue("TOMÁS", { dual: true }),
      dialogue("Seven.", { bold: [[0, 5]] }),
      action("THE END}", { centred: true, pageBreakBefore: true }),
    ]);
    const carried = readClipping(writeClipping(clippingOf(source) as Clipping)) as Clipping;
    expect(show(run(stateOf([action("Rain.|")]), paste(carried)))).toEqual([
      action("Rain."),
      cue("MAYA"),
      dialogue("Six.", { centred: true }),
      cue("TOMÁS", { dual: true }),
      dialogue("Seven.", { bold: [[0, 5]] }),
      action("THE END|", { centred: true, pageBreakBefore: true }),
    ]);
  });

  test("copying to another application gives Fountain", () => {
    const source = stateOf([
      cue("{MAYA"),
      dialogue("Six."),
      cue("TOMÁS", { dual: true }),
      dialogue("Seven.", { bold: [[0, 6]] }),
      action("THE END}", { centred: true, pageBreakBefore: true }),
    ]);
    expect(clippingToFountain(clippingOf(source) as Clipping)).toBe(
      "MAYA\nSix.\n\nTOMÁS ^\n**Seven.**\n\n===\n\n>THE END<",
    );
  });

  test.each<[string, Element[], string, Element[]]>([
    [
      "a Fountain scene from elsewhere arrives as elements",
      [action("Rain."), action("|")],
      "INT. HARBOUR OFFICE - NIGHT\n\nMARA\n(quietly)\nWe sail at dawn.\n",
      [
        action("Rain."),
        heading("INT. HARBOUR OFFICE - NIGHT"),
        cue("MARA"),
        paren("(quietly)"),
        dialogue("We sail at dawn.|"),
      ],
    ],
    [
      "paragraphs of prose from elsewhere arrive as action",
      [cue("MARA"), dialogue("Hi.|")],
      "It was late. The tide was turning.\n\nNobody came.",
      [
        cue("MARA"),
        dialogue("Hi."),
        action("It was late. The tide was turning."),
        action("Nobody came.|"),
      ],
    ],
    [
      "a line of prose from elsewhere goes in as text, in the element at the caret",
      [cue("MARA"), dialogue("|")],
      "We sail at dawn.",
      [cue("MARA"), dialogue("We sail at dawn.|")],
    ],
  ])("%s", (_name, before, fountain, after) => {
    expect(pasted(before, clippingFromFountain(fountain))).toEqual(after);
  });
});

describe("with the autocomplete popup open", () => {
  const speeches = [cue("MARA"), dialogue("Go."), cue("MAYA"), dialogue("No.")];

  test("a paste closes it, so Enter then starts the dialogue", () => {
    const open = type(stateOf([...speeches, cue("|")]), "ma");
    expect(popupOf(open)).not.toBeNull();
    const after = run(open, paste(text(cue("RA"))));
    expect(popupOf(after)).toBeNull();
    expect(show(press(after, "Enter").state).slice(-2)).toEqual([cue("maRA"), dialogue("|")]);
  });
});

describe("undo", () => {
  const undo = (state: EditorState) => press(state, "Ctrl-z").state;

  test("a paste is one step of its own, which Ctrl+Z takes back with the caret", () => {
    let state = typeEach(stateOf([action("Rain|")]), ".");
    state = run(state, paste(elements(cue("MARA"), dialogue("Hi."))));
    state = typeEach(state, "!");
    expect(show(state)).toEqual([action("Rain."), cue("MARA"), dialogue("Hi.!|")]);
    state = undo(state);
    expect(show(state)).toEqual([action("Rain."), cue("MARA"), dialogue("Hi.|")]);
    state = undo(state);
    expect(show(state)).toEqual([action("Rain.|")]);
    state = undo(state);
    expect(show(state)).toEqual([action("Rain|")]);
    // Redo puts the paste back, the caret after it.
    state = press(press(state, "Ctrl-y").state, "Ctrl-y").state;
    expect(show(state)).toEqual([action("Rain."), cue("MARA"), dialogue("Hi.|")]);
  });

  test("a cut is one step of its own, which Ctrl+Z takes back with the selection", () => {
    const script = [action("{Rain."), cue("MARA"), dialogue("Hi.}")];
    let state = typeEach(run(stateOf(script), cut), "x");
    expect(show(state)).toEqual([action("x|")]);
    state = undo(state);
    expect(show(state)).toEqual([action("|")]);
    expect(show(undo(state))).toEqual(script);
  });
});
