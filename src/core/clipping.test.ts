/**
 * The clipboard's three forms (brief, "Copy and paste"): Fountain for other
 * applications, Fountain read from them, and Tir's own form within Tir.
 * Expected Fountain follows fountain.io/syntax and Tir's writer (architecture,
 * "Fountain"), worked by hand.
 */
import { describe, expect, test } from "vitest";
import {
  type Clipping,
  clippingFromFountain,
  clippingToFountain,
  readClipping,
  writeClipping,
} from "./clipping.ts";
import type { Element, ElementType } from "./model.ts";

const element =
  (type: ElementType) =>
  (text: string, extra: Omit<Element, "type" | "text"> = {}): Element => ({ type, text, ...extra });
const heading = element("sceneHeading");
const action = element("action");
const cue = element("character");
const paren = element("parenthetical");
const dialogue = element("dialogue");
const transition = element("transition");
const shot = element("shot");

const elements = (...list: Element[]): Clipping => ({
  elements: list,
  openStart: false,
  openEnd: false,
});
const text = (piece: Element): Clipping => ({ elements: [piece], openStart: true, openEnd: true });

describe("text from another application is read as Fountain", () => {
  test.each<[string, string, Clipping]>([
    [
      "a scene arrives as its elements",
      "INT. HARBOUR OFFICE - NIGHT\n\nRain hammers the glass.\n\nMARA\n(quietly)\nWe sail at dawn.\n\nCUT TO:\n",
      elements(
        heading("INT. HARBOUR OFFICE - NIGHT"),
        action("Rain hammers the glass."),
        cue("MARA"),
        paren("(quietly)"),
        dialogue("We sail at dawn."),
        transition("CUT TO:"),
      ),
    ],
    [
      "a line of prose is text, for the element at the caret",
      "She waits by the door.",
      text(action("She waits by the door.")),
    ],
    [
      "lines of prose with no blank line between are one paragraph, so text",
      "It was late.\nNobody came.",
      text(action("It was late.\nNobody came.")),
    ],
    [
      "paragraphs of prose are action elements",
      "It was late.\n\nNobody came.\n",
      elements(action("It was late."), action("Nobody came.")),
    ],
    [
      "a lone scene heading is an element",
      "EXT. PIER - DAWN",
      elements(heading("EXT. PIER - DAWN")),
    ],
    [
      "a title page is script, so a paste never sets one",
      "Title: Salt Line\nAuthor: Mara Ellison\n\nINT. HOUSE - DAY",
      elements(action("Title: Salt Line\nAuthor: Mara Ellison"), heading("INT. HOUSE - DAY")),
    ],
    [
      "notes, boneyard, sections and synopses are left out, as an import leaves them",
      "# Act One\n\n= The storm comes.\n\nINT. HOUSE - DAY\n\nMara waits. [[check this]]\n\n/* She runs. */\n",
      elements(heading("INT. HOUSE - DAY"), action("Mara waits.")),
    ],
    [
      "centred text, a forced break, dual dialogue, emphasis and Tir's type notes",
      "===\n\n>THE END<\n\nMAYA\nSix.\n\nTOMÁS ^\n**Seven.**\n\n.CLOSE ON THE LAMP [[tir:shot]]",
      elements(
        action("THE END", { centred: true, pageBreakBefore: true }),
        cue("MAYA"),
        dialogue("Six."),
        cue("TOMÁS", { dual: true }),
        dialogue("Seven.", { bold: [[0, 6]] }),
        shot("CLOSE ON THE LAMP"),
      ),
    ],
    ["nothing but blank lines holds nothing", "\n  \n\n", elements()],
  ])("%s", (_name, fountain, expected) => {
    expect(clippingFromFountain(fountain)).toEqual(expected);
  });
});

describe("a copy gives other applications Fountain", () => {
  test.each<[string, Clipping, string]>([
    [
      "a scene, each element as Fountain infers it",
      elements(
        heading("INT. HARBOUR OFFICE - NIGHT"),
        action("Rain hammers the glass."),
        cue("MARA"),
        paren("(quietly)"),
        dialogue("We sail at dawn."),
        transition("CUT TO:"),
      ),
      "INT. HARBOUR OFFICE - NIGHT\n\nRain hammers the glass.\n\nMARA\n(quietly)\nWe sail at dawn.\n\nCUT TO:",
    ],
    [
      "elements Fountain would misread, forced",
      elements(cue("mara"), dialogue("Hi."), action("INT. is short for interior.")),
      "@mara\nHi.\n\n!INT. is short for interior.",
    ],
    [
      "styles, centring, a forced break and dual dialogue",
      elements(
        cue("MAYA"),
        dialogue("Six."),
        cue("TOMÁS", { dual: true }),
        dialogue("Seven.", { bold: [[0, 6]] }),
        action("THE END", { centred: true, pageBreakBefore: true }),
      ),
      "MAYA\nSix.\n\nTOMÁS ^\n**Seven.**\n\n===\n\n>THE END<",
    ],
    [
      "a shot, which Fountain lacks, with Tir's type note",
      elements(shot("CLOSE ON THE LAMP")),
      ".CLOSE ON THE LAMP [[tir:shot]]",
    ],
    [
      "parts of elements, each as an element of its type",
      { elements: [action("alls."), cue("MA")], openStart: true, openEnd: true },
      "alls.\n\n@MA",
    ],
    ["text from within an element, without element syntax", text(cue("ARA")), "ARA"],
    [
      "text with emphasis and characters Fountain would read as emphasis",
      text(action("the gate, 5*3", { italic: [[4, 8]] })),
      "the *gate*, 5\\*3",
    ],
  ])("%s", (_name, clipping, fountain) => {
    expect(clippingToFountain(clipping)).toBe(fountain);
  });

  test("and reading that Fountain back gives the same elements", () => {
    const scene = elements(
      heading("INT. HARBOUR OFFICE - NIGHT", { pageBreakBefore: true }),
      action("Rain hammers the glass.", { underline: [[0, 4]] }),
      cue("MAYA"),
      paren("(quietly)"),
      dialogue("Six."),
      cue("TOMÁS", { dual: true }),
      dialogue("Seven."),
      shot("CLOSE ON THE LAMP"),
      action("THE END", { centred: true }),
    );
    expect(clippingFromFountain(clippingToFountain(scene))).toEqual(scene);
  });
});

describe("within Tir the clipboard carries the clipping itself", () => {
  test("which reads back exactly, open ends, styles and formats included", () => {
    const clipping: Clipping = {
      elements: [
        dialogue("ight.", { centred: true }),
        cue("TOMÁS", { dual: true }),
        dialogue("Seven.", { bold: [[0, 5]], italic: [[2, 6]] }),
        action("THE", { pageBreakBefore: true, underline: [[0, 3]] }),
      ],
      openStart: true,
      openEnd: true,
    };
    expect(readClipping(writeClipping(clipping))).toEqual(clipping);
  });

  test.each([
    ["nothing, as when another application copied", ""],
    ["text that is not JSON", "MARA\nHi."],
    ["another format", '{"format":"tir-draft","version":1,"elements":[]}'],
    [
      "a newer version",
      '{"format":"tir-clipping","version":2,"openStart":false,"openEnd":false,"elements":[{"type":"action","text":"A"}]}',
    ],
    [
      "an unknown element type",
      '{"format":"tir-clipping","version":1,"openStart":false,"openEnd":false,"elements":[{"type":"lyric","text":"A"}]}',
    ],
    [
      "dual dialogue on an action",
      '{"format":"tir-clipping","version":1,"openStart":false,"openEnd":false,"elements":[{"type":"action","text":"A","dual":true}]}',
    ],
    [
      "no open ends",
      '{"format":"tir-clipping","version":1,"elements":[{"type":"action","text":"A"}]}',
    ],
    [
      "no elements",
      '{"format":"tir-clipping","version":1,"openStart":false,"openEnd":false,"elements":[]}',
    ],
  ])("and refuses %s, so a paste reads the text instead", (_name, data) => {
    expect(readClipping(data)).toBeNull();
  });
});
