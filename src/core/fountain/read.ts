/**
 * Reads Fountain 1.1 (fountain.io/syntax) into the model. What Tir does not
 * keep (notes, boneyard, sections, synopses, scene numbers and unknown title
 * page fields) is listed in `leftOut` for the import report (brief, "Import
 * report"), each with the element and place it sat at so the report can give
 * its page. Tir's own type notes, `[[tir:shot]]`, set the type of the element
 * they open (see write.ts).
 *
 * The report also lists two simplifications that lose no text: extra blank
 * lines between paragraphs collapse into one, because Final Draft has no
 * blank line that is not an element; and emphasis on the title page is
 * dropped, because Tir sets the title page in its own fixed style.
 */
import type { LeftOut, LeftOutKind, ScriptRead } from "../import-report.ts";
import {
  type Element,
  type ElementType,
  normaliseSpans,
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

interface Removed {
  readonly kind: LeftOutKind;
  readonly text: string;
  /**
   * Letters and digits before it on its line. Fountain's syntax adds and
   * removes none, so they find the same place in the element's text.
   */
  readonly column?: number;
  /** Where it sat in its element's text, once the element is built. */
  offset?: number;
}

interface Line {
  text: string;
  /** A Tir type note on this line. */
  readonly marker: ElementType | undefined;
  removed: Removed[];
  /** The element this line became part of, and where the line starts in its text. */
  element?: number;
  offset?: number;
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

export interface ReadOptions {
  /**
   * Whether an opening block of `Key: value` lines is a title page, as at the
   * start of a file. Without it, that block is script like any other.
   */
  readonly titlePage?: boolean;
}

export function readFountain(source: string, options: ReadOptions = {}): ScriptRead {
  const lines = splitLines(source);
  const start = lines.findIndex((line) => !isBlank(line));
  let titleEnd = start < 0 ? lines.length : start;
  while (titleEnd < lines.length && !isBlank(lines[titleEnd] as Line)) titleEnd++;
  const titleLines = start < 0 ? [] : lines.slice(start, titleEnd);

  const leftOut: LeftOut[] = [];
  let titlePage = emptyTitlePage();
  let body = lines;
  if (options.titlePage !== false && isTitlePage(titleLines)) {
    for (let i = 0; i < start; i++) {
      for (const item of lines[i]?.removed ?? []) leftOut.push(unlocated(item));
    }
    titlePage = readTitlePage(titleLines, leftOut);
    body = lines.slice(titleEnd);
  }

  const kept = removeLineSyntax(body);
  const elements = buildElements(kept);
  collectLeftOut(kept, elements, leftOut);
  return { script: { titlePage, elements }, leftOut };
}

const unlocated = ({ kind, text }: Removed): LeftOut => ({ kind, text, at: null });

const WORD_CHAR = /[\p{L}\p{N}]/u;

function wordChars(text: string): number {
  let count = 0;
  for (const char of text) if (WORD_CHAR.test(char)) count++;
  return count;
}

/** The offset just after the `count`th letter or digit, or the end of a shorter text. */
function afterWordChars(text: string, count: number): number {
  if (count === 0) return 0;
  let seen = 0;
  let offset = 0;
  for (const char of text) {
    offset += char.length;
    if (WORD_CHAR.test(char) && ++seen === count) return offset;
  }
  return text.length;
}

/** Splits lines and tracks notes as metadata, not as reserved characters in the text. */
function splitLines(source: string): Line[] {
  const text = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines: Line[] = [];
  let removed: Removed[] = [];
  let marker: ElementType | undefined;
  let cleaned = "";
  let segmentStart = 0;
  let removedSyntax = false;
  let leading = true;
  let i = 0;
  while (i <= text.length) {
    if (i === text.length || text[i] === "\n") {
      cleaned += text.slice(segmentStart, i);
      // An omission alone on a line must not split the surrounding speech.
      if (!removedSyntax || cleaned.trim() || marker !== undefined) {
        lines.push({ text: cleaned, marker, removed });
        removed = [];
      }
      marker = undefined;
      cleaned = "";
      removedSyntax = false;
      leading = true;
      segmentStart = ++i;
      continue;
    }
    if (text[i] === "\\") {
      // Keep escapes for inline parsing, but do not interpret escaped note delimiters here.
      i += i + 1 < text.length && text[i + 1] !== "\n" ? 2 : 1;
      continue;
    }
    const boneyard = text.startsWith("/*", i);
    if (boneyard || text.startsWith("[[", i)) {
      const end = text.indexOf(boneyard ? "*/" : "]]", i + 2);
      if (end >= 0) {
        const inside = text.slice(i + 2, end);
        const type = boneyard ? null : markerType(inside);
        if (type) marker ??= type;
        else {
          const column = wordChars(cleaned) + wordChars(text.slice(segmentStart, i));
          removed.push({ kind: boneyard ? "boneyard" : "note", text: inside.trim(), column });
        }
        removedSyntax = true;

        // Remove one space after an opening run of omissions, or before each
        // later omission, so removing the syntax does not leave doubled spaces.
        leading &&= i === segmentStart;
        if (!leading) {
          const trim = i > segmentStart && text[i - 1] === " " ? 1 : 0;
          cleaned += text.slice(segmentStart, i - trim);
        }
        i = end + 2;
        if (leading && text[i] === " ") {
          i++;
          leading = false;
        }
        segmentStart = i;
        continue;
      }
    }
    i++;
  }
  if (removed.length > 0) lines.push({ text: "", marker: undefined, removed });
  return lines;
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
  const emphasis = new Set<Style>();
  const plain = (value: string) => {
    const parsed = parseInline(value);
    for (const style of STYLES) if (parsed[style].length > 0) emphasis.add(style);
    return parsed.text;
  };
  let current: string[] | null = null;
  let shown = false;
  for (const line of block) {
    for (const item of line.removed) leftOut.push(unlocated(item));
    const keyed = titleKey(line);
    if (!keyed) {
      current?.push(plain(line.text.trim()));
      continue;
    }
    const key = normaliseKey(keyed.key);
    const field = TITLE_FIELDS.get(key);
    if (!field) {
      leftOut.push({ kind: "titlePageField", text: keyed.key.trim(), at: null });
      current = null;
      continue;
    }
    if (key === "draft date") shown = true;
    current = values.get(field) ?? [];
    values.set(field, current);
    const value = keyed.value.trim();
    if (value) current.push(plain(value));
  }
  for (const style of STYLES) {
    if (emphasis.has(style))
      leftOut.push({ kind: "formatting", text: `title page ${style}`, at: null });
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

const EXTRA_BLANK_LINES = "extra blank lines";

function buildElements(lines: readonly Line[]): Element[] {
  const drafts: Draft[] = [];
  let pageBreak = false;
  let paragraph: Line[] = [];
  // Blank lines since the last paragraph; extra ones are reported once.
  let blanks = 0;
  let spaced = false;
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
      blanks = 0;
    } else if (!isBlank(line)) {
      if (blanks > 1 && drafts.length > 0 && !spaced) {
        line.removed.push({ kind: "layout", text: EXTRA_BLANK_LINES });
        spaced = true;
      }
      blanks = 0;
      paragraph.push(line);
    } else if (paragraph.length > 0 && line.text.length >= 2 && continues(lines[i + 1])) {
      // Two spaces keep an empty line inside an element.
      paragraph.push(line);
    } else {
      flush();
      // A blank line carrying omissions follows a paragraph that was removed.
      blanks = line.removed.length > 0 ? 1 : blanks + 1;
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
    if (i > 0) text += "\n";
    // Action keeps its indentation; other elements do not (Fountain, "Indenting").
    const trimmed = draft.type === "action" && !draft.centred ? raw.trimEnd() : raw.trim();
    const parsed = parseInline(trimmed);
    const offset = text.length;
    line.element = index;
    line.offset = offset;
    for (const item of line.removed) {
      if (item.column !== undefined)
        item.offset = offset + afterWordChars(parsed.text, item.column);
    }
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

/** Gives each left-out item the element and place it sat at, or before. */
function collectLeftOut(
  lines: readonly Line[],
  elements: readonly Element[],
  leftOut: LeftOut[],
): void {
  const located = ({ kind, text }: Removed, at: number, offset: number): LeftOut =>
    offset > 0 ? { kind, text, at, offset } : { kind, text, at };
  let pending: Removed[] = [];
  for (const line of lines) {
    if (line.element === undefined) {
      pending.push(...line.removed);
      continue;
    }
    const start = line.offset ?? 0;
    for (const item of pending) leftOut.push(located(item, line.element, start));
    for (const item of line.removed) {
      leftOut.push(located(item, line.element, item.offset ?? start));
    }
    pending = [];
  }
  const last = elements.length - 1;
  for (const item of pending) {
    const end = elements[last]?.text.length;
    leftOut.push(end === undefined ? unlocated(item) : located(item, last, end));
  }
}
