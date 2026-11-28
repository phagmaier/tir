/**
 * The editor's state and keys as the tests drive them, without a browser.
 * The state holds the editor's state plugins and keys go through its key
 * plugins, each in `editor.ts`'s order. In element text, "|" is the caret,
 * and "{" and "}" the ends of a selection. Every transaction carries the
 * harness's clock, which only `pause` moves, so undo's grouping by time is
 * exact.
 */
import { keymap } from "prosemirror-keymap";
import {
  type Command,
  EditorState,
  type Plugin,
  TextSelection,
  type Transaction,
} from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { Element, ElementType } from "../core/model.ts";
import { autocomplete } from "./autocomplete.ts";
import { typeAcross } from "./clipboard.ts";
import { screenplayKeys } from "./commands.ts";
import { fromDocument, toDocument } from "./editor-model.ts";
import { find } from "./find.ts";
import { spelling } from "./spelling.ts";
import { undoHistory, undoKeys } from "./undo.ts";

type Extra = Omit<Element, "type" | "text">;
export const element =
  (type: ElementType) =>
  (text: string, extra: Extra = {}): Element => ({ type, text, ...extra });
export const heading = element("sceneHeading");
export const action = element("action");
export const cue = element("character");
export const paren = element("parenthetical");
export const dialogue = element("dialogue");
export const transition = element("transition");
export const shot = element("shot");
export const general = element("general");

// History treats a time of 0 as "no change yet", so the clock starts later.
let clock = 1_000_000;

/** Lets `ms` pass before the next transaction. */
export function pause(ms: number): void {
  clock += ms;
}

/** An editor state holding `elements`, with the selection their markers show. */
export function stateOf(elements: readonly Element[]): EditorState {
  const marks: Record<string, number> = {};
  let pos = 0;
  const clean = elements.map((el) => {
    let text = "";
    for (const char of el.text) {
      if ("|{}".includes(char)) marks[char] = pos + 1 + text.length;
      else text += char;
    }
    pos += text.length + 2;
    return { ...el, text };
  });
  const doc = toDocument(clean);
  const anchor = marks["|"] ?? (marks["{"] as number);
  const head = marks["|"] ?? (marks["}"] as number);
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, anchor, head),
    plugins: [...undoHistory, autocomplete, spelling, find],
  });
}

/** The model of `state`, with markers for its selection. */
export function show(state: EditorState): Element[] {
  const { from, to, empty } = state.selection;
  const marks: [number, string][] = empty
    ? [[from, "|"]]
    : [
        [to, "}"],
        [from, "{"],
      ];
  let pos = 0;
  return fromDocument(state.doc).map((el, i) => {
    let text = el.text;
    for (const [at, mark] of marks) {
      const offset = at - (pos + 1);
      if (offset >= 0 && offset <= text.length)
        text = text.slice(0, offset) + mark + text.slice(offset);
    }
    pos += state.doc.child(i).nodeSize;
    return { ...el, text };
  });
}

/** Applies `tr` at the clock's time. */
export function apply(state: EditorState, tr: Transaction): EditorState {
  return state.apply(tr.setTime(clock));
}

/** Runs `command`, returning the state after it. */
export function run(state: EditorState, command: Command): EditorState {
  let next = state;
  command(state, (tr) => {
    next = apply(next, tr);
  });
  return next;
}

/** The editor's plugins that take keys, in its order. */
const keyPlugins: readonly Plugin[] = [
  autocomplete,
  spelling,
  keymap(screenplayKeys),
  keymap(undoKeys),
];

const KEY_CODES: Record<string, number> = {
  Enter: 13,
  Tab: 9,
  Backspace: 8,
  Delete: 46,
  Escape: 27,
  ArrowUp: 38,
  ArrowDown: 40,
  "(": 57,
  ")": 48,
};

/** A key press such as "Ctrl-Alt-d" or ")" (typed with Shift), as WebKitGTK reports it. */
function keyEvent(combo: string): KeyboardEvent {
  const parts = combo.split("-");
  const key = parts.pop() as string;
  const keyCode = KEY_CODES[key] ?? key.toUpperCase().charCodeAt(0);
  return {
    key,
    keyCode,
    ctrlKey: parts.includes("Ctrl"),
    altKey: parts.includes("Alt"),
    shiftKey: parts.includes("Shift") || key === "(" || key === ")",
    metaKey: false,
  } as KeyboardEvent;
}

/** Presses `combo` in `state` through the editor's key plugins. */
export function press(state: EditorState, combo: string): { state: EditorState; handled: boolean } {
  let next = state;
  const view = {
    get state() {
      return next;
    },
    dispatch: (tr: Transaction) => {
      next = apply(next, tr);
    },
  } as unknown as EditorView;
  const event = keyEvent(combo);
  const handled = keyPlugins.some(
    (plugin) => !!plugin.props.handleKeyDown?.call(plugin, view, event),
  );
  return { state: next, handled };
}

/**
 * Types `text` over the selection in one transaction, as the editor applies
 * plain typing: over a selection across elements, as `typeAcross` does.
 */
export function type(state: EditorState, text: string): EditorState {
  const { from, to } = state.selection;
  return apply(state, typeAcross(state, text) ?? state.tr.insertText(text, from, to));
}

/** Types `text` a character at a time, as a writer does. */
export function typeEach(state: EditorState, text: string): EditorState {
  let next = state;
  for (const char of text) next = type(next, char);
  return next;
}
