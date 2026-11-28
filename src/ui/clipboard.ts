/**
 * Copy, cut and paste (brief, "Copy and paste"). Copying puts the selection
 * on the clipboard twice: as Fountain text, which other applications see,
 * and as a clipping under Tir's own type, which WebKitGTK keeps in a
 * clipboard entry of its own that other applications are not offered
 * (findings, "Editor"). A paste takes Tir's clipping when there is one and
 * otherwise reads the text as Fountain (`src/core/clipping.ts`).
 *
 * A selection within one element copies text. One across elements copies
 * the elements it covers whole, and the covered part of an element it
 * covers in part. A parenthetical's parentheses go with the element: a
 * selection that starts just after its "(" covers it from its start, one
 * that ends just before its ")" covers it to its end. Cutting removes what
 * copying takes; a paste puts it back where the selection was. Each is an
 * undo step of its own. Backspace, Delete and typing over a selection across
 * elements remove what Cut removes, as typing does.
 */
import type { Fragment, Node } from "prosemirror-model";
import {
  type Command,
  type EditorState,
  Plugin,
  Selection,
  TextSelection,
  type Transaction,
} from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  type Clipping,
  clippingFromFountain,
  clippingToFountain,
  isText,
  readClipping,
  writeClipping,
} from "../core/clipping.ts";
import { fromNode, toNode } from "./editor-model.ts";
import { ownStep } from "./undo.ts";

/** Tir's clipboard type: a clipping, as `writeClipping` writes it. */
export const CLIPPING_TYPE = "application/x-tir-clipping";

/** Where an element's own text lies: inside a parenthetical's parentheses. */
function textRange(node: Node): readonly [start: number, end: number] {
  const text = node.textContent;
  if (node.attrs.type !== "parenthetical") return [0, text.length];
  const start = text.startsWith("(") ? 1 : 0;
  const end = text.length > start && text.endsWith(")") ? text.length - 1 : text.length;
  return [start, end];
}

/** Holds no text of its own: empty, or a parenthetical's "()". */
function isBlank(node: Node): boolean {
  const [start, end] = textRange(node);
  return start >= end;
}

/** How much of an element at one end of the selection it covers. */
type Cover = "whole" | "part" | "none";

/** Where a selection lies among the elements it touches. */
interface Reach {
  /** Where the first element it touches starts and the last one ends. */
  readonly start: number;
  readonly end: number;
  readonly first: Node;
  readonly last: Node;
  /** The selection's offsets in the first element and the last. */
  readonly from: number;
  readonly to: number;
  /** Whether it lies within one element's text. */
  readonly within: boolean;
  /** Whether it covers one element from outside it: select all in a script of one element. */
  readonly single: boolean;
  /** For a selection across elements, how much of the first and the last it covers. */
  readonly firstCover: Cover;
  readonly lastCover: Cover;
  /** The elements between the first and the last, which it covers whole. */
  readonly middle: readonly Node[];
}

function reach(state: EditorState): Reach | null {
  const { doc } = state;
  const $from = doc.resolve(state.selection.from);
  const $to = doc.resolve(state.selection.to);
  // Select all reaches from before the first element to after the last.
  const firstIndex = $from.index(0);
  const lastIndex = $to.depth === 0 ? $to.index(0) - 1 : $to.index(0);
  if (lastIndex < firstIndex) return null;
  const first = doc.child(firstIndex);
  const last = doc.child(lastIndex);
  const from = $from.depth === 0 ? 0 : $from.parentOffset;
  const to = $to.depth === 0 ? last.content.size : $to.parentOffset;
  const within = $from.depth === 1 && $to.depth === 1 && firstIndex === lastIndex;
  const single = !within && firstIndex === lastIndex;
  const [firstStart, firstEnd] = textRange(first);
  const [lastStart, lastEnd] = textRange(last);
  const middle: Node[] = [];
  for (let i = firstIndex + 1; i < lastIndex; i++) middle.push(doc.child(i));
  return {
    start: $from.depth === 0 ? $from.pos : $from.before(1),
    end: $to.depth === 0 ? $to.pos : $to.after(1),
    first,
    last,
    from,
    to,
    within,
    single,
    // An empty element where the selection starts is covered whole; one
    // where it ends, not at all.
    firstCover: from <= firstStart ? "whole" : from >= firstEnd ? "none" : "part",
    lastCover: to <= lastStart && $to.depth === 1 ? "none" : to >= lastEnd ? "whole" : "part",
    middle,
  };
}

/** Whether a selection covers any text: not only the break between two elements. */
const coversText = (r: Reach) =>
  r.within || r.single || r.firstCover !== "none" || r.lastCover !== "none" || r.middle.length > 0;

/** `node` with `content`, without what belongs to its start: a forced page break and dual. */
function endPart(node: Node, content: Fragment): Node {
  return node.type.create({ type: node.attrs.type, centred: node.attrs.centred }, content);
}

/** The selection as a clipping; null when it covers no text. */
export function clippingOf(state: EditorState): Clipping | null {
  const r = state.selection.empty ? null : reach(state);
  if (!r || !coversText(r)) return null;
  if (r.within) {
    const text = r.first.type.create(
      { type: r.first.attrs.type },
      r.first.content.cut(r.from, r.to),
    );
    return { elements: [fromNode(text)], openStart: true, openEnd: true };
  }
  const pieces: Node[] = [];
  if (r.single) {
    pieces.push(r.first);
  } else {
    if (r.firstCover === "whole") pieces.push(r.first);
    if (r.firstCover === "part") pieces.push(endPart(r.first, r.first.content.cut(r.from)));
    pieces.push(...r.middle);
    if (r.lastCover === "whole") pieces.push(r.last);
    if (r.lastCover === "part") pieces.push(r.last.copy(r.last.content.cut(0, r.to)));
  }
  return {
    elements: pieces.map(fromNode),
    openStart: r.firstCover === "part",
    openEnd: r.lastCover === "part",
  };
}

/**
 * What a selection across elements leaves of its first element and its
 * last. The last keeps its end part, without its start's forced break and
 * dual, which went with its start part, as Enter's split leaves them.
 */
function remainders(r: Reach): { before: Node | null; after: Node | null } {
  const { first, last } = r;
  const before =
    r.firstCover === "part"
      ? first.copy(first.content.cut(0, r.from))
      : r.firstCover === "none"
        ? first
        : null;
  const after =
    r.lastCover === "part"
      ? endPart(last, last.content.cut(r.to))
      : r.lastCover === "none"
        ? last
        : null;
  return { before, after };
}

/** Elements to put in place of the touched ones, and where the caret goes among them. */
interface Placed {
  readonly nodes: Node[];
  /** The caret: an index into `nodes` and an offset in that element's text. */
  readonly caret: readonly [index: number, offset: number];
}

/**
 * Pasted elements between what remains before and after them. An open first
 * piece joins `before`, an open last piece takes in `after`'s text; `null`
 * is nothing remaining.
 */
function assemble(
  pieces: readonly Node[],
  { openStart, openEnd }: Clipping,
  before: Node | null,
  after: Node | null,
): Placed {
  const nodes: Node[] = [];
  const rest = [...pieces];
  if (openStart) {
    const piece = rest.shift() as Node;
    nodes.push(before ? before.copy(before.content.append(piece.content)) : piece);
  } else if (before) {
    nodes.push(before);
  }
  const lastPiece = openEnd ? rest.pop() : undefined;
  nodes.push(...rest);
  if (lastPiece) {
    nodes.push(after ? lastPiece.copy(lastPiece.content.append(after.content)) : lastPiece);
    return { nodes, caret: [nodes.length - 1, lastPiece.content.size] };
  }
  const caret = [nodes.length - 1, (nodes.at(-1) as Node).content.size] as const;
  if (after) nodes.push(after);
  return { nodes, caret };
}

/**
 * Pasted elements where the selection was, in place of the element or
 * elements it touches (brief, "Copy and paste"). An empty element at the
 * caret is replaced; at an element's start they go before it, at its end
 * after it, and inside its text they split it, as Enter does.
 */
function placeElements(r: Reach, clipping: Clipping): Placed {
  const pieces = clipping.elements.map(toNode);
  if (!r.within) {
    const { before, after } = remainders(r);
    return assemble(pieces, clipping, before, after);
  }
  const element = r.first;
  const head = element.content.cut(0, r.from);
  const tail = element.content.cut(r.to);
  const rest = element.copy(head.append(tail));
  const lastPiece = (nodes: readonly Node[], index: number): Placed => ({
    nodes: [...nodes],
    caret: [index, (nodes[index] as Node).content.size],
  });
  if (isBlank(rest)) return lastPiece(pieces, pieces.length - 1);
  if (!clipping.openStart && !clipping.openEnd) {
    const [start, end] = textRange(element);
    if (r.from <= start) return lastPiece([...pieces, rest], pieces.length - 1);
    if (r.to >= end) return lastPiece([rest, ...pieces], pieces.length);
    const split = [element.copy(head), ...pieces, endPart(element, tail)];
    return lastPiece(split, pieces.length);
  }
  const before = clipping.openStart || head.size > 0 ? element.copy(head) : null;
  return assemble(pieces, clipping, before, tail.size > 0 ? endPart(element, tail) : null);
}

/**
 * Replaces the elements from `start` to `end` with `nodes`, leaving out
 * those at either end that stay as they were, so ProseMirror keeps their
 * paragraphs and the undo step covers only what changed.
 */
function replaceElements(tr: Transaction, start: number, end: number, nodes: readonly Node[]) {
  const old = tr.doc.slice(start, end).content;
  let from = start;
  let to = end;
  let same = 0;
  while (same < Math.min(nodes.length, old.childCount)) {
    const node = old.child(same);
    if (!(nodes[same] as Node).eq(node)) break;
    from += node.nodeSize;
    same++;
  }
  let kept = 0;
  while (kept < Math.min(nodes.length, old.childCount) - same) {
    const node = old.child(old.childCount - 1 - kept);
    if (!(nodes[nodes.length - 1 - kept] as Node).eq(node)) break;
    to -= node.nodeSize;
    kept++;
  }
  tr.replaceWith(from, to, nodes.slice(same, nodes.length - kept));
}

/** Pastes `clipping` over the selection, as one undo step. */
export function paste(clipping: Clipping): Command {
  return (state, dispatch) => {
    const [only] = clipping.elements;
    const r = reach(state);
    if (!only || !r) return false;
    if (!dispatch) return true;
    const tr = state.tr;
    if (isText(clipping)) {
      // Text goes in as typing does, keeping its own styles.
      const { from, to } = state.selection;
      tr.replaceWith(from, to, toNode(only).content);
      tr.setSelection(Selection.near(tr.doc.resolve(tr.mapping.map(to, 1)), -1));
    } else {
      const { nodes, caret } = placeElements(r, clipping);
      replaceElements(tr, r.start, r.end, nodes);
      let pos = r.start + 1 + caret[1];
      for (let i = 0; i < caret[0]; i++) pos += (nodes[i] as Node).nodeSize;
      tr.setSelection(TextSelection.create(tr.doc, pos));
    }
    dispatch(ownStep(tr.scrollIntoView().setMeta("uiEvent", "paste")));
    return true;
  };
}

/** A selection across elements that covers text: what Cut, Backspace, Delete and typing remove. */
function across(state: EditorState): Reach | null {
  const r = state.selection.empty ? null : reach(state);
  return r && !r.within && coversText(r) ? r : null;
}

/**
 * Removes, in `tr`, what Cut removes of the selection across elements `r`:
 * elements it covers whole go; one it covers in part keeps the rest and its
 * type; when both ends are covered in part, what is left of them joins, as
 * Backspace joins them. The caret goes where a paste puts the clipping back.
 */
function removeAcross(tr: Transaction, r: Reach): void {
  const { before, after } = remainders(r);
  let nodes = [before, after].filter((node): node is Node => node !== null);
  // A clipping that ends inside the last element but covers none of the
  // first goes back at the start of what is left of the last.
  let caret =
    before && after && r.firstCover === "none" && r.lastCover === "part"
      ? r.start + before.nodeSize + 1
      : before
        ? r.start + before.nodeSize - 1
        : r.start + 1;
  if (before && after && r.firstCover === "part" && r.lastCover === "part") {
    nodes = [before.copy(before.content.append(after.content))];
  } else if (nodes.length === 0 && r.start === 0 && r.end === tr.doc.content.size) {
    // A script always has an element: an empty one of the first's type.
    nodes = [r.first.type.create({ type: r.first.attrs.type })];
  }
  replaceElements(tr, r.start, r.end, nodes);
  if (nodes.length === 0) caret = r.start;
  tr.setSelection(Selection.near(tr.doc.resolve(caret), 1));
}

/** Removes what copying the selection takes (`removeAcross`), as one undo step. */
export const cut: Command = (state, dispatch) => {
  const r = state.selection.empty ? null : reach(state);
  if (!r || !coversText(r)) return false;
  if (!dispatch) return true;
  const tr = state.tr;
  if (r.within) tr.delete(r.start + 1 + r.from, r.start + 1 + r.to);
  else removeAcross(tr, r);
  dispatch(ownStep(tr.scrollIntoView().setMeta("uiEvent", "cut")));
  return true;
};

/**
 * Backspace or Delete over a selection across elements: what Cut removes,
 * kept with the typing around it as Backspace is. Within one element, or
 * over only the break between two, the usual deletion applies.
 */
export const deleteAcross: Command = (state, dispatch) => {
  const r = across(state);
  if (!r) return false;
  if (dispatch) {
    const tr = state.tr;
    removeAcross(tr, r);
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/**
 * Clears a selection across elements for typing; null for any other
 * selection, where typing replaces it as usual. What Cut removes goes, and
 * the caret goes into what is left of an element covered in part, the
 * first when both are. Over whole elements only, an empty element takes
 * the first one's place and type, the caret between a parenthetical's
 * parentheses.
 */
function clearAcross(state: EditorState): Transaction | null {
  const r = across(state);
  if (!r) return null;
  const tr = state.tr;
  if (r.firstCover === "part" || r.lastCover === "part") {
    removeAcross(tr, r);
  } else {
    const { before, after } = remainders(r);
    const covered = r.firstCover === "whole" ? r.first : (r.middle[0] ?? r.last);
    const paren = covered.attrs.type === "parenthetical";
    const typed = covered.type.create(
      { type: covered.attrs.type },
      paren ? covered.type.schema.text("()") : undefined,
    );
    const nodes = [before, typed, after].filter((node): node is Node => node !== null);
    replaceElements(tr, r.start, r.end, nodes);
    const caret = r.start + (before?.nodeSize ?? 0) + 1 + (paren ? 1 : 0);
    tr.setSelection(TextSelection.create(tr.doc, caret));
  }
  return tr;
}

/** Typing `text` over a selection across elements (`clearAcross`); null for any other selection. */
export function typeAcross(state: EditorState, text: string): Transaction | null {
  return clearAcross(state)?.insertText(text) ?? null;
}

/** Puts the selection on the clipboard, and with `cutting` removes it. */
function put(view: EditorView, event: ClipboardEvent, cutting: boolean): boolean {
  const data = event.clipboardData;
  if (view.state.selection.empty || !data) return false;
  event.preventDefault();
  const clipping = clippingOf(view.state);
  if (!clipping) return true;
  data.clearData();
  data.setData("text/plain", clippingToFountain(clipping));
  data.setData(CLIPPING_TYPE, writeClipping(clipping));
  if (cutting) cut(view.state, view.dispatch);
  return true;
}

/**
 * The editor's copy, cut and paste, in place of ProseMirror's own, and
 * typing over a selection across elements (`typeAcross`), which ProseMirror
 * hands to `handleTextInput` from its own key handling. A composed
 * character (a dead key, the Compose key) starts with a key WebKit reports
 * as 229, before the composition replaces the selection natively, so that
 * key clears the selection first, as typing would.
 */
export const clipboard = new Plugin({
  props: {
    handleTextInput(view, from, to, text) {
      const { selection } = view.state;
      if (from !== selection.from || to !== selection.to) return false;
      const tr = typeAcross(view.state, text);
      if (!tr) return false;
      view.dispatch(tr.scrollIntoView());
      return true;
    },
    handleKeyDown(view, event) {
      if (event.keyCode !== 229 || view.composing) return false;
      const tr = clearAcross(view.state);
      if (tr) view.dispatch(tr.scrollIntoView());
      return false;
    },
    handleDOMEvents: {
      copy: (view, event) => put(view, event, false),
      cut: (view, event) => put(view, event, true),
      paste(view, event) {
        // During a composition the browser pastes natively, as ProseMirror leaves it.
        const data = event.clipboardData;
        if (view.composing || !data) return false;
        event.preventDefault();
        const clipping =
          readClipping(data.getData(CLIPPING_TYPE)) ??
          clippingFromFountain(data.getData("text/plain"));
        paste(clipping)(view.state, view.dispatch);
        return true;
      },
    },
  },
});
