/**
 * Rebuilds a script from the text and positions of a screenplay PDF in
 * Final Draft's layout. Courier is fixed-pitch, so each run's column is its
 * x divided by a character's width, which copes with text split into runs
 * and with odd spacing. Each line's indent gives its element type (findings,
 * the table); wrapped lines join into one element; dual dialogue is read
 * from its two columns; page numbers, (MORE), repeated (CONT'D) cues,
 * CONTINUED, scene numbers and revision marks are set aside. What it cannot
 * read for certain it reports in `notes` (findings, "Reading screenplay
 * PDFs").
 */
import {
  CHARS_PER_INCH,
  CONTINUED,
  type Column,
  DUAL_FORMATS,
  ELEMENT_FORMATS,
  type ElementFormat,
  LINES_PER_INCH,
  MORE,
  PAGE,
  PAGINATION,
} from "../../src/core/format.ts";
import { layoutElement } from "../../src/core/layout.ts";
import type { Element, ElementType } from "../../src/core/model.ts";
import type { PdfPage, PdfText, Run } from "./pdf-text.ts";

const POINTS = 72;
const CHAR = POINTS / CHARS_PER_INCH;
const LINE = POINTS / LINES_PER_INCH;
const col = (inches: number) => Math.round(inches * CHARS_PER_INCH);

const ACTION_COL = col(ELEMENT_FORMATS.action.left);
const DIALOGUE_COL = col(ELEMENT_FORMATS.dialogue.left);
const PAREN_COL = col(
  ELEMENT_FORMATS.parenthetical.left + ELEMENT_FORMATS.parenthetical.firstIndent,
);
const PAREN_NEXT_COL = col(ELEMENT_FORMATS.parenthetical.left);
const CUE_COL = col(ELEMENT_FORMATS.character.left);
const TRANSITION_END = col(ELEMENT_FORMATS.transition.right);
const ACTION_CENTRE = col((ELEMENT_FORMATS.action.left + ELEMENT_FORMATS.action.right) / 2);
const PAGE_CENTRE = col(PAGE.widthIn / 2);
/** Script text lies in these columns; anything outside is a margin mark. */
const TEXT_FROM = ACTION_COL - 1;
const TEXT_TO = ACTION_COL + ELEMENT_FORMATS.action.width;
/** Where the right column of dual dialogue begins, in points. */
const DUAL_SPLIT = 4.5 * POINTS;
const dualCentre = (column: Column) => {
  const fmt = DUAL_FORMATS[column].character;
  return ((fmt.left + fmt.right) / 2) * POINTS;
};
const HEADING = /^(?:int\.?\/ext|int|ext|est|i\/e)[. ]/i;
/** A scene number Final Draft sets inside the right margin of a heading. */
const SCENE_NUMBER_END = /\s{2,}[A-Z]?\d+[A-Z]*\.?$/;
/** Final Draft's scene continueds: "CONTINUED:", "CONTINUED: (2)" and "(CONTINUED)". */
const CONTINUED_MARKER = /^(?:CONTINUED:(?:\s*\(\d+\))?|\(CONTINUED\))$/;

export interface LinePosition {
  readonly element: number;
  /** Where the line starts in the element's text. */
  readonly offset: number;
  readonly text: string;
}

export interface Note {
  /** The script page, from 1. */
  readonly page: number;
  readonly text: string;
}

export interface Rebuilt {
  readonly elements: Element[];
  readonly titlePage: boolean;
  /** For each script page, the number in its header, if any. */
  readonly labels: (string | null)[];
  /** For each script page, its first line of script. */
  readonly starts: (LinePosition | null)[];
  readonly notes: Note[];
  readonly found: {
    marks: number;
    continueds: number;
    mores: number;
    offset: number;
    /** Empty lines read from gaps wider than an element's space before. */
    emptyLines: number;
  };
  /**
   * Script pages (from 1) with four or more blank rows inside them, where an
   * image or spacing the text does not show takes room: left out of the
   * page-by-page comparison.
   */
  readonly unreadable: ReadonlySet<number>;
  /**
   * Script pages (from 1) that end in action continuing on the next page,
   * where the paragraph boundary is read by pagination's own rules, so their
   * page break is no evidence for those rules: left out of the comparison.
   */
  readonly actionBreaks: ReadonlySet<number>;
  /** Each script page's lines as read, for `--show`: row, column, text and how it was read. */
  readonly pages: { row: number; col: number; text: string; read: string }[][];
  /** Elements wholly on one page, with their lines as the PDF set them, to check wrapping. */
  readonly wrapped: { type: ElementType; text: string; lines: string[] }[];
}

export interface RebuildOptions {
  /** Body lines on a page, used to tell a split paragraph from two (see `settle`). */
  readonly linesPerPage?: number;
}

interface Segment {
  /** In points, from the page's left edge. */
  readonly x: number;
  readonly text: string;
}

interface PdfLine {
  /** Script page, from 0. */
  readonly page: number;
  readonly row: number;
  readonly col: number;
  readonly text: string;
  /** The row's two halves, when a wide gap divides it as dual dialogue does. */
  readonly halves?: { readonly left: Segment; readonly right: Segment };
  /** Where its first run starts, in points. */
  readonly x: number;
}

type Kind = ElementType | "more";

/** An element being rebuilt, with the lines it has taken so far. */
interface Building {
  type: ElementType;
  text: string;
  format: ElementFormat;
  centred: boolean;
  dual: boolean;
  /** Where the part on the current page starts in the text. */
  partStart: number;
  lastLine: string;
  /** A parenthetical still waiting for its ")". */
  open: boolean;
  /** Lines so far, for the wrap test. */
  lineCount: number;
  /** Its lines as the PDF set them, and the pages it is on. */
  pdfLines: string[];
  pages: Set<number>;
}

/** Where action at the top of a page was joined to the last page's. */
interface Junction {
  readonly element: number;
  /** Where the joined part starts in the element's text. */
  readonly offset: number;
  /** Where the part on the page before starts. */
  readonly from: number;
  /** Rows left empty at the foot of the page before. */
  readonly room: number;
  /** The script page the joined part starts, from 1. */
  readonly page: number;
}

export function rebuild(pdf: PdfText, options: RebuildOptions = {}): Rebuilt {
  const linesPerPage = options.linesPerPage ?? PAGINATION.linesPerPage;
  const notes: Note[] = [];
  const junctions: Junction[] = [];
  const offset = commonOffset(pdf);
  const found = { marks: 0, continueds: 0, mores: 0, offset, emptyLines: 0 };
  const rowZero = firstBaseline(pdf);
  const pages = pdf.pages.map((page) => readPage(page, offset, rowZero, found));
  const titlePage = pages.length > 0 && isTitlePage(pages[0]?.body ?? []);
  const script = (titlePage ? pages.slice(1) : pages).map((page, index) => ({
    label: page.label,
    body: page.body.map((line) => ({ ...line, page: index })),
  }));

  const elements: Building[] = [];
  const starts: (LinePosition | null)[] = script.map(() => null);
  const shown: Rebuilt["pages"] = script.map(() => []);
  let pendingMore = false;
  /** The last row used on the page before. */
  let lastRow = 0;

  for (const [pageIndex, page] of script.entries()) {
    let first = true;
    let continuing = false;
    let previous: PdfLine | null = null;
    const lines = page.body;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] as PdfLine;
      const show = (read: string, text = line.text) =>
        shown[pageIndex]?.push({ row: line.row, col: line.col, text, read });

      if (isDualCueRow(line)) {
        // A dual dialogue block runs until the first blank row.
        let end = i + 1;
        while (
          end < lines.length &&
          (lines[end] as PdfLine).row === (lines[end - 1] as PdfLine).row + 1
        ) {
          end++;
        }
        const block = lines.slice(i, end);
        const at = elements.length;
        readDual(block, elements);
        if (first)
          starts[pageIndex] = { element: at, offset: 0, text: line.halves?.left.text ?? "" };
        for (const row of block) {
          shown[pageIndex]?.push({
            row: row.row,
            col: row.col,
            text: row.text,
            read: "dual dialogue",
          });
        }
        previous = block.at(-1) as PdfLine;
        pendingMore = false;
        first = false;
        i = end - 1;
        continue;
      }

      const { kind, text } = classify(line, previous, elements.at(-1), first, notes, found);
      if (kind === "more") {
        found.mores++;
        pendingMore = true;
        show("(MORE)");
        continue;
      }
      // The cue Final Draft repeats above a page over a split speech (some
      // scripts print no (MORE) before it).
      if (first && (pendingMore || line.row < 0) && kind === "character" && isContinuedCue(text)) {
        // The cue repeated over a split speech: the speech goes on.
        continuing = true;
        show("repeated cue");
        continue;
      }
      const current = elements.at(-1);
      const gap = previous ? line.row - previous.row - 1 : null;
      const how = place(line, kind, gap, current, first, continuing);
      let offsetInText = 0;
      if (how === "new") {
        // A wider gap than the element's space before holds empty lines,
        // which a PDF cannot show: read them as empty General elements,
        // which take a line each and no space before.
        const extra = gap === null ? 0 : gap - ELEMENT_FORMATS[kind as ElementType].spaceBefore;
        if (extra > 0 && extra < 4) {
          for (let k = 0; k < extra; k++) {
            elements.push(building("general", "", ELEMENT_FORMATS.general));
          }
          found.emptyLines += extra;
        }
        elements.push(start(kind, text, line));
      } else {
        const from = (current as Building).partStart;
        offsetInText = join(current as Building, text, how);
        if (how === "page" && kind === "action") {
          junctions.push({
            element: elements.length - 1,
            offset: offsetInText,
            from,
            room: linesPerPage - (lastRow + 1),
            page: pageIndex + 1,
          });
        }
      }
      (elements.at(-1) as Building).pages.add(pageIndex);
      if (first) starts[pageIndex] = { element: elements.length - 1, offset: offsetInText, text };
      show(`${kind} ${how === "new" ? "starts" : "joins"} element ${elements.length}`, text);
      pendingMore = false;
      continuing = false;
      previous = line;
      first = false;
    }
    lastRow = previous?.row ?? lastRow;
  }
  const unreadable = new Set<number>();
  shown.forEach((lines, index) => {
    for (let k = 1; k < lines.length; k++) {
      const blank = (lines[k] as { row: number }).row - (lines[k - 1] as { row: number }).row - 1;
      if (blank >= 4) {
        unreadable.add(index + 1);
        notes.push({
          page: index + 1,
          text: `${blank} blank rows inside the page, perhaps an image: left out of the page-by-page comparison`,
        });
        break;
      }
    }
  });
  const wrapped = elements
    .filter((element) => element.pages.size === 1 && !element.dual && !element.centred)
    .map((element) => ({ type: element.type, text: element.text, lines: element.pdfLines }));
  const built = elements.map(finish);
  const actionBreaks = new Set(junctions.map((junction) => junction.page - 1));
  settle(built, starts, junctions, notes);
  if (offset !== 0) {
    notes.push({
      page: 1,
      text: `text sits ${offset} pt right of Final Draft's margins; read as if it did not`,
    });
  }
  notes.sort((a, b) => a.page - b.page);

  return {
    elements: built,
    titlePage,
    labels: script.map((page) => page.label),
    starts,
    notes,
    found,
    unreadable,
    actionBreaks,
    pages: shown,
    wrapped,
  };
}

/**
 * Some PDFs place every line a few points right of Final Draft's margins
 * (printed with an offset). The most common left edge near 1.5 in shows it.
 */
function commonOffset(pdf: PdfText): number {
  const counts = new Map<number, number>();
  for (const page of pdf.pages) {
    for (const run of page.runs) {
      if (run.x < 90 || run.x > 140) continue;
      const x = Math.round(run.x);
      counts.set(x, (counts.get(x) ?? 0) + 1);
    }
  }
  const [mode] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [108];
  const offset = mode - ACTION_COL * CHAR;
  return Math.abs(offset) >= 2 ? offset : 0;
}

/**
 * The baseline of a page's first body line: the highest baseline below the
 * top margin that most pages share. Rows count from it, so a cue Final Draft
 * repeats above the first line over a split speech reads as row -1.
 */
function firstBaseline(pdf: PdfText): number {
  const counts = new Map<number, number>();
  for (const page of pdf.pages) {
    const bodyTop = page.height - PAGE.topMarginIn * POINTS;
    const top = Math.max(
      -1,
      ...page.runs.filter((run) => run.y <= bodyTop).map((run) => Math.round(run.y)),
    );
    if (top > 0) counts.set(top, (counts.get(top) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
}

interface ReadPage {
  readonly label: string | null;
  readonly body: PdfLine[];
}

/** Groups a page's runs into lines: the header's page number, and body lines with rows. */
function readPage(
  page: PdfPage,
  offset: number,
  rowZero: number,
  found: Rebuilt["found"],
): ReadPage {
  const rows: Run[][] = [];
  const shifted = page.runs.map((run) => ({ ...run, x: run.x - offset }));
  for (const run of shifted.sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.at(-1);
    if (row && Math.abs((row[0] as Run).y - run.y) < 2) row.push(run);
    else rows.push([run]);
  }
  // The header sits half an inch down; rows between it and the body hold a
  // repeated cue (row -1), "CONTINUED:" (row -2) or, in some scripts, the
  // page number.
  const headerBelow = page.height - PAGE.headerIn * POINTS - LINE;
  const bodyTop = page.height - PAGE.topMarginIn * POINTS;
  let label: string | null = null;
  const body: { y: number; text: string; col: number; x: number; halves?: PdfLine["halves"] }[] =
    [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    const y = (row[0] as Run).y;
    if (y > bodyTop) {
      // Above the body: the page number (the last word at the right, as in
      // "3." beside draft text), header text, or a repeated cue or
      // "CONTINUED:" on the rows just above the first line.
      const last = row.at(-1) as Run;
      if (/^\d+[A-Z]*\.?$/.test(last.text.trim()) && last.x > 5 * POINTS) {
        label = last.text.trim();
        continue;
      }
      if (y >= headerBelow) continue;
    }
    // Scene numbers and revision marks sit in the margins.
    const inside = row.filter((run) => {
      const c = Math.round(run.x / CHAR);
      return c >= TEXT_FROM && c < TEXT_TO;
    });
    if (inside.length < row.length && inside.length > 0) found.marks++;
    const runs = inside.length > 0 ? inside : row;
    const kept = columns(runs);
    // Scene continueds take no part in the script, so rows count without them.
    if (CONTINUED_MARKER.test(kept.trim())) {
      found.continueds++;
      continue;
    }
    body.push({
      y,
      text: kept.trimEnd(),
      col: kept.length - kept.trimStart().length,
      x: (runs[0] as Run).x,
      ...halves(runs),
    });
  }
  return {
    label,
    body: body.map((line) => ({
      page: 0,
      row: Math.round((rowZero - line.y) / LINE),
      col: line.col,
      text: line.text.trimStart(),
      x: line.x,
      ...(line.halves ? { halves: line.halves } : {}),
    })),
  };
}

/** Splits a row in two where a wide gap leads into the right half of the page. */
function halves(runs: readonly Run[]): { halves?: PdfLine["halves"] } {
  for (let i = 1; i < runs.length; i++) {
    const before = runs[i - 1] as Run;
    const after = runs[i] as Run;
    const gap = after.x - (before.x + before.text.length * CHAR);
    if (gap >= 2 * CHAR && after.x >= DUAL_SPLIT - CHAR && (runs[0] as Run).x < DUAL_SPLIT) {
      const left = runs.slice(0, i);
      const right = runs.slice(i);
      return {
        halves: {
          left: { x: (left[0] as Run).x, text: columns(left).trim() },
          right: { x: (right[0] as Run).x, text: columns(right).trim() },
        },
      };
    }
  }
  return {};
}

/**
 * Joins a row's runs into its text. The first run is placed at its column;
 * each later one follows the gap before it: none when runs touch (a word
 * split into runs), otherwise a space for each character's width of gap
 * and at least one, since styled text can sit off Courier's grid.
 */
function columns(runs: readonly Run[]): string {
  let line = "";
  let end = 0;
  for (const run of runs) {
    // Ligatures some PDF writers use read as their letters.
    const text = run.text.replace(/[ﬀ-ﬆ]/g, (c) => c.normalize("NFKC"));
    if (line === "") {
      line = " ".repeat(Math.max(0, Math.round(run.x / CHAR))) + text;
    } else {
      const gap = run.x - end;
      // Text printed twice over itself (a fake bold) is read once.
      if (gap < -CHAR / 2 && line.endsWith(text)) continue;
      line += gap < 1 ? text : " ".repeat(Math.max(1, Math.round(gap / CHAR))) + text;
    }
    end = run.x + text.length * CHAR;
  }
  return line;
}

/**
 * A title page centres at least two lines, and at least half of its lines,
 * on the page (title, credit, author), and has no scene heading.
 */
function isTitlePage(lines: readonly PdfLine[]): boolean {
  if (lines.some((line) => line.col === ACTION_COL && HEADING.test(line.text))) return false;
  const centred = lines.filter(
    (line) => Math.abs(line.col + line.text.length / 2 - PAGE_CENTRE) <= 1,
  );
  return centred.length >= 2 && centred.length * 2 >= lines.length;
}

/** Upper case, as cue names are, before any "(" extension. */
function cueLike(text: string): boolean {
  const name = (text.split("(")[0] ?? "").trim();
  return /\p{L}/u.test(name) && !/\p{Ll}/u.test(name);
}

/**
 * Two cues, each centred in its column of dual dialogue: the whole cue, or
 * its name alone when Final Draft adds "(CONT'D)" after centring.
 */
function isDualCueRow(line: PdfLine): boolean {
  if (!line.halves) return false;
  const { left, right } = line.halves;
  const centred = (segment: Segment, column: Column) =>
    [segment.text, segment.text.replace(/\s*\(.*$/, "")].some(
      (text) => Math.abs(segment.x + (text.length * CHAR) / 2 - dualCentre(column)) <= CHAR,
    );
  return (
    cueLike(left.text) && cueLike(right.text) && centred(left, "left") && centred(right, "right")
  );
}

/** Reads a dual dialogue block into its two speeches, left then right. */
function readDual(block: readonly PdfLine[], elements: Building[]): void {
  const columns: Record<Column, string[]> = { left: [], right: [] };
  for (const row of block) {
    if (row.halves) {
      columns.left.push(row.halves.left.text);
      columns.right.push(row.halves.right.text);
    } else {
      columns[row.x < DUAL_SPLIT - CHAR ? "left" : "right"].push(row.text);
    }
  }
  for (const column of ["left", "right"] as const) {
    const [cue, ...rest] = columns[column];
    if (cue === undefined) continue;
    const fmt = DUAL_FORMATS[column];
    elements.push({
      ...building("character", stripContinued(cue), fmt.character),
      dual: column === "right",
    });
    for (const text of rest) {
      const current = elements.at(-1) as Building;
      const paren = text.startsWith("(") || (current.type === "parenthetical" && current.open);
      const type: ElementType = paren ? "parenthetical" : "dialogue";
      if (current.type === type && !(type === "parenthetical" && text.startsWith("("))) {
        join(current, text, wraps(current, text) ? "wrap" : "break");
      } else {
        elements.push(building(type, text, fmt[type]));
      }
    }
  }
}

function classify(
  line: PdfLine,
  previous: PdfLine | null,
  current: Building | undefined,
  first: boolean,
  notes: Note[],
  found: Rebuilt["found"],
): { kind: Kind; text: string } {
  const text = line.text;
  const at = line.col;
  const as = (kind: Kind, extra = 0) => ({ kind, text: " ".repeat(extra) + text });
  if (text === MORE && Math.abs(at - CUE_COL) <= 1) return as("more");
  if (at === CUE_COL) return as("character");
  if (at === DIALOGUE_COL) return as("dialogue");
  // Some templates do not hang the parenthetical's "(": it starts at 3.0 in.
  const inSpeech = current && ["character", "dialogue", "parenthetical"].includes(current.type);
  if (text.startsWith("(") && (at === PAREN_COL || (at === PAREN_NEXT_COL && inSpeech))) {
    return as("parenthetical");
  }
  if (at === PAREN_NEXT_COL && current?.type === "parenthetical" && current.open) {
    return as("parenthetical");
  }
  if (at + text.length === TRANSITION_END && at > CUE_COL) return as("transition");
  if (at === ACTION_COL) return actionLike(line, previous, current, first, notes, found);
  if (Math.abs(at + text.length / 2 - ACTION_CENTRE) <= 1) return as("action");
  // A column or two right of an indent: leading spaces the writer typed.
  if (at > DIALOGUE_COL && at <= DIALOGUE_COL + 2) return as("dialogue", at - DIALOGUE_COL);
  if (at > ACTION_COL && at <= ACTION_COL + 2) {
    return {
      ...actionLike(line, previous, current, first, notes, found),
      text: " ".repeat(at - ACTION_COL) + text,
    };
  }
  notes.push({
    page: line.page + 1,
    text: `line at ${(at / CHARS_PER_INCH).toFixed(1)} in not recognised, read as action: "${text}"`,
  });
  return as("action");
}

/** A line at the action indent: a scene heading, shot, general or action. */
function actionLike(
  line: PdfLine,
  previous: PdfLine | null,
  current: Building | undefined,
  first: boolean,
  notes: Note[],
  found: Rebuilt["found"],
): { kind: Kind; text: string } {
  const text = line.text;
  const gap = previous ? line.row - previous.row - 1 : null;
  if (HEADING.test(text)) {
    if (SCENE_NUMBER_END.test(text)) {
      found.marks++;
      return { kind: "sceneHeading", text: text.replace(SCENE_NUMBER_END, "") };
    }
    return { kind: "sceneHeading", text };
  }
  if (gap !== null && gap >= 2 && text === text.toUpperCase()) return { kind: "shot", text };
  if (gap === 0 && !first && current && current.type !== "action" && current.type !== "general") {
    return { kind: "general", text };
  }
  // At the top of a page there is no blank line above to tell a shot by
  // (a script does not open with one).
  if (first && line.page > 0 && /\p{L}/u.test(text) && !/\p{Ll}/u.test(text)) {
    notes.push({
      page: line.page + 1,
      text: `"${text}" at the top is read as action; it may be a shot`,
    });
  }
  return { kind: "action", text };
}

function isContinuedCue(text: string): boolean {
  const straight = (s: string) => s.replaceAll("’", "'").toUpperCase();
  return straight(text).endsWith(straight(CONTINUED));
}

function centredLine(line: PdfLine): boolean {
  return line.col !== ACTION_COL && Math.abs(line.col + line.text.length / 2 - ACTION_CENTRE) <= 1;
}

/** Whether a line starts a new element, or joins the current one as a wrapped or broken line. */
function place(
  line: PdfLine,
  kind: Kind,
  gap: number | null,
  current: Building | undefined,
  first: boolean,
  afterMore: boolean,
): "new" | "wrap" | "break" | "page" {
  if (!current || kind !== current.type || current.dual) return "new";
  if (first) {
    // A speech split with (MORE) goes on. Action that ends one page and
    // starts the next is joined for now; `settle` decides.
    if (afterMore && kind === "dialogue") return "page";
    if (kind === "action" && !current.centred && !centredLine(line)) return "page";
    return "new";
  }
  if (gap !== 0) return "new";
  if (kind === "parenthetical" && !current.open) return "new";
  if (kind === "sceneHeading" || kind === "transition" || kind === "shot") {
    return wraps(current, line.text) ? "wrap" : "new";
  }
  return wraps(current, line.text) ? "wrap" : "break";
}

/** A line wrapped if its first word would not have fit on the line before. */
function wraps(current: Building, text: string): boolean {
  const width = current.lineCount === 1 ? current.format.firstWidth : current.format.width;
  if (wordHyphen(current.lastLine) && /^\p{Ll}/u.test(text)) return true;
  const word = text.trimStart().split(" ")[0] ?? "";
  return current.lastLine.length + 1 + word.length > width;
}

/** Ends with a hyphen inside a word, where Final Draft breaks a line. */
function wordHyphen(line: string): boolean {
  return /[^\s-]-$|[^\s]--$/.test(line);
}

function building(type: ElementType, text: string, format: ElementFormat): Building {
  return {
    type,
    text,
    format,
    centred: false,
    dual: false,
    partStart: 0,
    lastLine: text,
    open: type === "parenthetical" && !text.endsWith(")"),
    lineCount: 1,
    pdfLines: [text],
    pages: new Set(),
  };
}

function start(kind: Kind, text: string, line: PdfLine): Building {
  const type = kind as ElementType;
  const made = building(
    type,
    type === "character" ? stripContinued(text) : text,
    ELEMENT_FORMATS[type],
  );
  if (type === "action" && centredLine(line)) made.centred = true;
  return made;
}

/** Adds a line to the element; returns where the line starts in its text. */
function join(current: Building, text: string, how: "wrap" | "break" | "page"): number {
  // A word broken after its hyphen joins without a space ("self-"
  // "respect"), unless it would have fitted whole: then a space followed the
  // hyphen ("39-year- old"), as Final Draft would not have broken there.
  const width = current.lineCount === 1 ? current.format.firstWidth : current.format.width;
  const word = text.split(" ")[0] ?? "";
  const hyphenated =
    how !== "break" &&
    wordHyphen(current.text) &&
    /^\p{Ll}/u.test(text) &&
    current.lastLine.length + word.length > width;
  current.text += how === "break" ? "\n" : hyphenated ? "" : " ";
  const offset = current.text.length;
  current.text += text;
  current.lineCount = how === "page" ? 1 : current.lineCount + 1;
  current.lastLine = text;
  current.pdfLines.push(text);
  if (how === "page") current.partStart = offset;
  if (current.type === "parenthetical") current.open = !text.endsWith(")");
  return offset;
}

/**
 * Decides each action joined across a page break. A PDF cannot show
 * whether it is one paragraph split at a sentence end or two paragraphs,
 * but pagination's rules can rule one reading out: if it were one, Final
 * Draft would have split it at the last sentence end or line break that
 * fits with two lines each side; if two, it would have started the second
 * on the page before had a piece of it fitted there. Undecided cases stay
 * joined and are noted.
 */
function settle(
  elements: Element[],
  starts: (LinePosition | null)[],
  junctions: readonly Junction[],
  notes: Note[],
): void {
  const lines = (text: string) => layoutElement({ type: "action", text }).lines.length;
  const min = PAGINATION.minSplitLines;
  /** Where pagination may split an action: after a sentence end, or at a line break. */
  const splits = (text: string) =>
    [...text.matchAll(/([.!?]+["'”’)\]]*)?(\s+)/g)]
      .filter((m) => m[1] !== undefined || (m[2] ?? "").includes("\n"))
      .map((m) => ({
        end: m.index + m[0].length - (m[2] ?? "").length,
        resume: m.index + m[0].length,
      }))
      .filter((p) => p.end > 0 && p.resume < text.length);
  /** The part pagination would put in `room` rows, or null if none fits. */
  const placed = (text: string, room: number) =>
    splits(text)
      .filter((p) => {
        const head = lines(text.slice(0, p.end));
        return head <= room && head >= min && lines(text.slice(p.resume)) >= min;
      })
      .at(-1) ?? null;
  for (const junction of [...junctions].reverse()) {
    const element = elements[junction.element] as Element;
    const before = element.text.slice(junction.from, junction.offset - 1);
    const after = element.text.slice(junction.offset);
    // Pagination splits action at a sentence end or a line break, so a part
    // that does not end a sentence was split at a line break.
    const separator = /[.!?]+["'”’)\]]*$/.test(before) ? " " : "\n";
    // A lone line in capitals is its own element, not the rest of a
    // sentence (classify notes that it may be a shot).
    if (lines(after) === 1 && /\p{L}/u.test(after) && !/\p{Ll}/u.test(after)) {
      split(elements, starts, junction);
      continue;
    }
    if (separator === "\n") {
      const text = `${element.text.slice(0, junction.offset - 1)}\n${after}`;
      elements[junction.element] = { ...element, text };
    }
    const joined = `${before}${separator}${after}`;
    const one = placed(joined, lines(before) + junction.room)?.end === before.length;
    const fitsWhole = 1 + lines(after) <= junction.room;
    const two = !fitsWhole && placed(after, junction.room - 1) === null;
    if (two && !one) {
      split(elements, starts, junction);
    } else if (one === two) {
      notes.push({
        page: junction.page,
        text: "action at the top may continue the last page's paragraph or start its own: read as one",
      });
    }
  }
}

/** Splits a joined element in two at a junction, moving later page starts along. */
function split(elements: Element[], starts: (LinePosition | null)[], junction: Junction): void {
  const element = elements[junction.element] as Element;
  elements.splice(
    junction.element,
    1,
    { ...element, text: element.text.slice(0, junction.offset - 1) },
    { ...element, text: element.text.slice(junction.offset) },
  );
  starts.forEach((start, i) => {
    if (!start || start.element < junction.element) return;
    if (start.element > junction.element) {
      starts[i] = { ...start, element: start.element + 1 };
    } else if (start.offset >= junction.offset) {
      starts[i] = { ...start, element: start.element + 1, offset: start.offset - junction.offset };
    }
  });
}

function stripContinued(cue: string): string {
  return cue.replace(/\s*\(CONT['’]D\)$/i, "");
}

function finish(built: Building): Element {
  const element: { -readonly [K in keyof Element]: Element[K] } = {
    type: built.type,
    text: built.text,
  };
  if (built.centred) element.centred = true;
  if (built.dual) element.dual = true;
  return element;
}
