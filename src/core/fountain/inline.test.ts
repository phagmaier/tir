import { describe, expect, it } from "vitest";
import { type Span, STYLES } from "../model.ts";
import { parseInline, type StyledText, writeInline } from "./inline.ts";

function styled(text: string, spans: Partial<Omit<StyledText, "text">> = {}): StyledText {
  return { text, bold: [], italic: [], underline: [], ...spans };
}

describe("parseInline: the spec's emphasis examples", () => {
  it.each([
    ["*italics*", styled("italics", { italic: [[0, 7]] })],
    ["**bold**", styled("bold", { bold: [[0, 4]] })],
    ["***bold italics***", styled("bold italics", { bold: [[0, 12]], italic: [[0, 12]] })],
    ["_underline_", styled("underline", { underline: [[0, 9]] })],
    // "Steel enters the code on the keypad: **\*9765\***"
    ["code: **\\*9765\\***", styled("code: *9765*", { bold: [[6, 12]] })],
    // Spaces around the delimiters decide whether they pair.
    [
      "He dialed *69 and then *23, and then hung up.",
      styled("He dialed *69 and then *23, and then hung up."),
    ],
    [
      "He dialed *69 and then 23*, and then hung up.",
      styled("He dialed 69 and then 23, and then hung up.", { italic: [[10, 24]] }),
    ],
    [
      "He dialed *69 and then 23\\*, and then hung up.",
      styled("He dialed *69 and then 23*, and then hung up."),
    ],
  ])("%s", (line, expected) => {
    expect(parseInline(line)).toEqual(expected);
  });
});

describe("parseInline: combinations and escapes", () => {
  it.each([
    ["_**bold underline**_", styled("bold underline", { bold: [[0, 14]], underline: [[0, 14]] })],
    [
      "*italic **both** italic*",
      styled("italic both italic", { bold: [[7, 11]], italic: [[0, 18]] }),
    ],
    ["**a*b***", styled("ab", { bold: [[0, 2]], italic: [[1, 2]] })],
    ["an * alone and _ alone", styled("an * alone and _ alone")],
    ["**unclosed bold", styled("**unclosed bold")],
    ["a\\\\b \\_c\\_ \\[\\[", styled("a\\b _c_ [[")],
    ["C:\\Users stays", styled("C:\\Users stays")],
    ["Tomás *dijo* «sí»", styled("Tomás dijo «sí»", { italic: [[6, 10]] })],
  ])("%s", (line, expected) => {
    expect(parseInline(line)).toEqual(expected);
  });
});

describe("writeInline", () => {
  it.each([
    [styled("plain text"), "plain text"],
    [styled("bold word", { bold: [[0, 4]] }), "**bold** word"],
    [styled("both", { bold: [[0, 4]], italic: [[0, 4]] }), "***both***"],
    [styled("under it", { underline: [[0, 8]], bold: [[6, 8]] }), "_under **it**_"],
    [styled("a*b_c\\d [[x]]"), "a\\*b\\_c\\\\d \\[\\[x]]"],
    // "/" then a bold marker would read as the start of boneyard.
    [styled("and/or", { bold: [[4, 6]] }), "and\\/**or**"],
    // Whitespace at a span's edge stays outside its markers.
    [styled("say it now", { bold: [[3, 7]] }), "say **it** now"],
    // Underline and bold crossing at a word boundary.
    [
      styled("under both bold", { underline: [[0, 10]], bold: [[6, 15]] }),
      "_under **both**_ **bold**",
    ],
  ])("writes %j", (input, expected) => {
    expect(writeInline(input)).toBe(expected);
  });
});

// A seeded generator keeps failures reproducible.
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Each non-space character's styles, as "3d:bi" strings. */
function visibleStyles(styled: StyledText): string[] {
  return [...styled.text].flatMap((char, i) =>
    /\s/.test(char)
      ? []
      : [
          `${i}${char}:${STYLES.filter((style) =>
            styled[style].some(([start, end]) => start <= i && i < end),
          )
            .map((style) => style[0])
            .join("")}`,
        ],
  );
}

const pick = <T>(next: () => number, items: readonly T[]): T =>
  items[Math.floor(next() * items.length)] as T;

describe("writeInline then parseInline", () => {
  it("keeps the text and every visible character's styles when styles cover whole words", () => {
    const next = random(20261126);
    for (let round = 0; round < 3000; round++) {
      const words = Array.from({ length: 1 + Math.floor(next() * 6) }, () =>
        Array.from({ length: 1 + Math.floor(next() * 4) }, () =>
          pick(next, [..."abé*_\\[]!.#"]),
        ).join(""),
      );
      let text = "";
      const bounds: Span[] = [];
      for (const word of words) {
        if (text) text += pick(next, [" ", " ", "  "]);
        bounds.push([text.length, text.length + word.length]);
        text += word;
      }
      const input = styled(text);
      for (const style of STYLES) {
        for (let k = Math.floor(next() * 3); k > 0; k--) {
          const a = Math.floor(next() * bounds.length);
          const b = Math.floor(next() * bounds.length);
          const first = bounds[Math.min(a, b)] as Span;
          const last = bounds[Math.max(a, b)] as Span;
          input[style].push([first[0], last[1]]);
        }
      }
      const written = writeInline(input);
      const parsed = parseInline(written);
      expect({ written, text: parsed.text, styles: visibleStyles(parsed) }).toEqual({
        written,
        text,
        styles: visibleStyles(input),
      });
    }
  });

  it("always keeps the text exactly, wherever styles start and end", () => {
    const next = random(42);
    for (let round = 0; round < 3000; round++) {
      const length = 1 + Math.floor(next() * 14);
      const text = Array.from({ length }, () => pick(next, [..."ab cdé *_\\[]!."])).join("");
      const input = styled(text);
      for (const style of STYLES) {
        for (let k = Math.floor(next() * 3); k > 0; k--) {
          const a = Math.floor(next() * (length + 1));
          const b = Math.floor(next() * (length + 1));
          if (a !== b) input[style].push([Math.min(a, b), Math.max(a, b)]);
        }
      }
      const written = writeInline(input);
      expect({ written, text: parseInline(written).text }).toEqual({ written, text });
    }
  });
});
