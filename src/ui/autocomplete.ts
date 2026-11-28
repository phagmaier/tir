/**
 * Autocomplete (brief, "Elements and keys"). While the writer types at the
 * end of a cue, scene heading or transition, a popup lists the suggestions
 * that continue the part being typed, most used first, and a ghost shows the
 * rest of the highlighted one after the caret. Enter or Tab accepts, the
 * arrows choose, Esc closes; with the popup closed these keys are the
 * screenplay's, so this plugin comes before `screenplayKeys`.
 *
 * Only typing or deleting at an element's end opens the popup, so moving the
 * caret never does, and any other change closes it, undo and redo included.
 * Composed input (dead keys, the Compose key) closes it too, so nothing near
 * the caret changes while a composition is under way. Accepting a
 * suggestion is an undo step of its own, so Ctrl+Z gives back what was typed.
 *
 * The popup and the ghost sit beside the editable element, at the caret's
 * place on the page: they move no line and add nothing to WebKit's editing
 * work (architecture, "The editor"). The editable element names the
 * popup's highlighted option as its active descendant, which a screen
 * reader announces while focus stays in the script.
 */
import { isHistoryTransaction } from "prosemirror-history";
import type { Node } from "prosemirror-model";
import {
  type Command,
  type EditorState,
  Plugin,
  PluginKey,
  TextSelection,
  type Transaction,
} from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { ELEMENT_FORMATS } from "../core/format.ts";
import { capitals } from "../core/layout.ts";
import type { ElementType } from "../core/model.ts";
import {
  type Source,
  type Suggestion,
  suggest,
  Tally,
  type Use,
  usesOf,
} from "../core/suggestions.ts";
import { ROW_PX } from "./projection.ts";
import { ownStep } from "./undo.ts";

/** At most this many suggestions show; typing more narrows the rest. */
const SHOWN = 10;

const TITLES: Readonly<Record<Source, string>> = {
  character: "Character",
  extension: "Extension",
  prefix: "Prefix",
  location: "Location",
  time: "Time of day",
  transition: "Transition",
};

interface Open {
  readonly source: Source;
  /** The part being typed, which runs to the element's end, where the caret is. */
  readonly from: number;
  readonly to: number;
  readonly suffix: string;
  readonly options: readonly Suggestion[];
  readonly chosen: number;
}

interface State {
  /** Uses of each suggestion in the whole script. */
  readonly tally: Tally;
  readonly open: Open | null;
}

type Meta = { readonly choose: number } | { readonly close: true };

const key = new PluginKey<State>("autocomplete");

const usesByNode = new WeakMap<Node, Use[]>();

/** An element's uses; elements are immutable nodes, so each is read once. */
function usesOfNode(node: Node): Use[] {
  let uses = usesByNode.get(node);
  if (!uses) {
    uses = usesOf(node.attrs.type as ElementType, node.textContent);
    usesByNode.set(node, uses);
  }
  return uses;
}

const sameUses = (a: readonly Use[], b: readonly Use[]) =>
  a.length === b.length &&
  a.every((use, i) => use.source === b[i]?.source && use.text === b[i].text);

/**
 * Follows an edit: the tally loses the uses of the elements the edit
 * replaced and gains those of their replacements. The elements around them
 * are the same nodes before and after. Also returns the index of the one
 * element the edit changed, when it changed exactly one.
 */
function follow(tally: Tally, before: Node, after: Node): { tally: Tally; only: number | null } {
  const most = Math.min(before.childCount, after.childCount);
  let first = 0;
  while (first < most && before.child(first) === after.child(first)) first++;
  let kept = 0;
  while (
    kept < most - first &&
    before.child(before.childCount - 1 - kept) === after.child(after.childCount - 1 - kept)
  ) {
    kept++;
  }
  const removed: Use[] = [];
  const added: Use[] = [];
  for (let i = first; i < before.childCount - kept; i++)
    removed.push(...usesOfNode(before.child(i)));
  for (let i = first; i < after.childCount - kept; i++) added.push(...usesOfNode(after.child(i)));
  const only = before.childCount === after.childCount && after.childCount - kept === first + 1;
  return {
    tally: sameUses(removed, added) ? tally : tally.with(removed, added),
    only: only ? first : null,
  };
}

/**
 * Whether `tr` is typing or deleting in the caret's element, which keeps its
 * type: the only edits that open the popup. A format key changes the
 * element but not its text. Paste, drop, cut and find's replacements name
 * themselves in `uiEvent`, ProseMirror marks composed input, and undo and
 * redo are the history's.
 */
function isTyping(tr: Transaction, only: number | null): boolean {
  if (only === null || tr.getMeta("composition") || tr.getMeta("uiEvent")) return false;
  if (isHistoryTransaction(tr)) return false;
  const { selection } = tr;
  const before = tr.before.child(only);
  const after = tr.doc.child(only);
  return (
    selection.empty &&
    selection.$from.index(0) === only &&
    before.attrs.type === after.attrs.type &&
    before.textContent !== after.textContent
  );
}

/** The popup for the caret, when it ends an element whose text has suggestions. */
function openAt(state: EditorState, tally: Tally): Open | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;
  const { $from } = selection;
  const node = $from.parent;
  if ($from.depth !== 1 || $from.parentOffset !== node.content.size) return null;
  const found = suggest(tally, node.attrs.type as ElementType, node.textContent, usesOfNode(node));
  if (!found) return null;
  return {
    source: found.source,
    from: $from.start() + found.start,
    to: $from.pos,
    suffix: found.suffix,
    options: found.options.slice(0, SHOWN),
    chosen: 0,
  };
}

const openIn = (state: EditorState) => key.getState(state)?.open ?? null;

/** How often the script uses each suggestion: its names and locations teach spell check too. */
export function tallyOf(state: EditorState): Tally | undefined {
  return key.getState(state)?.tally;
}

/** Moves the highlight by `by`, round the list. */
const choose =
  (by: number): Command =>
  (state, dispatch) => {
    const open = openIn(state);
    if (!open) return false;
    const count = open.options.length;
    dispatch?.(state.tr.setMeta(key, { choose: (open.chosen + by + count) % count }));
    return true;
  };

/**
 * Replaces the part being typed with suggestion `index` (the highlighted
 * one by default), as the script writes it, and adds what follows it: the
 * space after a prefix, " - " after a location. The popup then offers the
 * next part, if any.
 */
const accept =
  (index?: number): Command =>
  (state, dispatch) => {
    const open = openIn(state);
    const option = open?.options[index ?? open.chosen];
    if (!open || !option) return false;
    if (dispatch) {
      const text = option.text + open.suffix;
      const tr = state.tr.insertText(text, open.from, open.to);
      tr.setSelection(TextSelection.create(tr.doc, open.from + text.length));
      dispatch(ownStep(tr.scrollIntoView()));
    }
    return true;
  };

const close: Command = (state, dispatch) => {
  if (!openIn(state)) return false;
  dispatch?.(state.tr.setMeta(key, { close: true }));
  return true;
};

/** The popup's keys, each recorded in brief, "Elements and keys". */
const KEYS: Readonly<Record<string, Command>> = {
  Enter: accept(),
  Tab: accept(),
  ArrowDown: choose(1),
  ArrowUp: choose(-1),
  Escape: close,
};

/** What the popup shows, in capitals where the element shows them, as the script does. */
export interface Popup {
  readonly title: string;
  readonly options: readonly Suggestion[];
  readonly chosen: number;
  /** The rest of the highlighted suggestion, shown after the caret. */
  readonly ghost: string;
}

export function popupOf(state: EditorState): Popup | null {
  const open = openIn(state);
  if (!open) return null;
  const type = state.doc.resolve(open.to).parent.attrs.type as ElementType;
  const shown = ELEMENT_FORMATS[type].capitals ? capitals : (text: string) => text;
  const chosen = open.options[open.chosen] as Suggestion;
  return {
    title: TITLES[open.source],
    options: open.options.map(({ text, uses }) => ({ text: shown(text), uses })),
    chosen: open.chosen,
    ghost: shown(chosen.text.slice(open.to - open.from)),
  };
}

/** Each editor's popup view; ProseMirror makes a new one when the editor takes new plugins. */
const popups = new WeakMap<EditorView, PopupView>();

export const autocomplete: Plugin<State> = new Plugin<State>({
  key,
  state: {
    init: (_config, state) => ({
      tally: Tally.of(
        Array.from({ length: state.doc.childCount }, (_, i) => {
          const node = state.doc.child(i);
          return { type: node.attrs.type as ElementType, text: node.textContent };
        }),
      ),
      open: null,
    }),
    apply(tr, value, _before, state) {
      let { tally } = value;
      let typing = false;
      if (tr.docChanged) {
        const followed = follow(tally, tr.before, tr.doc);
        tally = followed.tally;
        typing = isTyping(tr, followed.only);
      }
      const meta = tr.getMeta(key) as Meta | undefined;
      let open: Open | null;
      if (meta && "close" in meta) {
        open = null;
      } else if (meta && "choose" in meta) {
        open = value.open && { ...value.open, chosen: meta.choose };
      } else if (tr.docChanged) {
        open = typing ? openAt(state, tally) : null;
      } else {
        // The caret leaving the end of the text closes the popup.
        const { selection } = state;
        open =
          value.open && selection.empty && selection.head === value.open.to ? value.open : null;
      }
      return open === value.open && tally === value.tally ? value : { tally, open };
    },
  },
  props: {
    handleKeyDown(view, event) {
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || view.composing) {
        return false;
      }
      return KEYS[event.key]?.(view.state, view.dispatch, view) ?? false;
    },
    handleDOMEvents: {
      blur(view) {
        close(view.state, view.dispatch);
        return false;
      },
    },
  },
  view(view) {
    const popup = new PopupView(view);
    popups.set(view, popup);
    return popup;
  },
});

/**
 * Moves an open popup and its ghost to the caret's place in the current
 * layout, as after a zoom change, which moves the caret but changes no state.
 */
export function placePopup(view: EditorView): void {
  popups.get(view)?.place(view);
}

/** Where the caret is on screen, and the script's zoom. */
interface CaretPlace {
  readonly caret: { readonly left: number; readonly top: number; readonly bottom: number };
  readonly origin: DOMRect;
  readonly frame: DOMRect;
  readonly zoom: number;
  /** A line's height at the zoom. */
  readonly row: number;
  /** The top of the caret's line. */
  readonly top: number;
}

/**
 * Draws the ghost in the editor's parent, the script, beside the editable
 * element, on the line after the caret, in the script's font, so it
 * continues the text at the page's zoom. The popup goes below the caret's
 * line, or above it when the window has no room below, in the script's
 * frame, which the zoom does not scale, so it keeps the interface's size.
 */
class PopupView {
  private readonly script: HTMLElement;
  private readonly ghost = document.createElement("span");
  private readonly list = document.createElement("div");
  private shown: Open | null = null;
  /** Counts the lists drawn, so each draws its options under new ids. */
  private drawn = 0;

  constructor(view: EditorView) {
    this.script = view.dom.parentElement as HTMLElement;
    this.ghost.className = "completion-ghost";
    this.ghost.setAttribute("aria-hidden", "true");
    this.list.className = "completion";
    this.list.id = "completion";
    this.list.setAttribute("role", "listbox");
    this.hide(view);
    // Pressing an option would take focus, and the caret, from the editor.
    this.list.addEventListener("mousedown", (event) => event.preventDefault());
    this.list.addEventListener("click", (event) => {
      const option = (event.target as HTMLElement).closest<HTMLElement>("[data-index]");
      if (option) accept(Number(option.dataset.index))(view.state, view.dispatch);
    });
    this.script.append(this.ghost);
    this.script.parentElement?.append(this.list);
  }

  update(view: EditorView): void {
    const open = openIn(view.state);
    if (open === this.shown) return;
    this.shown = open;
    const popup = popupOf(view.state);
    if (!open || !popup) {
      this.hide(view);
      return;
    }
    // Where the caret is, read before anything here changes, so the page is
    // laid out once for it.
    const at = this.measure(view, open);
    this.list.setAttribute("aria-label", popup.title);
    const drawn = ++this.drawn;
    this.list.replaceChildren(
      line("completion-title", popup.title),
      ...popup.options.map(({ text, uses }, index) => {
        const option = line("completion-option", text);
        option.id = `completion-${drawn}-${index}`;
        option.dataset.index = String(index);
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(index === popup.chosen));
        if (index === popup.chosen && uses > 0) {
          const count = document.createElement("i");
          count.textContent = `used ${uses}×`;
          option.append(count);
        }
        return option;
      }),
      line("completion-keys", "Enter accepts · ↑↓ choose · Esc"),
    );
    // Named once the option is in the page, so a screen reader finds it.
    view.dom.setAttribute("aria-controls", this.list.id);
    view.dom.setAttribute("aria-activedescendant", `completion-${drawn}-${popup.chosen}`);
    this.list.hidden = false;
    const marks = view.state.storedMarks ?? view.state.doc.resolve(open.to).marks();
    const has = (name: string) => marks.some((mark) => mark.type.name === name);
    const { style } = this.ghost;
    style.fontWeight = has("bold") ? "700" : "";
    style.fontStyle = has("italic") ? "italic" : "";
    style.textDecoration = has("underline") ? "underline" : "";
    this.ghost.textContent = popup.ghost;
    this.ghost.hidden = false;
    this.position(at);
  }

  /** Moves the popup and the ghost, when open, to the caret's place in the current layout. */
  place(view: EditorView): void {
    if (this.shown) this.position(this.measure(view, this.shown));
  }

  /**
   * The caret's place, read from the layout. The caret's box is its font's
   * height, centred on its line. Positions inside the script are at 100%:
   * the zoom scales them.
   */
  private measure(view: EditorView, open: Open): CaretPlace {
    const caret = view.coordsAtPos(open.to, -1);
    const origin = this.script.getBoundingClientRect();
    const frame = (this.list.parentElement as HTMLElement).getBoundingClientRect();
    const zoom = origin.width / this.script.offsetWidth || 1;
    const row = ROW_PX * zoom;
    return { caret, origin, frame, zoom, row, top: (caret.top + caret.bottom - row) / 2 };
  }

  private position({ caret, origin, frame, zoom, row, top }: CaretPlace): void {
    this.ghost.style.left = `${(caret.left - origin.left) / zoom}px`;
    this.ghost.style.top = `${(top - origin.top) / zoom}px`;
    // Below the caret's line, or above it when only that fits in the window;
    // from the caret's column, or further left when the window ends first.
    const { offsetWidth: width, offsetHeight: height } = this.list;
    const below = top + row + 4;
    const above = top - 4 - height;
    const y = below + height > innerHeight && above >= 0 ? above : below;
    const x = Math.max(0, Math.min(caret.left, document.documentElement.clientWidth - width - 4));
    this.list.style.top = `${y - frame.top}px`;
    this.list.style.left = `${x - frame.left}px`;
  }

  private hide(view: EditorView): void {
    this.ghost.hidden = true;
    this.list.hidden = true;
    if (view.dom.getAttribute("aria-controls") === this.list.id) {
      view.dom.removeAttribute("aria-controls");
      view.dom.removeAttribute("aria-activedescendant");
    }
  }

  destroy(): void {
    this.ghost.remove();
    this.list.remove();
  }
}

function line(className: string, text: string): HTMLElement {
  const dom = document.createElement("div");
  dom.className = className;
  const span = document.createElement("span");
  span.textContent = text;
  dom.append(span);
  return dom;
}
