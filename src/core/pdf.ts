/**
 * PDF export (brief, "PDF export"): the title page, then the script's pages
 * as the editor shows them. The PDF does no layout of its own (architecture,
 * design rule 1): every line, its place and its page come from `paginate`,
 * and the title page's places from `TITLE_PAGE`, which its preview uses too.
 * Text is Courier Prime, embedded and subset, black on white whatever the
 * paper on screen. What the PDF cannot print as the screen shows it (a
 * character Courier Prime lacks, text past the paper's edge) stops the
 * export with a message saying where it is, before any PDF is made.
 */
import fontkit, { type Font } from "@cantoo/fontkit";
import {
  PDFDocument,
  type PDFFont,
  PDFHexString,
  PDFName,
  type PDFPage,
  type PDFRef,
  rgb,
} from "@cantoo/pdf-lib";
import {
  CHARS_PER_INCH,
  FONT_SIZE_PT,
  LINES_PER_INCH,
  PAGE,
  PAGINATION,
  TITLE_PAGE,
} from "./format.ts";
import { capitals, expandTitleTabs, graphemeCount, graphemeStarts } from "./layout.ts";
import type { Element, Script, Span, TitlePage } from "./model.ts";
import { type Page, type PageLine, pageLabel, paginate } from "./paginate.ts";
import { ScriptMap } from "./script-map.ts";

export const FONT_FACES = ["regular", "bold", "italic", "boldItalic"] as const;
export type FontFace = (typeof FONT_FACES)[number];
/** Courier Prime's four font files. */
export type PdfFonts = Readonly<Record<FontFace, Uint8Array>>;

export interface PdfOptions {
  /** Whether the title page comes first; the writer may leave it out (brief, "PDF export"). */
  readonly titlePage: boolean;
}

const POINTS = 72;
const LINE_PT = POINTS / LINES_PER_INCH;
/** One character of the engine's lines: 7.2 pt, where Courier Prime's own advance is 7.195. */
const CELL_PT = POINTS / CHARS_PER_INCH;
const PAGE_SIZE: [number, number] = [PAGE.widthIn * POINTS, PAGE.heightIn * POINTS];
const BLACK = rgb(0, 0, 0);

/**
 * Subset fonts' names start with six capitals and "+" (PDF 1.7, 9.6.4),
 * different for each subset in the file.
 */
const SUBSET_TAGS: Readonly<Record<FontFace, string>> = {
  regular: "TIRAAA",
  bold: "TIRAAB",
  italic: "TIRAAC",
  boldItalic: "TIRAAD",
};

interface Face {
  readonly font: PDFFont;
  /** Added to each character's advance, so every character takes its cell of the engine's line. */
  readonly spacing: number;
  /** The underline's centre below the baseline, and its thickness, in points. */
  readonly underlineDrop: number;
  readonly underlineThickness: number;
}

/** A stretch of a line's text in one face, as [start, end) offsets into the line's text. */
interface Run {
  readonly start: number;
  readonly end: number;
  readonly face: FontFace;
  readonly underline: boolean;
}

/** Text as the PDF sets it (`setText`), in points from the page's left edge and top. */
interface Placed {
  readonly text: string;
  readonly x: number;
  readonly top: number;
  readonly run?: Run;
}

export async function writePdf(
  script: Script,
  fonts: PdfFonts,
  options: PdfOptions,
): Promise<Uint8Array> {
  const pages = paginate(script.elements);
  const parsed = new Map<FontFace, Font>();
  const glyphs = (name: FontFace) => {
    let font = parsed.get(name);
    if (!font) {
      font = parseFont(fonts[name]);
      parsed.set(name, font);
    }
    return font;
  };
  // Everything is set, and checked, before the PDF is begun.
  const misprints = new Misprints();
  const title = options.titlePage
    ? titlePageText(script.titlePage, glyphs("regular"), misprints)
    : [];
  const body = pages.map((page) => pageText(page, script.elements, glyphs, misprints));
  if (misprints.found) throw new Error(misprints.message());

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  describe(doc, script.titlePage);

  const faces = new Map<FontFace, Promise<Face>>();
  const face = (name: FontFace) => {
    let embedded = faces.get(name);
    if (!embedded) {
      embedded = embed(doc, fonts[name], glyphs(name), name);
      faces.set(name, embedded);
    }
    return embedded;
  };
  // Every face shares the regular face's vertical metrics; the baseline sits
  // where the browser puts it in a line box of one row (CSS half-leading).
  const metrics = glyphs("regular");
  const scale = FONT_SIZE_PT / metrics.unitsPerEm;
  const baseline = (LINE_PT + (metrics.ascent + metrics.descent) * scale) / 2;

  // A page given a font gains a font resource each time, so each page is
  // given a face only when its text changes face.
  const onPage = (page: PDFPage) => {
    let current: FontFace | null = null;
    return async ({ text, x, top, run }: Placed) => {
      if (!text) return;
      const name = run?.face ?? "regular";
      const { font, spacing, underlineDrop, underlineThickness } = await face(name);
      if (name !== current) {
        page.setFont(font);
        current = name;
      }
      const y = PAGE_SIZE[1] - top - baseline;
      page.drawText(text, {
        x,
        y,
        size: FONT_SIZE_PT,
        color: BLACK,
        characterSpacing: spacing,
      });
      if (run?.underline) {
        const width = graphemeCount(text) * CELL_PT;
        page.drawLine({
          start: { x, y: y - underlineDrop },
          end: { x: x + width, y: y - underlineDrop },
          thickness: underlineThickness,
          color: BLACK,
        });
      }
    };
  };

  if (options.titlePage) {
    const draw = onPage(doc.addPage(PAGE_SIZE));
    for (const placed of title) await draw(placed);
  }
  const pdfPages: PDFPage[] = [];
  for (const [i, scriptPage] of pages.entries()) {
    const page = doc.addPage(PAGE_SIZE);
    pdfPages.push(page);
    const draw = onPage(page);
    const label = pageLabel(scriptPage.number);
    if (label) {
      const x = PAGE.widthIn - PAGE.rightMarginIn - graphemeCount(label) / CHARS_PER_INCH;
      await draw({ text: label, x: x * POINTS, top: PAGE.headerIn * POINTS });
    }
    for (const placed of body[i] ?? []) await draw(placed);
  }

  outline(doc, script.elements, pages, pdfPages);
  if (options.titlePage) labelPages(doc);
  return doc.save();
}

/** A page's lines as the PDF sets them, run by run, noting what it cannot print as shown. */
function pageText(
  page: Page,
  elements: readonly Element[],
  glyphs: (face: FontFace) => Font,
  misprints: Misprints,
): Placed[] {
  const where = `Page ${page.number}`;
  // Only (MORE) may take the row below the page's last (findings, "Pagination").
  const past = page.lines.find((line) =>
    line.kind === "more" ? line.row > PAGINATION.linesPerPage : line.row >= PAGINATION.linesPerPage,
  );
  if (past) misprints.add(`${where}: ${overflow(past, elements)}`);
  const placed: Placed[] = [];
  for (const line of page.lines) {
    const top = rowTop(line.row);
    const refused: Refused[] = [];
    for (const run of runsOf(line, elements[line.element])) {
      const x = line.x * POINTS + graphemeCount(line.text.slice(0, run.start)) * CELL_PT;
      const text = setText(line.text.slice(run.start, run.end), glyphs(run.face), (at, grapheme) =>
        refused.push({ at: run.start + at, grapheme }),
      );
      placed.push({ text, x, top, run });
    }
    misprints.characters(where, line.text, refused);
  }
  return placed;
}

/** What runs past the foot of a page; the engine keeps dual dialogue whole. */
function overflow(line: PageLine, elements: readonly Element[]): string {
  if (line.column) {
    const cueBefore = (index: number) => {
      let i = index;
      while (i >= 0 && elements[i]?.type !== "character") i--;
      return i;
    };
    const cue = cueBefore(line.element);
    let other = cue + 1;
    if (elements[cue]?.dual) other = cueBefore(cue - 1);
    else while (other < elements.length && elements[other]?.type !== "character") other++;
    const [left, right] = [cue, other]
      .sort((a, b) => a - b)
      .map((i) => capitals(elements[i]?.text ?? "").trim() || "a speaker with no name");
    return (
      `the dual dialogue of ${left} and ${right} is longer than a page. ` +
      "Shorten a speech, or put the two in one column with Ctrl+Alt+D."
    );
  }
  const text = elements[line.element]?.text.split("\n")[0]?.trim() ?? "";
  const start = graphemeCount(text) > 30 ? `${text.slice(0, 30).trimEnd()}…` : text;
  return `the text from “${start}” runs past the foot of the page. Shorten it.`;
}

/** Points from the page's top edge to the top of a body row. */
function rowTop(row: number): number {
  return (PAGE.topMarginIn + row / LINES_PER_INCH) * POINTS;
}

const PLAIN = /^[\x20-\x7e]*$/;
/**
 * Characters that print differently than the screen shows them, whatever
 * the font holds: controls, hidden formatting such as a soft hyphen, line
 * and paragraph separators, private use and unassigned code points.
 */
const UNSEEN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cn}\p{Cs}]/u;

/**
 * Text as the PDF sets it, one of Courier Prime's glyphs to each of the
 * engine's cells. A tab takes one cell, as the engine counts it, so it
 * prints as a space. An accent pasted as a mark after its letter joins it
 * (NFC), as text shaping joins it on screen, into the letter the font
 * holds. Each character (grapheme) the font cannot set as one glyph goes to
 * `refuse`, with its offset in `text`.
 */
function setText(text: string, font: Font, refuse: (at: number, grapheme: string) => void): string {
  const spaced = text.replaceAll("\t", " ");
  if (PLAIN.test(spaced)) return spaced;
  const starts = graphemeStarts(spaced) ?? Array.from({ length: spaced.length + 1 }, (_, i) => i);
  let set = "";
  for (let i = 0; i + 1 < starts.length; i++) {
    const at = starts[i] as number;
    const grapheme = spaced.slice(at, starts[i + 1]).normalize("NFC");
    const code = grapheme.codePointAt(0) as number;
    const single = grapheme.length === (code > 0xffff ? 2 : 1);
    if (!single || UNSEEN.test(grapheme) || !font.hasGlyphForCodePoint(code)) refuse(at, grapheme);
    set += grapheme;
  }
  return set;
}

/** A character `setText` cannot set as shown, at an offset into its line. */
interface Refused {
  readonly at: number;
  readonly grapheme: string;
}

/** How many problems a refusal lists; it counts the rest. */
const LISTED = 6;

/** What the PDF would not print as Tir shows it. Tir makes no PDF while there is any. */
class Misprints {
  private readonly notes: { readonly text: string; more: number }[] = [];
  /** Notes on characters, by the characters, so each set is noted once and then counted. */
  private readonly byCharacters = new Map<string, { readonly text: string; more: number }>();

  get found(): boolean {
    return this.notes.length > 0;
  }

  add(text: string): void {
    this.notes.push({ text, more: 0 });
  }

  /** The characters refused in a line of text at `where`, word by word. */
  characters(where: string, text: string, refused: readonly Refused[]): void {
    const words = new Map<number, { end: number; graphemes: Set<string> }>();
    for (const { at, grapheme } of refused) {
      let start = at;
      while (start > 0 && !/\s/.test(text[start - 1] as string)) start--;
      let end = at;
      while (end < text.length && !/\s/.test(text[end] as string)) end++;
      const word = words.get(start) ?? { end, graphemes: new Set<string>() };
      word.graphemes.add(grapheme);
      words.set(start, word);
    }
    for (const [start, { end, graphemes }] of words) {
      const unique = [...graphemes];
      const key = unique.join("\u0000");
      const seen = this.byCharacters.get(key);
      if (seen) {
        seen.more++;
        continue;
      }
      const word = text.slice(start, end).normalize("NFC");
      const place = !word || word === unique[0] ? where : `${where}, in “${word}”`;
      const note = { text: `${place}: ${describeCharacters(unique)}`, more: 0 };
      this.byCharacters.set(key, note);
      this.notes.push(note);
    }
  }

  message(): string {
    const lines = this.notes.slice(0, LISTED).map(({ text, more }) => {
      const also = more ? ` It is in ${more} more ${more === 1 ? "place" : "places"}.` : "";
      return `• ${text}${also}`;
    });
    if (this.notes.length > LISTED) lines.push(`…and ${this.notes.length - LISTED} more.`);
    return (
      "The PDF would not print the script as Tir shows it. " +
      `Change the following, then export again:\n\n${lines.join("\n")}`
    );
  }
}

/** Why characters cannot print: shown with their code points where they can be seen, else by code point alone. */
function describeCharacters(graphemes: readonly string[]): string {
  const codes = (grapheme: string) =>
    [...grapheme]
      .map(
        (char) =>
          `U+${(char.codePointAt(0) as number).toString(16).toUpperCase().padStart(4, "0")}`,
      )
      .join(" ");
  const list = (items: readonly string[], last: string) => {
    if (items.length > 3) return `${items.slice(0, 3).join(", ")} ${last} ${items.length - 3} more`;
    return items.length > 1
      ? `${items.slice(0, -1).join(", ")} ${last} ${items.at(-1)}`
      : `${items[0]}`;
  };
  const unseen = (grapheme: string) => /[\p{C}\p{Z}]|^\p{M}/u.test(grapheme);
  const shown = graphemes.filter((grapheme) => !unseen(grapheme));
  const hidden = graphemes.filter(unseen);
  const parts: string[] = [];
  if (shown.length) {
    const items = shown.map((grapheme) => `“${grapheme}” (${codes(grapheme)})`);
    parts.push(`Courier Prime, the script’s font, has no ${list(items, "or")}.`);
  }
  if (hidden.length) {
    const one = hidden.length === 1;
    parts.push(
      `The invisible ${one ? "character" : "characters"} ${list(hidden.map(codes), "and")} ` +
        `would not print as ${one ? "it shows" : "they show"}.`,
    );
  }
  return parts.join(" ");
}

function parseFont(bytes: Uint8Array): Font {
  const font = fontkit.create(bytes);
  if (!("unitsPerEm" in font)) throw new Error("A font file holds a collection, not one font.");
  return font;
}

async function embed(
  doc: PDFDocument,
  bytes: Uint8Array,
  metrics: Font,
  name: FontFace,
): Promise<Face> {
  const scale = FONT_SIZE_PT / metrics.unitsPerEm;
  const advance =
    (metrics.glyphForCodePoint(0x20)?.advanceWidth ?? metrics.unitsPerEm * 0.6) * scale;
  // Courier Prime Italic and Bold Italic join "fi" and "fl" into one glyph
  // unless told not to, which would take characters off the engine's grid;
  // the editor turns ligatures off too (ProseMirror's stylesheet).
  const font = await doc.embedFont(bytes, {
    subset: true,
    features: { liga: false },
    customName: `${SUBSET_TAGS[name]}+${metrics.postscriptName ?? "CourierPrime"}`,
  });
  // The post table gives the underline's top edge; the line is drawn about its centre.
  const thickness = metrics.underlineThickness * scale;
  return {
    font,
    spacing: CELL_PT - advance,
    underlineDrop: -metrics.underlinePosition * scale + thickness / 2,
    underlineThickness: thickness,
  };
}

/** The document's title, author and the program that made it, for the viewer. */
function describe(doc: PDFDocument, titlePage: TitlePage): void {
  const oneLine = (text: string, joiner: string) =>
    text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join(joiner);
  const title = oneLine(titlePage.title, " ");
  if (title) doc.setTitle(title, { showInWindowTitleBar: true });
  const authors = oneLine(titlePage.authors, ", ");
  if (authors) doc.setAuthor(authors);
  doc.setCreator("Tir");
  doc.setLanguage("en-US");
}

/**
 * The runs of a line, split where its element's bold, italic or underline
 * starts or stops. Capitals keep the text's length, so the line's text at
 * `k` shows the element's at `line.start + k`. As on screen, what no element
 * holds ((MORE), a repeated cue, an automatic (CONT'D)) prints unstyled. A
 * style starting or stopping inside a character (an accent styled apart
 * from its letter) takes effect after it: a character prints whole, in its
 * first code point's style.
 */
function runsOf(line: PageLine, element: Element | undefined): Run[] {
  const length = line.text.length;
  const own = line.kind === "element" && element ? line.end - line.start : 0;
  const cuts = new Set([0, own, length]);
  if (own > 0 && element) {
    const starts = graphemeStarts(line.text);
    for (const spans of [element.bold, element.italic, element.underline]) {
      for (const span of spans ?? []) {
        for (const at of span) {
          let k = at - line.start;
          if (starts) k = starts.find((start) => start >= k) ?? length;
          if (k > 0 && k < own) cuts.add(k);
        }
      }
    }
  }
  const edges = [...cuts].sort((a, b) => a - b);
  const runs: Run[] = [];
  edges.forEach((start, i) => {
    const end = edges[i + 1];
    if (end === undefined || end <= start) return;
    const at = start < own ? line.start + start : -1;
    const bold = covers(element?.bold, at);
    const italic = covers(element?.italic, at);
    runs.push({
      start,
      end,
      face: bold && italic ? "boldItalic" : bold ? "bold" : italic ? "italic" : "regular",
      underline: covers(element?.underline, at),
    });
  });
  return runs;
}

function covers(spans: readonly Span[] | undefined, at: number): boolean {
  return at >= 0 && !!spans?.some(([start, end]) => start <= at && at < end);
}

type TitleField = Exclude<keyof TitlePage, "showDraftDate">;

/** The title page form's names for its fields (`index.html`), for saying where a problem is. */
const FIELD_NAMES: Readonly<Record<TitleField, string>> = {
  title: "Title",
  credit: "Credit",
  authors: "Author(s)",
  source: "Source",
  contact: "Contact",
  draftDate: "Draft and date",
};

/** A line of the title page: its field, its text, and where it starts in inches from the left and top edges. */
interface TitleLine {
  readonly field: TitleField;
  readonly text: string;
  readonly x: number;
  readonly top: number;
}

/** The title page as the PDF sets it, noting what it cannot print as the preview shows it. */
function titlePageText(page: TitlePage, font: Font, misprints: Misprints): Placed[] {
  const off = new Set<TitleField>();
  return titlePageLines(page).map(({ field, text, x, top }) => {
    const where = `Title page, ${FIELD_NAMES[field]}`;
    const right = x + graphemeCount(text) / CHARS_PER_INCH;
    const lowest = PAGE.heightIn - 1 / LINES_PER_INCH;
    const edge = 1e-9;
    const offPaper = x < -edge || right > PAGE.widthIn + edge || top < -edge || top > lowest + edge;
    if (offPaper && !off.has(field)) {
      off.add(field);
      misprints.add(`${where}: a line runs off the paper. Shorten it.`);
    }
    const refused: Refused[] = [];
    const set = setText(text, font, (at, grapheme) => refused.push({ at, grapheme }));
    misprints.characters(where, text, refused);
    return { text: set, x: x * POINTS, top: top * POINTS };
  });
}

/**
 * The title page's lines where its preview shows them (`.title-preview` in
 * `app.css`, set out by `TITLE_PAGE`): the title in capitals, always taking
 * its place, then each of credit, authors and source that holds text,
 * centred with a blank line between; the contact at the bottom left, and the
 * draft and date, when shown, at the bottom right. Text is set as typed,
 * spaces included, as the preview's `white-space: pre` does.
 */
function titlePageLines(page: TitlePage): TitleLine[] {
  const left = PAGE.leftMarginIn;
  const right = PAGE.widthIn - PAGE.rightMarginIn;
  const bottom = PAGE.heightIn - PAGE.bottomMarginIn;
  const width = (text: string) => graphemeCount(text) / CHARS_PER_INCH;
  const out: TitleLine[] = [];

  const fields: [TitleField, string][] = [
    ["title", page.title.trim() ? page.title.toUpperCase() : ""],
  ];
  for (const field of ["credit", "authors", "source"] as const) {
    if (page[field].trim()) fields.push([field, page[field]]);
  }
  let row = 0;
  fields.forEach(([field, text], i) => {
    if (i > 0) row++;
    for (const line of fieldLines(text)) {
      // A line wider than the margins starts at the left one, as the preview's does.
      const x = left + Math.max(0, (right - left - width(line)) / 2);
      out.push({ field, text: line, x, top: TITLE_PAGE.centreTopIn + row / LINES_PER_INCH });
      row++;
    }
  });

  const foot = (field: TitleField, x: (line: string) => number) => {
    const lines = fieldLines(page[field]);
    lines.forEach((line, k) => {
      out.push({
        field,
        text: line,
        x: x(line),
        top: bottom - (lines.length - k) / LINES_PER_INCH,
      });
    });
  };
  if (page.contact.trim()) foot("contact", () => left);
  if (page.showDraftDate) foot("draftDate", (line) => right - width(line));
  return out;
}

/** A field's lines: a line break ending the text starts no line of its own, as in the preview. */
function fieldLines(text: string): string[] {
  const lines = expandTitleTabs(text).split("\n");
  if (lines.length > 1 && lines.at(-1) === "") lines.pop();
  return lines;
}

/**
 * One bookmark per scene, in order, each opening its heading's page at the
 * heading (PDF 1.7, 12.3.3). The PDF library has no outline of its own.
 */
function outline(
  doc: PDFDocument,
  elements: readonly Element[],
  pages: readonly Page[],
  pdfPages: readonly PDFPage[],
): void {
  const scenes = new ScriptMap(elements, pages).scenes;
  if (scenes.length === 0) return;
  const { context } = doc;
  const root = context.nextRef();
  const refs = scenes.map(() => context.nextRef());
  scenes.forEach((scene, i) => {
    const page = pdfPages[scene.page - 1] as PDFPage;
    const heading = scene.heading.replaceAll("\n", " ").trim();
    const item = context.obj({
      Title: PDFHexString.fromText(heading || `Scene ${i + 1}`),
      Parent: root,
      Dest: [page.ref, "XYZ", null, PAGE_SIZE[1] - rowTop(scene.row), null],
      ...(i > 0 ? { Prev: refs[i - 1] } : {}),
      ...(i + 1 < refs.length ? { Next: refs[i + 1] } : {}),
    });
    context.assign(refs[i] as PDFRef, item);
  });
  context.assign(
    root,
    context.obj({
      Type: "Outlines",
      First: refs[0],
      Last: refs.at(-1),
      Count: refs.length,
    }),
  );
  doc.catalog.set(PDFName.of("Outlines"), root);
}

/**
 * Page labels, so a viewer numbers the pages as they print: the title page
 * is outside the numbering (brief, "Title page") and the script starts at 1.
 */
function labelPages(doc: PDFDocument): void {
  const labels = doc.context.obj({
    Nums: [0, { P: PDFHexString.fromText("Title page") }, 1, { S: "D" }],
  });
  doc.catalog.set(PDFName.of("PageLabels"), labels);
}
