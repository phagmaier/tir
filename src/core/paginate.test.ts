// Worked examples for each pagination rule, using short pages so each rule
// shows in a few lines. Rows count down from the top margin; dialogue wraps
// at 35 characters and action at 60 (findings, the table).
import { describe, expect, it } from "vitest";
import { featureScript } from "./fixtures/scripts.ts";
import { LayoutCache } from "./layout.ts";
import type { Element, ElementType } from "./model.ts";
import { automaticContinueds, type Page, pageLabel, paginate } from "./paginate.ts";

const el = (type: ElementType, text: string, more: Partial<Element> = {}): Element => ({
  type,
  text,
  ...more,
});
const rows = (pages: Page[]) =>
  pages.map((page) =>
    page.lines.map(
      (line) => `${line.row} ${line.text}${line.kind === "element" ? "" : ` <${line.kind}>`}`,
    ),
  );

describe("filling pages", () => {
  it("drops an element's space before at the top of a page", () => {
    const script = ["One.", "Two.", "Three.", "Four."].map((text) => el("action", text));
    // Rows 0, 2, 4; "Four." would need rows 5 and 6 of a 6-row page.
    expect(rows(paginate(script, { linesPerPage: 6 }))).toEqual([
      ["0 One.", "2 Two.", "4 Three."],
      ["0 Four."],
    ]);
  });

  it("gives an empty script one empty page", () => {
    expect(paginate([])).toEqual([{ number: 1, lines: [] }]);
  });

  it("numbers pages from 1 and shows numbers from page 2", () => {
    const pages = paginate([el("action", "One."), el("action", "Two.", { pageBreakBefore: true })]);
    expect(pages.map((page) => page.number)).toEqual([1, 2]);
    expect([pageLabel(1), pageLabel(2), pageLabel(120)]).toEqual([null, "2.", "120."]);
  });
});

describe("forced page breaks", () => {
  it("start the element on a new page", () => {
    const script = [
      el("action", "One."),
      el("sceneHeading", "INT. LAMP ROOM - NIGHT", { pageBreakBefore: true }),
    ];
    expect(rows(paginate(script))).toEqual([["0 One."], ["0 INT. LAMP ROOM - NIGHT"]]);
  });

  it("do not leave a blank first page", () => {
    expect(paginate([el("action", "One.", { pageBreakBefore: true })])).toHaveLength(1);
  });
});

describe("scene headings and shots stay with what follows", () => {
  const before = [el("action", "One."), el("action", "Two.")];

  it.each<ElementType>(["sceneHeading", "shot"])("a %s at a page's foot moves on", (type) => {
    // The heading fits at row 5 of 6, but its action would not.
    const script = [...before, el(type, "INT. LAMP ROOM"), el("action", "Three.")];
    expect(rows(paginate(script, { linesPerPage: 6 }))).toEqual([
      ["0 One.", "2 Two."],
      ["0 INT. LAMP ROOM", "2 Three."],
    ]);
  });

  it("a heading with nothing after it may end a page", () => {
    const script = [...before, el("sceneHeading", "INT. LAMP ROOM")];
    expect(rows(paginate(script, { linesPerPage: 6 }))).toEqual([
      ["0 One.", "2 Two.", "5 INT. LAMP ROOM"],
    ]);
  });
});

describe("action splits only at a sentence end, leaving two lines a side", () => {
  // At 61 characters a line this wraps as "The keeper climbs the spiral stair.
  // At the top the lamp room" (60), "is dark and cold. The glass is cracked
  // across and the wind" (58), "comes through it like a voice." (30).
  const long =
    "The keeper climbs the spiral stair. At the top the lamp room is dark and cold. The glass is cracked across and the wind comes through it like a voice.";

  it("puts what fits on this page and wraps the rest afresh on the next", () => {
    // After "Rain." two rows remain: "stair." would leave one line (too few),
    // "cold." leaves two on each page.
    const pages = paginate([el("action", "Rain."), el("action", long)], { linesPerPage: 4 });
    expect(rows(pages)).toEqual([
      [
        "0 Rain.",
        "2 The keeper climbs the spiral stair. At the top the lamp room",
        "3 is dark and cold.",
      ],
      ["0 The glass is cracked across and the wind comes through it", "1 like a voice."],
    ]);
    expect(pages[1]?.lines[0]).toMatchObject({ element: 1, start: 79, end: 136 });
  });

  it("moves an action with no sentence end to fit whole", () => {
    // "the glass is cracked across and the lamp room is dark and" (57), then "cold all night".
    const text = "the glass is cracked across and the lamp room is dark and cold all night";
    expect(
      rows(paginate([el("action", "Rain."), el("action", text)], { linesPerPage: 3 })),
    ).toEqual([
      ["0 Rain."],
      ["0 the glass is cracked across and the lamp room is dark and", "1 cold all night"],
    ]);
  });

  it("splits an action longer than a page at a line, even leaving one", () => {
    // 25 four-letter words: 12, 12 and 1 to a line. It has to split somewhere.
    const text = Array(25).fill("abcd").join(" ");
    const twelve = Array(12).fill("abcd").join(" ");
    expect(rows(paginate([el("action", text)], { linesPerPage: 2 }))).toEqual([
      [`0 ${twelve}`, `1 ${twelve}`],
      ["0 abcd"],
    ]);
  });
});

describe("a transition stays with what comes before it", () => {
  it("takes the element before it onto the next page rather than start a page", () => {
    // "The shutters bang against the stone wall of the lighthouse" (58) and
    // "all night long": it fits rows 2 and 3, but "CUT TO:" would then start
    // the next page.
    const script = [
      el("action", "Rain."),
      el("action", "The shutters bang against the stone wall of the lighthouse all night long"),
      el("transition", "CUT TO:"),
    ];
    expect(rows(paginate(script, { linesPerPage: 5 }))).toEqual([
      ["0 Rain."],
      [
        "0 The shutters bang against the stone wall of the lighthouse",
        "1 all night long",
        "3 CUT TO:",
      ],
    ]);
  });
});

describe("a speech split across pages", () => {
  // Wrapped at 35: "Go home. I waited all night by the" (34),
  // "harbour wall. You never came, and" (33), "the lamp went out at dawn." (26).
  const dialogue =
    "Go home. I waited all night by the harbour wall. You never came, and the lamp went out at dawn.";

  it("ends with (MORE) below its last line and repeats the cue above the next page", () => {
    const script = [el("action", "Rain."), el("character", "MAYA"), el("dialogue", dialogue)];
    // After "Rain." 4 rows remain: the space before, the cue and two lines,
    // so the speech breaks after "wall."; (MORE) takes the row below and the
    // repeated cue the row above the next page, neither counting. The rest
    // wraps afresh: "You never came, and the lamp went" (33), "out at dawn.".
    const pages = paginate(script, { linesPerPage: 5 });
    expect(rows(pages)).toEqual([
      [
        "0 Rain.",
        "2 MAYA",
        "3 Go home. I waited all night by the",
        "4 harbour wall.",
        "5 (MORE) <more>",
      ],
      ["-1 MAYA (CONT’D) <continued>", "0 You never came, and the lamp went", "1 out at dawn."],
    ]);
    expect(pages[0]?.lines[4]).toMatchObject({ x: 3.5, element: 2 });
    expect(pages[1]?.lines[0]).toMatchObject({ x: 3.5, element: 1, start: 0, end: 4 });
  });

  it("leaves at least two lines of a dialogue on each page", () => {
    // "Go home now, you hear me? The lamp" (34), "will hold.": splitting after
    // "me?" would leave one line each side, so the speech moves on.
    const script = [
      el("action", "Rain."),
      el("character", "MAYA"),
      el("dialogue", "Go home now, you hear me? The lamp will hold."),
    ];
    expect(rows(paginate(script, { linesPerPage: 4 }))).toEqual([
      ["0 Rain."],
      ["0 MAYA", "1 Go home now, you hear me? The lamp", "2 will hold."],
    ]);
  });

  it("runs over pages at sentence ends", () => {
    // A page holds the cue and two lines with (MORE) below; the next holds
    // three, its cue above. "six." would leave one line; "seven." leaves two.
    const text =
      "The tide turns at six. The boat leaves at seven. The lamp goes out at eight. Then nobody will see us. Not even the old keeper. So we go tonight.";
    const script = [el("character", "MAYA"), el("dialogue", text)];
    expect(rows(paginate(script, { linesPerPage: 3 }))).toEqual([
      // "The tide turns at six. The boat" (31) and "leaves at seven.".
      ["0 MAYA", "1 The tide turns at six. The boat", "2 leaves at seven.", "3 (MORE) <more>"],
      [
        "-1 MAYA (CONT’D) <continued>",
        // "The lamp goes out at eight. Then" (32), "nobody will see us. Not even the"
        // (32), "old keeper. So we go tonight." (29).
        "0 The lamp goes out at eight. Then",
        "1 nobody will see us. Not even the",
        "2 old keeper. So we go tonight.",
      ],
    ]);
  });

  it("splits at a line when longer than a page with no sentence end", () => {
    // 33 four-letter words, seven to a 35-character line: 7, 7, 7, 7 and 5.
    // The first page holds the cue and two lines; the rest, wrapped afresh to
    // 7, 7 and 5, fits the next page under the cue repeated above it.
    const seven = Array(7).fill("abcd").join(" ");
    const five = Array(5).fill("abcd").join(" ");
    const script = [el("character", "MAYA"), el("dialogue", Array(33).fill("abcd").join(" "))];
    expect(rows(paginate(script, { linesPerPage: 3 }))).toEqual([
      ["0 MAYA", `1 ${seven}`, `2 ${seven}`, "3 (MORE) <more>"],
      ["-1 MAYA (CONT’D) <continued>", `0 ${seven}`, `1 ${seven}`, `2 ${five}`],
    ]);
  });

  it("moves whole when its dialogue has no sentence end to split at", () => {
    // "I waited all night by the harbour" (33), "wall and you never came and the"
    // (31), "lamp went out at dawn" (21): no room for all three after "Rain.".
    const text =
      "I waited all night by the harbour wall and you never came and the lamp went out at dawn";
    const script = [el("action", "Rain."), el("character", "MAYA"), el("dialogue", text)];
    expect(rows(paginate(script, { linesPerPage: 5 }))).toEqual([
      ["0 Rain."],
      [
        "0 MAYA",
        "1 I waited all night by the harbour",
        "2 wall and you never came and the",
        "3 lamp went out at dawn",
      ],
    ]);
  });

  it("may end a page after a parenthetical, with two lines of dialogue above (MORE)", () => {
    // "I have waited by this window every" (34), "night since the boat went out."
    // (one sentence), then "(beat)": the page fills there, so (MORE) follows it.
    const script = [
      el("action", "Rain."),
      el("character", "MAYA"),
      el("dialogue", "I have waited by this window every night since the boat went out."),
      el("parenthetical", "(beat)"),
      el("dialogue", "Go home now, you hear me? The lamp will hold."),
    ];
    expect(rows(paginate(script, { linesPerPage: 6 }))).toEqual([
      [
        "0 Rain.",
        "2 MAYA",
        "3 I have waited by this window every",
        "4 night since the boat went out.",
        "5 (beat)",
        "6 (MORE) <more>",
      ],
      ["-1 MAYA (CONT’D) <continued>", "0 Go home now, you hear me? The lamp", "1 will hold."],
    ]);
  });

  it("does not end a page with only one line of dialogue above (MORE)", () => {
    const script = [
      el("action", "Rain."),
      el("character", "MAYA"),
      el("dialogue", "Go."),
      el("parenthetical", "(beat)"),
      el("dialogue", "Then go."),
    ];
    expect(rows(paginate(script, { linesPerPage: 5 }))).toEqual([
      ["0 Rain."],
      ["0 MAYA", "1 Go.", "2 (beat)", "3 Then go."],
    ]);
  });

  it("never leaves a cue alone at a page's foot", () => {
    const script = [
      el("action", "Rain."),
      el("action", "Wind."),
      el("character", "MAYA"),
      el("dialogue", "Go."),
    ];
    expect(rows(paginate(script, { linesPerPage: 4 }))).toEqual([
      ["0 Rain.", "2 Wind."],
      ["0 MAYA", "1 Go."],
    ]);
  });
});

describe("automatic (CONT'D)", () => {
  it("marks a speaker who returns after action", () => {
    const script = [
      el("character", "MAYA (V.O.)"),
      el("dialogue", "Hello?"),
      el("action", "She turns."),
      el("character", "Maya"),
      el("dialogue", "Again."),
    ];
    expect(automaticContinueds(script)).toEqual(new Set([3]));
    expect(rows(paginate(script))[0]?.[3]).toBe("5 MAYA (CONT’D)");
  });

  it.each([
    ["another speaker came between", ["MAYA", "Hi.", "TOMÁS", "Yo.", "action", "MAYA", "Again."]],
    ["a scene heading came between", ["MAYA", "Hi.", "heading", "MAYA", "Again."]],
    ["nothing came between", ["MAYA", "Hi.", "MAYA", "Again."]],
    ["the cue already says so", ["MAYA", "Hi.", "action", "MAYA (CONT'D)", "Again."]],
  ])("is not added when %s", (_why, items) => {
    const script = items.map((text) =>
      text === "action"
        ? el("action", "She turns.")
        : text === "heading"
          ? el("sceneHeading", "INT. LAMP ROOM - NIGHT")
          : /^[A-ZÁ (').]+$/.test(text)
            ? el("character", text)
            : el("dialogue", text),
    );
    expect(automaticContinueds(script)).toEqual(new Set());
  });
});

describe("dual dialogue", () => {
  it("sets the two speeches side by side from the same row", () => {
    const script = [
      el("character", "MAYA"),
      el("dialogue", "Left."),
      el("character", "TOMÁS", { dual: true }),
      el("dialogue", "Right."),
    ];
    const lines = paginate(script)[0]?.lines.map((line) => [
      line.row,
      line.x,
      line.text,
      line.column,
    ]);
    // Each cue centred in its column; dialogue at 1.5 and 4.625 in.
    expect(lines).toEqual([
      [0, 2.7375, "MAYA", "left"],
      [0, 5.8125, "TOMÁS", "right"],
      [1, 1.5, "Left.", "left"],
      [1, 4.625, "Right.", "right"],
    ]);
  });
});

describe("a layout cache kept between runs", () => {
  it("paginates an edited script as a fresh run does", () => {
    let script = featureScript(30);
    const layouts = new LayoutCache();
    paginate(script, { layouts });
    // Lengthen, shorten and retype elements so lines and page breaks move.
    for (const [index, change] of [
      [3, (text: string) => `${text} And the tide comes in again over the wall.`],
      [10, (text: string) => text.slice(0, 5)],
      [11, (text: string) => text.toUpperCase()],
      [40, () => ""],
    ] as const) {
      script = script.map((element, i) =>
        i === index ? { ...element, text: change(element.text) } : element,
      );
      expect(paginate(script, { layouts })).toEqual(paginate(script));
    }
  });
});
