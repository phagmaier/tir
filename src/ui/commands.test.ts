/**
 * Each key and command's result in the model. Expected results come from
 * the brief ("Elements and keys") and Final Draft's table and keys
 * (findings, "Final Draft's default screenplay format"), spelled out here.
 * In element text, "|" is the caret, and "{" and "}" the ends of a selection.
 * Keys go through the editor's key plugins in its order (`editor-harness.ts`),
 * autocomplete's first, so every row before "autocomplete" checks a key with
 * no popup open.
 */
import { type EditorState, TextSelection } from "prosemirror-state";
import { describe, expect, it, test } from "vitest";
import { layoutElement } from "../core/layout.ts";
import type { Element } from "../core/model.ts";
import { popupOf } from "./autocomplete.ts";
import { setElementType } from "./commands.ts";
import { devScript } from "./dev-fixtures.ts";
import {
  action,
  apply,
  cue,
  dialogue,
  element,
  general,
  heading,
  paren,
  pause,
  press,
  run,
  shot,
  show,
  stateOf,
  transition,
  type,
  typeEach,
} from "./editor-harness.ts";
import { fromDocument } from "./editor-model.ts";

/** Presses each key in turn. */
function pressAll(elements: readonly Element[], keys: readonly string[]) {
  let state = stateOf(elements);
  let handled = true;
  for (const key of keys) {
    const result = press(state, key);
    state = result.state;
    handled &&= result.handled;
  }
  return { elements: show(state), handled };
}

type Row = readonly [name: string, before: Element[], key: string, after: Element[]];

const checkRows = (rows: readonly Row[]) =>
  test.each(rows)("%s", (_name, before, key, after) => {
    expect(pressAll(before, [key])).toEqual({ elements: after, handled: true });
  });

describe("Enter at the end of an element starts the next by Final Draft's Return column", () => {
  checkRows([
    [
      "Scene Heading → Action",
      [heading("INT. HOUSE - DAY|")],
      "Enter",
      [heading("INT. HOUSE - DAY"), action("|")],
    ],
    ["Action → Action", [action("She waits.|")], "Enter", [action("She waits."), action("|")]],
    ["Character → Dialogue", [cue("MARA|")], "Enter", [cue("MARA"), dialogue("|")]],
    [
      "Parenthetical → Dialogue, from before the closing parenthesis",
      [paren("(quietly|)")],
      "Enter",
      [paren("(quietly)"), dialogue("|")],
    ],
    [
      "Parenthetical → Dialogue, from after it",
      [paren("(quietly)|")],
      "Enter",
      [paren("(quietly)"), dialogue("|")],
    ],
    [
      "Dialogue → Action",
      [dialogue("Still here.|")],
      "Enter",
      [dialogue("Still here."), action("|")],
    ],
    [
      "Transition → Scene Heading",
      [transition("CUT TO:|")],
      "Enter",
      [transition("CUT TO:"), heading("|")],
    ],
    [
      "Shot → Action",
      [shot("CLOSE ON THE LAMP|")],
      "Enter",
      [shot("CLOSE ON THE LAMP"), action("|")],
    ],
    ["General → General", [general("A sign.|")], "Enter", [general("A sign."), general("|")]],
    ["an empty element too", [cue("|")], "Enter", [cue(""), dialogue("|")]],
  ]);
});

describe("Enter elsewhere", () => {
  checkRows([
    [
      "splits an element inside its text into two of its type",
      [dialogue("Wait.| Listen.")],
      "Enter",
      [dialogue("Wait."), dialogue("| Listen.")],
    ],
    [
      "opens an empty element of its type above, at its start",
      [cue("|MARA")],
      "Enter",
      [cue(""), cue("|MARA")],
    ],
    [
      "replaces a selection first",
      [action("The {old} door")],
      "Enter",
      [action("The "), action("| door")],
    ],
    [
      "at the start, leaves a forced break, dual and centring on the text",
      [cue("|MARA", { centred: true, dual: true, pageBreakBefore: true })],
      "Enter",
      [cue(""), cue("|MARA", { centred: true, dual: true, pageBreakBefore: true })],
    ],
    [
      "at a parenthetical's start, opens one with its parentheses",
      [paren("|(quietly)")],
      "Enter",
      [paren("()"), paren("|(quietly)")],
    ],
    [
      "leaves a forced break and dual on the first part, centring on both",
      [cue("TO|MÁS", { centred: true, dual: true, pageBreakBefore: true })],
      "Enter",
      [
        cue("TO", { centred: true, dual: true, pageBreakBefore: true }),
        cue("|MÁS", { centred: true }),
      ],
    ],
  ]);
});

describe("Tab on an empty element changes it by Final Draft's Tab column", () => {
  checkRows([
    ["Scene Heading → Action", [heading("|")], "Tab", [action("|")]],
    ["Action → Character", [action("|")], "Tab", [cue("|")]],
    ["Character → Transition", [cue("|")], "Tab", [transition("|")]],
    ["Parenthetical → Dialogue, losing its parentheses", [paren("(|)")], "Tab", [dialogue("|")]],
    ["Dialogue → Parenthetical, gaining them", [dialogue("|")], "Tab", [paren("(|)")]],
    ["Transition → Scene Heading", [transition("|")], "Tab", [heading("|")]],
    ["Shot: none", [shot("|")], "Tab", [shot("|")]],
    ["General: none", [general("|")], "Tab", [general("|")]],
  ]);
});

describe("Tab at the end of an element's text starts the next, as Final Draft's does", () => {
  checkRows([
    [
      "Scene Heading → Action",
      [heading("INT. HOUSE - DAY|")],
      "Tab",
      [heading("INT. HOUSE - DAY"), action("|")],
    ],
    ["Action → Character", [action("She waits.|")], "Tab", [action("She waits."), cue("|")]],
    ["Character with a name → Parenthetical", [cue("MARA|")], "Tab", [cue("MARA"), paren("(|)")]],
    ["Parenthetical → Dialogue", [paren("(quietly|)")], "Tab", [paren("(quietly)"), dialogue("|")]],
    [
      "Dialogue → Parenthetical",
      [dialogue("Still here.|")],
      "Tab",
      [dialogue("Still here."), paren("(|)")],
    ],
    [
      "Transition → Scene Heading",
      [transition("CUT TO:|")],
      "Tab",
      [transition("CUT TO:"), heading("|")],
    ],
    ["Shot: none", [shot("CLOSE ON THE LAMP|")], "Tab", [shot("CLOSE ON THE LAMP|")]],
    ["General: none", [general("A sign.|")], "Tab", [general("A sign.|")]],
  ]);
});

describe("Tab and Shift+Tab never leave the editor", () => {
  checkRows([
    ["Tab inside the text does nothing", [action("She| waits.")], "Tab", [action("She| waits.")]],
    [
      "Tab over a selection does nothing",
      [action("She {waits}.")],
      "Tab",
      [action("She {waits}.")],
    ],
    ["Shift+Tab does nothing", [action("|")], "Shift-Tab", [action("|")]],
  ]);
});

test("Enter after dialogue, then Tab, gives a new cue", () => {
  expect(pressAll([cue("MARA"), dialogue("Still here.|")], ["Enter", "Tab"])).toEqual({
    elements: [cue("MARA"), dialogue("Still here."), cue("|")],
    handled: true,
  });
});

describe("Ctrl+1 to Ctrl+7 and Ctrl+0 change the element, as Final Draft's shortcuts", () => {
  checkRows([
    ["Ctrl+1: Scene Heading", [dialogue("it's late|")], "Ctrl-1", [heading("it's late|")]],
    ["Ctrl+2: Action", [dialogue("it's late|")], "Ctrl-2", [action("it's late|")]],
    ["Ctrl+3: Character", [dialogue("it's late|")], "Ctrl-3", [cue("it's late|")]],
    ["Ctrl+4: Parenthetical", [dialogue("it's late|")], "Ctrl-4", [paren("(it's late|)")]],
    ["Ctrl+5: Dialogue", [action("it's late|")], "Ctrl-5", [dialogue("it's late|")]],
    ["Ctrl+6: Transition", [dialogue("it's late|")], "Ctrl-6", [transition("it's late|")]],
    ["Ctrl+7: Shot", [dialogue("it's late|")], "Ctrl-7", [shot("it's late|")]],
    ["Ctrl+0: General", [dialogue("it's late|")], "Ctrl-0", [general("it's late|")]],
    [
      "every element a selection touches",
      [action("Mara{"), action("Teo}"), action("Rain.")],
      "Ctrl-3",
      [cue("Mara{"), cue("Teo}"), action("Rain.")],
    ],
    [
      "a cue that stops being one stops being dual",
      [cue("TOMÁS|", { dual: true })],
      "Ctrl-5",
      [dialogue("TOMÁS|")],
    ],
  ]);
});

test.each([
  ["Scene Heading", "sceneHeading", [action("it's late|")], [heading("it's late|")]],
  ["Action", "action", [dialogue("it's late|")], [action("it's late|")]],
  ["Character", "character", [action("it's late|")], [cue("it's late|")]],
  ["Parenthetical", "parenthetical", [action("it's late|")], [paren("(it's late|)")]],
  ["Dialogue", "dialogue", [action("it's late|")], [dialogue("it's late|")]],
  ["Transition", "transition", [action("it's late|")], [transition("it's late|")]],
  ["Shot", "shot", [action("it's late|")], [shot("it's late|")]],
  ["General", "general", [action("it's late|")], [general("it's late|")]],
] as const)("the top bar's %s button changes the element", (_name, to, before, after) => {
  let state = stateOf(before);
  setElementType(to)(state, (tr) => {
    state = state.apply(tr);
  });
  expect(show(state)).toEqual(after);
});

describe("automatic parentheses around a parenthetical", () => {
  checkRows([
    [
      "an empty element becoming one gets both, the caret between",
      [action("|")],
      "Ctrl-4",
      [paren("(|)")],
    ],
    [
      "a caret at the text's start moves past the added (",
      [action("|quietly")],
      "Ctrl-4",
      [paren("(|quietly)")],
    ],
    ["only the missing one is added", [action("(quietly|")], "Ctrl-4", [paren("(quietly|)")]],
    [
      "one that stops being a parenthetical loses them",
      [paren("(quietly)|")],
      "Ctrl-5",
      [dialogue("quietly|")],
    ],
    ["an empty one loses both", [paren("(|)")], "Ctrl-2", [action("|")]],
    [
      "typing ) before the closing one steps over it",
      [paren("(quietly|)")],
      ")",
      [paren("(quietly)|")],
    ],
    ["typing ( just after the opening one adds nothing", [paren("(|)")], "(", [paren("(|)")]],
    [
      "Backspace in an empty one removes it",
      [dialogue("Hi."), paren("(|)")],
      "Backspace",
      [dialogue("Hi.|")],
    ],
    [
      "Backspace in the first element removes it too",
      [paren("(|)"), dialogue("Hi.")],
      "Backspace",
      [dialogue("|Hi.")],
    ],
    [
      "Backspace in the script's only element leaves an empty Action",
      [paren("(|)")],
      "Backspace",
      [action("|")],
    ],
  ]);

  test("typing inside an empty one goes between the two", () => {
    expect(show(type(stateOf([paren("(|)")]), "beat"))).toEqual([paren("(beat|)")]);
  });

  test.each([
    ["typing ) inside the text", [paren("(qui|etly)")], ")"],
    ["Backspace in one with text", [paren("(qui|etly)")], "Backspace"],
    ["typing ( elsewhere", [paren("(quietly|)")], "("],
  ])("leaves %s to ordinary typing", (_name, before, key) => {
    expect(press(stateOf(before), key).handled).toBe(false);
  });
});

describe("automatic capitals", () => {
  it.each([
    ["sceneHeading", "int. straße - day", "INT. STRAßE - DAY"],
    ["character", "josé (v.o.)", "JOSÉ (V.O.)"],
    ["transition", "cut to:", "CUT TO:"],
    ["shot", "close on mara", "CLOSE ON MARA"],
    ["action", "Mara waits.", "Mara waits."],
  ] as const)(
    "keeps %s text as typed in the model, set in capitals by layout",
    (to, typed, shown) => {
      const state = type(stateOf([element(to)("|")]), typed);
      const [typedElement] = fromDocument(state.doc);
      expect(typedElement).toEqual({ type: to, text: typed });
      expect(layoutElement(typedElement as Element).lines.map((line) => line.text)).toEqual([
        shown,
      ]);
    },
  );

  test("an element shortcut keeps the text as typed", () => {
    expect(pressAll([action("mara|")], ["Ctrl-3"]).elements).toEqual([cue("mara|")]);
  });
});

describe("Ctrl+B, Ctrl+I and Ctrl+U style the selection", () => {
  checkRows([
    [
      "bold",
      [action("The {gate} is locked.")],
      "Ctrl-b",
      [action("The {gate} is locked.", { bold: [[4, 8]] })],
    ],
    [
      "italic",
      [action("The {gate} is locked.")],
      "Ctrl-i",
      [action("The {gate} is locked.", { italic: [[4, 8]] })],
    ],
    [
      "underline",
      [action("The {gate} is locked.")],
      "Ctrl-u",
      [action("The {gate} is locked.", { underline: [[4, 8]] })],
    ],
    [
      "bold again removes it",
      [action("The {gate} is locked.", { bold: [[4, 8]] })],
      "Ctrl-b",
      [action("The {gate} is locked.")],
    ],
  ]);

  test("with a caret, the style applies to what is typed next", () => {
    const state = press(stateOf([action("The |")]), "Ctrl-i").state;
    expect(show(type(state, "gate"))).toEqual([action("The gate|", { italic: [[4, 8]] })]);
  });
});

describe("Ctrl+Alt+D puts two speeches side by side, as Final Draft's Dual Dialogue", () => {
  const maya = [cue("MAYA"), dialogue("Six.")];
  const tomas = [cue("TOMÁS"), dialogue("Seven.")];
  checkRows([
    [
      "from the first speech, beside the next",
      [cue("MA|YA"), dialogue("Six."), ...tomas],
      "Ctrl-Alt-d",
      [cue("MA|YA"), dialogue("Six."), cue("TOMÁS", { dual: true }), dialogue("Seven.")],
    ],
    [
      "from the last speech, beside the one before",
      [...maya, cue("TOMÁS"), dialogue("Sev|en.")],
      "Ctrl-Alt-d",
      [...maya, cue("TOMÁS", { dual: true }), dialogue("Sev|en.")],
    ],
    [
      "from the right column, back to one column",
      [...maya, cue("TOMÁS", { dual: true }), dialogue("Sev|en.")],
      "Ctrl-Alt-d",
      [...maya, cue("TOMÁS"), dialogue("Sev|en.")],
    ],
    [
      "from the left column, back to one column",
      [cue("MAYA"), dialogue("|Six."), cue("TOMÁS", { dual: true }), dialogue("Seven.")],
      "Ctrl-Alt-d",
      [cue("MAYA"), dialogue("|Six."), ...tomas],
    ],
    [
      "from the right column with a forced break, back to one column",
      [...maya, cue("TOMÁS", { dual: true, pageBreakBefore: true }), dialogue("Sev|en.")],
      "Ctrl-Alt-d",
      [...maya, cue("TOMÁS", { pageBreakBefore: true }), dialogue("Sev|en.")],
    ],
  ]);

  test.each([
    ["outside a speech", [action("Rain|."), ...maya]],
    [
      "when the next speech already has one beside it",
      [cue("ELLIS|"), dialogue("No."), ...maya, cue("TOMÁS", { dual: true }), dialogue("Seven.")],
    ],
    ["for a lone speech", [action("Rain."), cue("MAYA|"), dialogue("Six.")]],
    [
      "when the cue it would mark starts a new page",
      [cue("MA|YA"), dialogue("Six."), cue("TOMÁS", { pageBreakBefore: true }), dialogue("Seven.")],
    ],
    [
      "when a forced break inside the speech before keeps the two apart",
      [cue("MAYA"), dialogue("Six.", { pageBreakBefore: true }), cue("TOMÁS"), dialogue("Sev|en.")],
    ],
  ])("does nothing %s", (_name, before) => {
    expect(pressAll(before, ["Ctrl-Alt-d"])).toEqual({ elements: before, handled: false });
  });
});

describe("Ctrl+E centres, and Ctrl+Enter forces a page break, as commands on whole elements", () => {
  checkRows([
    [
      "centres the element",
      [action("THE END|")],
      "Ctrl-e",
      [action("THE END|", { centred: true })],
    ],
    ["again, does not", [action("THE END|", { centred: true })], "Ctrl-e", [action("THE END|")]],
    [
      "centres every element the selection touches",
      [action("TH{E", { centred: true }), action("EN}D")],
      "Ctrl-e",
      [action("TH{E", { centred: true }), action("EN}D", { centred: true })],
    ],
    [
      "forces a break before the element, wherever the caret",
      [action("Before."), action("Lat|er.")],
      "Ctrl-Enter",
      [action("Before."), action("Lat|er.", { pageBreakBefore: true })],
    ],
    [
      "again, removes it",
      [action("Lat|er.", { pageBreakBefore: true })],
      "Ctrl-Enter",
      [action("Lat|er.")],
    ],
    [
      "again, removes it from a speech beside another",
      [cue("MAYA"), dialogue("Six."), cue("TO|MÁS", { dual: true, pageBreakBefore: true })],
      "Ctrl-Enter",
      [cue("MAYA"), dialogue("Six."), cue("TO|MÁS", { dual: true })],
    ],
  ]);

  test.each([
    ["on the right column's cue", [cue("MAYA"), dialogue("Six."), cue("TO|MÁS", { dual: true })]],
    ["inside the left column", [cue("MAYA"), dialogue("Si|x."), cue("TOMÁS", { dual: true })]],
  ])("Ctrl+Enter adds no break that would part two speeches side by side, %s", (_name, before) => {
    expect(pressAll(before, ["Ctrl-Enter"])).toEqual({ elements: before, handled: false });
  });
});

describe("autocomplete", () => {
  const speeches = [
    cue("MARA"),
    dialogue("Go."),
    cue("MAYA"),
    dialogue("No."),
    cue("MARA"),
    dialogue("Now."),
  ];

  /** Types `typed` at the caret, as the editor applies typing, then presses each key. */
  function typeThenPress(elements: readonly Element[], typed: string, keys: readonly string[]) {
    let state = type(stateOf(elements), typed);
    let handled = true;
    for (const key of keys) {
      const result = press(state, key);
      state = result.state;
      handled &&= result.handled;
    }
    return { elements: show(state), handled, popup: popupOf(state) };
  }

  /** Deletes the character before the caret, as the editor applies Backspace. */
  const erase = (state: EditorState) =>
    state.apply(state.tr.delete(state.selection.from - 1, state.selection.from));

  test("typing in a cue opens the popup: names, most used first, and the first's rest after the caret", () => {
    expect(popupOf(type(stateOf([...speeches, cue("|")]), "ma"))).toEqual({
      title: "Character",
      options: [
        { text: "MARA", uses: 2 },
        { text: "MAYA", uses: 1 },
      ],
      chosen: 0,
      ghost: "RA",
    });
  });

  test("prototype piece 5's heading: after ' - ', times of day, the script's most used first", () => {
    const sample = devScript("sample").elements;
    const typing = [...sample.slice(0, -1), heading("INT. HALCYON - WHEELHOUSE -|")];
    expect(popupOf(type(stateOf(typing), " "))).toEqual({
      title: "Time of day",
      options: [
        { text: "NIGHT", uses: 6 },
        { text: "CONTINUOUS", uses: 3 },
        { text: "DAY", uses: 0 },
        { text: "MORNING", uses: 0 },
        { text: "AFTERNOON", uses: 0 },
        { text: "EVENING", uses: 0 },
        { text: "LATER", uses: 0 },
        { text: "MOMENTS LATER", uses: 0 },
        { text: "THE NEXT DAY", uses: 0 },
      ],
      chosen: 0,
      ghost: "NIGHT",
    });
  });

  test.each<readonly [string, Element[], string, string[], Element[]]>([
    [
      "Enter accepts the highlighted name",
      [...speeches, cue("|")],
      "ma",
      ["Enter"],
      [...speeches, cue("MARA|")],
    ],
    ["Tab accepts it too", [...speeches, cue("|")], "ma", ["Tab"], [...speeches, cue("MARA|")]],
    [
      "Down chooses the next",
      [...speeches, cue("|")],
      "ma",
      ["ArrowDown", "Enter"],
      [...speeches, cue("MAYA|")],
    ],
    [
      "Up from the first chooses the last",
      [...speeches, cue("|")],
      "ma",
      ["ArrowUp", "Enter"],
      [...speeches, cue("MAYA|")],
    ],
    [
      "Down from the last comes round to the first",
      [...speeches, cue("|")],
      "ma",
      ["ArrowDown", "ArrowDown", "Enter"],
      [...speeches, cue("MARA|")],
    ],
    [
      "Esc closes it, so Enter then starts the dialogue as without it",
      [...speeches, cue("|")],
      "ma",
      ["Escape", "Enter"],
      [...speeches, cue("ma"), dialogue("|")],
    ],
    [
      "Esc closes it, and Ctrl+E reopens nothing, so Enter starts the dialogue",
      [...speeches, cue("|")],
      "ma",
      ["Escape", "Ctrl-e", "Enter"],
      [...speeches, cue("ma", { centred: true }), dialogue("|")],
    ],
    [
      "Esc closes it, and Ctrl+Enter reopens nothing, so Enter starts the dialogue",
      [...speeches, cue("|")],
      "ma",
      ["Escape", "Ctrl-Enter", "Enter"],
      [...speeches, cue("ma", { pageBreakBefore: true }), dialogue("|")],
    ],
    [
      "a name typed in full opens nothing, so Enter starts the dialogue",
      [...speeches, cue("|")],
      "mara",
      ["Enter"],
      [...speeches, cue("mara"), dialogue("|")],
    ],
    [
      "a new name opens nothing, so Enter starts the dialogue",
      [...speeches, cue("|")],
      "Zoe",
      ["Enter"],
      [...speeches, cue("Zoe"), dialogue("|")],
    ],
    [
      "an accepted name reads as the script writes it",
      [cue("Mara"), dialogue("Go."), cue("|")],
      "MA",
      ["Enter"],
      [cue("Mara"), dialogue("Go."), cue("Mara|")],
    ],
    [
      "an extension, from '('",
      [...speeches, cue("MARA |")],
      "(",
      ["Enter"],
      [...speeches, cue("MARA (V.O.)|")],
    ],
    ["a transition", [transition("|")], "cu", ["Tab"], [transition("CUT TO:|")]],
    [
      "a prefix, with the space after it, as Final Draft writes it",
      [heading("|")],
      "e",
      ["Enter"],
      [heading("EXT. |")],
    ],
  ])("%s", (_name, before, typed, keys, after) => {
    expect(typeThenPress(before, typed, keys)).toEqual({
      elements: after,
      handled: true,
      popup: null,
    });
  });

  test("a heading part by part: accepting the prefix offers locations, then times of day", () => {
    let state = type(stateOf([heading("INT. HOUSE - NIGHT"), action("Dark."), heading("|")]), "i");
    expect(popupOf(state)).toMatchObject({
      title: "Prefix",
      options: [
        { text: "INT.", uses: 1 },
        { text: "INT./EXT.", uses: 0 },
        { text: "I/E.", uses: 0 },
      ],
    });
    state = press(state, "Enter").state;
    expect(show(state).at(-1)).toEqual(heading("INT. |"));
    expect(popupOf(state)).toMatchObject({
      title: "Location",
      options: [{ text: "HOUSE", uses: 1 }],
      ghost: "HOUSE",
    });
    state = press(state, "Tab").state;
    expect(show(state).at(-1)).toEqual(heading("INT. HOUSE - |"));
    expect(popupOf(state)).toMatchObject({ title: "Time of day", ghost: "NIGHT" });
    state = press(type(state, "d"), "Enter").state;
    expect(show(state).at(-1)).toEqual(heading("INT. HOUSE - DAY|"));
    expect(popupOf(state)).toBeNull();
    expect(show(press(state, "Enter").state).slice(-2)).toEqual([
      heading("INT. HOUSE - DAY"),
      action("|"),
    ]);
  });

  test("deleting at the end narrows the popup again", () => {
    const closed = type(stateOf([...speeches, cue("|")]), "maz");
    expect(popupOf(closed)).toBeNull();
    expect(popupOf(erase(closed))?.options.map((option) => option.text)).toEqual(["MARA", "MAYA"]);
  });

  test("names written since the script opened are suggested", () => {
    let state = stateOf([action("Rain.|")]);
    state = press(state, "Tab").state;
    state = press(type(state, "Zoe"), "Enter").state;
    state = press(press(type(state, "Hi."), "Enter").state, "Tab").state;
    expect(show(state)).toEqual([action("Rain."), cue("Zoe"), dialogue("Hi."), cue("|")]);
    expect(popupOf(type(state, "z"))?.options).toEqual([{ text: "ZOE", uses: 1 }]);
  });

  test("moving the caret closes the popup, and moving it back does not reopen it", () => {
    const open = type(stateOf([...speeches, cue("|")]), "ma");
    const end = open.selection.from;
    const moved = open.apply(open.tr.setSelection(TextSelection.create(open.doc, end - 1)));
    expect(popupOf(moved)).toBeNull();
    const back = moved.apply(moved.tr.setSelection(TextSelection.create(moved.doc, end)));
    expect(popupOf(back)).toBeNull();
  });

  test("typing before an element's end, or in action, opens nothing", () => {
    expect(popupOf(type(stateOf([...speeches, cue("|A")]), "M"))).toBeNull();
    expect(popupOf(type(stateOf([...speeches, action("|")]), "Ma"))).toBeNull();
  });

  test.each(["ArrowDown", "ArrowUp", "Escape"])(
    "with no popup open, %s is left to the caret and the window",
    (key) => {
      expect(press(stateOf([...speeches, cue("ma|")]), key).handled).toBe(false);
    },
  );
});

describe("undo and redo", () => {
  /** What each Ctrl+Z shows, until there is nothing left to undo. */
  function undoSteps(state: EditorState): Element[][] {
    const shown: Element[][] = [];
    let result = press(state, "Ctrl-z");
    while (result.handled) {
      shown.push(show(result.state));
      result = press(result.state, "Ctrl-z");
    }
    return shown;
  }

  test("a burst of typing is one step, and Ctrl+Z puts the caret back where it was", () => {
    const state = typeEach(stateOf([action("Rain.|")]), " It stops.");
    expect(undoSteps(state)).toEqual([[action("Rain.|")]]);
  });

  test("a pause of more than half a second ends the burst; a shorter one does not", () => {
    let state = typeEach(stateOf([action("Rain.|")]), " It");
    pause(400);
    state = typeEach(state, " stops");
    pause(600);
    state = typeEach(state, " now.");
    expect(undoSteps(state)).toEqual([[action("Rain. It stops|")], [action("Rain.|")]]);
  });

  test("typing somewhere else starts a new step", () => {
    let state = typeEach(stateOf([action("Rain.|"), action("Wind.")]), "!");
    state = apply(state, state.tr.setSelection(TextSelection.create(state.doc, 14)));
    state = typeEach(state, "?");
    expect(show(state)).toEqual([action("Rain.!"), action("Wind.?|")]);
    expect(undoSteps(state)).toEqual([
      [action("Rain.!"), action("Wind.|")],
      [action("Rain.|"), action("Wind.")],
    ]);
  });

  test.each(["Ctrl-Shift-z", "Ctrl-y"])("%s redoes, the caret after what it redid", (key) => {
    const undone = press(typeEach(stateOf([action("Rain.|")]), " It stops."), "Ctrl-z").state;
    expect(show(press(undone, key).state)).toEqual([action("Rain. It stops.|")]);
  });

  test("an element change is a step of its own, apart from the typing around it", () => {
    let state = typeEach(stateOf([action("|")]), "mara");
    state = press(state, "Ctrl-3").state;
    state = typeEach(state, " jones");
    expect(undoSteps(state)).toEqual([[cue("mara|")], [action("mara|")], [action("|")]]);
  });

  test("the top bar's element change too", () => {
    const state = run(typeEach(stateOf([action("|")]), "mara"), setElementType("character"));
    expect(undoSteps(state)).toEqual([[action("mara|")], [action("|")]]);
  });

  test("Enter starts a step, and typing straight after joins it", () => {
    let state = typeEach(stateOf([action("|")]), "Rain.");
    state = typeEach(press(state, "Enter").state, "Wind.");
    expect(show(state)).toEqual([action("Rain."), action("Wind.|")]);
    expect(undoSteps(state)).toEqual([[action("Rain.|")], [action("|")]]);
  });

  test("Enter at an element's start is a step that typing straight after joins", () => {
    const state = typeEach(press(stateOf([cue("|MARA")]), "Enter").state, "x");
    expect(show(state)).toEqual([cue(""), cue("x|MARA")]);
    expect(undoSteps(state)).toEqual([[cue("|MARA")]]);
  });

  test("Tab starting an element is a step that typing joins, as Enter is", () => {
    const state = typeEach(press(stateOf([cue("MARA|")]), "Tab").state, "quietly");
    expect(show(state)).toEqual([cue("MARA"), paren("(quietly|)")]);
    expect(undoSteps(state)).toEqual([[cue("MARA|")]]);
  });

  test("Enter after dialogue, Tab, and a name: each Ctrl+Z takes back one", () => {
    let state = press(stateOf([cue("MARA"), dialogue("Hi.|")]), "Enter").state;
    state = typeEach(press(state, "Tab").state, "TEO");
    expect(undoSteps(state)).toEqual([
      [cue("MARA"), dialogue("Hi."), cue("|")],
      [cue("MARA"), dialogue("Hi."), action("|")],
      [cue("MARA"), dialogue("Hi.|")],
    ]);
  });

  test.each<[string, Element[], string]>([
    ["Ctrl+B", [action("The {gate} is locked.")], "Ctrl-b"],
    ["Ctrl+I", [action("The {gate} is locked.")], "Ctrl-i"],
    ["Ctrl+U", [action("The {gate} is locked.")], "Ctrl-u"],
    ["Ctrl+E", [action("THE END|")], "Ctrl-e"],
    ["Ctrl+Enter", [action("Before."), action("Lat|er.")], "Ctrl-Enter"],
    [
      "Ctrl+Alt+D",
      [cue("MA|YA"), dialogue("Six."), cue("TOMÁS"), dialogue("Seven.")],
      "Ctrl-Alt-d",
    ],
  ])(
    "%s is a step of its own, which Ctrl+Z takes back with the selection",
    (_name, before, key) => {
      const changed = press(stateOf(before), key);
      expect(changed.handled).toBe(true);
      expect(show(changed.state)).not.toEqual(before);
      expect(undoSteps(changed.state)).toEqual([before]);
    },
  );

  test("typing just before and after a format key stays apart from it", () => {
    let state = typeEach(stateOf([action("THE END|")]), "!");
    state = typeEach(press(state, "Ctrl-e").state, "!");
    expect(undoSteps(state)).toEqual([
      [action("THE END!|", { centred: true })],
      [action("THE END!|")],
      [action("THE END|")],
    ]);
  });

  describe("with autocomplete", () => {
    const speeches = [cue("MARA"), dialogue("Go."), cue("MAYA"), dialogue("No.")];

    test("an accepted suggestion is a step of its own: Ctrl+Z gives back what was typed", () => {
      const typed = typeEach(stateOf([...speeches, cue("|")]), "ma");
      const accepted = press(typed, "Enter").state;
      expect(show(accepted).at(-1)).toEqual(cue("MARA|"));
      expect(undoSteps(accepted).map((shown) => shown.at(-1))).toEqual([cue("ma|"), cue("|")]);
    });

    test("undo and redo open no popup; typing does", () => {
      let state = typeEach(stateOf([...speeches, cue("|")]), "ma");
      pause(600);
      state = typeEach(state, "z");
      expect(popupOf(state)).toBeNull();
      const undone = press(state, "Ctrl-z").state;
      expect(show(undone).at(-1)).toEqual(cue("ma|"));
      expect(popupOf(undone)).toBeNull();
      expect(popupOf(press(press(undone, "Ctrl-z").state, "Ctrl-y").state)).toBeNull();
      expect(popupOf(type(undone, "r"))?.options).toEqual([{ text: "MARA", uses: 1 }]);
    });
  });
});
