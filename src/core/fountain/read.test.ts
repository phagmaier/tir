// One group per rule of the Fountain 1.1 spec (fountain.io/syntax), each
// with worked examples. The example text is original.
import { describe, expect, it } from "vitest";
import type { Element } from "../model.ts";
import { readFountain } from "./read.ts";

const elements = (source: string) => readFountain(source).script.elements;
const types = (source: string) => elements(source).map((element) => element.type);

describe("scene headings", () => {
  it.each([
    "INT. LIGHTHOUSE - NIGHT",
    "EXT. HARBOUR WALL - DAY",
    "EST. FISHING VILLAGE - DAWN",
    "INT./EXT. VAN - MOVING",
    "INT/EXT. VAN - MOVING",
    "I/E VAN - MOVING",
    "INT LIGHTHOUSE",
  ])("%s is a heading", (line) => {
    expect(elements(`${line}\n\nRain.`)[0]).toEqual({ type: "sceneHeading", text: line });
  });

  it("matches the prefix in any case and keeps the text as typed", () => {
    expect(elements("ext. harbour wall - day\n\nRain.")[0]).toEqual({
      type: "sceneHeading",
      text: "ext. harbour wall - day",
    });
  });

  it("needs a dot or a space after the prefix", () => {
    expect(types("INTERIOR DESIGN\n\nRain.")).toEqual(["action", "action"]);
  });

  it("needs a blank line after it", () => {
    expect(types("INT. LIGHTHOUSE - NIGHT\nThe lamp turns.")).not.toContain("sceneHeading");
  });

  it("is forced by a leading period, which is removed", () => {
    expect(elements(".TELESCOPE POV\n\nA ship.")[0]).toEqual({
      type: "sceneHeading",
      text: "TELESCOPE POV",
    });
  });

  it("is not forced by an ellipsis", () => {
    expect(elements("...where the ferry waits.")[0]).toEqual({
      type: "action",
      text: "...where the ferry waits.",
    });
  });

  it("is overridden by a leading !", () => {
    expect(types("!INT. LIGHTHOUSE - NIGHT")).toEqual(["action"]);
  });

  it.each([
    ["INT. LIGHTHOUSE - NIGHT #1#", "INT. LIGHTHOUSE - NIGHT", "1"],
    ["INT. LIGHTHOUSE - NIGHT #1A#", "INT. LIGHTHOUSE - NIGHT", "1A"],
    ["INT. LIGHTHOUSE - NIGHT #I-1-A#", "INT. LIGHTHOUSE - NIGHT", "I-1-A"],
    ["INT. LIGHTHOUSE - NIGHT #1.#", "INT. LIGHTHOUSE - NIGHT", "1."],
    ["INT. LIGHTHOUSE - FLASHBACK (1971) #110A#", "INT. LIGHTHOUSE - FLASHBACK (1971)", "110A"],
  ])("leaves out the scene number in %s", (line, text, number) => {
    const read = readFountain(`${line}\n\nRain.`);
    expect(read.script.elements[0]).toEqual({ type: "sceneHeading", text });
    expect(read.leftOut).toEqual([{ kind: "sceneNumber", text: number, at: 0 }]);
  });
});

describe("action", () => {
  it("is any paragraph that is nothing else", () => {
    expect(elements("The lamp turns. Somewhere, a bell.")).toEqual([
      { type: "action", text: "The lamp turns. Somewhere, a bell." },
    ]);
  });

  it("is forced by a leading !, so an upper-case line is not a cue", () => {
    const source = "!SCANNING THE HORIZON...\nNo ship tonight.";
    expect(elements(source)).toEqual([
      { type: "action", text: "SCANNING THE HORIZON...\nNo ship tonight." },
    ]);
    expect(types("SCANNING THE HORIZON...\nNo ship tonight.")).toEqual(["character", "dialogue"]);
  });

  it("keeps every line break, and splits at blank lines", () => {
    expect(elements("She waits.\n\nAnd waits.\nLonger than is kind.\nThen longer.")).toEqual([
      { type: "action", text: "She waits." },
      { type: "action", text: "And waits.\nLonger than is kind.\nThen longer." },
    ]);
  });

  it("keeps leading spaces, and turns each tab into four spaces", () => {
    expect(elements("\t\tThe ship is small.\n  Very small.")).toEqual([
      { type: "action", text: "        The ship is small.\n  Very small." },
    ]);
  });

  it("collapses extra blank lines between paragraphs", () => {
    expect(types("One.\n\n\n\nTwo.")).toEqual(["action", "action"]);
  });
});

describe("characters", () => {
  it("is an upper-case line with a blank line before and none after", () => {
    expect(elements("The door opens.\n\nMAYA\nWho's there?")).toEqual([
      { type: "action", text: "The door opens." },
      { type: "character", text: "MAYA" },
      { type: "dialogue", text: "Who's there?" },
    ]);
  });

  it.each([
    ["MAYA (V.O.)", "MAYA (V.O.)"],
    ["MOTHER (O. S.)", "MOTHER (O. S.)"],
    ["TOMÁS (on the radio)", "TOMÁS (on the radio)"],
  ])("takes the extension in %s", (cue, text) => {
    expect(elements(`${cue}\nOver.`)[0]).toEqual({ type: "character", text });
  });

  it("needs a letter in the name: R2D2 is a cue, 23 is not", () => {
    expect(types("R2D2\nBeep.")).toEqual(["character", "dialogue"]);
    expect(types("23\nSkidoo.")).toEqual(["action"]);
  });

  it("is forced by a leading @, keeping mixed case", () => {
    expect(elements("@McCORMACK\nAye.")).toEqual([
      { type: "character", text: "McCORMACK" },
      { type: "dialogue", text: "Aye." },
    ]);
  });

  it("is not a cue with a blank line after it", () => {
    expect(types("THE END")).toEqual(["action"]);
  });

  it("ignores indentation", () => {
    expect(elements("\t\tMAYA\n\t\tWho's there?")).toEqual([
      { type: "character", text: "MAYA" },
      { type: "dialogue", text: "Who's there?" },
    ]);
  });
});

describe("dialogue", () => {
  it("follows a cue, keeping its line breaks", () => {
    expect(elements("KEEPER\nOne flash.\nThen two.")[1]).toEqual({
      type: "dialogue",
      text: "One flash.\nThen two.",
    });
  });

  it("keeps an empty line typed as two spaces", () => {
    expect(elements("KEEPER\nOne flash.\n  \nThen two.")[1]).toEqual({
      type: "dialogue",
      text: "One flash.\n\nThen two.",
    });
  });
});

describe("parentheticals", () => {
  it("follow a cue or dialogue, wrapped in parentheses", () => {
    expect(elements("KEEPER\n(lighting the lamp)\nOne flash.\n(beat)\nThen two.")).toEqual([
      { type: "character", text: "KEEPER" },
      { type: "parenthetical", text: "(lighting the lamp)" },
      { type: "dialogue", text: "One flash." },
      { type: "parenthetical", text: "(beat)" },
      { type: "dialogue", text: "Then two." },
    ]);
  });

  it("may run over several lines until the closing parenthesis", () => {
    expect(elements("KEEPER\n(to the gulls,\nnot unkindly)\nShoo.")[1]).toEqual({
      type: "parenthetical",
      text: "(to the gulls,\nnot unkindly)",
    });
  });
});

describe("dual dialogue", () => {
  it("marks the second cue's speech with a caret", () => {
    expect(elements("MAYA\nLeft.\n\nTOMÁS ^\nRight.")).toEqual([
      { type: "character", text: "MAYA" },
      { type: "dialogue", text: "Left." },
      { type: "character", text: "TOMÁS", dual: true },
      { type: "dialogue", text: "Right." },
    ]);
  });

  it("allows any spaces before the caret, and a forced cue", () => {
    expect(elements("@Tomás    ^\nRight.")[0]).toEqual({
      type: "character",
      text: "Tomás",
      dual: true,
    });
  });
});

describe("lyrics", () => {
  it("are lines forced with ~ and set in italics", () => {
    expect(elements("~Row, row the boat\n~Over the bar")).toEqual([
      {
        type: "action",
        text: "Row, row the boat\nOver the bar",
        italic: [
          [0, 17],
          [18, 30],
        ],
      },
    ]);
  });

  it("are sung dialogue under a cue", () => {
    expect(elements("KEEPER\n~Row, row the boat")[1]).toEqual({
      type: "dialogue",
      text: "Row, row the boat",
      italic: [[0, 17]],
    });
  });
});

describe("transitions", () => {
  it("is upper case, ends in TO:, with blank lines around it", () => {
    expect(elements("Rain.\n\nCUT TO:\n\nINT. LIGHTHOUSE - NIGHT")[1]).toEqual({
      type: "transition",
      text: "CUT TO:",
    });
  });

  it("is forced by a leading >", () => {
    expect(elements(">Fade to grey.")).toEqual([{ type: "transition", text: "Fade to grey." }]);
  });

  it.each([
    ["in lower case", "cut to:", "action"],
    ["with a space after the colon", "CUT TO: ", "action"],
    ["with a leading period", ".CUT TO:", "sceneHeading"],
  ])("is not a transition %s", (_how, line, type) => {
    expect(types(`${line}\n\nRain.`)[0]).toBe(type);
  });

  it("needs a blank line after it", () => {
    expect(types("CUT TO:\nRain.")).not.toContain("transition");
  });
});

describe("centred text", () => {
  it.each([">THE END<", "> THE END <"])("%s is centred action", (line) => {
    expect(elements(line)).toEqual([{ type: "action", text: "THE END", centred: true }]);
  });

  it("can run over several lines", () => {
    expect(elements(">THE END<\n>for now<")).toEqual([
      { type: "action", text: "THE END\nfor now", centred: true },
    ]);
  });
});

describe("emphasis", () => {
  it("is read inside elements", () => {
    expect(elements("KEEPER\nThe *light* is **out**. _Now._")[1]).toEqual({
      type: "dialogue",
      text: "The light is out. Now.",
      italic: [[4, 9]],
      bold: [[13, 16]],
      underline: [[18, 22]],
    });
  });

  it("does not carry across a line break", () => {
    expect(elements("A *strange\nlight* here.")).toEqual([
      { type: "action", text: "A *strange\nlight* here." },
    ]);
  });
});

describe("title page", () => {
  const titlePage = [
    "Title:",
    "    _**SALT LINE**_",
    "    _**A HARBOUR STORY**_",
    "Credit: Written by",
    "Author: Mara Ellison",
    "Source: Based on a story by Tomás Ruiz",
    "Draft date: 26 November 2026",
    "Contact:",
    "\tMara Ellison",
    "\t12 Harbour Row",
    "",
    "EXT. HARBOUR WALL - NIGHT",
  ].join("\n");

  it("reads every field, multi-line values and emphasis-free text", () => {
    const read = readFountain(titlePage);
    expect(read.script.titlePage).toEqual({
      title: "SALT LINE\nA HARBOUR STORY",
      credit: "Written by",
      authors: "Mara Ellison",
      source: "Based on a story by Tomás Ruiz",
      contact: "Mara Ellison\n12 Harbour Row",
      draftDate: "26 November 2026",
      showDraftDate: true,
    });
    expect(read.script.elements).toEqual([
      { type: "sceneHeading", text: "EXT. HARBOUR WALL - NIGHT" },
    ]);
  });

  it("accepts any single field, keys in any case and Authors", () => {
    expect(readFountain("Draft date: 6/23/2012\n\nRain.").script.titlePage.draftDate).toBe(
      "6/23/2012",
    );
    expect(readFountain("TITLE: Salt Line\nAUTHORS: Two People").script.titlePage).toMatchObject({
      title: "Salt Line",
      authors: "Two People",
    });
  });

  it("does not mistake a key named after an object property for a field", () => {
    const read = readFountain("Title: Salt Line\nconstructor: x\n\nRain.");
    expect(read.script.titlePage.title).toBe("Salt Line");
    expect(read.leftOut).toEqual([{ kind: "titlePageField", text: "constructor", at: null }]);
  });

  it("lists unknown fields as left out", () => {
    const read = readFountain("Title: Salt Line\nCopyright: 2026\n\nRain.");
    expect(read.leftOut).toEqual([{ kind: "titlePageField", text: "Copyright", at: null }]);
  });

  it("is absent when the first block is not keys, or names no field Fountain knows", () => {
    expect(readFountain("FADE IN:\n\nRain.").script.titlePage.title).toBe("");
    expect(types("FADE IN:\n\nRain.")).toEqual(["action", "action"]);
    expect(types("LATER: the sun sets.")).toEqual(["action"]);
  });

  it("leaves every field empty and the date hidden without one", () => {
    expect(readFountain("Rain.").script.titlePage).toEqual({
      title: "",
      credit: "",
      authors: "",
      source: "",
      contact: "",
      draftDate: "",
      showDraftDate: false,
    });
  });
});

describe("page breaks", () => {
  it.each(["===", "======"])("%s starts the next element on a new page", (line) => {
    expect(elements(`Rain.\n\n${line}\n\nINT. LIGHTHOUSE - NIGHT`)).toEqual([
      { type: "action", text: "Rain." },
      { type: "sceneHeading", text: "INT. LIGHTHOUSE - NIGHT", pageBreakBefore: true },
    ]);
  });
});

describe("punctuation", () => {
  it("is kept as typed", () => {
    expect(elements(`He said "go" -- then... nothing.`)[0]?.text).toBe(
      `He said "go" -- then... nothing.`,
    );
  });
});

describe("left out: notes, boneyard, sections and synopses", () => {
  it("removes an inline note and reports it at its element", () => {
    const read = readFountain("Rain.\n\nThe lamp [[check the bulb]] turns.");
    expect(read.script.elements[1]).toEqual({ type: "action", text: "The lamp turns." });
    expect(read.leftOut).toEqual([{ kind: "note", text: "check the bulb", at: 1 }]);
  });

  it("keeps private-use text beside actual notes, emphasis and Tir type notes", () => {
    const read = readFountain("\uE000 **\uE001turn** [[keep \uE000 and \uE001]] [[tir:shot]]");
    expect(read.script.elements).toEqual([
      { type: "shot", text: "\uE000 \uE001turn", bold: [[2, 7]] },
    ]);
    expect(read.leftOut).toEqual([{ kind: "note", text: "keep \uE000 and \uE001", at: 0 }]);
  });

  it("leaves notes without an associated body element unlocated", () => {
    expect(readFountain("[[no body]]").leftOut).toEqual([
      { kind: "note", text: "no body", at: null },
    ]);
    expect(readFountain("Title: Rain [[title note]]\n\nWind.").leftOut).toEqual([
      { kind: "note", text: "title note", at: null },
    ]);
  });

  it("removes a note on its own line without splitting a speech", () => {
    const read = readFountain("KEEPER\nOne flash.\n[[louder?]]\nThen two.");
    expect(read.script.elements).toEqual([
      { type: "character", text: "KEEPER" },
      { type: "dialogue", text: "One flash.\nThen two." },
    ]);
    expect(read.leftOut).toEqual([{ kind: "note", text: "louder?", at: 1 }]);
  });

  it("removes a note across lines", () => {
    const read = readFountain("Rain.\n\n[[First line\nsecond line]]\n\nWind.");
    expect(types("Rain.\n\n[[First line\nsecond line]]\n\nWind.")).toEqual(["action", "action"]);
    expect(read.leftOut).toEqual([{ kind: "note", text: "First line\nsecond line", at: 1 }]);
  });

  it("removes boneyard across elements", () => {
    const read = readFountain("Rain.\n\n/*\nINT. CUT SCENE - DAY\n\nGone.\n*/\n\nWind.");
    expect(read.script.elements).toEqual([
      { type: "action", text: "Rain." },
      { type: "action", text: "Wind." },
    ]);
    expect(read.leftOut).toEqual([
      { kind: "boneyard", text: "INT. CUT SCENE - DAY\n\nGone.", at: 1 },
    ]);
  });

  it("removes sections and synopses, reporting each at the element after it", () => {
    const read = readFountain(
      "# Act One\n\n## The harbour\n\n= Maya arrives too late.\n\nEXT. HARBOUR - NIGHT\n\nRain.",
    );
    expect(read.script.elements).toEqual([
      { type: "sceneHeading", text: "EXT. HARBOUR - NIGHT" },
      { type: "action", text: "Rain." },
    ]);
    expect(read.leftOut).toEqual([
      { kind: "section", text: "Act One", at: 0 },
      { kind: "section", text: "The harbour", at: 0 },
      { kind: "synopsis", text: "Maya arrives too late.", at: 0 },
    ]);
  });

  it("reports something after the last element at the last element", () => {
    expect(readFountain("Rain.\n\nWind.\n\n[[end]]").leftOut).toEqual([
      { kind: "note", text: "end", at: 1 },
    ]);
  });
});

describe("Tir's type notes", () => {
  it("set the element's type and are not reported", () => {
    const read = readFountain(".CLOSE ON THE LAMP [[tir:shot]]\n\n!A sign. [[tir:general]]");
    expect(read.script.elements).toEqual<Element[]>([
      { type: "shot", text: "CLOSE ON THE LAMP" },
      { type: "general", text: "A sign." },
    ]);
    expect(read.leftOut).toEqual([]);
  });

  it("start a new element inside a speech", () => {
    expect(elements("KEEPER\nOne.\nTwo. [[tir:dialogue]]")).toEqual([
      { type: "character", text: "KEEPER" },
      { type: "dialogue", text: "One." },
      { type: "dialogue", text: "Two." },
    ]);
  });

  it("give an empty element on a line of their own", () => {
    expect(elements("Rain.\n\n[[tir:sceneHeading]]")[1]).toEqual({
      type: "sceneHeading",
      text: "",
    });
  });
});

describe("files", () => {
  it("reads Windows line endings and a byte order mark", () => {
    expect(elements("\uFEFFKEEPER\r\nOne flash.\r\n")).toEqual([
      { type: "character", text: "KEEPER" },
      { type: "dialogue", text: "One flash." },
    ]);
  });

  it("reads an empty file as an empty script", () => {
    expect(elements("")).toEqual([]);
  });
});
