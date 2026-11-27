/**
 * Reads Fountain 1.1 (fountain.io/syntax) into the model. What Tir does not
 * keep (notes, boneyard, sections, synopses, scene numbers and unknown title
 * page fields) is listed in `leftOut` for the import report (brief, "Import
 * report"), each with the element it sat beside so the report can give its
 * page. Tir's own type notes, `[[tir:shot]]`, set the type of the element
 * they open (see write.ts).
 *
 * Two simplifications lose no text, so the report omits them: extra blank
 * lines between paragraphs collapse into one, because Final Draft has no
 * blank line that is not an element; and emphasis on the title page is
 * dropped, because Tir sets the title page in its own fixed style.
 */
import {
  type Element,
  type ElementType,
  normaliseSpans,
  type Script,
  type Span,
  STYLES,
  type Style,
  type TitlePage,
} from "../model.ts";
import { parseInline } from "./inline.ts";
import {
  centredText,
  isCue,
  isForcedHeading,
  isHeading,
  isLyric,
  isPageBreak,
  isSection,
  isSynopsis,
  isTransition,
  markerType,
  SCENE_NUMBER,
  splitDual,
  TITLE_CONTINUATION,
  TITLE_KEY,
} from "./syntax.ts";

export type LeftOutKind =
  | "note"
  | "boneyard"
  | "section"
  | "synopsis"
  | "sceneNumber"
  | "titlePageField";

export interface LeftOut {
  readonly kind: LeftOutKind;
  readonly text: string;
  /** The index of the element it sat beside, or 0 on the title page. */
  readonly at: number;
}

export interface FountainRead {
  readonly script: Script;
  readonly leftOut: readonly LeftOut[];
}

interface Removed {
  readonly kind: LeftOutKind;
  readonly text: string;
}

interface Line {
  text: string;
  /** A Tir type note on this line. */
  readonly marker: ElementType | undefined;
  removed: Removed[];
  /** The element this line became part of. */
  element?: number;
}

/** An element being built: its type, flags and raw lines. */
interface Draft {
  type: ElementType;
  readonly lines: { readonly line: Line; text: string; readonly lyric: boolean }[];
  centred?: true;
  dual?: true;
  pageBreakBefore?: true;
  /** A parenthetical still waiting for its ")". */
  open?: boolean;
}

const LEFT_OUT = "\uE000";
const MARKER = "\uE001";

export interface ReadOptions {
  /**
   * Whether an opening block of `Key: value` lines is a title page, as at the
   * start of a file. Without it, that block is script like any other.
   */
  readonly titlePage?: boolean;
}

export function readFountain(source: string, options: ReadOptions = {}): FountainRead {
  const lines = splitLines(source);
  const start = lines.findIndex((line) => !isBlank(line));
  let titleEnd = start < 0 ? lines.length : start;
  while (titleEnd < lines.length && !isBlank(lines[titleEnd] as Line)) titleEnd++;
  const titleLines = start < 0 ? [] : lines.slice(start, titleEnd);

  const leftOut: LeftOut[] = [];
  let titlePage = emptyTitlePage();
  let body = lines;
  if (options.titlePage !== false && isTitlePage(titleLines)) {
    titlePage = readTitlePage(titleLines, leftOut);
    body = lines.slice(titleEnd);
  }

  const kept = removeLineSyntax(body);
  const elements = buildElements(kept);
  collectLeftOut(kept, elements.length, leftOut);
  return { script: { titlePage, elements }, leftOut };
}

/** Splits into lines, setting aside notes and boneyard as it goes. */
function splitLines(source: string): Line[] {
  const removed: Removed[] = [];
  const markers: ElementType[] = [];
  const text = setAside(source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"), removed, markers);

  const lines: Line[] = [];
  let pending: Removed[] = [];
  for (const raw of text.split("\n")) {
    const lineRemoved = [...raw]
      .filter((c) => c === LEFT_OUT)
      .map(() => removed.shift() as Removed);
    const lineMarkers = [...raw].filter((c) => c === MARKER).map(() => markers.shift());
    const cleaned = raw.replace(/^[\uE000\uE001]+ ?| ?[\uE000\uE001]/g, "");
    // A line that held only a note or boneyard goes, so a note between two
    // lines of a speech does not split it.
    if (raw !== cleaned && cleaned.trim() === "" && lineMarkers.length === 0) {
      pending.push(...lineRemoved);
      continue;
    }
    lines.push({ text: cleaned, marker: lineMarkers[0], removed: [...pending, ...lineRemoved] });
    pending = [];
  }
  if (pending.length > 0) lines.push({ text: "", marker: undefined, removed: pending });
  return lines;
}

/**
 * Replaces each note and each stretch of boneyard with a placeholder,
 * skipping escaped characters, so `\/**bold**` is not boneyard.
 */
function setAside(text: string, removed: Removed[], markers: ElementType[]): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "\\") {
      out += text.slice(i, i + 2);
      i += 2;
      continue;
    }
    const boneyard = text.startsWith("/*", i);
    if (boneyard || text.startsWith("[[", i)) {
      const end = text.indexOf(boneyard ? "*/" : "]]", i + 2);
      if (end >= 0) {
        const inside = text.slice(i + 2, end);
        const type = boneyard ? null : markerType(inside);
        if (type) markers.push(type);
        else removed.push({ kind: boneyard ? "boneyard" : "note", text: inside.trim() });
        out += type ? MARKER : LEFT_OUT;
        i = end + 2;
        continue;
      }
    }
    out += text[i];
    i++;
  }
  return out;
}

function isBlank(line: Line): boolean {
  return line.marker === undefined && line.text.trim() === "";
}

function emptyTitlePage(): TitlePage {
  return {
    title: "",
    credit: "",
    authors: "",
    source: "",
    contact: "",
    draftDate: "",
    showDraftDate: false,
  };
}

const TITLE_FIELDS = new Map<string, keyof TitlePage>([
  ["title", "title"],
  ["credit", "credit"],
  ["author", "authors"],
  ["authors", "authors"],
  ["author(s)", "authors"],
  ["source", "source"],
  ["contact", "contact"],
  ["draft date", "draftDate"],
  // Tir writes a draft date that is not shown under this key.
  ["hidden draft date", "draftDate"],
]);

function titleKey(line: Line): { key: string; value: string } | null {
  if (line.marker !== undefined) return null;
  const match = TITLE_KEY.exec(line.text);
  return match ? { key: match[1] as string, value: match[2] as string } : null;
}

function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * The first block of lines is a title page when it is made of `Key: value`
 * lines and indented continuations, and names at least one field Fountain
 * defines, so an opening "FADE IN:" stays in the script.
 */
function isTitlePage(block: readonly Line[]): boolean {
  const first = block[0];
  if (!first || !titleKey(first)) return false;
  const keyed = block.every(
    (line) => titleKey(line) || (line.marker === undefined && TITLE_CONTINUATION.test(line.text)),
  );
  const known = block.some((line) => {
    const key = titleKey(line)?.key;
    return key !== undefined && TITLE_FIELDS.has(normaliseKey(key));
  });
  return keyed && known;
}

function readTitlePage(block: readonly Line[], leftOut: LeftOut[]): TitlePage {
  const values = new Map<keyof TitlePage, string[]>();
  let current: string[] | null = null;
  let shown = false;
  for (const line of block) {
    for (const item of line.removed) leftOut.push({ ...item, at: 0 });
    const keyed = titleKey(line);
    if (!keyed) {
      current?.push(parseInline(line.text.trim()).text);
      continue;
    }
    const key = normaliseKey(keyed.key);
    const field = TITLE_FIELDS.get(key);
    if (!field) {
      leftOut.push({ kind: "titlePageField", text: keyed.key.trim(), at: 0 });
      current = null;
      continue;
    }
    if (key === "draft date") shown = true;
    current = values.get(field) ?? [];
    values.set(field, current);
    const value = keyed.value.trim();
    if (value) current.push(parseInline(value).text);
  }
  const text = (field: keyof TitlePage) => (values.get(field) ?? []).join("\n");
  return {
    title: text("title"),
    credit: text("credit"),
    authors: text("authors"),
    source: text("source"),
    contact: text("contact"),
    draftDate: text("draftDate"),
    showDraftDate: shown,
  };
}

/** Removes section and synopsis lines and expands tabs (Fountain: four spaces). */
function removeLineSyntax(lines: readonly Line[]): Line[] {
  const kept: Line[] = [];
  let pending: Removed[] = [];
  for (const line of lines) {
    if (line.marker === undefined && (isSection(line.text) || isSynopsis(line.text))) {
      const t = line.text.trimStart();
      const kind = isSection(t) ? "section" : "synopsis";
      pending.push(...line.removed, { kind, text: t.replace(/^(#+|=)\s*/, "") });
      continue;
    }
    line.text = line.text.replaceAll("\t", "    ");
    line.removed = [...pending, ...line.removed];
    pending = [];
    kept.push(line);
  }
  if (pending.length > 0) kept.push({ text: "", marker: undefined, removed: pending });
  return kept;
}

function buildElements(lines: readonly Line[]): Element[] {
  const drafts: Draft[] = [];
  let pageBreak = false;
  let paragraph: Line[] = [];
  const flush = () => {
    if (paragraph.length === 0) return;
    const made = classify(paragraph);
    if (pageBreak && made[0]) made[0].pageBreakBefore = true;
    pageBreak = false;
    drafts.push(...made);
    paragraph = [];
  };
  lines.forEach((line, i) => {
    if (line.marker === undefined && isPageBreak(line.text)) {
      flush();
      pageBreak = true;
    } else if (!isBlank(line)) {
      paragraph.push(line);
    } else if (paragraph.length > 0 && line.text.length >= 2 && continues(lines[i + 1])) {
      // Two spaces keep an empty line inside an element.
      paragraph.push(line);
    } else {
      flush();
    }
  });
  flush();
  return drafts.map((draft, index) => finish(draft, index));
}

function continues(next: Line | undefined): boolean {
  return next !== undefined && !isBlank(next) && !isPageBreak(next.text);
}

/** Classifies one paragraph by its first line, following Fountain's rules. */
function classify(lines: Line[]): Draft[] {
  const [first, ...rest] = lines as [Line, ...Line[]];
  const t = first.text.trimStart();
  let made: Draft[];
  if (t.startsWith("!")) {
    made = [action(lines, first.text.replace("!", ""))];
  } else if (isForcedHeading(t)) {
    made = [single("sceneHeading", first, heading(t.slice(1))), ...classifyRest(rest)];
  } else if (centredText(first.text) !== null) {
    made = [
      {
        type: "action",
        centred: true,
        lines: lines.map((line) => ({
          line,
          text: centredText(line.text) ?? line.text.trim(),
          lyric: false,
        })),
      },
    ];
  } else if (t.startsWith(">")) {
    made = [single("transition", first, t.slice(1).trim()), ...classifyRest(rest)];
  } else if (t.startsWith("@")) {
    made = speech(first, t.slice(1), rest);
  } else if (isLyric(t)) {
    made = [action(lines)];
  } else if (rest.length === 0 && isHeading(t)) {
    made = [single("sceneHeading", first, heading(t))];
  } else if (rest.length === 0 && isTransition(first.text)) {
    made = [single("transition", first, t.trim())];
  } else if (rest.length > 0 && isCue(t)) {
    made = speech(first, t, rest);
  } else {
    made = [action(lines)];
  }
  const opening = made[0];
  if (opening && first.marker) opening.type = first.marker;
  return made;
}

function classifyRest(rest: Line[]): Draft[] {
  return rest.length > 0 ? classify(rest) : [];
}

/** A scene heading's text, with any scene number set aside. */
function heading(text: string): { text: string; sceneNumber?: string } {
  const match = SCENE_NUMBER.exec(text);
  if (!match) return { text: text.trim() };
  return { text: text.slice(0, match.index).trim(), sceneNumber: match[1] as string };
}

function single(
  type: ElementType,
  line: Line,
  content: string | { text: string; sceneNumber?: string },
): Draft {
  const { text, sceneNumber } = typeof content === "string" ? { text: content } : content;
  if (sceneNumber !== undefined) line.removed.push({ kind: "sceneNumber", text: sceneNumber });
  return { type, lines: [{ line, text, lyric: false }] };
}

/** An action paragraph; `firstText` replaces the first line's text when forced. */
function action(lines: Line[], firstText?: string): Draft {
  return {
    type: "action",
    lines: lines.map((line, i) => {
      const text = i === 0 && firstText !== undefined ? firstText : line.text;
      return isLyric(text)
        ? { line, text: text.trimStart().slice(1), lyric: true }
        : { line, text, lyric: false };
    }),
  };
}

/** A cue and the parentheticals and dialogue under it. */
function speech(first: Line, cueText: string, rest: Line[]): Draft[] {
  const { cue, dual } = splitDual(cueText);
  const made: Draft[] = [{ type: "character", lines: [{ line: first, text: cue, lyric: false }] }];
  if (dual) (made[0] as Draft).dual = true;
  for (const line of rest) {
    const t = line.text.trim();
    const current = made.at(-1) as Draft;
    const entry = { line, text: isLyric(t) ? t.slice(1) : t, lyric: isLyric(t) };
    if (line.marker) {
      made.push({ type: line.marker, lines: [entry] });
    } else if (current.type === "parenthetical" && current.open) {
      current.lines.push(entry);
      current.open = !t.endsWith(")");
    } else if (t.startsWith("(")) {
      made.push({ type: "parenthetical", lines: [entry], open: !t.endsWith(")") });
    } else if (current.type === "dialogue") {
      current.lines.push(entry);
    } else {
      made.push({ type: "dialogue", lines: [entry] });
    }
  }
  return made;
}

/** Turns a draft into an element, reading emphasis line by line. */
function finish(draft: Draft, index: number): Element {
  let text = "";
  const spans: Record<Style, Span[]> = { bold: [], italic: [], underline: [] };
  draft.lines.forEach(({ line, text: raw, lyric }, i) => {
    line.element = index;
    if (i > 0) text += "\n";
    // Action keeps its indentation; other elements do not (Fountain, "Indenting").
    const trimmed = draft.type === "action" && !draft.centred ? raw.trimEnd() : raw.trim();
    const parsed = parseInline(trimmed);
    const offset = text.length;
    for (const style of STYLES) {
      for (const [start, end] of parsed[style]) spans[style].push([offset + start, offset + end]);
    }
    // Lyrics are set in italics.
    if (lyric && parsed.text.length > 0) spans.italic.push([offset, offset + parsed.text.length]);
    text += parsed.text;
  });

  const element: { -readonly [K in keyof Element]: Element[K] } = { type: draft.type, text };
  for (const style of STYLES) {
    const normal = normaliseSpans(spans[style]);
    if (normal.length > 0) element[style] = normal;
  }
  if (draft.centred) element.centred = true;
  if (draft.dual && draft.type === "character") element.dual = true;
  if (draft.pageBreakBefore) element.pageBreakBefore = true;
  return element;
}

/** Gives each left-out item the element it sat on or before. */
function collectLeftOut(lines: readonly Line[], count: number, leftOut: LeftOut[]): void {
  let pending: Removed[] = [];
  for (const line of lines) {
    pending.push(...line.removed);
    if (line.element !== undefined) {
      for (const item of pending) leftOut.push({ ...item, at: line.element });
      pending = [];
    }
  }
  for (const item of pending) leftOut.push({ ...item, at: Math.max(0, count - 1) });
}
