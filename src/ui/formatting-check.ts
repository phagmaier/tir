import { type EditorState, Plugin } from "prosemirror-state";
import { PAGE } from "../core/format.ts";
import { checkFormatting, type Finding } from "../core/formatting-check.ts";
import type { ElementType } from "../core/model.ts";
import { fromDocument } from "./editor-model.ts";
import { jumpTo } from "./jump.ts";
import { PITCH_PX, type Projection, ROW_PX } from "./projection.ts";

const ALERT = `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.3 14.2 13H1.8L8 2.3Z"/><path d="M8 6.4v3M8 11.2v.1"/></svg>`;

function explanation(finding: Finding, type: ElementType): string {
  switch (finding.kind) {
    case "cueWithoutDialogue":
      return "This character cue has no dialogue under it.";
    case "speechWithoutCue":
      return "This element has no character cue above it.";
    case "headingPrefix":
      return "Start a scene heading with INT., EXT., INT./EXT., EXT./INT., I/E. or EST., then a space.";
    case "emptyElement":
      return type === "parenthetical"
        ? "This parenthetical holds nothing between its parentheses."
        : "This empty element prints as a stray blank line.";
    case "emptyScene":
      return "This scene has nothing under its heading.";
    case "nearDuplicateName":
      return `“${finding.name}” appears in one cue. Did you mean “${finding.suggested}”?`;
  }
}

/** The element holding the caret, as an index into the draft; -1 for a selection. */
function caretElement({ selection }: EditorState): number {
  return selection.empty ? selection.$head.index(0) : -1;
}

/** The count in the top bar and marks on the paper (prototype pieces 1 and 5). */
export function formattingCheck(
  bar: HTMLElement,
  script: HTMLElement,
  projection: Projection,
  zoom: () => number,
  showScript: () => void,
  canNavigate: () => boolean,
  toast: (text: string) => void,
): Plugin {
  const divider = document.createElement("span");
  divider.className = "sep";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "formatting-count";
  button.title = "Formatting findings · F8 next";
  button.setAttribute("aria-keyshortcuts", "F8");
  button.innerHTML = ALERT;
  const count = document.createTextNode("");
  button.append(count);
  bar.append(divider, button);

  let go: (() => boolean) | undefined;
  // Pressing the button would take focus, and the caret, from the editor.
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => go?.());
  return new Plugin({
    view(view) {
      // A sibling of the editable root: neither the document, its geometry,
      // clipboard nor any export contains a mark or explanation.
      const layer = document.createElement("div");
      layer.className = "formatting-marks";
      // Pressing a mark would take focus from the editor; its tip shows on hover.
      layer.addEventListener("mousedown", (event) => event.preventDefault());
      script.append(layer);
      const marks = new Map<number, HTMLElement>();
      let current: HTMLElement | undefined;
      let waiting = 0;
      // The element the writer last typed in while the caret stays there: empty, it
      // is the place being written, as after Enter, and no stray line yet.
      let writing = -1;
      const indicateCaret = () => {
        const { selection } = view.state;
        const next = selection.empty ? marks.get(selection.$head.index(0)) : undefined;
        if (next === current) return;
        current?.classList.remove("at-caret");
        next?.classList.add("at-caret");
        current = next;
      };
      const refresh = () => {
        clearTimeout(waiting);
        waiting = 0;
        const { doc } = view.state;
        const findings = checkFormatting(fromDocument(doc), writing);
        const total = String(findings.length);
        if (count.data !== total) {
          count.data = total;
          button.classList.toggle("has-findings", findings.length > 0);
          button.setAttribute(
            "aria-label",
            `${total} formatting ${findings.length === 1 ? "finding" : "findings"} · Next finding`,
          );
        }
        const groups = new Map<number, string[]>();
        for (const finding of findings) {
          const message = explanation(finding, doc.child(finding.index).attrs.type as ElementType);
          const messages = groups.get(finding.index);
          if (messages) messages.push(message);
          else groups.set(finding.index, [message]);
        }
        const fragment = document.createDocumentFragment();
        marks.clear();
        for (const [index, messages] of groups) {
          const first = projection.map.firstSpot(index);
          if (!first) continue;
          const mark = document.createElement("span");
          mark.className = "finding-mark";
          mark.classList.toggle("right", projection.block(index)?.column === "right");
          mark.style.top = `${(first.page - 1) * PITCH_PX + PAGE.topMarginIn * 96 + first.row * ROW_PX}px`;
          mark.tabIndex = 0;
          mark.setAttribute("role", "img");
          mark.setAttribute("aria-label", messages.join(" "));
          const tip = document.createElement("span");
          tip.className = "finding-tip";
          tip.setAttribute("aria-hidden", "true");
          tip.textContent = messages.join("\n");
          mark.append(tip);
          fragment.append(mark);
          marks.set(index, mark);
        }
        layer.replaceChildren(fragment);
        indicateCaret();
      };
      go = () => {
        if (!view.editable || !canNavigate()) return false;
        // A jump immediately after typing must use the new draft, not old marks.
        if (waiting) refresh();
        const caret = view.state.selection.$head.index(0);
        let next: number | undefined;
        for (const index of marks.keys()) {
          next ??= index;
          if (index > caret) {
            next = index;
            break;
          }
        }
        const spot = next === undefined ? undefined : projection.map.firstSpot(next);
        if (spot) {
          showScript();
          jumpTo(view, projection, spot, zoom());
        } else {
          toast("No formatting findings");
        }
        return true;
      };
      const onKey = (event: KeyboardEvent) => {
        if (
          event.key === "F8" &&
          !event.defaultPrevented &&
          !event.isComposing &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.metaKey &&
          !event.shiftKey &&
          go?.()
        ) {
          event.preventDefault();
        }
      };
      window.addEventListener("keydown", onKey);
      refresh();
      return {
        update(next, previous) {
          if (next.state.doc !== previous.doc) {
            clearTimeout(waiting);
            current?.classList.remove("at-caret");
            current = undefined;
            writing = caretElement(next.state);
            // Don't scan the draft or draw its marks on the typing path.
            waiting = window.setTimeout(refresh, 150);
          } else if (writing !== -1 && caretElement(next.state) !== writing) {
            // The caret left the element being written: an empty one is a stray line now.
            writing = -1;
            clearTimeout(waiting);
            waiting = window.setTimeout(refresh, 150);
          }
          if (!waiting && !next.state.selection.eq(previous.selection)) indicateCaret();
        },
        destroy() {
          clearTimeout(waiting);
          window.removeEventListener("keydown", onKey);
          layer.remove();
          go = undefined;
        },
      };
    },
  });
}
