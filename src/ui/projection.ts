/**
 * The layout engine's output, projected onto the ProseMirror document
 * (architecture, design rule 1). Each element is a paragraph whose `block`
 * (the space above it and its first line's indent) the editor sets as a
 * style; each later line starts after a decoration on the previous line's
 * last character that ends the line, plus an indent where that line's
 * differs. Decorations sit on single characters, so styled text, whose marks
 * split a line into several DOM nodes, cannot split a line. Where an element
 * calls for capitals, which the editor shows with CSS, a decoration keeps
 * each character whose capital is longer as typed, as the engine does. What
 * a sheet prints that no element holds (page numbers, (MORE), repeated cues
 * and the automatic (CONT'D)) is in `sheets`, for drawing outside the
 * editable text, and `map` holds the scenes and where each page starts.
 *
 * `apply` follows each edit: the engine paginates the whole script again
 * (reusing unchanged elements' layouts), and only elements whose lines or
 * block changed get new decorations or styles. Creating a decoration set
 * costs time for every element times every decoration, so the set is made
 * once and then mapped and patched (findings, "Editor").
 */
import type { Node } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import {
  CHARS_PER_INCH,
  type Column,
  ELEMENT_FORMATS,
  LINES_PER_INCH,
  PAGE,
} from "../core/format.ts";
import { keepsCase, LayoutCache } from "../core/layout.ts";
import type { ElementType } from "../core/model.ts";
import { type Page, pageLabel, paginate } from "../core/paginate.ts";
import { ScriptMap } from "../core/script-map.ts";
import { fromDocument } from "./editor-model.ts";

export const ROW_PX = 96 / LINES_PER_INCH;
export const SHEET_PX = PAGE.heightIn * 96;
export const GUTTER_PX = 30;
export const PITCH_PX = SHEET_PX + GUTTER_PX;

/** Where an element's paragraph sits. */
export interface Block {
  /** Pixels from the previous element's last line to this one's first; negative beside it. */
  readonly gap: number;
  /** The first line's indent, in inches from the page's left edge. */
  readonly x: number;
  /** The column of dual dialogue the element sits in, if any. */
  readonly column?: Column;
  /** Pixels the paragraph reaches below its last line, beside a longer column. */
  readonly below?: number;
}

/** Text a sheet prints that no element holds. */
export interface Printed {
  readonly text: string;
  /** Pixels from the sheet's top edge to the text's row. */
  readonly top: number;
  /** Inches from the sheet's left edge. */
  readonly x: number;
}

/** One page as a sheet of paper. */
export interface Sheet {
  /** The page number shown at the top right; none on page 1. */
  readonly label: string | null;
  /** (MORE), repeated cues and automatic (CONT'D)s. */
  readonly printed: readonly Printed[];
}

interface Placement {
  readonly block: Block;
  /**
   * For each line after the first: its start offset, its indent (in), the
   * pixels above it, and where the line before it ends.
   */
  readonly breaks: readonly number[];
}

/** An element whose block changed. */
export interface Restyle {
  readonly index: number;
  /**
   * Where it started in the previous document, when it is the same node as
   * before, so its paragraph can be restyled before ProseMirror redraws.
   * Without it, the element's node view sets the style as it is drawn.
   */
  readonly before?: number;
}

export class Projection {
  doc!: Node;
  decorations!: DecorationSet;
  /** Pixels from the top of the first sheet to the bottom of the last. */
  height = 0;
  /** Each page's sheet, in order. */
  sheets: Sheet[] = [];
  /** The scenes, and where each page starts. */
  map!: ScriptMap;
  private placements!: Placement[];
  private positions!: number[];
  private readonly layouts = new LayoutCache();

  constructor(doc: Node) {
    this.rebuild(doc);
  }

  /**
   * Follows a transaction that changed the document, returning the elements
   * whose block needs setting again.
   */
  apply(tr: Transaction): Restyle[] {
    if (tr.before !== this.doc) {
      this.rebuild(tr.doc);
      return this.placements.map((_, index) => ({ index }));
    }
    const doc = tr.doc;
    const before = this.placements;
    const positionsBefore = this.positions;
    const placements = this.place(doc);
    const positions = positionsOf(doc);
    // The elements outside the changed ones are the nodes they were, so
    // their earlier placements and mapped decorations still belong to
    // them, and ProseMirror keeps their paragraphs and styles.
    const { first, last } = changedElements(tr, positions);
    const shift = doc.childCount - before.length;
    let decorations = this.decorations.map(tr.mapping, doc);
    const stale: Decoration[] = [];
    const fresh: Decoration[] = [];
    const restyle: Restyle[] = [];
    placements.forEach((placement, i) => {
      const was = i < first ? i : i > last ? i - shift : undefined;
      const old = was === undefined ? undefined : before[was];
      if (!old || !sameBlock(old.block, placement.block)) {
        restyle.push(
          was === undefined ? { index: i } : { index: i, before: positionsBefore[was] as number },
        );
      }
      if (!old || !sameNumbers(old.breaks, placement.breaks)) {
        const pos = positions[i] as number;
        const node = doc.child(i);
        stale.push(...decorations.find(pos + 1, pos + node.nodeSize - 1));
        decorate(node, pos, placement, fresh);
      }
    });
    if (stale.length) decorations = decorations.remove(stale);
    if (fresh.length) decorations = decorations.add(doc, fresh);
    this.doc = doc;
    this.placements = placements;
    this.positions = positions;
    this.decorations = decorations;
    return restyle;
  }

  block(index: number): Block | undefined {
    return this.placements[index]?.block;
  }

  /** The index of the element starting at `pos`. */
  indexAt(pos: number): number {
    return indexAt(this.positions, pos);
  }

  /** The page holding document position `pos`. */
  pageAt(pos: number): number {
    const element = indexAt(this.positions, pos);
    return this.map.pageAt(element, Math.max(0, pos - (this.positions[element] as number) - 1));
  }

  /** The scene holding document position `pos`, as an index into `map.scenes`; -1 before the first. */
  sceneAt(pos: number): number {
    return this.map.sceneAt(indexAt(this.positions, pos));
  }

  positionOf(index: number): number | undefined {
    return this.positions[index];
  }

  /**
   * The line that Up (`down` false) or Down from `offset` in element `index`
   * reaches when it crosses a page gap inside the element: where that line
   * starts and ends, and where the line holding `offset` starts. Null when
   * the move crosses no gap.
   */
  lineAcrossGap(
    index: number,
    offset: number,
    down: boolean,
  ): { from: number; start: number; end: number } | null {
    const placement = this.placements[index];
    if (!placement) return null;
    const { breaks } = placement;
    const starts = [0];
    const ends: number[] = [];
    const gaps = [0];
    for (let j = 0; j < breaks.length; j += 4) {
      starts.push(breaks[j] as number);
      gaps.push(breaks[j + 2] as number);
      ends.push(breaks[j + 3] as number);
    }
    ends.push(this.doc.child(index).textContent.length);
    let line = 0;
    while (line + 1 < starts.length && (starts[line + 1] as number) <= offset) line++;
    const to = down ? line + 1 : line - 1;
    const gap = gaps[down ? line + 1 : line] as number | undefined;
    if (to < 0 || to >= starts.length || !(gap && gap > 0)) return null;
    return { from: starts[line] as number, start: starts[to] as number, end: ends[to] as number };
  }

  /**
   * Projects `doc` afresh, for a document put in place without a
   * transaction (an opened script) or one that is not the document it
   * last followed.
   */
  rebuild(doc: Node): void {
    this.doc = doc;
    this.placements = this.place(doc);
    this.positions = positionsOf(doc);
    const decorations: Decoration[] = [];
    doc.forEach((node, pos, index) => {
      decorate(node, pos, this.placements[index] as Placement, decorations);
    });
    this.decorations = DecorationSet.create(doc, decorations);
  }

  private place(doc: Node): Placement[] {
    const elements = fromDocument(doc);
    const pages = paginate(elements, { layouts: this.layouts });
    this.height = Math.max(1, pages.length) * PITCH_PX - GUTTER_PX;
    this.sheets = pages.map(sheetOf);
    this.map = new ScriptMap(elements, pages);
    return place(pages, doc.childCount);
  }
}

/** Each element's lines as start, end, indent and top in pixels, then its placement. */
function place(pages: readonly Page[], count: number): Placement[] {
  const lines: number[][] = Array.from({ length: count }, () => []);
  const columns: (Column | undefined)[] = [];
  pages.forEach((page, p) => {
    const pageTop = p * PITCH_PX + PAGE.topMarginIn * 96;
    for (const line of page.lines) {
      if (line.kind === "element") {
        lines[line.element]?.push(line.start, line.end, line.x, pageTop + line.row * ROW_PX);
        columns[line.element] = line.column;
      }
    }
  });
  // A dual dialogue block ends where its longer column does. The shorter
  // column's last paragraph reaches down to there, so a click in that
  // column's blank rows lands at its end, not in the space above the
  // element after the block.
  const below: number[] = [];
  const end = (i: number) => (lines[i]?.at(-1) ?? 0) + ROW_PX;
  for (let i = 0; i < count; i++) {
    if (columns[i] !== "left") continue;
    let right = i;
    while (columns[right] === "left") right++;
    let after = right;
    while (columns[after] === "right") after++;
    const leftEnd = end(right - 1);
    const rightEnd = end(after - 1);
    if (leftEnd < rightEnd) below[right - 1] = rightEnd - leftEnd;
    else if (rightEnd < leftEnd) below[after - 1] = leftEnd - rightEnd;
    i = after - 1;
  }
  let bottom = 0;
  return lines.map((own, index) => {
    // Every element has a line; the fallback only guards a broken engine.
    if (own.length === 0) own.push(0, 0, 0, bottom);
    const breaks: number[] = [];
    for (let j = 4; j < own.length; j += 4) {
      breaks.push(
        own[j] as number,
        own[j + 2] as number,
        (own[j + 3] as number) - (own[j - 1] as number) - ROW_PX,
        own[j - 3] as number,
      );
    }
    const column = columns[index];
    const extra = below[index];
    const block: Block = {
      gap: (own[3] as number) - bottom,
      x: own[2] as number,
      ...(column ? { column } : {}),
      ...(extra ? { below: extra } : {}),
    };
    bottom = (own.at(-1) as number) + ROW_PX + (extra ?? 0);
    return { block, breaks };
  });
}

/**
 * What a page prints besides its elements' text: its number, (MORE) and
 * repeated cues, which are lines of their own, and the automatic (CONT'D),
 * which the engine sets on a cue's line after the cue's own text.
 */
function sheetOf(page: Page): Sheet {
  const printed: Printed[] = [];
  for (const line of page.lines) {
    const top = PAGE.topMarginIn * 96 + line.row * ROW_PX;
    if (line.kind !== "element") {
      printed.push({ text: line.text, top, x: line.x });
      continue;
    }
    // Capitals keep the text's length, so only an added suffix makes a line
    // longer than the stretch of text it shows.
    const own = line.end - line.start;
    if (line.text.length > own) {
      const cells = [...segmenter.segment(line.text.slice(0, own))].length;
      const x = Math.round((line.x + cells / CHARS_PER_INCH) * 1e6) / 1e6;
      printed.push({ text: line.text.slice(own), top, x });
    }
  }
  return { label: pageLabel(page.number), printed };
}

/** An element's decorations. Each spec repeats its attributes, so tests can read them. */
function decorate(node: Node, pos: number, { block, breaks }: Placement, out: Decoration[]): void {
  const text = node.textContent;
  const at = pos + 1;
  if (ELEMENT_FORMATS[node.attrs.type as ElementType].capitals) keepCase(text, at, out);
  for (let j = 0; j < breaks.length; j += 4) {
    const start = breaks[j] as number;
    const x = breaks[j + 1] as number;
    const gap = breaks[j + 2] as number;
    const end = breaks[j + 3] as number;
    const attrs = gap > 0 ? { class: "page-gap", style: `--gap: ${gap}px` } : { class: "line-end" };
    // Where an element splits across pages the engine drops the white space
    // between the two parts, typed line breaks included. Each typed break
    // ends a line in the editor, so only the last shows, carrying the gap.
    const newline = gap > 0 ? text.lastIndexOf("\n", start - 1) : -1;
    if (newline >= end) {
      if (newline > end) out.push(Decoration.inline(at + end, at + newline, SKIPPED, SKIPPED));
      if (start > newline + 1) {
        out.push(Decoration.inline(at + newline + 1, at + start, SKIPPED, SKIPPED));
      }
      out.push(Decoration.inline(at + newline, at + newline + 1, attrs, attrs));
    } else if (start > 0 && (text[start - 1] !== "\n" || gap > 0)) {
      // A typed line break ends its line already, unless a page gap follows.
      out.push(Decoration.inline(at + graphemeBefore(text, start), at + start, attrs, attrs));
    }
    if (x !== block.x && start < text.length && text[start] !== "\n") {
      const attrs = { style: `margin-left: ${Math.round((x - block.x) * 1e6) / 1e6}in` };
      out.push(Decoration.inline(at + start, at + graphemeAfter(text, start), attrs, attrs));
    }
  }
}

const SKIPPED = { class: "skipped" };

const KEEP_CASE = { class: "keep-case" };

/**
 * Leaves each character whose capital is longer ("ß", whose capital is
 * "SS") as typed, as the engine's capitals do: CSS would print the longer
 * capital and move the rest of the line.
 */
function keepCase(text: string, at: number, out: Decoration[]): void {
  // No character's capital is shorter, so equal lengths mean none is kept.
  if (text.toUpperCase().length === text.length) return;
  let offset = 0;
  for (const char of text) {
    if (keepsCase(char)) {
      out.push(Decoration.inline(at + offset, at + offset + char.length, KEEP_CASE, KEEP_CASE));
    }
    offset += char.length;
  }
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
// Characters that may belong to the grapheme before them.
const JOINING = /\p{M}|\u200D|\uFE0E|\uFE0F|[\uDC00-\uDFFF]/u;

/** Where the character (grapheme) ending at `end` starts. */
function graphemeBefore(text: string, end: number): number {
  if (!JOINING.test(text[end - 1] as string)) return end - 1;
  const from = Math.max(0, end - 32);
  const last = [...segmenter.segment(text.slice(from, end))].at(-1);
  return from + (last?.index ?? end - from - 1);
}

/** Where the character (grapheme) starting at `start` ends. */
function graphemeAfter(text: string, start: number): number {
  if (!JOINING.test(text[start + 1] ?? "")) return start + 1;
  const first = [...segmenter.segment(text.slice(start, start + 32))][0];
  return start + (first?.segment.length ?? 1);
}

function positionsOf(doc: Node): number[] {
  const positions: number[] = [];
  doc.forEach((_node, pos) => {
    positions.push(pos);
  });
  return positions;
}

/** The last element starting at or before `pos`. */
function indexAt(positions: readonly number[], pos: number): number {
  let low = 0;
  let high = positions.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if ((positions[mid] as number) <= pos) low = mid;
    else high = mid - 1;
  }
  return low;
}

/**
 * The elements `tr` changed, as indices into its final document, whose
 * elements start at `positions`: every node that is not the object it was
 * (mark and attribute steps move no positions), and every element the steps
 * touched. The elements outside are the nodes they were. `first` is past
 * `last` when none changed.
 */
export function changedElements(
  tr: Transaction,
  positions: readonly number[],
): { first: number; last: number } {
  const { doc, before } = tr;
  const most = Math.min(doc.childCount, before.childCount);
  let first = 0;
  while (first < most && doc.child(first) === before.child(first)) first++;
  let kept = 0;
  while (
    kept < most - first &&
    doc.child(doc.childCount - 1 - kept) === before.child(before.childCount - 1 - kept)
  ) {
    kept++;
  }
  let last = doc.childCount - 1 - kept;
  const range = changedRange(tr);
  if (range) {
    const from = indexAt(positions, range.from);
    first = Math.min(first, from > 0 && positions[from] === range.from ? from - 1 : from);
    last = Math.max(last, indexAt(positions, range.to));
  }
  return { first, last };
}

/** Where a transaction changed the document, in its final positions. */
export function changedRange(tr: Transaction): { from: number; to: number } | null {
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;
  for (const map of tr.mapping.maps) {
    if (from <= to) {
      from = map.map(from, -1);
      to = map.map(to, 1);
    }
    map.forEach((_oldStart, _oldEnd, start, end) => {
      from = Math.min(from, start);
      to = Math.max(to, end);
    });
  }
  return from <= to ? { from, to } : null;
}

export function sameBlock(a: Block, b: Block): boolean {
  return a.gap === b.gap && a.x === b.x && a.column === b.column && a.below === b.below;
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
