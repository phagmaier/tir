/**
 * Compares where each page starts in a Final Draft PDF with where Tir's
 * pagination of the rebuilt script starts it (brief, "Page parity": every
 * page starts on the same line).
 */
import type { Element } from "../../src/core/model.ts";
import { type Page, paginate } from "../../src/core/paginate.ts";
import type { LinePosition, Rebuilt } from "./rebuild.ts";

export interface PageResult {
  /** The script page, from 1. */
  readonly page: number;
  readonly same: boolean;
  readonly finalDraft: LinePosition | null;
  readonly tir: LinePosition | null;
}

export interface Comparison {
  readonly pages: readonly PageResult[];
  readonly tirPageCount: number;
}

export function compare(rebuilt: Rebuilt, linesPerPage?: number): Comparison {
  const tirPages = paginate(rebuilt.elements, linesPerPage ? { linesPerPage } : {});
  const tirStarts = tirPages.map((page) => pageStart(page, rebuilt));
  const count = Math.max(rebuilt.starts.length, tirStarts.length);
  const pages: PageResult[] = [];
  for (let i = 0; i < count; i++) {
    const finalDraft = rebuilt.starts[i] ?? null;
    const tir = tirStarts[i] ?? null;
    const same =
      finalDraft !== null &&
      tir !== null &&
      finalDraft.element === tir.element &&
      finalDraft.offset === tir.offset;
    pages.push({ page: i + 1, same, finalDraft, tir });
  }
  return { pages, tirPageCount: tirPages.length };
}

/** A page's first line of the script itself, past a repeated (CONT'D) cue. */
function pageStart(page: Page, rebuilt: Rebuilt): LinePosition | null {
  const line = page.lines.find((l) => l.kind === "element");
  if (!line) return null;
  const element = rebuilt.elements[line.element];
  const text = element ? element.text.slice(line.start, line.end) : line.text;
  return { element: line.element, offset: line.start, text };
}

/**
 * Page by page: starting Tir where Final Draft starts each page, does the
 * page end where Final Draft's does? One difference early in a script moves
 * every page after it, so this shows each rule difference on its own page.
 */
export function compareLocally(rebuilt: Rebuilt, linesPerPage?: number): PageResult[] {
  const results: PageResult[] = [];
  for (let i = 0; i + 1 < rebuilt.starts.length; i++) {
    const expected = rebuilt.starts[i + 1] ?? null;
    if (rebuilt.unreadable.has(i + 1) || rebuilt.actionBreaks.has(i + 1)) continue;
    const pages = localPages(rebuilt, i, linesPerPage);
    if (!pages || !expected) continue;
    const line = pages[1]?.lines.find((l) => l.kind === "element");
    const tir = line ? { element: line.element, offset: line.start, text: line.text } : null;
    const same = tir !== null && tir.element === expected.element && tir.offset === expected.offset;
    results.push({ page: i + 1, same, finalDraft: expected, tir });
  }
  return results;
}

/**
 * Tir's pages for the script from where Final Draft starts page `index`
 * (from 0): enough of the script for a page or two, with element numbers and
 * offsets as in the whole script.
 */
export function localPages(rebuilt: Rebuilt, index: number, linesPerPage?: number): Page[] | null {
  const { elements } = rebuilt;
  const from = rebuilt.starts[index];
  if (!from) return null;
  const head = elements[from.element] as Element;
  const window: Element[] = [];
  const indexOf: number[] = [];
  // A page that continues a speech starts with its dialogue: the cue
  // repeated above it takes no line.
  const { pageBreakBefore: _, ...rest } = head;
  window.push({ ...rest, text: head.text.slice(from.offset) });
  indexOf.push(from.element);
  for (let k = from.element + 1; k < Math.min(elements.length, from.element + 160); k++) {
    window.push(elements[k] as Element);
    indexOf.push(k);
  }
  return paginate(window, linesPerPage ? { linesPerPage } : {}).map((page) => ({
    ...page,
    lines: page.lines.map((line) => {
      const element = indexOf[line.element] as number;
      const shift = element === from.element && line.kind !== "continued" ? from.offset : 0;
      return { ...line, element, start: line.start + shift, end: line.end + shift };
    }),
  }));
}

/** The report for one PDF: each differing page (or every page), then a summary. */
export function report(
  name: string,
  producer: string | null,
  rebuilt: Rebuilt,
  comparison: Comparison,
  all = false,
  local?: readonly PageResult[],
): string {
  const out: string[] = [];
  const pdfPages = rebuilt.starts.length;
  out.push(
    `${name} — ${producer ?? "no producer named"}; ${pdfPages} script pages${rebuilt.titlePage ? ", title page skipped" : ""}; Tir makes ${comparison.tirPageCount}`,
  );
  const quote = (position: LinePosition | null) =>
    position ? `element ${position.element + 1}, "${short(position.text)}"` : "nothing";
  for (const result of comparison.pages) {
    if (result.same && !all) continue;
    const page = String(result.page).padStart(4);
    out.push(
      result.same
        ? `  page ${page}  same: ${quote(result.finalDraft)}`
        : `  page ${page}  differs: Final Draft starts at ${quote(result.finalDraft)}; Tir at ${quote(result.tir)}`,
    );
  }
  const same = comparison.pages.filter((result) => result.same).length;
  const firstDifference = comparison.pages.find((result) => !result.same);
  out.push(
    `  summary: ${same} of ${comparison.pages.length} pages start on the same line${firstDifference ? `; first difference on page ${firstDifference.page}` : ""}.`,
  );
  if (local) {
    const ends = local.filter((result) => result.same).length;
    out.push(
      `  page by page: ${ends} of ${local.length} pages end where Final Draft's do when Tir starts each where Final Draft does (left out: ${rebuilt.actionBreaks.size} pages ending inside action, ${rebuilt.unreadable.size} with blank gaps).`,
    );
    if (all || !firstDifference) {
      for (const result of local.filter((r) => !r.same)) {
        out.push(
          `    page ${String(result.page).padStart(4)} ends differently: Final Draft's next page starts at ${quote(result.finalDraft)}; Tir's at ${quote(result.tir)}`,
        );
      }
    }
  }
  const labels = rebuilt.labels.filter((label) => label !== null);
  if (labels.length > 0) out.push(`  page numbers read like "${labels[0]}"`);
  const { marks, continueds, mores, emptyLines } = rebuilt.found;
  out.push(
    `  set aside: ${mores} (MORE), ${continueds} CONTINUED, ${marks} lines with scene numbers or revision marks; read ${emptyLines} empty lines`,
  );
  for (const note of rebuilt.notes) out.push(`  note, page ${note.page}: ${note.text}`);
  return out.join("\n");
}

function short(text: string): string {
  const line = text.split("\n")[0] ?? "";
  return line.length > 40 ? `${line.slice(0, 40)}…` : line;
}

/** One script page as Final Draft set it and as Tir sets it, row by row. */
export function showPage(rebuilt: Rebuilt, number: number, linesPerPage?: number): string {
  const out = [`  page ${number} as Final Draft set it (row, indent, text — how it was read):`];
  for (const line of rebuilt.pages[number - 1] ?? []) {
    out.push(
      `    ${String(line.row).padStart(2)} ${(line.col / 10).toFixed(1).padStart(4)}  ${line.text.padEnd(62).slice(0, 62)} ${line.read}`,
    );
  }
  out.push(`  page ${number} as Tir sets it, starting where Final Draft does:`);
  const tir = localPages(rebuilt, number - 1, linesPerPage)?.[0];
  for (const line of tir?.lines ?? []) {
    out.push(
      `    ${String(line.row).padStart(2)} ${line.x.toFixed(1).padStart(4)}  ${line.text.padEnd(62).slice(0, 62)} element ${line.element + 1}${line.kind === "element" ? "" : ` ${line.kind}`}`,
    );
  }
  return out.join("\n");
}
