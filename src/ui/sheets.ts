/**
 * The sheets of paper behind the editor, with what they print that no
 * element holds: page numbers, (MORE), repeated cues and the automatic
 * (CONT'D). They sit outside the editable element, so WebKit's editing never
 * walks them, and a sheet is redrawn only when its own marks change.
 */
import { PITCH_PX, type Printed, type Sheet } from "./projection.ts";

export class SheetLayer {
  readonly dom: HTMLElement;
  private shown: readonly Sheet[] = [];

  constructor() {
    this.dom = document.createElement("div");
    this.dom.className = "sheets";
    // The editor holds the script's text; these marks repeat or number it.
    this.dom.setAttribute("aria-hidden", "true");
  }

  update(sheets: readonly Sheet[]): void {
    const children = this.dom.children;
    while (children.length > sheets.length) children[children.length - 1]?.remove();
    sheets.forEach((sheet, p) => {
      let dom = children[p] as HTMLElement | undefined;
      if (!dom) {
        dom = document.createElement("div");
        dom.className = "sheet";
        dom.style.top = `${p * PITCH_PX}px`;
        this.dom.append(dom);
      } else if (sameSheet(this.shown[p], sheet)) {
        return;
      }
      dom.replaceChildren(...draw(sheet));
    });
    this.shown = sheets;
  }
}

function sameSheet(a: Sheet | undefined, b: Sheet): boolean {
  if (!a || a.label !== b.label || a.printed.length !== b.printed.length) return false;
  return a.printed.every((p, i) => samePrinted(p, b.printed[i] as Printed));
}

function samePrinted(a: Printed, b: Printed): boolean {
  return a.text === b.text && a.top === b.top && a.x === b.x;
}

function draw(sheet: Sheet): HTMLElement[] {
  const out: HTMLElement[] = [];
  if (sheet.label) {
    const number = document.createElement("span");
    number.className = "page-number";
    number.textContent = sheet.label;
    out.push(number);
  }
  for (const { text, top, x } of sheet.printed) {
    const line = document.createElement("span");
    line.className = "printed";
    line.style.cssText = `top: ${top}px; left: ${x}in`;
    line.textContent = text;
    out.push(line);
  }
  return out;
}
