/**
 * Each source's suggestions while an element is typed at the end of a
 * script. The sources, ranking by use and the five prefixes come from the
 * brief; the built-in lists and their order are Final Draft's SmartType
 * defaults (findings, "Final Draft's SmartType"). Each count is worked by
 * hand from its script.
 */
import { describe, expect, test } from "vitest";
import type { Element, ElementType } from "./model.ts";
import { type Source, suggest, Tally, usesOf } from "./suggestions.ts";

const element =
  (type: ElementType) =>
  (text: string): Element => ({ type, text });
const heading = element("sceneHeading");
const action = element("action");
const cue = element("character");
const dialogue = element("dialogue");
const transition = element("transition");

/** The suggestions, as [text, uses], while `typed` is being typed after `script`. */
function typing(script: readonly Element[], typed: Element) {
  const tally = Tally.of([...script, typed]);
  const found = suggest(tally, typed.type, typed.text, usesOf(typed.type, typed.text));
  return found ? found.options.map(({ text, uses }) => [text, uses]) : null;
}

describe("character names, from cues, ranked by speeches", () => {
  const script = [
    cue("MARA"),
    dialogue("Go."),
    cue("TEO"),
    dialogue("No."),
    cue("MARA (V.O.)"),
    dialogue("Now."),
    action("Maya and Mara wait."),
    cue("MAYA"),
    dialogue("Hi."),
    cue("MARA"),
    dialogue("Bye."),
  ];

  test.each([
    [
      "ma",
      [
        ["MARA", 3],
        ["MAYA", 1],
      ],
    ],
    ["t", [["TEO", 1]]],
    ["may", [["MAYA", 1]]],
    ["x", null],
    ["mara", null],
    ["", null],
  ])("typing %j in a cue", (typed, expected) => {
    expect(typing(script, cue(typed))).toEqual(expected);
  });

  test("the cue being typed is not a name yet", () => {
    expect(typing([], cue("ma"))).toBeNull();
  });
});

describe("cue extensions, from an open parenthesis: Final Draft's, then any used", () => {
  const script = [cue("MARA (O.S.)"), cue("TEO (O.S.)"), cue("MARA (V.O.)"), cue("TEO (ON PHONE)")];

  test.each([
    [
      "MAYA (",
      [
        ["(O.S.)", 2],
        ["(V.O.)", 1],
        ["(ON PHONE)", 1],
        ["(O.C.)", 0],
        ["(SUBTITLE)", 0],
      ],
    ],
    ["MAYA (v", [["(V.O.)", 1]]],
    [
      "MAYA (o",
      [
        ["(O.S.)", 2],
        ["(ON PHONE)", 1],
        ["(O.C.)", 0],
      ],
    ],
    ["MAYA (V.O.)", null],
    ["MAYA (V.O.) ", null],
  ])("typing %j in a cue", (typed, expected) => {
    expect(typing(script, cue(typed))).toEqual(expected);
  });
});

describe("scene heading prefixes: the brief's five, ranked by use", () => {
  const script = [
    heading("INT. HOUSE - DAY"),
    heading("I/E. CAR - NIGHT"),
    heading("i/e car - night"),
  ];

  test.each([
    [
      "i",
      [
        ["I/E.", 2],
        ["INT.", 1],
        ["INT./EXT.", 0],
      ],
    ],
    [
      "e",
      [
        ["EXT.", 0],
        ["EST.", 0],
      ],
    ],
    ["int./", [["INT./EXT.", 0]]],
    ["INT.", null],
    ["x", null],
    ["", null],
  ])("typing %j in a heading", (typed, expected) => {
    expect(typing(script, heading(typed))).toEqual(expected);
  });
});

describe("locations already used, after the prefix", () => {
  const script = [
    heading("INT. HALCYON - WHEELHOUSE - NIGHT"),
    heading("EXT. HALCYON - DECK - CONTINUOUS"),
    heading("INT. HALCYON - WHEELHOUSE - NIGHT"),
    heading("EXT. HARBOR - NIGHT"),
    heading("EXT. HARBOR"),
    action("They reach the HARBOR - and stop."),
  ];

  test.each([
    [
      "INT. ",
      [
        ["HALCYON - WHEELHOUSE", 2],
        ["HARBOR", 2],
        ["HALCYON - DECK", 1],
      ],
    ],
    [
      "ext. hal",
      [
        ["HALCYON - WHEELHOUSE", 2],
        ["HALCYON - DECK", 1],
      ],
    ],
    ["INT HAR", [["HARBOR", 2]]],
    ["INT. HARBOR", null],
    ["CAR ", null],
  ])("typing %j in a heading", (typed, expected) => {
    expect(typing(script, heading(typed))).toEqual(expected);
  });
});

describe("times of day, after ' - ': Final Draft's, then any used", () => {
  const script = [
    heading("INT. HOUSE - NIGHT"),
    heading("EXT. YARD - NIGHT"),
    heading("INT. HOUSE - KITCHEN - NIGHT"),
    heading("INT. HOUSE - CONTINUOUS"),
    heading("EXT. YARD - DUSK"),
  ];

  test.each([
    [
      "INT. HOUSE - ",
      [
        ["NIGHT", 3],
        ["CONTINUOUS", 1],
        ["DUSK", 1],
        ["DAY", 0],
        ["MORNING", 0],
        ["AFTERNOON", 0],
        ["EVENING", 0],
        ["LATER", 0],
        ["MOMENTS LATER", 0],
        ["THE NEXT DAY", 0],
      ],
    ],
    [
      "INT. HOUSE - m",
      [
        ["MORNING", 0],
        ["MOMENTS LATER", 0],
      ],
    ],
    [
      "INT. HOUSE - KITCHEN - d",
      [
        ["DUSK", 1],
        ["DAY", 0],
      ],
    ],
    ["INT. HOUSE - DAY", null],
  ])("typing %j in a heading", (typed, expected) => {
    expect(typing(script, heading(typed))).toEqual(expected);
  });
});

describe("transitions: Final Draft's, then any used", () => {
  const script = [transition("SMASH CUT TO:"), transition("CUT TO:"), transition("cut to:")];

  test.each([
    ["c", [["CUT TO:", 2]]],
    ["s", [["SMASH CUT TO:", 1]]],
    [
      "f",
      [
        ["FADE IN:", 0],
        ["FADE OUT", 0],
        ["FADE TO:", 0],
        ["FADE TO BLACK", 0],
      ],
    ],
    ["", null],
  ])("typing %j in a transition", (typed, expected) => {
    expect(typing(script, transition(typed))).toEqual(expected);
  });
});

test("a suggestion reads as the script writes it most often", () => {
  expect(typing([cue("Mara"), cue("Mara"), cue("MARA")], cue("m"))).toEqual([["Mara", 3]]);
});

test("other elements offer nothing", () => {
  const script = [cue("MARA"), heading("INT. HOUSE - DAY")];
  expect(typing(script, action("M"))).toBeNull();
  expect(typing(script, dialogue("M"))).toBeNull();
});

describe("the tally follows edits element by element", () => {
  const SOURCES: readonly Source[] = [
    "character",
    "extension",
    "prefix",
    "location",
    "time",
    "transition",
  ];
  /** Each source's entries, ignoring the order they were counted in. */
  const counts = (tally: Tally) =>
    SOURCES.map((source) =>
      [...tally.entries(source)]
        .map(([key, { uses, forms }]) => [key, uses, [...forms].sort()] as const)
        .sort(([a], [b]) => (a < b ? -1 : 1)),
    );
  const uses = (elements: readonly Element[]) => elements.flatMap((e) => usesOf(e.type, e.text));

  test("changing, removing and adding elements counts as recounting the script", () => {
    const before = [
      cue("MARA"),
      heading("INT. HOUSE - DAY"),
      transition("CUT TO:"),
      heading("INT. HOUSE - DAY"),
    ];
    const after = [cue("MARA (V.O.)"), heading("EXT. BARN - NIGHT"), heading("INT. HOUSE - DAY")];
    const followed = Tally.of(before).with(uses(before.slice(0, 3)), uses(after.slice(0, 2)));
    expect(counts(followed)).toEqual(counts(Tally.of(after)));
  });

  test("removing every use leaves nothing behind", () => {
    const script = [cue("MARA (V.O.)"), heading("INT. HOUSE - DAY"), transition("CUT TO:")];
    expect(counts(Tally.of(script).with(uses(script), []))).toEqual(counts(Tally.of([])));
  });
});
