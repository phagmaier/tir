/**
 * Pagination: breaks the laid-out lines into pages as Final Draft does
 * (brief, "Page parity"; findings, "Final Draft's default screenplay
 * format"). Space before an element is dropped at the top of a page. Scene
 * headings and shots stay with what follows them, and a transition with
 * what precedes it; a cue never ends a page. Action and dialogue split only at a
 * sentence end, and both parts are wrapped afresh. A split speech ends with
 * (MORE) and resumes under its cue with (CONT'D), and a speaker who returns
 * after action gets an automatic (CONT'D). Settings live in format.ts.
 */
import { CONTINUED, type Column, ELEMENT_FORMATS, MORE, PAGINATION } from "./format.ts";
import { type Layout, LayoutCache, type Line } from "./layout.ts";
import type { Element, ElementType } from "./model.ts";

export type PageLineKind = "element" | "more" | "continued";

export interface PageLine extends Line {
  /** An element's own line, a (MORE), or a cue repeated after a split speech. */
  readonly kind: PageLineKind;
  /** The element shown; for (MORE), the dialogue it follows. */
  readonly element: number;
  /**
   * Lines down from the top margin, counting from 0. A repeated cue sits at
   * -1, above the first line, and (MORE) may sit at the row after the last.
   */
  readonly row: number;
  /** The column of dual dialogue the line sits in, if any. */
  readonly column?: Column;
}

export interface Page {
  readonly number: number;
  readonly lines: readonly PageLine[];
}

export interface PaginateOptions {
  /** Body lines on a page; provisional until task 0.8 settles it. */
  readonly linesPerPage?: number;
  /**
   * Layouts kept from earlier runs. An editor passes the same cache on every
   * edit, so only changed elements are laid out again.
   */
  readonly layouts?: LayoutCache;
}

/** The number a page shows, or null on page 1. */
export function pageLabel(number: number): string | null {
  return number < PAGINATION.firstNumberShown ? null : `${number}${PAGINATION.numberSuffix}`;
}

export function paginate(elements: readonly Element[], options: PaginateOptions = {}): Page[] {
  const layouts = options.layouts ?? new LayoutCache();
  layouts.startRun();
  const pager = new Pager(elements, options.linesPerPage ?? PAGINATION.linesPerPage, layouts);
  const blocks = toBlocks(elements);
  blocks.forEach((block, i) => {
    pager.place(block, blocks[i + 1]);
  });
  return pager.finish();
}

/** Part of an element: all of it, or what is left after a split. */
interface Piece {
  readonly index: number;
  readonly type: ElementType;
  readonly text: string;
  /** Where `text` starts in the element's own text. */
  readonly offset: number;
  readonly centred: boolean;
}

interface Speech {
  readonly cue: number;
  readonly items: readonly Piece[];
}

type Block =
  | { readonly kind: "single"; readonly piece: Piece }
  | { readonly kind: "speech"; readonly speech: Speech }
  | { readonly kind: "dual"; readonly left: Speech; readonly right: Speech };

function wholePiece(elements: readonly Element[], index: number): Piece {
  const element = elements[index] as Element;
  return { index, type: element.type, text: element.text, offset: 0, centred: !!element.centred };
}

/** Groups the elements: a cue with its parentheticals and dialogue is one speech. */
function toBlocks(elements: readonly Element[]): Block[] {
  const blocks: Block[] = [];
  const speechAt = (cue: number): Speech => {
    const items: Piece[] = [];
    let i = cue + 1;
    for (; i < elements.length; i++) {
      const element = elements[i] as Element;
      if (element.pageBreakBefore) break;
      if (element.type !== "parenthetical" && element.type !== "dialogue") break;
      items.push(wholePiece(elements, i));
    }
    return { cue, items };
  };
  let i = 0;
  while (i < elements.length) {
    if (elements[i]?.type !== "character") {
      blocks.push({ kind: "single", piece: wholePiece(elements, i) });
      i++;
      continue;
    }
    const left = speechAt(i);
    i = left.cue + left.items.length + 1;
    const next = elements[i];
    if (next?.type === "character" && next.dual && !next.pageBreakBefore) {
      const right = speechAt(i);
      i = right.cue + right.items.length + 1;
      blocks.push({ kind: "dual", left, right });
    } else {
      blocks.push({ kind: "speech", speech: left });
    }
  }
  return blocks;
}

/**
 * Cues that get an automatic (CONT'D): the same speaker again after action,
 * with nobody else speaking between, within one scene.
 */
export function automaticContinueds(elements: readonly Element[]): Set<number> {
  const cues = new Set<number>();
  let speaker: string | null = null;
  let interrupted = false;
  elements.forEach((element, index) => {
    if (element.type === "sceneHeading") {
      speaker = null;
    } else if (element.type === "character") {
      const name = (element.text.split("(")[0] as string).trim().toUpperCase();
      if (element.dual) {
        speaker = null;
      } else {
        if (name === speaker && interrupted && !hasContinued(element.text)) cues.add(index);
        speaker = name;
      }
      interrupted = false;
    } else if (element.type !== "parenthetical" && element.type !== "dialogue") {
      interrupted = true;
    }
  });
  return cues;
}

function hasContinued(cue: string): boolean {
  const straight = (text: string) => text.toUpperCase().replaceAll("’", "'");
  return straight(cue).includes(straight(CONTINUED));
}

/** Lays out a piece, with offsets into its element's whole text. */
function layoutPiece(layouts: LayoutCache, piece: Piece, column?: Column): Layout {
  const element: Element = piece.centred
    ? { type: piece.type, text: piece.text, centred: true }
    : { type: piece.type, text: piece.text };
  const layout = layouts.layout(element, column);
  if (piece.offset === 0) return layout;
  return {
    spaceBefore: layout.spaceBefore,
    lines: layout.lines.map((line) => ({
      ...line,
      start: line.start + piece.offset,
      end: line.end + piece.offset,
    })),
  };
}

interface Split {
  /** End of the first part, in the piece's text. */
  readonly end: number;
  /** Start of the second part. */
  readonly resume: number;
}

/**
 * Where a piece may split, first to last: after a sentence end, or at a line
 * break inside it. With `anyLine`, at any line of `layout` as well, for an
 * element too long for a page that has no sentence end to split at.
 */
function splitPoints(piece: Piece, layout: Layout, anyLine: boolean): Split[] {
  const points: Split[] = [];
  for (const match of piece.text.matchAll(/([.!?]+["'”’)\]]*)?(\s+)/g)) {
    const [whole, sentenceEnd, space] = match as unknown as [string, string | undefined, string];
    if (sentenceEnd === undefined && !space.includes("\n")) continue;
    const end = match.index + whole.length - space.length;
    const resume = match.index + whole.length;
    if (end > 0 && resume < piece.text.length) points.push({ end, resume });
  }
  if (anyLine) {
    for (const line of layout.lines.slice(1)) {
      const resume = line.start - piece.offset;
      const end = piece.text.slice(0, resume).trimEnd().length;
      if (end > 0 && !points.some((p) => p.resume === resume)) points.push({ end, resume });
    }
    points.sort((a, b) => a.end - b.end);
  }
  return points;
}

function head(piece: Piece, split: Split): Piece {
  return { ...piece, text: piece.text.slice(0, split.end) };
}

function tail(piece: Piece, split: Split): Piece {
  return { ...piece, text: piece.text.slice(split.resume), offset: piece.offset + split.resume };
}

/** A way to end a page partway through a speech, with what it places and leaves. */
interface SpeechCut {
  /**
   * Lines it puts on the page after the cue. (MORE) is not counted: Final
   * Draft sets it on the line below the last one (findings, "Pagination").
   */
  readonly height: number;
  readonly placed: readonly Piece[];
  readonly remainder: readonly Piece[];
}

/**
 * The ways a speech can end a page, from least placed to most: inside
 * dialogue at a sentence end, or between its parts, with at least two lines
 * of dialogue on the page and more of the speech to follow. Final Draft lets
 * a parenthetical end the page that way ("(beat)" then "(MORE)"; findings,
 * "Pagination").
 */
function speechCuts(
  layouts: LayoutCache,
  items: readonly Piece[],
  anyLine: boolean,
  column?: Column,
): SpeechCut[] {
  const cuts: SpeechCut[] = [];
  // A speech longer than a page must split somewhere, so the minimum relaxes.
  const min = anyLine ? 1 : PAGINATION.minSplitLines;
  let before = 0;
  // Final Draft puts at least `min` lines of dialogue above a (MORE).
  let dialogue = 0;
  items.forEach((piece, j) => {
    const layout = layoutPiece(layouts, piece, column);
    if (piece.type === "dialogue") {
      for (const split of splitPoints(piece, layout, anyLine)) {
        const first = layoutPiece(layouts, head(piece, split), column).lines.length;
        const rest = layoutPiece(layouts, tail(piece, split), column).lines.length;
        if (dialogue + first < min || first < min || rest < min) continue;
        cuts.push({
          height: before + first,
          placed: [...items.slice(0, j), head(piece, split)],
          remainder: [tail(piece, split), ...items.slice(j + 1)],
        });
      }
      dialogue += layout.lines.length;
    }
    if (j + 1 < items.length && dialogue >= min) {
      cuts.push({
        height: before + layout.lines.length,
        placed: items.slice(0, j + 1),
        remainder: items.slice(j + 1),
      });
    }
    before += layout.lines.length;
  });
  return cuts;
}

function firstIndex(block: Block): number {
  if (block.kind === "single") return block.piece.index;
  return block.kind === "speech" ? block.speech.cue : block.left.cue;
}

/** The ways a piece can split, from least placed to most, with the lines it puts first. */
function cuts(
  layouts: LayoutCache,
  piece: Piece,
  anyLine: boolean,
): { split: Split; first: number }[] {
  const layout = layoutPiece(layouts, piece);
  // An element longer than a page must split somewhere, so the minimum relaxes.
  const min = anyLine ? 1 : PAGINATION.minSplitLines;
  return splitPoints(piece, layout, anyLine)
    .map((split) => ({
      split,
      first: layoutPiece(layouts, head(piece, split)).lines.length,
      rest: layoutPiece(layouts, tail(piece, split)).lines.length,
    }))
    .filter(({ first, rest }) => first >= min && rest >= min);
}

class Pager {
  private readonly pages: Page[] = [];
  private lines: PageLine[] = [];
  private row = 0;
  private readonly continueds: Set<number>;
  private readonly elements: readonly Element[];
  private readonly perPage: number;
  private readonly layouts: LayoutCache;

  constructor(elements: readonly Element[], perPage: number, layouts: LayoutCache) {
    this.elements = elements;
    this.perPage = perPage;
    this.layouts = layouts;
    this.continueds = automaticContinueds(elements);
  }

  private layout(piece: Piece, column?: Column): Layout {
    return layoutPiece(this.layouts, piece, column);
  }

  finish(): Page[] {
    if (this.row > 0 || this.pages.length === 0) this.newPage();
    return this.pages;
  }

  place(block: Block, next: Block | undefined): void {
    if (this.breaksBefore(block) && this.row > 0) this.newPage();
    if (block.kind === "single") this.placeSingle(block.piece, next);
    else if (block.kind === "speech") this.placeSpeech(block.speech, this.trailing(next));
    else this.placeDual(block.left, block.right);
  }

  /**
   * Rows a following transition needs: a transition never starts a page, so
   * whatever comes before it keeps room for it or moves on with it.
   */
  private trailing(next: Block | undefined): number {
    if (next?.kind !== "single" || next.piece.type !== "transition" || this.breaksBefore(next)) {
      return 0;
    }
    const layout = this.layout(next.piece);
    return layout.spaceBefore + layout.lines.length;
  }

  private get room(): number {
    return this.perPage - this.row;
  }

  /** Space before an element, dropped at the top of a page. */
  private gap(spaceBefore: number): number {
    return this.row === 0 ? 0 : spaceBefore;
  }

  private newPage(): void {
    this.pages.push({ number: this.pages.length + 1, lines: this.lines });
    this.lines = [];
    this.row = 0;
  }

  private put(lines: readonly Line[], element: number, kind: PageLineKind, gap = 0): void {
    this.row += gap;
    for (const line of lines) this.lines.push({ ...line, kind, element, row: this.row++ });
  }

  private placeSingle(piece: Piece, next: Block | undefined): void {
    const layout = this.layout(piece);
    const height = layout.lines.length;
    // A scene heading or shot needs room for the start of what follows.
    const keep =
      (piece.type === "sceneHeading" || piece.type === "shot") && next && !this.breaksBefore(next)
        ? this.lead(next)
        : this.trailing(next);
    if (this.gap(layout.spaceBefore) + height + keep <= this.room) {
      this.put(layout.lines, piece.index, "element", this.gap(layout.spaceBefore));
      return;
    }
    if (piece.type === "action" && this.split(piece, layout, false)) return;
    if (this.row > 0) {
      this.newPage();
      this.placeSingle(piece, next);
      return;
    }
    // An element taller than a page splits at a line.
    if (height > this.room && this.split(piece, layout, true)) return;
    this.put(layout.lines, piece.index, "element");
  }

  /** Puts as much of a piece as fits, split at a sentence end (or any line), and the rest after. */
  private split(piece: Piece, layout: Layout, anyLine: boolean): boolean {
    const gap = this.gap(layout.spaceBefore);
    const cut = cuts(this.layouts, piece, anyLine)
      .filter(({ first }) => gap + first <= this.room)
      .at(-1);
    if (!cut) return false;
    this.put(this.layout(head(piece, cut.split)).lines, piece.index, "element", gap);
    this.newPage();
    this.placeSingle(tail(piece, cut.split), undefined);
    return true;
  }

  private breaksBefore(block: Block): boolean {
    return !!this.elements[firstIndex(block)]?.pageBreakBefore;
  }

  private cueLayout(cue: number, kind: PageLineKind, column?: Column): Layout {
    const { text: own, centred } = this.elements[cue] as Element;
    let text = own;
    if (kind === "continued" || this.continueds.has(cue)) {
      text = hasContinued(own) ? own : `${own} ${CONTINUED}`;
    }
    const input = { type: "character" as const, text, ...(centred ? { centred } : {}) };
    const layout = this.layouts.layout(input, column);
    // A suffix shown after the cue is not part of its text.
    const clamp = (offset: number) => Math.min(offset, own.length);
    return {
      spaceBefore: layout.spaceBefore,
      lines: layout.lines.map((line) => ({
        ...line,
        start: clamp(line.start),
        end: clamp(line.end),
      })),
    };
  }

  private placeSpeech(speech: Speech, trailing = 0): void {
    let kind: PageLineKind = "element";
    let items = speech.items;
    for (;;) {
      const cue = this.cueLayout(speech.cue, kind);
      // A cue repeated over a split speech sits on the row above the page's
      // first line, as (MORE) sits on the row below its last, so neither
      // takes a line of the page (findings, "Pagination").
      const above = kind === "continued";
      const cueRows = above ? 0 : cue.lines.length;
      const gap = this.gap(cue.spaceBefore);
      const placeCue = () => {
        if (above) this.putAbove(cue.lines, speech.cue);
        else this.put(cue.lines, speech.cue, kind, gap);
      };
      const itemLayouts = items.map((piece) => this.layout(piece));
      const height = itemLayouts.reduce((sum, layout) => sum + layout.lines.length, 0);
      if (gap + cueRows + height + trailing <= this.room) {
        placeCue();
        items.forEach((piece, j) => {
          this.put((itemLayouts[j] as Layout).lines, piece.index, "element");
        });
        return;
      }
      const fits = (cut: SpeechCut) => gap + cueRows + cut.height <= this.room;
      let cut = speechCuts(this.layouts, items, false).filter(fits).at(-1);
      if (!cut && this.row > 0) {
        this.newPage();
        continue;
      }
      // Taller than a page: split dialogue at a line if no sentence end fits.
      cut ??= speechCuts(this.layouts, items, true).filter(fits).at(-1);
      if (!cut) {
        placeCue();
        items.forEach((piece, j) => {
          this.put((itemLayouts[j] as Layout).lines, piece.index, "element");
        });
        return;
      }
      placeCue();
      for (const piece of cut.placed) this.put(this.layout(piece).lines, piece.index, "element");
      const last = cut.placed.at(-1) as Piece;
      this.put(
        [{ start: 0, end: 0, text: MORE, x: ELEMENT_FORMATS.character.left }],
        last.index,
        "more",
      );
      this.newPage();
      items = cut.remainder;
      kind = "continued";
    }
  }

  /** Puts lines on the rows above the page's first, without taking any of its lines. */
  private putAbove(lines: readonly Line[], element: number): void {
    lines.forEach((line, k) => {
      this.lines.push({ ...line, kind: "continued", element, row: k - lines.length });
    });
  }

  /** A dual dialogue block: two speeches side by side, kept together. */
  private placeDual(left: Speech, right: Speech): void {
    const columns = (
      [
        [left, "left"],
        [right, "right"],
      ] as const
    ).map(([speech, column]) => {
      const cue = this.cueLayout(speech.cue, "element", column);
      const lines = [
        ...cue.lines.map((line) => ({ line, element: speech.cue })),
        ...speech.items.flatMap((piece) =>
          this.layout(piece, column).lines.map((line) => ({ line, element: piece.index })),
        ),
      ];
      return { column, spaceBefore: cue.spaceBefore, lines };
    });
    const height = Math.max(...columns.map((column) => column.lines.length));
    if (this.gap(columns[0]?.spaceBefore ?? 0) + height > this.room && this.row > 0) this.newPage();
    this.row += this.gap(columns[0]?.spaceBefore ?? 0);
    const top = this.row;
    for (const { column, lines } of columns) {
      lines.forEach(({ line, element }, k) => {
        this.lines.push({ ...line, kind: "element", element, row: top + k, column });
      });
    }
    this.lines.sort((a, b) => a.row - b.row || a.x - b.x);
    this.row = top + height;
  }

  /** Lines a block needs at the foot of a page to start there, space before included. */
  private lead(block: Block): number {
    if (block.kind === "single") {
      const layout = this.layout(block.piece);
      const whole = layout.lines.length;
      const cut =
        block.piece.type === "action" ? cuts(this.layouts, block.piece, false)[0] : undefined;
      return layout.spaceBefore + Math.min(whole, cut?.first ?? whole);
    }
    if (block.kind === "speech") {
      const cue = this.cueLayout(block.speech.cue, "element");
      const whole = block.speech.items.reduce(
        (sum, piece) => sum + this.layout(piece).lines.length,
        0,
      );
      const cut = speechCuts(this.layouts, block.speech.items, false)[0];
      return cue.spaceBefore + cue.lines.length + Math.min(whole, cut?.height ?? whole);
    }
    const height = (speech: Speech, column: Column) =>
      this.cueLayout(speech.cue, "element", column).lines.length +
      speech.items.reduce((sum, piece) => sum + this.layout(piece, column).lines.length, 0);
    return (
      ELEMENT_FORMATS.character.spaceBefore +
      Math.max(height(block.left, "left"), height(block.right, "right"))
    );
  }
}
