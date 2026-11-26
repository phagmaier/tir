import { describe, expect, it } from "vitest";
import { readDraft, writeDraft } from "./draft-file.ts";
import { everyFormat } from "./fixtures/scripts.ts";
import type { Script } from "./model.ts";

const small: Script = {
  titlePage: {
    title: "Salt Line",
    credit: "Written by",
    authors: "Mara Ellison",
    source: "",
    contact: "",
    draftDate: "",
    showDraftDate: false,
  },
  elements: [
    { type: "sceneHeading", text: "INT. HARBOUR OFFICE - NIGHT", pageBreakBefore: true },
    { type: "action", text: "The gate is locked.", bold: [[12, 18]], centred: true },
    { type: "character", text: "TOMÁS", dual: true },
    { type: "dialogue", text: "Line one\nline two" },
  ],
};

// Written by hand: the format a git diff shows, one element per line.
const smallFile = `{
  "format": "tir-draft",
  "version": 1,
  "titlePage": {
    "title": "Salt Line",
    "credit": "Written by",
    "authors": "Mara Ellison",
    "source": "",
    "contact": "",
    "draftDate": "",
    "showDraftDate": false
  },
  "elements": [
    {"type":"sceneHeading","text":"INT. HARBOUR OFFICE - NIGHT","pageBreakBefore":true},
    {"type":"action","text":"The gate is locked.","bold":[[12,18]],"centred":true},
    {"type":"character","text":"TOMÁS","dual":true},
    {"type":"dialogue","text":"Line one\\nline two"}
  ]
}
`;

function expectRefused(text: string, ...phrases: string[]): void {
  const result = readDraft(text);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  for (const phrase of phrases) expect(result.error).toContain(phrase);
}

/** A valid file as plain data, for building damaged variants. */
function validData(): Record<string, unknown> {
  return JSON.parse(writeDraft(small));
}

function withElement(element: unknown): string {
  return JSON.stringify({ ...validData(), elements: [element] });
}

describe("writeDraft", () => {
  it("writes the documented format with keys in a fixed order", () => {
    expect(writeDraft(small)).toBe(smallFile);
  });

  it("writes an empty script with an empty element list", () => {
    const text = writeDraft({ titlePage: small.titlePage, elements: [] });
    expect(text).toContain('"elements": []\n}');
    expect(readDraft(text)).toEqual({ ok: true, script: { ...small, elements: [] } });
  });

  it("writes spans in canonical form", () => {
    const text = writeDraft({
      titlePage: small.titlePage,
      elements: [
        {
          type: "action",
          text: "abcdefghij",
          italic: [
            [5, 8],
            [0, 3],
            [2, 4],
          ],
        },
      ],
    });
    expect(text).toContain('{"type":"action","text":"abcdefghij","italic":[[0,4],[5,8]]}');
  });

  it("keeps an element with line or paragraph separators on one line", () => {
    const script: Script = {
      titlePage: small.titlePage,
      elements: [{ type: "action", text: "one\u2028two\u2029three" }],
    };
    const text = writeDraft(script);
    const lines = text.split(/\r?\n|\u2028|\u2029/).filter((line) => line.includes("one"));
    expect(lines).toEqual(['    {"type":"action","text":"one\\u2028two\\u2029three"}']);
    expect(readDraft(text)).toEqual({ ok: true, script });
  });

  it("refuses to write a draft it could not read back", () => {
    const broken: Script = {
      titlePage: small.titlePage,
      elements: [{ type: "action", text: "short", bold: [[2, 9]] }],
    };
    expect(() => writeDraft(broken)).toThrow(/could not read back.*element 1/);
  });
});

describe("readDraft", () => {
  it("reads the documented format", () => {
    expect(readDraft(smallFile)).toEqual({ ok: true, script: small });
  });

  it("round-trips every element type and format unchanged", () => {
    expect(readDraft(writeDraft(everyFormat))).toEqual({ ok: true, script: everyFormat });
  });

  it("puts spans it reads in canonical form", () => {
    const text = withElement({
      type: "action",
      text: "abcdefghij",
      bold: [
        [4, 6],
        [0, 5],
      ],
    });
    const result = readDraft(text);
    expect(result.ok && result.script.elements[0]).toEqual({
      type: "action",
      text: "abcdefghij",
      bold: [[0, 6]],
    });
  });

  describe("refuses a file from a newer version of Tir", () => {
    it("naming both versions", () => {
      expectRefused(
        JSON.stringify({ ...validData(), version: 2 }),
        "newer version of Tir",
        "format 2",
        "format 1",
      );
    });

    it("even when it holds fields this version does not know", () => {
      expectRefused(
        JSON.stringify({ ...validData(), version: 3, scenes: [], elements: "elsewhere" }),
        "newer version of Tir",
      );
    });
  });

  it.each([
    ["an empty file", "", "not complete JSON"],
    ["a truncated file", writeDraft(everyFormat).slice(0, 400), "not complete JSON"],
    ["a JSON array", "[]", "not a Tir draft"],
    ["another JSON file", JSON.stringify({ name: "Salt Line" }), "not a Tir draft"],
    ["a missing version", JSON.stringify({ ...validData(), version: undefined }), "version"],
    ["a version as text", JSON.stringify({ ...validData(), version: "1" }), "version"],
    ["a version of 0", JSON.stringify({ ...validData(), version: 0 }), "version"],
    ["a fractional version", JSON.stringify({ ...validData(), version: 1.5 }), "version"],
    ["an unknown field", JSON.stringify({ ...validData(), notes: [] }), 'unexpected field "notes"'],
    ["a missing title page", JSON.stringify({ ...validData(), titlePage: null }), "title page"],
    [
      "a title page field of the wrong kind",
      JSON.stringify({ ...validData(), titlePage: { ...small.titlePage, title: 7 } }),
      'title page\'s "title"',
    ],
    [
      "a missing title page field",
      JSON.stringify({ ...validData(), titlePage: { ...small.titlePage, contact: undefined } }),
      'title page\'s "contact"',
    ],
    [
      "an unknown title page field",
      JSON.stringify({ ...validData(), titlePage: { ...small.titlePage, logo: "x" } }),
      'unexpected field "logo"',
    ],
    ["a missing element list", JSON.stringify({ ...validData(), elements: {} }), "element list"],
    ["an element that is not an object", withElement("MAYA"), "element 1"],
    ["an unknown element type", withElement({ type: "lyric", text: "la" }), 'type "lyric"'],
    ["element text that is not text", withElement({ type: "action", text: 4 }), "element 1"],
    ["missing element text", withElement({ type: "action" }), "element 1"],
    [
      "a span past the end of the text",
      withElement({ type: "action", text: "short", bold: [[2, 9]] }),
      "element 1",
      "bold",
    ],
    [
      "an empty span",
      withElement({ type: "action", text: "short", italic: [[2, 2]] }),
      "element 1",
      "italic",
    ],
    [
      "a span that is not a pair of whole numbers",
      withElement({ type: "action", text: "short", underline: [[0.5, 2]] }),
      "underline",
    ],
    ["spans that are not a list", withElement({ type: "action", text: "x", bold: 1 }), "bold"],
    [
      "a flag that is not true",
      withElement({ type: "action", text: "x", centred: false }),
      '"centred"',
    ],
    [
      "dual dialogue on an element that is not a cue",
      withElement({ type: "dialogue", text: "x", dual: true }),
      "dual",
      "character cue",
    ],
    [
      "an unknown element field",
      withElement({ type: "action", text: "x", colour: "red" }),
      'unexpected field "colour"',
    ],
  ])("refuses %s", (_name, text, ...phrases) => {
    expectRefused(text, ...phrases);
  });

  it("refuses rather than partly loading a file damaged late on", () => {
    const data = JSON.parse(writeDraft(everyFormat));
    data.elements[data.elements.length - 1].type = "unknown";
    const result = readDraft(JSON.stringify(data));
    expect(result).toEqual({ ok: false, error: expect.stringContaining("element 15") });
  });
});
