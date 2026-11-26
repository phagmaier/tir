// The parity tool against PDFs made from known, original scripts: it must
// rebuild each script exactly, find every page the same, and report each
// page break moved on purpose.
import { describe, expect, it } from "vitest";
import type { Element, ElementType, TitlePage } from "../../src/core/model.ts";
import { pageLabel, paginate } from "../../src/core/paginate.ts";
import { compare, report } from "./compare.ts";
import { type PdfText, readPdfText } from "./pdf-text.ts";
import { rebuild } from "./rebuild.ts";
import { type PdfOptions, writeScriptPdf } from "./write-pdf.ts";

const el = (type: ElementType, text: string, more: Partial<Element> = {}): Element => ({
  type,
  text,
  ...more,
});

function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An original script of some ten pages using every element the tool reads. */
function harbourScript(): Element[] {
  const next = random(2026);
  const pick = <T>(items: readonly T[]) => items[Math.floor(next() * items.length)] as T;
  const words =
    "the lamp harbour keeper glass night wall boat tide stair window rope salt bell light cold dark water old long slow gull".split(
      " ",
    );
  const sentence = () => {
    const text = Array.from({ length: 4 + Math.floor(next() * 12) }, () => pick(words)).join(" ");
    return `${text[0]?.toUpperCase()}${text.slice(1)}${pick([".", ".", "?", "!"])}`;
  };
  const sentences = (most: number) =>
    Array.from({ length: 1 + Math.floor(next() * most) }, sentence).join(" ");
  const script: Element[] = [el("action", "FADE IN:")];
  const places = ["LIGHTHOUSE", "HARBOUR WALL", "LAMP ROOM", "FERRY", "BOATHOUSE"];
  for (let scene = 0; scene < 14; scene++) {
    script.push(
      el("sceneHeading", `${pick(["INT.", "EXT."])} ${pick(places)} - ${pick(["DAY", "NIGHT"])}`),
    );
    script.push(el("action", sentences(6)));
    for (let beat = 0; beat < 3 + Math.floor(next() * 5); beat++) {
      if (next() < 0.3) {
        script.push(el("action", sentences(4)));
        continue;
      }
      script.push(el("character", pick(["MAYA", "TOMÁS (V.O.)", "THE KEEPER", "ISLA"])));
      if (next() < 0.25) script.push(el("parenthetical", `(${pick(words)} ${pick(words)})`));
      script.push(el("dialogue", sentences(next() < 0.2 ? 9 : 3)));
    }
    if (scene === 3) {
      script.push(el("action", "BANG\nThe shutters slam."));
      script.push(el("action", "TIDE TABLE\nHigh water 05:52\nLow water 12:07"));
    }
    if (scene === 5) {
      // The same speaker after action gets an automatic (CONT'D).
      script.push(el("character", "MAYA"), el("dialogue", "Still here?"));
      script.push(el("action", "The keeper says nothing."));
      script.push(el("character", "MAYA"), el("dialogue", "I thought so."));
      script.push(
        el("character", "THE KEEPER"),
        el("parenthetical", "(to the gulls, not unkindly, with a long look at the sea)"),
        el("dialogue", "Go home."),
      );
    }
    if (scene === 7) {
      // Dual dialogue, then an empty line the PDF shows only as a wider gap.
      script.push(el("character", "MAYA"), el("dialogue", "Left, then."));
      script.push(el("character", "TOMÁS", { dual: true }), el("dialogue", "Right."));
      script.push(el("action", "They part."), el("general", ""), el("action", "The lamp turns."));
    }
    if (scene === 8) script.push(el("shot", "CLOSE ON THE LAMP"), el("action", "It flickers."));
    script.push(el("transition", pick(["CUT TO:", "DISSOLVE TO:"])));
  }
  script.push(el("action", "THE END", { centred: true }));
  return script;
}

const script = harbourScript();
const titlePage: TitlePage = {
  title: "Salt Line",
  credit: "Written by",
  authors: "Mara Ellison",
  source: "",
  contact: "Mara Ellison\n12 Harbour Row",
  draftDate: "",
  showDraftDate: false,
};

async function pdfOf(
  elements: readonly Element[],
  options: PdfOptions = {},
  linesPerPage?: number,
) {
  const pages = paginate(elements, linesPerPage ? { linesPerPage } : {});
  return { pages, pdf: await readPdfText(await writeScriptPdf(elements, pages, options)) };
}

describe("the parity tool on PDFs made from known scripts", () => {
  it.each<[string, PdfOptions]>([
    ["a plain PDF", {}],
    [
      "a PDF with a title page, scene numbers, CONTINUEDs and a run per word",
      { titlePage, sceneNumbers: true, continueds: true, splitRuns: true },
    ],
  ])("rebuilds %s exactly and finds every page the same", async (_name, options) => {
    const { pages, pdf } = await pdfOf(script, options);
    expect(pages.length).toBeGreaterThanOrEqual(8);
    const rebuilt = rebuild(pdf);
    expect(rebuilt.elements).toEqual(script);
    expect(rebuilt.titlePage).toBe(options.titlePage !== undefined);
    expect(rebuilt.labels).toEqual(pages.map((page) => pageLabel(page.number)));
    const mores = pages.flatMap((page) => page.lines).filter((line) => line.kind === "more");
    expect(mores.length).toBeGreaterThan(0);
    expect(rebuilt.found.mores).toBe(mores.length);
    if (options.sceneNumbers) {
      expect(rebuilt.found.marks).toBe(script.filter((e) => e.type === "sceneHeading").length);
      expect(rebuilt.found.continueds).toBe(2 * (pages.length - 1));
    }
    const comparison = compare(rebuilt);
    expect(comparison.pages.filter((page) => !page.same)).toEqual([]);
    expect(comparison.tirPageCount).toBe(pages.length);
  });

  it("reports a page break moved on purpose, after pages that match", async () => {
    // Force a break before a scene heading that normally sits mid-page.
    const natural = paginate(script);
    const heading = script.findIndex((element, i) => {
      const line = natural.flatMap((page) => page.lines).find((l) => l.element === i);
      return element.type === "sceneHeading" && line !== undefined && line.row > 20 && i > 60;
    });
    const forced = script.map((element, i) =>
      i === heading ? { ...element, pageBreakBefore: true as const } : element,
    );
    const { pages, pdf } = await pdfOf(forced);
    const movedPage =
      pages.findIndex((page) => page.lines.some((line) => line.element === heading)) + 1;

    const rebuilt = rebuild(pdf);
    expect(rebuilt.elements).toEqual(script);
    const comparison = compare(rebuilt);
    expect(comparison.pages.slice(0, movedPage - 1).every((page) => page.same)).toBe(true);
    expect(comparison.pages[movedPage - 1]).toMatchObject({
      same: false,
      finalDraft: { element: heading, offset: 0 },
    });
    const text = report("moved.pdf", pdf.producer, rebuilt, comparison);
    expect(text).toContain(
      `page ${String(movedPage).padStart(4)}  differs: Final Draft starts at element ${heading + 1}`,
    );
    expect(text).toContain(`first difference on page ${movedPage}`);
  });

  it("matches at the lines per page a PDF was made with, and reports the rest", async () => {
    const { pdf } = await pdfOf(script, {}, 50);
    const at50 = compare(rebuild(pdf, { linesPerPage: 50 }), 50);
    expect(at50.pages.every((page) => page.same)).toBe(true);
    const at54 = compare(rebuild(pdf), 54);
    expect(at54.pages.some((page) => !page.same)).toBe(true);
  });
});

describe("reading PDF quirks", () => {
  const CHAR = 7.2;
  const line = (col: number, y: number, ...parts: string[]) =>
    parts.map((text, k) => ({ text, x: (col + parts.slice(0, k).join("").length) * CHAR, y }));
  const pdf = (...runs: ReturnType<typeof line>[]): PdfText => ({
    producer: "Final Draft",
    creator: null,
    pages: [{ height: 792, runs: runs.flat() }],
  });

  it("joins a word split across runs, reads ligatures, and ignores text printed twice", () => {
    const rebuilt = rebuild(
      pdf(line(35, 700, "MA", "YA"), line(25, 688, "Too ", "ﬁne."), line(25, 688, "Too ")),
    );
    expect(rebuilt.elements).toEqual([el("character", "MAYA"), el("dialogue", "Too fine.")]);
  });

  it("reads a page number above the body beside header text, and a repeated cue above the first line", () => {
    const rebuilt = rebuild({
      producer: "Final Draft",
      creator: null,
      pages: [
        {
          height: 792,
          runs: [
            ...line(15, 711, "INT. LAMP ROOM - NIGHT"),
            ...line(35, 687, "MAYA"),
            ...line(25, 675, "One."),
          ],
        },
        {
          height: 792,
          runs: [
            ...line(30, 747, "Blue Revision"),
            ...line(70, 735, "2."),
            ...line(35, 723, "MAYA (CONT’D)"),
            ...line(25, 711, "Two."),
          ],
        },
      ],
    });
    expect(rebuilt.labels).toEqual([null, "2."]);
    expect(rebuilt.pages[1]?.[0]).toMatchObject({ row: -1, read: "repeated cue" });
  });

  it("notes a wide gap inside a page, where an image may be, and leaves it out", () => {
    const rebuilt = rebuild(
      pdf(line(15, 711, "INT. LAMP ROOM - NIGHT"), line(15, 687, "Rain."), line(15, 603, "Wind.")),
    );
    expect(rebuilt.unreadable).toEqual(new Set([1]));
    expect(rebuilt.notes[0]?.text).toContain("6 blank rows");
  });

  it("rejoins a hyphen with a space when the word would have fitted after it", () => {
    // "I said it was a well-" (21) and "known" (5) fit in 35, so Final Draft
    // would not have broken there: the text had "well- known".
    const rebuilt = rebuild(
      pdf(
        line(15, 711, "INT. LAMP ROOM - NIGHT"),
        line(35, 687, "MAYA"),
        line(25, 675, "I said it was a well-"),
        line(25, 663, "known thing."),
      ),
    );
    expect(rebuilt.elements[2]).toEqual(el("dialogue", "I said it was a well- known thing."));
  });

  it("reads a space between runs set off Courier's grid, as styled text can be", () => {
    // "Bean?" ends at 338.4 pt; "Fine" starts at 341, short of a character's
    // width but clearly apart; ". But" touches "Fine".
    const rebuilt = rebuild(
      pdf(line(15, 711, "INT. LAMP ROOM - NIGHT"), line(35, 687, "MAYA"), [
        { text: "Some drills with Bean?", x: 180, y: 675 },
        { text: "Fine", x: 341, y: 675 },
        { text: ". But we", x: 369.8, y: 675 },
      ]),
    );
    expect(rebuilt.elements[2]).toEqual(el("dialogue", "Some drills with Bean? Fine. But we"));
  });

  it("reports a line at an indent it does not know, rather than guessing silently", () => {
    const rebuilt = rebuild(
      pdf(line(15, 700, "INT. LAMP ROOM - NIGHT"), line(15, 676, "Rain."), line(42, 652, "Odd")),
    );
    expect(rebuilt.notes).toEqual([
      { page: 1, text: 'line at 4.2 in not recognised, read as action: "Odd"' },
    ]);
  });
});
