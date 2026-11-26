import { CHARS_PER_INCH, FONT_SIZE_PT, LINES_PER_INCH, PAGE } from "../core/format.ts";

// A placeholder page until the editor arrives in Stage 1: a few centred
// lines placed by character and line arithmetic, never by browser wrapping.
const placeholder: readonly { line: number; text: string }[] = [
  { line: 18, text: "TIR" },
  { line: 20, text: "a screenwriting application" },
  { line: 23, text: "Stage 0: skeleton and page engine" },
];

function centredLeftIn(text: string): number {
  return (PAGE.widthIn - text.length / CHARS_PER_INCH) / 2;
}

function renderPlaceholder(pages: HTMLElement): void {
  const sheet = document.createElement("div");
  sheet.className = "sheet";
  sheet.style.width = `${PAGE.widthIn}in`;
  sheet.style.height = `${PAGE.heightIn}in`;
  sheet.style.fontSize = `${FONT_SIZE_PT}pt`;
  sheet.style.lineHeight = `${1 / LINES_PER_INCH}in`;
  for (const { line, text } of placeholder) {
    const el = document.createElement("div");
    el.className = "line";
    el.textContent = text;
    el.style.left = `${centredLeftIn(text)}in`;
    el.style.top = `${PAGE.topMarginIn + line / LINES_PER_INCH}in`;
    sheet.append(el);
  }
  pages.append(sheet);
}

const pages = document.getElementById("pages");
if (pages) renderPlaceholder(pages);
