/**
 * The find bar (brief, "Find and replace"; prototype piece 5), under the
 * top bar's right end. Ctrl+F in the script opens it with its query
 * selected, or with the script's selection as the query when that lies on
 * one line of one element. Typing finds as it goes, from the selection,
 * once the typing pauses; Enter and Shift+Enter in the query go to the
 * next and previous match, Enter in the replacement replaces, and Esc goes
 * back to the script with the current match selected. On the bar's
 * buttons, Ctrl+Z and the redo keys undo and redo the script, so one
 * Ctrl+Z after Replace all reverses it; in its fields they undo the
 * field's typing.
 *
 * The bar is in the top bar, so it shows and hides with it: in focus mode
 * while it holds focus, and not over the Projects screen.
 */
import { keydownHandler } from "prosemirror-keymap";
import { type Command, Plugin } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  findNext,
  findPrevious,
  findStatus,
  replaceAll,
  replaceMatch,
  selectedText,
  setFindQuery,
} from "./find.ts";
import { undoKeys } from "./undo.ts";

// Prototype piece 5's icons, on a 16-unit grid.
const ICONS = {
  search: '<circle cx="7" cy="7" r="4.3"/><path d="m10.2 10.2 3.3 3.3"/>',
  up: '<path d="M4.5 9.5 8 6l3.5 3.5"/>',
  down: '<path d="M4.5 6.5 8 10l3.5-3.5"/>',
  swap: '<path d="M3 5.5h9l-2.5-2.5M13 10.5H4l2.5 2.5"/>',
  close: '<path d="m4.5 4.5 7 7M11.5 4.5l-7 7"/>',
};

const svg = (name: keyof typeof ICONS) =>
  `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const dom = document.createElement(tag);
  dom.className = className;
  return dom;
}

function button(className: string, title: string, html: string, label = ""): HTMLButtonElement {
  const dom = el("button", className);
  dom.type = "button";
  dom.title = title;
  dom.innerHTML = html;
  if (label) dom.setAttribute("aria-label", label);
  return dom;
}

function field(label: string): HTMLInputElement {
  const dom = el("input", "");
  dom.type = "text";
  dom.autocomplete = "off";
  dom.spellcheck = false;
  dom.setAttribute("aria-label", label);
  return dom;
}

const undoKey = keydownHandler(undoKeys);

/** The count beside the query: the current match's place, or how many there are. */
function countText(status: { count: number; current: number } | null): string {
  if (!status) return "";
  if (status.current >= 0) return `${status.current + 1} of ${status.count}`;
  if (status.count === 0) return "No matches";
  return status.count === 1 ? "1 match" : `${status.count} matches`;
}

/**
 * Adds the find bar to `parent`, the top bar, returning the plugin that
 * gives it the editor and Ctrl+F. `toast` reports Replace all.
 */
export function findBar(parent: HTMLElement, toast: (text: string) => void): Plugin {
  const bar = el("div", "pop find-bar");
  bar.hidden = true;
  bar.setAttribute("role", "search");
  bar.setAttribute("aria-label", "Find and replace");
  const query = field("Find");
  const count = el("span", "find-count");
  count.setAttribute("role", "status");
  const previous = button(
    "find-icon-button",
    "Previous match · Shift+Enter",
    svg("up"),
    "Previous match",
  );
  const next = button("find-icon-button", "Next match · Enter", svg("down"), "Next match");
  const toggle = (text: string, label: string) => {
    const dom = button("find-toggle", label, text, label);
    dom.setAttribute("aria-pressed", "false");
    dom.addEventListener("click", () => {
      dom.setAttribute("aria-pressed", String(!pressed(dom)));
      search();
    });
    return dom;
  };
  const pressed = (dom: HTMLButtonElement) => dom.getAttribute("aria-pressed") === "true";
  const matchCase = toggle("Aa", "Match case");
  const wholeWord = toggle("Word", "Whole word");
  const close = button("find-icon-button", "Close · Esc", svg("close"), "Close find");
  const replacement = field("Replace with");
  const replace = button("find-action", "Replace this match · Enter", "Replace");
  const replaceEvery = button("find-action", "Replace every match", "Replace all");
  const icon = (name: keyof typeof ICONS) => {
    const dom = el("span", "find-icon");
    dom.innerHTML = svg(name);
    return dom;
  };
  const row = (...children: HTMLElement[]) => {
    const dom = el("div", "find-row");
    dom.append(...children);
    return dom;
  };
  bar.append(
    row(icon("search"), query, count, previous, next, matchCase, wholeWord, close),
    row(icon("swap"), replacement, replace, replaceEvery),
  );
  parent.append(bar);

  let editor: EditorView | undefined;
  // Where the current match started when last brought into view.
  let revealed: number | null = null;

  const run = (command: Command) => !!editor && command(editor.state, editor.dispatch, editor);
  // Typing in the query searches once the typing pauses: a short query's
  // thousands of highlights take a long script a noticeable time to draw
  // (findings, "Editor"), which each keystroke would wait for.
  let pending = 0;
  const search = () => {
    clearTimeout(pending);
    pending = 0;
    run(
      setFindQuery(
        query.value
          ? { text: query.value, matchCase: pressed(matchCase), wholeWord: pressed(wholeWord) }
          : null,
      ),
    );
  };
  const searchSoon = () => {
    clearTimeout(pending);
    pending = window.setTimeout(search, 150);
  };
  /**
   * Runs `command` for the query as it stands, finding it first if a search
   * is waiting, and brings the current match into view after it, even when
   * it was already current, as the only match is.
   */
  const act = (command: Command) => {
    if (pending) search();
    revealed = null;
    return run(command);
  };
  // Replacing, and undoing on the bar's buttons, change the script: never
  // while it is not editable, as while Tir closes.
  const change = (command: Command) => !!editor?.editable && act(command);
  const hide = () => {
    bar.hidden = true;
    revealed = null;
    clearTimeout(pending);
    pending = 0;
    window.removeEventListener("keydown", onEscape, true);
  };
  const shut = () => {
    if (bar.hidden) return;
    hide();
    run(setFindQuery(null));
    editor?.focus();
  };
  // Desk listens on the document in capture; Esc belongs to the bar first.
  const onEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.isComposing) return;
    if (!(event.target instanceof Node) || !bar.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    shut();
  };
  const open = (view: EditorView) => {
    const selected = selectedText(view.state);
    if (selected !== null) query.value = selected;
    if (bar.hidden) {
      bar.hidden = false;
      window.addEventListener("keydown", onEscape, true);
    }
    query.focus();
    query.select();
    search();
  };
  // Scrolls the current match into view, to the window's middle, when the
  // bars or the window's edges hide any of it.
  const reveal = (view: EditorView) => {
    const hit = view.dom.querySelector(".find-current");
    if (!hit) return;
    const { top, bottom, left, right } = hit.getBoundingClientRect();
    if (
      top < bar.getBoundingClientRect().bottom ||
      bottom > innerHeight ||
      left < 0 ||
      right > innerWidth
    ) {
      hit.scrollIntoView({ block: "center", inline: "nearest" });
    }
  };
  const show = (view: EditorView) => {
    const status = findStatus(view.state);
    const text = countText(status);
    if (count.textContent !== text) count.textContent = text;
    const at = status && status.current >= 0 ? view.state.selection.from : null;
    if (at !== null && at !== revealed && !bar.hidden) reveal(view);
    revealed = at;
  };

  query.addEventListener("input", searchSoon);
  // A search still waiting runs from the selection before a click in the
  // script moves it, so the click's caret stays.
  query.addEventListener("blur", () => {
    if (pending) search();
  });
  previous.addEventListener("click", () => act(findPrevious));
  next.addEventListener("click", () => act(findNext));
  close.addEventListener("click", shut);
  replace.addEventListener("click", () => change(replaceMatch(replacement.value)));
  replaceEvery.addEventListener("click", () => {
    if (!editor?.editable) return;
    if (pending) search();
    const replaced = findStatus(editor.state)?.count;
    if (run(replaceAll(replacement.value))) toast(`Replaced ${replaced} · one Undo reverses it`);
  });
  bar.addEventListener("keydown", (event) => {
    if (!editor || event.isComposing) return;
    const plain = !event.ctrlKey && !event.altKey && !event.metaKey;
    if (plain && event.key === "Enter" && event.target === query) {
      event.preventDefault();
      act(event.shiftKey ? findPrevious : findNext);
    } else if (plain && !event.shiftKey && event.key === "Enter" && event.target === replacement) {
      event.preventDefault();
      change(replaceMatch(replacement.value));
    } else if (
      event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey &&
      event.key.toLowerCase() === "f"
    ) {
      event.preventDefault();
      query.focus();
      query.select();
    } else if (
      event.target instanceof HTMLButtonElement &&
      editor.editable &&
      undoKey(editor, event)
    ) {
      event.preventDefault();
    }
  });

  return new Plugin({
    props: {
      handleKeyDown: keydownHandler({
        "Mod-f": (_state, _dispatch, view) => {
          if (view) open(view);
          return true;
        },
      }),
    },
    view(view) {
      // ProseMirror makes this view again for each new state, an opened
      // script, which finds nothing: the bar closes with the script it
      // searched. The DOM's listeners were added once, above.
      editor = view;
      hide();
      show(view);
      return {
        update: show,
        destroy() {
          editor = undefined;
        },
      };
    },
  });
}
