/**
 * Writes a script as a PDF laid out as Final Draft lays out its own, from
 * Tir's pagination: the parity tool's test fixtures. Stage 3 writes the
 * real PDF export.
 */
import { readFileSync } from "node:fs";
import fontkit from "@cantoo/fontkit";
import { PDFDocument, type PDFFont, type PDFPage } from "@cantoo/pdf-lib";
import { CHARS_PER_INCH, LINES_PER_INCH, PAGE } from "../../src/core/format.ts";
import type { Element, TitlePage } from "../../src/core/model.ts";
import { type Page, pageLabel } from "../../src/core/paginate.ts";

const FONT = new URL("../../src/ui/fonts/CourierPrime-Regular.ttf", import.meta.url);
const POINTS = 72;
/** From the top of a line's box to its baseline, in points. */
const BASELINE = 9.6;

export interface PdfOptions {
  readonly titlePage?: TitlePage;
  /** Scene numbers in both margins of each scene heading. */
  readonly sceneNumbers?: boolean;
  /** "CONTINUED:" above each page after the first and "(CONTINUED)" below the one before. */
  readonly continueds?: boolean;
  /** Each word as its own text run, as some PDF writers do. */
  readonly splitRuns?: boolean;
  readonly producer?: string;
}

export async function writeScriptPdf(
  elements: readonly Element[],
  pages: readonly Page[],
  options: PdfOptions = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setProducer(options.producer ?? "Final Draft 12.0.9");
  const font = await doc.embedFont(readFileSync(FONT), { subset: true });
  const size = [PAGE.widthIn * POINTS, PAGE.heightIn * POINTS] as [number, number];

  if (options.titlePage) writeTitlePage(doc.addPage(size), font, options.titlePage);

  const draw = (page: PDFPage, text: string, xIn: number, topIn: number) => {
    const y = size[1] - topIn * POINTS - BASELINE;
    if (!options.splitRuns) {
      page.drawText(text, { x: xIn * POINTS, y, size: 12, font });
      return;
    }
    for (const word of text.matchAll(/\S+/g)) {
      page.drawText(word[0], {
        x: (xIn + word.index / CHARS_PER_INCH) * POINTS,
        y,
        size: 12,
        font,
      });
    }
  };
  const rowTop = (row: number) => PAGE.topMarginIn + row / LINES_PER_INCH;

  pages.forEach((scriptPage, i) => {
    const page = doc.addPage(size);
    const label = pageLabel(scriptPage.number);
    if (label) draw(page, label, 7.5 - label.length / CHARS_PER_INCH, PAGE.headerIn);
    // Final Draft sets scene continueds in the margins, outside the page's
    // lines: "CONTINUED:" two rows above the first (seen in calibration PDFs).
    if (options.continueds && i > 0) draw(page, "CONTINUED:", 1.5, rowTop(-2));
    for (const line of scriptPage.lines) {
      draw(page, line.text, line.x, rowTop(line.row));
      const element = elements[line.element];
      if (options.sceneNumbers && element?.type === "sceneHeading" && line.kind === "element") {
        const number = String(sceneNumber(elements, line.element));
        draw(page, number, 1.5 - (number.length + 4) / CHARS_PER_INCH, rowTop(line.row));
        draw(page, number, 7.6, rowTop(line.row));
      }
    }
    if (options.continueds && i + 1 < pages.length) {
      const last = Math.max(0, ...scriptPage.lines.map((line) => line.row));
      draw(page, "(CONTINUED)", 7.5 - 1.1, rowTop(last + 2));
    }
  });
  return doc.save();
}

function sceneNumber(elements: readonly Element[], index: number): number {
  return elements.slice(0, index + 1).filter((element) => element.type === "sceneHeading").length;
}

/** A title page as the brief describes it: centred title, credit and author; contact at the foot. */
function writeTitlePage(page: PDFPage, font: PDFFont, title: TitlePage): void {
  const centre = (text: string, topIn: number) => {
    const x = (PAGE.widthIn - text.length / CHARS_PER_INCH) / 2;
    page.drawText(text, { x: x * POINTS, y: page.getHeight() - topIn * POINTS, size: 12, font });
  };
  centre(title.title.toUpperCase(), 3.5);
  centre(title.credit, 4.0);
  centre(title.authors, 4.33);
  title.contact.split("\n").forEach((line, i) => {
    page.drawText(line, {
      x: 1.5 * POINTS,
      y: page.getHeight() - (9 + i / LINES_PER_INCH) * POINTS,
      size: 12,
      font,
    });
  });
}
