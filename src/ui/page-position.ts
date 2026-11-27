import { keydownHandler } from "prosemirror-keymap";
import { Plugin } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { jumpTo } from "./jump.ts";
import type { Projection } from "./projection.ts";

/**
 * The top bar's page position in `dom` (brief, "Page position"):
 * "Page N of M", N the page holding the caret and M the script's pages, from
 * the projection. Go to page (prototype piece 7, A): Ctrl+G or a click turns
 * N into a field; Enter puts the caret at the start of the page typed and
 * scrolls there, Esc goes back to the script. A view plugin in the typing
 * path, so it touches the page only when N or M changes.
 */
export function pagePosition(
  dom: HTMLElement,
  projection: Projection,
  zoom: () => number,
  showScript: () => void,
): Plugin {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pg";
  button.title = "Go to page · Ctrl+G";
  button.setAttribute("aria-keyshortcuts", "Control+G");
  const form = document.createElement("span");
  form.className = "pg editing";
  form.hidden = true;
  const field = document.createElement("input");
  field.className = "pg-field";
  field.inputMode = "numeric";
  field.autocomplete = "off";
  field.spellcheck = false;
  field.setAttribute("aria-label", "Go to page");
  const total = document.createTextNode("");
  form.append("Page ", field, total);
  dom.append(button, form);

  let page = 0;
  let count = 0;
  const show = (view: EditorView) => {
    const n = projection.pageAt(view.state.selection.head);
    const m = projection.map.pageCount;
    if (n === page && m === count) return;
    button.textContent = `Page ${n} of ${m}`;
    if (m !== count) total.data = ` of ${m}`;
    page = n;
    count = m;
  };

  const open = () => {
    showScript();
    button.hidden = true;
    form.hidden = false;
    field.value = String(page);
    field.focus();
    field.select();
  };
  const close = () => {
    form.hidden = true;
    button.hidden = false;
  };
  const go = (view: EditorView) => {
    // A page number, kept within the script: past the end is the last page.
    if (!/^\s*\d+\s*$/.test(field.value)) {
      field.select();
      return;
    }
    const n = Math.min(Math.max(Number(field.value), 1), count);
    const start = projection.map.pageStart(n);
    close();
    if (start) jumpTo(view, projection, start, zoom());
    else view.focus();
  };

  // ProseMirror makes the plugin's view again for each new state (an opened
  // script), so the button and field get their listeners once, here.
  let editor: EditorView | undefined;
  button.addEventListener("click", open);
  field.addEventListener("keydown", (event) => {
    if (!editor) return;
    if (event.key === "Enter") {
      event.preventDefault();
      go(editor);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
      editor.focus();
    }
  });
  // Clicking elsewhere leaves the page where it is. Switching to another
  // window, to look a page number up, keeps the field for the return.
  field.addEventListener("blur", () => {
    if (document.hasFocus()) close();
  });

  return new Plugin({
    props: {
      handleKeyDown: keydownHandler({
        "Mod-g": () => {
          open();
          return true;
        },
      }),
    },
    view(view) {
      editor = view;
      show(view);
      return { update: show };
    },
  });
}
