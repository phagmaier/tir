// Expected matches are worked by hand from the brief ("Find and replace")
// and the rules `find.ts` records: text as the page shows it, an apostrophe
// ending a word, and letters, accents and digits in any script making one.
import { describe, expect, it } from "vitest";
import { type FindQuery, finder } from "./find.ts";
import type { ElementType } from "./model.ts";

const query = (text: string, more: Partial<FindQuery> = {}): FindQuery => ({
  text,
  matchCase: false,
  wholeWord: false,
  ...more,
});
const whole = { wholeWord: true };

/** Where `q` matches `text` in an element of `type`, as offsets into the text as typed. */
function spans(q: FindQuery, text: string, type: ElementType = "action") {
  const find = finder(q);
  if (!find) throw new Error(`No finder for “${q.text}”`);
  return find(type, text);
}

it("an empty query finds nothing", () => {
  expect(finder(query(""))).toBeNull();
});

describe("characters special in a regular expression match themselves", () => {
  it.each<[string, string, [number, number][]]>([
    ["(V.O.)", "ELLIS (V.O.)", [[6, 12]]],
    ["$5.00?", "It costs $5.00? No.", [[9, 15]]],
    ["a+b", "a+b aab", [[0, 3]]],
    ["[x]", "[x] x", [[0, 3]]],
    ["\\d", "\\d 5", [[0, 2]]],
    ["^|.", "a^|.", [[1, 4]]],
    ["{2}", "a{2}", [[1, 4]]],
    ["and/or", "this and/or that", [[5, 11]]],
    // Escaping "-" would be an error in a Unicode expression.
    ["-", "INT. HOUSE - DAY", [[11, 12]]],
    [".", "a.b", [[1, 2]]],
  ])("%s", (text, script, expected) => {
    expect(spans(query(text), script)).toEqual(expected);
  });
});

describe("match case", () => {
  it("off, finds any capitals", () => {
    expect(spans(query("ellis"), "ELLIS and Ellis")).toEqual([
      [0, 5],
      [10, 15],
    ]);
  });

  it("on, finds the capitals typed", () => {
    expect(spans(query("Ellis", { matchCase: true }), "ELLIS and Ellis")).toEqual([[10, 15]]);
  });

  it("on, compares the capitals the page shows, not the text as typed", () => {
    const caps = query("ELLIS", { matchCase: true });
    expect(spans(caps, "ellis (v.o.)", "character")).toEqual([[0, 5]]);
    expect(spans(caps, "ellis", "action")).toEqual([]);
    expect(spans(query("ellis", { matchCase: true }), "ellis", "character")).toEqual([]);
  });

  it("keeps “ß”, whose capital is longer, as the page does", () => {
    expect(spans(query("STRAßE", { matchCase: true }), "straße", "sceneHeading")).toEqual([[0, 6]]);
    expect(spans(query("STRASSE", { matchCase: true }), "straße", "sceneHeading")).toEqual([]);
  });
});

describe("whole word next to apostrophes", () => {
  it("an apostrophe ends a word, straight or curly", () => {
    const text = "ELLIS'S boat. ELLIS’ oars. ELLISON.";
    expect(spans(query("ELLIS", whole), text)).toEqual([
      [0, 5],
      [14, 19],
    ]);
    expect(spans(query("don", whole), "I don't.")).toEqual([[2, 5]]);
  });

  it("a straight apostrophe in the query finds a curly one, and the other way round", () => {
    expect(spans(query("Ellis's", whole), "Ellis’s oar")).toEqual([[0, 7]]);
    expect(spans(query("Ellis’s", whole), "Ellis's oar")).toEqual([[0, 7]]);
  });
});

describe("whole word next to letters beyond ASCII", () => {
  it("an accented letter continues a word", () => {
    expect(spans(query("Tom"), "Tomás, TOMÁS and Tom.")).toEqual([
      [0, 3],
      [7, 10],
      [17, 20],
    ]);
    expect(spans(query("Tom", whole), "Tomás, TOMÁS and Tom.")).toEqual([[17, 20]]);
    expect(spans(query("Tomás", whole), "¿Tomás?")).toEqual([[1, 6]]);
  });

  it("a combining accent continues a word", () => {
    expect(spans(query("Toma", whole), "Toma\u0301s")).toEqual([]);
  });

  it("letters of other scripts, and digits, make words", () => {
    expect(spans(query("Иван", whole), "Иван, Иванов")).toEqual([[0, 4]]);
    expect(spans(query("R2", whole), "R2D2 R2")).toEqual([[5, 7]]);
  });

  it("a letter outside the Basic Multilingual Plane continues a word", () => {
    // "𝒜" is two UTF-16 code units.
    expect(spans(query("bc", whole), "𝒜bc bc")).toEqual([[5, 7]]);
  });

  it("a word refused does not hide one starting inside it", () => {
    expect(spans(query("aa", whole), "aaa aa")).toEqual([[4, 6]]);
  });

  it("a query starting with punctuation needs no space before it", () => {
    expect(spans(query("(V.O.)", whole), "ELLIS (V.O.)", "character")).toEqual([[6, 12]]);
  });
});
