// The PDF export read back: by pdf.js (unpdf) for text, positions,
// bookmarks, page labels and metadata, as a viewer reads it, and by the PDF
// library for fonts and drawn underlines.
import { readFileSync } from "node:fs";
import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  type PDFRawStream,
  PDFRef,
  PDFStream,
} from "@cantoo/pdf-lib";
import { getDocumentProxy } from "unpdf";
import { describe, expect, it } from "vitest";
import { everyFormat } from "./fixtures/scripts.ts";
import { type Element, type ElementType, newTitlePage, type Script } from "./model.ts";
import { paginate } from "./paginate.ts";
import { FONT_FACES, type PdfFonts, writePdf } from "./pdf.ts";

const FILES = { regular: "Regular", bold: "Bold", italic: "Italic", boldItalic: "BoldItalic" };
const fonts = Object.fromEntries(
  FONT_FACES.map((face) => [
    face,
    readFileSync(new URL(`../ui/fonts/CourierPrime-${FILES[face]}.ttf`, import.meta.url)),
  ]),
) as unknown as PdfFonts;

const el = (type: ElementType, text: string, more: Partial<Element> = {}): Element => ({
  type,
  text,
  ...more,
});

// US Letter is 612 by 792 pt. Rows are 12 pt from the 1 in top margin.
// Courier Prime's ascent (1600) and descent (700 of its 2048 em) centred in a
// 12 pt row, as CSS sets a line box, put the baseline 8.64 pt below its top.
const BASELINE = 8.63671875;
const rowY = (row: number) => 792 - 72 - 12 * row - BASELINE;
/** The baseline of a line whose top is `inches` from the page's top edge. */
const topY = (inches: number) => 792 - inches * 72 - BASELINE;

interface ReadLine {
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

interface TextItem {
  readonly str: string;
  readonly transform: readonly number[];
  readonly width: number;
}

/**
 * Each page's lines of text as a viewer extracts them: the words on one
 * baseline joined in order, with a space for a gap of one character, and a
 * new line where a wider gap parts them (the columns of dual dialogue).
 */
async function readBack(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const pages: ReadLine[][] = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const items = ((await page.getTextContent()).items as TextItem[])
      .filter((item) => item.str.trim() !== "" && item.transform)
      .map((item) => ({ ...item, x: item.transform[4] as number, y: item.transform[5] as number }))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: { text: string; x: number; y: number; end: number }[] = [];
    for (const item of items) {
      const last = lines.at(-1);
      const gap = last ? Math.round((item.x - last.end) / 7.2) : 0;
      if (last && Math.abs(last.y - item.y) < 0.01 && gap < 2) {
        last.text += " ".repeat(Math.max(0, gap)) + item.str;
        last.end = item.x + item.width;
      } else {
        lines.push({ text: item.str, x: item.x, y: item.y, end: item.x + item.width });
      }
    }
    pages.push(lines.map(({ text, x, y }) => ({ text, x, y })));
  }
  return { pdf, pages };
}

/** The line reading `text`; with `nth`, a later one reading the same. */
function lineAt(lines: readonly ReadLine[], text: string, nth = 0): ReadLine {
  const line = lines.filter((candidate) => candidate.text === text)[nth];
  if (!line) throw new Error(`No line “${text}” in ${JSON.stringify(lines.map((l) => l.text))}`);
  return line;
}

function expectAt(line: ReadLine, x: number, y: number): void {
  expect(line.x).toBeCloseTo(x, 3);
  expect(line.y).toBeCloseTo(y, 3);
}

/** Each page's text objects with their font, and its drawn lines, from its content stream. */
async function drawn(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => {
    const fonts = page.node.Resources()?.lookupMaybe(PDFName.of("Font"), PDFDict);
    const baseFont = (key: string) => {
      const font = doc.context.lookup(fonts?.get(PDFName.of(key)), PDFDict);
      return font.get(PDFName.of("BaseFont"))?.toString().slice(1);
    };
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray() : [contents];
    const operators = streams
      .map((ref) => doc.context.lookup(ref) as PDFRawStream)
      .map((stream) => new TextDecoder().decode(decodePDFRawStream(stream).decode()))
      .join("\n");
    const texts: { font: string | undefined; x: number; y: number }[] = [];
    let font: string | undefined;
    for (const match of operators.matchAll(/\/(\S+) [\d.]+ Tf|1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/g)) {
      if (match[1]) font = baseFont(match[1]);
      else texts.push({ font, x: Number(match[2]), y: Number(match[3]) });
    }
    const rules = [...operators.matchAll(/([\d.]+) ([\d.]+) m\s+([\d.]+) ([\d.]+) l/g)].map(
      (match) => ({
        from: Number(match[1]),
        to: Number(match[3]),
        y: Number(match[2]),
      }),
    );
    return { texts, rules };
  });
}

const salt: Script = everyFormat;
const noTitlePage = { titlePage: false };

describe("writePdf", () => {
  it("sets each line where the engine puts it, at exact points", async () => {
    const { pages } = await readBack(await writePdf(salt, fonts, noTitlePage));
    expect(pages).toHaveLength(2);
    const [one = [], two = []] = pages;
    // Action and scene headings at 1.5 in; the heading on the first row.
    expectAt(lineAt(one, "EXT. HARBOUR WALL - NIGHT"), 108, rowY(0));
    expectAt(lineAt(one, "quay."), 108, rowY(3));
    // Dual dialogue: each cue centred in its column (1.5–4.375 in and
    // 4.625–7.5 in), the parenthetical's "(" at 1.75 in, dialogue at each
    // column's left.
    expectAt(lineAt(one, "MAYA"), 197.1, rowY(7));
    expectAt(lineAt(one, "TOMÁS"), 418.5, rowY(7));
    expectAt(lineAt(one, "(out of breath)"), 126, rowY(8));
    expectAt(lineAt(one, "Six. I said six."), 333, rowY(8));
    expectAt(lineAt(one, "Tomás said six — not seven."), 108, rowY(9));
    expectAt(lineAt(one, "CLOSE ON THE LAMP"), 108, rowY(12));
    // A transition ends at 7.1 in.
    expectAt(lineAt(one, "CUT TO:"), 460.8, rowY(16));
    // Page 1 shows no number; page 2 shows "2." ending at 7.5 in, half an inch down.
    expect(one.some((line) => line.text === "1." || line.text === "1")).toBe(false);
    expectAt(lineAt(two, "2."), 525.6, topY(0.5));
    expectAt(lineAt(two, "INT. HARBOUR OFFICE - CONTINUOUS"), 108, rowY(0));
    expectAt(lineAt(two, "Low water 12:07"), 108, rowY(5));
    // Centred action: between 1.5 and 7.5 in.
    expectAt(lineAt(two, "THE END"), 298.8, rowY(7));
  });

  it("prints every line of the engine's pages, (MORE) and (CONT’D) included", async () => {
    const elements = [
      el("sceneHeading", "INT. LAMP ROOM - NIGHT"),
      ...Array.from({ length: 24 }, (_, i) => el("action", `The lamp turns, turn ${i + 1}.`)),
      el("character", "MAYA"),
      el(
        "dialogue",
        Array.from({ length: 30 }, (_, i) => `The tide is in, wave ${i + 1}.`).join(" "),
      ),
      el("action", "She waits."),
      el("character", "MAYA"),
      el("dialogue", "Still here."),
    ];
    const script = { titlePage: newTitlePage(), elements };
    const engine = paginate(elements);
    const { pages } = await readBack(await writePdf(script, fonts, noTitlePage));
    expect(pages).toHaveLength(engine.length);
    const printed = engine.flatMap((page) =>
      page.lines.filter((line) => line.text.trim()).map((line) => ({ page, line })),
    );
    expect(printed.map(({ line }) => line.kind)).toEqual(
      expect.arrayContaining(["more", "continued"]),
    );
    for (const { page, line } of printed) {
      const read = pages[page.number - 1] ?? [];
      const x = line.x * 72;
      const y = rowY(line.row);
      const found = read.some(
        (candidate) =>
          candidate.text === line.text.trim() &&
          Math.abs(candidate.x - x) < 0.001 &&
          Math.abs(candidate.y - y) < 0.001,
      );
      expect(found, `“${line.text}” on page ${page.number}, row ${line.row}`).toBe(true);
    }
    expect(pages.flat().some((line) => line.text === "MAYA (CONT’D)")).toBe(true);
  });

  it("styles runs in Courier Prime's faces on the engine's character grid", async () => {
    const [one] = await drawn(await writePdf(salt, fonts, noTitlePage));
    const at = (x: number, y: number) =>
      one?.texts.find((text) => Math.abs(text.x - x) < 0.001 && Math.abs(text.y - y) < 0.001);
    // "The gate is locked. Again. She kicks it anyway.", row 5: "locked"
    // bold and italic from character 12, ". Again." italic to 26, all 7.2 pt apart.
    expect(at(108, rowY(5))?.font).toBe("TIRAAA+CourierPrime-Regular");
    expect(at(108 + 12 * 7.2, rowY(5))?.font).toBe("TIRAAD+CourierPrime-BoldItalic");
    expect(at(108 + 18 * 7.2, rowY(5))?.font).toBe("TIRAAC+CourierPrime-Italic");
    expect(at(108 + 26 * 7.2, rowY(5))?.font).toBe("TIRAAA+CourierPrime-Regular");
    // "six" in bold, from character 11 of the left column's dialogue.
    expect(at(108 + 11 * 7.2, rowY(9))?.font).toBe("TIRAAB+CourierPrime-Bold");
    // Underlined "The" and "kicks ": a rule under each, a little below the baseline.
    const rules = one?.rules ?? [];
    expect(rules).toHaveLength(2);
    expect(rules[0]?.from).toBeCloseTo(108, 3);
    expect(rules[0]?.to).toBeCloseTo(108 + 3 * 7.2, 3);
    expect(rules[1]?.from).toBeCloseTo(108 + 40 * 7.2, 3);
    expect(rules[1]?.to).toBeCloseTo(108 + 46 * 7.2, 3);
    for (const rule of rules) {
      expect(rowY(5) - rule.y).toBeGreaterThan(0.5);
      expect(rowY(5) - rule.y).toBeLessThan(3);
    }
  });

  it("keeps italic “fi” and “fl” as two characters, and an automatic (CONT’D) unstyled", async () => {
    const elements = [
      el("sceneHeading", "INT. LAMP ROOM - NIGHT"),
      el("action", "The final flight leaves now.", { italic: [[0, 16]] }),
      el("character", "MAYA", { bold: [[0, 4]] }),
      el("dialogue", "Hi."),
      el("action", "She turns."),
      el("character", "MAYA", { bold: [[0, 4]] }),
      el("dialogue", "Again."),
    ];
    const bytes = await writePdf({ titlePage: newTitlePage(), elements }, fonts, noTitlePage);
    // Courier Prime Italic would join "fi" and "fl" into one glyph each,
    // pulling the rest of the run a character left.
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const items = (await (await pdf.getPage(1)).getTextContent()).items as TextItem[];
    const word = (text: string) => items.find((item) => item.str === text)?.transform[4];
    expect(word("final")).toBeCloseTo(108 + 4 * 7.2, 3);
    expect(word("flight")).toBeCloseTo(108 + 10 * 7.2, 3);
    expect(word("leaves")).toBeCloseTo(108 + 17 * 7.2, 3);
    // The second cue, on row 9, gets an automatic (CONT'D): its name bold
    // as typed, the suffix in the regular face, as the screen prints it.
    const [one] = await drawn(bytes);
    const fontAt = (x: number) =>
      one?.texts.find((text) => Math.abs(text.x - x) < 0.001 && Math.abs(text.y - rowY(9)) < 0.001)
        ?.font;
    expect(fontAt(252)).toBe("TIRAAB+CourierPrime-Bold");
    expect(fontAt(252 + 4 * 7.2)).toBe("TIRAAA+CourierPrime-Regular");
  });

  it("embeds a subset of each Courier Prime face the script uses, and only those", async () => {
    const embedded = async (script: Script) => {
      const doc = await PDFDocument.load(await writePdf(script, fonts, noTitlePage));
      const found = new Map<string, number>();
      doc.context.enumerateIndirectObjects().forEach(([, object]) => {
        if (!(object instanceof PDFDict) || object.get(PDFName.of("Type")) !== PDFName.of("Font")) {
          return;
        }
        if (object.get(PDFName.of("Subtype")) !== PDFName.of("CIDFontType2")) return;
        const descriptor = doc.context.lookup(object.get(PDFName.of("FontDescriptor")), PDFDict);
        const file = descriptor.get(PDFName.of("FontFile2"));
        const stream = doc.context.lookup(file instanceof PDFRef ? file : undefined);
        expect(stream).toBeInstanceOf(PDFStream);
        const name = object.get(PDFName.of("BaseFont"))?.toString().slice(1) ?? "";
        found.set(name, decodePDFRawStream(stream as PDFRawStream).decode().length);
      });
      return found;
    };
    const plain = await embedded({
      titlePage: newTitlePage(),
      elements: [el("action", "The tide is out.")],
    });
    expect([...plain.keys()]).toEqual(["TIRAAA+CourierPrime-Regular"]);
    const every = await embedded(salt);
    expect([...every.keys()].sort()).toEqual([
      "TIRAAA+CourierPrime-Regular",
      "TIRAAB+CourierPrime-Bold",
      "TIRAAC+CourierPrime-Italic",
      "TIRAAD+CourierPrime-BoldItalic",
    ]);
    // A subset holds only the glyphs used: far smaller than the font file.
    for (const [name, size] of every) {
      const face = FONT_FACES.find((key) => name.endsWith(`+CourierPrime-${FILES[key]}`));
      expect(size).toBeLessThan(fonts[face ?? "regular"].length / 2);
    }
  });

  it("puts the title page first, outside the page numbering", async () => {
    const { pdf, pages } = await readBack(await writePdf(salt, fonts, { titlePage: true }));
    expect(pages).toHaveLength(3);
    expect(await pdf.getPageLabels()).toEqual(["Title page", "1", "2"]);
    expect(pages[1]?.[0]?.text).toBe("EXT. HARBOUR WALL - NIGHT");
    expectAt(lineAt(pages[2] ?? [], "2."), 525.6, topY(0.5));

    const without = await readBack(await writePdf(salt, fonts, noTitlePage));
    expect(await without.pdf.getPageLabels()).toBeNull();
  });

  it("sets the title page where its preview shows it", async () => {
    const { pages } = await readBack(await writePdf(salt, fonts, { titlePage: true }));
    const page = pages[0] ?? [];
    // Centred between 1.5 and 7.5 in from 3.5 in down, a blank line between fields.
    expectAt(lineAt(page, "SALT LINE"), 291.6, topY(3.5));
    expectAt(lineAt(page, "Written by"), 288, topY(3.5 + 2 / 6));
    expectAt(lineAt(page, "Mara Ellison"), 280.8, topY(3.5 + 4 / 6));
    expectAt(lineAt(page, "Based on the short story by Tomás Ruiz"), 187.2, topY(3.5 + 6 / 6));
    // The contact's four lines end on the bottom margin at 10 in, at 1.5 in.
    expectAt(lineAt(page, "Mara Ellison", 1), 108, topY(10 - 4 / 6));
    expectAt(lineAt(page, "mara@example.com"), 108, topY(10 - 1 / 6));
    // The draft and date end at 7.5 in.
    expectAt(lineAt(page, "Second draft"), 453.6, topY(10 - 2 / 6));
    expectAt(lineAt(page, "26 November 2026"), 424.8, topY(10 - 1 / 6));
    expect(page).toHaveLength(10);
  });

  it("closes up empty title page fields and leaves out the draft date when it is off", async () => {
    const titlePage = {
      ...newTitlePage(),
      title: "Salt line",
      credit: " ",
      authors: "Mara Ellison\nTomás Ruiz",
      contact: "mara@example.com\n",
      draftDate: "Second draft",
    };
    const { pages } = await readBack(
      await writePdf({ titlePage, elements: [] }, fonts, { titlePage: true }),
    );
    const page = pages[0] ?? [];
    expect(page.map((line) => line.text)).toEqual([
      "SALT LINE",
      "Mara Ellison",
      "Tomás Ruiz",
      "mara@example.com",
    ]);
    expectAt(lineAt(page, "Mara Ellison"), 280.8, topY(3.5 + 2 / 6));
    expectAt(lineAt(page, "Tomás Ruiz"), 288, topY(3.5 + 3 / 6));
    // A line break ending the contact starts no line: it still ends on the margin.
    expectAt(lineAt(page, "mara@example.com"), 108, topY(10 - 1 / 6));
  });

  it("marks each scene with a bookmark opening at its heading", async () => {
    const elements = [
      el("sceneHeading", "int. lamp room - night"),
      el("action", "The lamp turns."),
      el("sceneHeading", ""),
      el("action", "Dark."),
      el("sceneHeading", "EXT. TOMÁS’S BOAT - DAY", { pageBreakBefore: true }),
    ];
    const bytes = await writePdf({ titlePage: newTitlePage(), elements }, fonts, {
      titlePage: true,
    });
    const { pdf } = await readBack(bytes);
    const outline = (await pdf.getOutline()) ?? [];
    expect(outline.map((item) => item.title)).toEqual([
      "INT. LAMP ROOM - NIGHT",
      "Scene 2",
      "EXT. TOMÁS’S BOAT - DAY",
    ]);
    const places = await Promise.all(
      outline.map(async (item) => {
        const [page, kind, left, top] = item.dest as [object, { name: string }, null, number];
        return { page: await pdf.getPageIndex(page as never), kind: kind.name, left, top };
      }),
    );
    // Headings on rows 0 and 5 of the first script page (after the title
    // page), and row 0 of the next: the top of each heading's line.
    expect(places).toEqual([
      { page: 1, kind: "XYZ", left: null, top: 720 },
      { page: 1, kind: "XYZ", left: null, top: 660 },
      { page: 2, kind: "XYZ", left: null, top: 720 },
    ]);

    const none = await readBack(
      await writePdf({ titlePage: newTitlePage(), elements: [el("action", "x")] }, fonts, {
        titlePage: false,
      }),
    );
    expect(await none.pdf.getOutline()).toBeNull();
  });

  it("names the title and writers for the viewer, and Tir as the maker", async () => {
    const titlePage = {
      ...newTitlePage(),
      title: "Salt Line\nPart One",
      authors: "Mara Ellison\nTomás Ruiz",
    };
    const { pdf } = await readBack(
      await writePdf({ titlePage, elements: [] }, fonts, { titlePage: false }),
    );
    const { info } = (await pdf.getMetadata()) as { info: Record<string, unknown> };
    expect(info.Title).toBe("Salt Line Part One");
    expect(info.Author).toBe("Mara Ellison, Tomás Ruiz");
    expect(info.Creator).toBe("Tir");
    expect(info.Language).toBe("en-US");
  });
});
