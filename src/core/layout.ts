/**
 * Line layout: where each line of an element falls (architecture, design
 * rule 1). The browser never wraps script text; the editor, the PDF and
 * pagination all take their line breaks from here. Courier is fixed-pitch,
 * so layout is character arithmetic: every character (grapheme) is one cell
 * of 1/10 inch.
 */
import {
  CHARS_PER_INCH,
  type Column,
  DUAL_FORMATS,
  ELEMENT_FORMATS,
  type ElementFormat,
  type SpeechType,
} from "./format.ts";
import { ELEMENT_TYPES, type Element } from "./model.ts";

export interface Line {
  /** The stretch of the element's text this line shows, as UTF-16 offsets. */
  readonly start: number;
  readonly end: number;
  /** What the line shows: its text, in capitals where the element calls for them. */
  readonly text: string;
  /** Where the line's first character sits, in inches from the page's left edge. */
  readonly x: number;
}

export interface Layout {
  /** Blank lines above the element. */
  readonly spaceBefore: number;
  /** At least one line; an empty element is one empty line. */
  readonly lines: readonly Line[];
}

/**
 * Lays out one element. A speech in dual dialogue passes its column: the
 * speech before a dual cue is the left column, the dual cue's speech the
 * right.
 */
export function layoutElement(element: Element, column?: Column): Layout {
  const fmt = formatFor(element, column);
  const lines: Line[] = [];
  let offset = 0;
  for (const paragraph of element.text.split("\n")) {
    for (const [start, end] of wrap(paragraph, lines.length === 0, fmt)) {
      lines.push(
        place(element.text, offset + start, offset + end, lines.length === 0, fmt, element),
      );
    }
    offset += paragraph.length + 1;
  }
  return { spaceBefore: fmt.spaceBefore, lines };
}

/**
 * Remembers element layouts from one pagination to the next, so paginating
 * again after an edit lays out only the text the edit changed. It keeps the
 * layouts the previous run used and drops the rest at each new run, so it
 * holds at most two runs' worth.
 */
export class LayoutCache {
  // One map from text to layout for each way of setting text: element type,
  // column and centring.
  private current: Map<string, Layout>[] = [];
  private previous: Map<string, Layout>[] = [];

  /** Starts a run: after it, only the layouts this run used are kept. */
  startRun(): void {
    this.previous = this.current;
    this.current = [];
  }

  /** `layoutElement`, remembered by everything a layout depends on. */
  layout(element: Element, column?: Column): Layout {
    const columnCode = column === "left" ? 1 : column === "right" ? 2 : 0;
    const format =
      (ELEMENT_TYPES.indexOf(element.type) * 3 + columnCode) * 2 + (element.centred ? 1 : 0);
    let texts = this.current[format];
    if (!texts) {
      texts = new Map();
      this.current[format] = texts;
    }
    let layout = texts.get(element.text);
    if (!layout) {
      layout = this.previous[format]?.get(element.text) ?? layoutElement(element, column);
      texts.set(element.text, layout);
    }
    return layout;
  }
}

function formatFor(element: Element, column: Column | undefined): ElementFormat {
  const type = element.type;
  if (column && (type === "character" || type === "parenthetical" || type === "dialogue")) {
    return DUAL_FORMATS[column][type as SpeechType];
  }
  return ELEMENT_FORMATS[type];
}

/**
 * Breaks one paragraph (text between "\n"s) into lines, as [start, end)
 * offsets into it. Lines break at spaces, which belong to neither line, or
 * after a hyphen inside a word. A hyphen ending a line may hang one
 * character past the line's width, as in Final Draft (findings, "Line
 * widths"). A word longer than a line breaks where the line is full.
 */
function wrap(paragraph: string, firstOfElement: boolean, fmt: ElementFormat): [number, number][] {
  const cells = graphemeStarts(paragraph);
  const count = cells ? cells.length - 1 : paragraph.length;
  const at = (cell: number) => (cells ? (cells[cell] as number) : cell);
  const char = (cell: number) => paragraph[at(cell)];
  const isSpace = (cell: number) => char(cell) === " " || char(cell) === "\t";
  /** A break may follow this cell: a hyphen with a word on both sides ("well-known", "bottle--only"). */
  const hyphenBreak = (cell: number) =>
    char(cell) === "-" &&
    cell > 0 &&
    cell + 1 < count &&
    !isSpace(cell - 1) &&
    !isSpace(cell + 1) &&
    char(cell + 1) !== "-";

  const lines: [number, number][] = [];
  let first = firstOfElement;
  let i = 0;
  while (lines.length === 0 || i < count) {
    const width = Math.max(1, first ? fmt.firstWidth : fmt.width);
    first = false;
    // A hyphen ending a line may hang one character past the width.
    if (count - i <= width || (count - i === width + 1 && char(count - 1) === "-")) {
      lines.push([at(i), at(count)]);
      break;
    }
    // The furthest break: at a space, or after a hyphen inside a word, with
    // the line no longer than the width, or one longer if it ends in a hyphen.
    let end = i + width;
    let next = end;
    for (let p = i + width + 1; p > i; p--) {
      const fits = p <= i + width || char(p - 1) === "-";
      if (fits && isSpace(p)) {
        end = p;
        while (end > i && isSpace(end - 1)) end--;
        next = p;
        break;
      }
      if (p - 1 > i && hyphenBreak(p - 1)) {
        end = p;
        next = p;
        break;
      }
    }
    lines.push([at(i), at(end)]);
    i = next;
    while (i < count && isSpace(i)) i++;
  }
  return lines;
}

// Marks, joiners, variation selectors and characters beyond the Basic
// Multilingual Plane need real grapheme segmentation; everything else is one
// code unit per character.
const COMPLEX = /\p{M}|\u200D|\uFE0E|\uFE0F|[\uD800-\uDFFF]|[\u{10000}-\u{10FFFF}]/u;
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * The UTF-16 offset where each grapheme starts, then the text's length; or
 * null when every code unit is its own character.
 */
export function graphemeStarts(text: string): number[] | null {
  if (!COMPLEX.test(text)) return null;
  const starts = Array.from(segmenter.segment(text), (segment) => segment.index);
  starts.push(text.length);
  return starts;
}

/** Characters in `text` as the engine counts them: graphemes, each one cell of the line. */
export function graphemeCount(text: string): number {
  const starts = graphemeStarts(text);
  return starts ? starts.length - 1 : text.length;
}

/** Expand pasted title-page tabs to eight-cell stops before aligning a field. */
export function expandTitleTabs(text: string): string {
  if (!text.includes("\t")) return text;
  return text.replace(/[^\t\n]*\t|[^\t\n]+/g, (part) => {
    if (!part.endsWith("\t")) return part;
    const before = part.slice(0, -1);
    // The preceding tab, or the start of the line, was on a tab stop.
    return before + " ".repeat(8 - (graphemeCount(before) % 8));
  });
}

function place(
  text: string,
  start: number,
  end: number,
  firstOfElement: boolean,
  fmt: ElementFormat,
  element: Element,
): Line {
  const shown = fmt.capitals ? capitals(text.slice(start, end)) : text.slice(start, end);
  const left = fmt.left + (firstOfElement ? fmt.firstIndent : 0);
  const visible = graphemeCount(shown.trimEnd());
  let x = left;
  if (element.centred || fmt.align === "centre") {
    x = left + (fmt.right - left - visible / CHARS_PER_INCH) / 2;
  } else if (fmt.align === "right") {
    x = fmt.right - visible / CHARS_PER_INCH;
  }
  // Round away floating-point dust: 7.1 - 0.7 is 6.3999999999999995.
  return { start, end, text: shown, x: Math.round(x * 1e6) / 1e6 };
}

/**
 * Upper case, character by character, keeping any character whose capital
 * would change the text's length ("ß" would become "SS"), so offsets and
 * widths still match the text.
 */
export function capitals(text: string): string {
  const upper = text.toUpperCase();
  // No character's capital is shorter, so equal lengths mean none is kept.
  if (upper.length === text.length) return upper;
  let out = "";
  for (const char of text) out += keepsCase(char) ? char : char.toUpperCase();
  return out;
}

/** Whether capitals leave this character (code point) as typed: its capital is longer. */
export function keepsCase(char: string): boolean {
  return char.toUpperCase().length !== char.length;
}
