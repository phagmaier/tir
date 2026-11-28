/**
 * `mise run editor-placement [--fixture NAME] [--zoom Z] [--focus]`: checks
 * design rule 1 in the running dev app. Every line the engine lays out must
 * start in the editor where the engine puts it, scaled by the page's zoom,
 * and a click on its first or last character must put the caret before that
 * character; in dual dialogue, a click in the blank part of a column's row
 * must land at that line's end. In a line holding a tab or text beyond
 * ASCII, every character must sit in its own cell of the engine's line.
 * Each element must show the engine's text, capitals included. What the
 * sheets print (page numbers, (MORE), repeated cues and the automatic
 * (CONT'D)) must sit where the engine puts it too.
 * With `--fixture` it loads that script first (`?fixture=NAME`); otherwise
 * it checks the one open. `--zoom` (such as 1.25) and `--focus` set the
 * window's settings for the check and put back the ones it found. Start the
 * app with `TIR_CONFIG_DIR=$(mktemp -d) WEBKIT_INSPECTOR_HTTP_SERVER=127.0.0.1:9339 mise run dev`.
 */
import { load, Page } from "./inspector.ts";

/**
 * Runs in the page. A character's box is shorter than its row, so its top
 * sits a fixed distance below the row's: the first line sets that offset and
 * every other line and mark must match it. WebKit reports character boxes on
 * whole pixels (a cue centred at 262.8 px reads 262), so a miss is a pixel or
 * more. Clicks need the spot on screen and clear of the fixed bars, so the
 * check scrolls to it first. Positions are the engine's at 100%, scaled by
 * the zoom `Z` to compare with the window's.
 */
const CHECK = `(async () => {
  const { paginate, pageLabel } = await import("/src/core/paginate.ts");
  const { CHARS_PER_INCH, DUAL_FORMATS, PAGE } = await import("/src/core/format.ts");
  const { fromDocument } = await import("/src/ui/editor-model.ts");
  const { PITCH_PX, ROW_PX } = await import("/src/ui/projection.ts");
  const view = tirView;
  const Z = tirDesk.settings.zoom;
  const doc = view.state.doc;
  const starts = [];
  doc.forEach((_node, pos) => starts.push(pos));
  const cells = (text) => [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)];
  // What the bars cover, as the editor keeps the caret clear of it.
  const { top: bar, left: side } = view.someProp("scrollThreshold");
  const scroll = [scrollX, scrollY];
  const out = { zoom: Z, focus: tirDesk.settings.focus, pages: 0, lines: 0, empty: 0, marks: 0, characters: 0, offset: null, placed: [], cells: [], clicked: [], shown: [], printed: [] };

  /** The caret position a click lands on, \`left\` and \`top\` px at 100% from the editor's corner. */
  const click = (left, top) => {
    let box = view.dom.getBoundingClientRect();
    const x = box.left + Z * left;
    const y = box.top + Z * top;
    if (x < side + 20 || x > innerWidth - 20) scrollBy(x - (side + innerWidth) / 2, 0);
    if (y < bar + 20 || y > innerHeight - 20) scrollBy(0, y - (bar + innerHeight) / 2);
    box = view.dom.getBoundingClientRect();
    return view.posAtCoords({ left: box.left + Z * left, top: box.top + Z * top })?.pos;
  };

  const pages = paginate(fromDocument(doc));
  out.pages = pages.length;
  pages.forEach((page, p) => {
    const sheetTop = p * PITCH_PX;
    for (const line of page.lines) {
      if (line.kind !== "element") continue;
      out.lines++;
      if (line.start === line.end) out.empty++;
      const pos = starts[line.element] + 1 + line.start;
      const top = sheetTop + PAGE.topMarginIn * 96 + line.row * ROW_PX;
      const left = line.x * 96;
      const box = view.dom.getBoundingClientRect();
      const at = view.coordsAtPos(pos, 1);
      const dx = at.left - box.left - Z * left;
      const dy = at.top - box.top - Z * top;
      out.offset ??= dy;
      const where = { element: line.element, page: p + 1, row: line.row, text: line.text };
      if (Math.abs(dx) >= 1 || Math.abs(dy - out.offset) >= 1) {
        out.placed.push({ ...where, dx, dy: dy - out.offset });
      }
      // Where tabs and wider text could leave the grid, where each character
      // ends: the right edge of the character before each position. Zoomed
      // character boxes can round a whole pixel off; a tab or a fallback
      // glyph misses by most of a cell.
      if (/[^\\x20-\\x7e]/.test(line.text)) {
        const own = doc.child(line.element).textContent.slice(line.start, line.end);
        const chars = cells(own);
        chars.forEach((_char, k) => {
          out.characters++;
          const end = chars[k + 1]?.index ?? own.length;
          const want = box.left + Z * (line.x * 96 + ((k + 1) * 96) / CHARS_PER_INCH);
          const got = view.coordsAtPos(pos + end, -1).left;
          if (Math.abs(got - want) > 1) out.cells.push({ ...where, cell: k, dx: got - want });
        });
      }
      const first = click(left + 2, top + ROW_PX / 2);
      if (first !== pos) out.clicked.push({ ...where, got: first, want: pos });
      const shown = cells(doc.child(line.element).textContent.slice(line.start, line.end));
      if (shown.length > 1) {
        const want = pos + (shown.at(-1)?.index ?? 0);
        const last = click(left + ((shown.length - 1) * 96) / CHARS_PER_INCH + 2, top + ROW_PX / 2);
        if (last !== want) out.clicked.push({ ...where, end: true, got: last, want });
      }
      // In dual dialogue, a click in the blank part of a column's row lands
      // at that line's end, not in the other column's paragraph.
      if (line.column) {
        const edge = DUAL_FORMATS[line.column].dialogue.right * 96 - 2;
        const lineEnd = pos + line.end - line.start;
        const next = page.lines.find((l) => l.element === line.element && l.start > line.start);
        const nextStart = starts[line.element] + 1 + (next?.start ?? line.end);
        if (edge > left + (shown.length * 96) / CHARS_PER_INCH + 4) {
          const got = click(edge, top + ROW_PX / 2);
          if (!(got >= lineEnd && got <= nextStart)) {
            out.clicked.push({ ...where, blank: true, got, want: lineEnd });
          }
        }
      }
    }
  });

  // What each paragraph shows, against the engine's text for its lines.
  // innerText applies CSS capitals and leaves out the line breaks drawn as
  // generated content; ProseMirror's trailing break adds a final "\\n".
  // Where an element splits across pages, the editor shows only the last
  // typed line break of the white space the engine drops there.
  const want = [];
  doc.forEach((node) => want.push(node.textContent));
  const skips = [];
  const lastLine = new Map();
  pages.forEach((page, p) => {
    for (const line of page.lines) {
      if (line.kind !== "element") continue;
      const text = want[line.element];
      want[line.element] = text.slice(0, line.start) + line.text.slice(0, line.end - line.start) + text.slice(line.end);
      const before = lastLine.get(line.element);
      if (before && before.page !== p) skips.push([line.element, before.end, line.start]);
      lastLine.set(line.element, { page: p, end: line.end });
    }
  });
  for (const [element, from, to] of skips.reverse()) {
    const text = want[element];
    if (text.slice(from, to).includes("\\n")) want[element] = text.slice(0, from) + "\\n" + text.slice(to);
  }
  [...view.dom.children].forEach((p, element) => {
    let got = p.innerText;
    if (p.lastChild?.nodeName === "BR") got = got.replace(/\\n$/, "");
    if (got !== want[element]) out.shown.push({ element, got, want: want[element] });
  });

  // What each sheet prints, from the engine, against the text drawn there.
  const sheets = document.querySelectorAll(".sheets > .sheet");
  const box = view.dom.getBoundingClientRect();
  const firstChar = (span) => {
    const range = document.createRange();
    range.setStart(span.firstChild, 0);
    range.setEnd(span.firstChild, 1);
    return range.getBoundingClientRect();
  };
  pages.forEach((page, p) => {
    const sheetTop = p * PITCH_PX;
    const want = [];
    for (const line of page.lines) {
      const top = PAGE.topMarginIn * 96 + line.row * ROW_PX;
      const own = line.end - line.start;
      if (line.kind !== "element") want.push({ text: line.text, top, x: line.x });
      else if (line.text.length > own) {
        const x = line.x + cells(line.text.slice(0, own)).length / CHARS_PER_INCH;
        want.push({ text: line.text.slice(own), top, x });
      }
    }
    const drawn = [...(sheets[p]?.querySelectorAll(".printed") ?? [])];
    out.marks += want.length;
    want.forEach((mark, i) => {
      const span = drawn[i];
      const where = { page: p + 1, text: mark.text };
      if (span?.textContent !== mark.text) {
        out.printed.push({ ...where, got: span?.textContent });
        return;
      }
      const at = firstChar(span);
      const dx = at.left - box.left - Z * mark.x * 96;
      const dy = at.top - box.top - Z * (sheetTop + mark.top) - out.offset;
      if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) out.printed.push({ ...where, dx, dy });
    });
    if (drawn.length !== want.length) {
      out.printed.push({ page: p + 1, got: drawn.length, want: want.length });
    }
    const label = pageLabel(page.number);
    const number = sheets[p]?.querySelector(".page-number");
    if ((number?.textContent ?? null) !== label) {
      out.printed.push({ page: p + 1, got: number?.textContent, want: label });
    } else if (number) {
      // The number ends at the right margin, on the header's row.
      const range = document.createRange();
      range.selectNodeContents(number);
      const at = range.getBoundingClientRect();
      const dx = at.right - box.left - Z * (PAGE.widthIn - 1) * 96;
      const dy = at.top - box.top - Z * (sheetTop + PAGE.headerIn * 96) - out.offset;
      if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) out.printed.push({ page: p + 1, text: label, dx, dy });
    }
  });
  if (sheets.length !== pages.length) out.printed.push({ sheets: sheets.length, pages: pages.length });
  scrollTo(...scroll);
  return out;
})()`;

interface Miss {
  element?: number;
  page?: number;
  row?: number;
  text?: string;
  dx?: number;
  dy?: number;
  got?: unknown;
  want?: unknown;
}

interface Result {
  zoom: number;
  focus: boolean;
  pages: number;
  lines: number;
  empty: number;
  marks: number;
  characters: number;
  placed: Miss[];
  cells: Miss[];
  clicked: Miss[];
  shown: Miss[];
  printed: Miss[];
}

async function main(args: string[]): Promise<number> {
  const option = (name: string) => {
    const at = args.indexOf(name);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const fixture = option("--fixture");
  const page = fixture ? await load(`?fixture=${fixture}`) : await Page.open();
  const zoom = option("--zoom");
  const change = {
    ...(zoom ? { zoom: Number(zoom) } : {}),
    ...(args.includes("--focus") ? { focus: true } : {}),
  };
  let result: Result;
  try {
    const found = await page.evaluate<object>("tirDesk.settings");
    try {
      await page.evaluate(`(tirDesk.set(${JSON.stringify(change)}), true)`);
      result = await page.evaluate<Result>(CHECK);
    } finally {
      await page.evaluate(`(tirDesk.set(${JSON.stringify(found)}), true)`);
    }
  } finally {
    page.close();
  }
  console.log(
    `At ${Math.round(result.zoom * 100)}%${result.focus ? " in focus mode" : ""}: ${result.pages} pages, ${result.lines} lines checked (${result.empty} of them empty), ${result.characters} characters in lines with tabs or text beyond ASCII, and ${result.marks} printed marks besides page numbers.`,
  );
  const show = (title: string, misses: Miss[]) => {
    console.log(`${title}: ${misses.length}`);
    for (const miss of misses.slice(0, 10)) console.log(`  ${JSON.stringify(miss)}`);
  };
  show("Lines not where the engine puts them", result.placed);
  show("Characters not ending on the engine's cells", result.cells);
  show("Clicks that missed their character or line end", result.clicked);
  show("Elements not showing the engine's text", result.shown);
  show("Page numbers and marks not as the engine sets them", result.printed);
  const misses = [result.placed, result.cells, result.clicked, result.shown, result.printed].flat();
  return misses.length ? 1 : 0;
}

process.exitCode = await main(process.argv.slice(2));
