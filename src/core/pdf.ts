/**
 * PDF export (brief, "PDF export"): the title page, then the script's pages
 * as the editor shows them. The PDF does no layout of its own (architecture,
 * design rule 1): every line, its place and its page come from `paginate`,
 * and the title page's places from `TITLE_PAGE`, which its preview uses too.
 * Text is Courier Prime, embedded and subset, black on white whatever the
 * paper on screen.
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
import { CHARS_PER_INCH, FONT_SIZE_PT, LINES_PER_INCH, PAGE, TITLE_PAGE } from "./format.ts";
import { expandTitleTabs, graphemeCount } from "./layout.ts";
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

export async function writePdf(
  script: Script,
  fonts: PdfFonts,
  options: PdfOptions,
): Promise<Uint8Array> {
  const pages = paginate(script.elements);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  describe(doc, script.titlePage);

  const faces = new Map<FontFace, Promise<Face>>();
  const face = (name: FontFace) => {
    let embedded = faces.get(name);
    if (!embedded) {
      embedded = embed(doc, fonts[name], name);
      faces.set(name, embedded);
    }
    return embedded;
  };
  // Every face shares the regular face's vertical metrics; the baseline sits
  // where the browser puts it in a line box of one row (CSS half-leading).
  const metrics = parseFont(fonts.regular);
  const scale = FONT_SIZE_PT / metrics.unitsPerEm;
  const baseline = (LINE_PT + (metrics.ascent + metrics.descent) * scale) / 2;

  // A page given a font gains a font resource each time, so each page is
  // given a face only when its text changes face.
  const onPage = (page: PDFPage) => {
    let current: FontFace | null = null;
    return async (text: string, xPt: number, topPt: number, run?: Run) => {
      if (!text) return;
      const name = run?.face ?? "regular";
      const { font, spacing, underlineDrop, underlineThickness } = await face(name);
      if (name !== current) {
        page.setFont(font);
        current = name;
      }
      const y = PAGE_SIZE[1] - topPt - baseline;
      page.drawText(text, {
        x: xPt,
        y,
        size: FONT_SIZE_PT,
        color: BLACK,
        characterSpacing: spacing,
      });
      if (run?.underline) {
        const width = graphemeCount(text) * CELL_PT;
        page.drawLine({
          start: { x: xPt, y: y - underlineDrop },
          end: { x: xPt + width, y: y - underlineDrop },
          thickness: underlineThickness,
          color: BLACK,
        });
      }
    };
  };

  if (options.titlePage) {
    const draw = onPage(doc.addPage(PAGE_SIZE));
    for (const line of titlePageLines(script.titlePage)) {
      await draw(line.text, line.x * POINTS, line.top * POINTS);
    }
  }
  const pdfPages: PDFPage[] = [];
  for (const scriptPage of pages) {
    const page = doc.addPage(PAGE_SIZE);
    pdfPages.push(page);
    const draw = onPage(page);
    const label = pageLabel(scriptPage.number);
    if (label) {
      const x = PAGE.widthIn - PAGE.rightMarginIn - graphemeCount(label) / CHARS_PER_INCH;
      await draw(label, x * POINTS, PAGE.headerIn * POINTS);
    }
    for (const line of scriptPage.lines) {
      const top = rowTop(line.row);
      for (const run of runsOf(line, script.elements[line.element])) {
        const x = line.x * POINTS + graphemeCount(line.text.slice(0, run.start)) * CELL_PT;
        await draw(line.text.slice(run.start, run.end), x, top, run);
      }
    }
  }

  outline(doc, script.elements, pages, pdfPages);
  if (options.titlePage) labelPages(doc);
  return doc.save();
}

/** Points from the page's top edge to the top of a body row. */
function rowTop(row: number): number {
  return (PAGE.topMarginIn + row / LINES_PER_INCH) * POINTS;
}

function parseFont(bytes: Uint8Array): Font {
  const font = fontkit.create(bytes);
  if (!("unitsPerEm" in font)) throw new Error("A font file holds a collection, not one font.");
  return font;
}

async function embed(doc: PDFDocument, bytes: Uint8Array, name: FontFace): Promise<Face> {
  const metrics = parseFont(bytes);
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
 * holds ((MORE), a repeated cue, an automatic (CONT'D)) prints unstyled.
 */
function runsOf(line: PageLine, element: Element | undefined): Run[] {
  const length = line.text.length;
  const own = line.kind === "element" && element ? line.end - line.start : 0;
  const cuts = new Set([0, own, length]);
  if (own > 0 && element) {
    for (const spans of [element.bold, element.italic, element.underline]) {
      for (const span of spans ?? []) {
        for (const at of span) {
          const k = at - line.start;
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

/** A line of the title page: its text, and where it starts in inches from the left and top edges. */
interface TitleLine {
  readonly text: string;
  readonly x: number;
  readonly top: number;
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

  const fields = [page.title.trim() ? page.title.toUpperCase() : ""];
  for (const text of [page.credit, page.authors, page.source]) if (text.trim()) fields.push(text);
  let row = 0;
  fields.forEach((text, i) => {
    if (i > 0) row++;
    for (const line of fieldLines(text)) {
      // A line wider than the margins starts at the left one, as the preview's does.
      const x = left + Math.max(0, (right - left - width(line)) / 2);
      out.push({ text: line, x, top: TITLE_PAGE.centreTopIn + row / LINES_PER_INCH });
      row++;
    }
  });

  const foot = (text: string, x: (line: string) => number) => {
    const lines = fieldLines(text);
    lines.forEach((line, k) => {
      out.push({ text: line, x: x(line), top: bottom - (lines.length - k) / LINES_PER_INCH });
    });
  };
  if (page.contact.trim()) foot(page.contact, () => left);
  if (page.showDraftDate) foot(page.draftDate, (line) => right - width(line));
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
