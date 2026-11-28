/**
 * The screenplay's keys and commands (brief, "Elements and keys"): Enter
 * and Tab by Final Draft's table, the element shortcuts and the top bar,
 * automatic parentheses, the three styles, dual dialogue, centred text and a
 * forced page break. Each command edits the ProseMirror document, so its
 * result is the model's (`fromDocument`), and marks where its undo step
 * starts and ends (`undo.ts`). Capitals are not here: the model keeps text
 * as typed and layout applies them.
 */
import { chainCommands, toggleMark } from "prosemirror-commands";
import type { Node } from "prosemirror-model";
import { type Command, type EditorState, TextSelection, type Transaction } from "prosemirror-state";
import { NEXT_ON_RETURN, NEXT_ON_TAB, NEXT_ON_TAB_AFTER_TEXT } from "../core/format.ts";
import type { ElementType } from "../core/model.ts";
import { deleteAcross } from "./clipboard.ts";
import { schema } from "./editor-model.ts";
import { asOwnStep, newStep, ownStep } from "./undo.ts";

const typeOf = (node: Node) => node.attrs.type as ElementType;

/** A new element: empty, or a parenthetical's two parentheses. */
function blank(type: ElementType): Node {
  return schema.node("element", { type }, type === "parenthetical" ? schema.text("()") : undefined);
}

/** Where the caret goes in a new element: between a parenthetical's parentheses. */
const caretIn = (node: Node) => (typeOf(node) === "parenthetical" ? 1 : 0);

/** Holds nothing the writer typed: no text, or only a parenthetical's "()". */
function isBlank(node: Node): boolean {
  const text = node.textContent;
  return text === "" || (typeOf(node) === "parenthetical" && text === "()");
}

/** `offset` ends the element's text: at its end, or before a parenthetical's closing ")". */
function endsText(node: Node, offset: number): boolean {
  const text = node.textContent;
  if (offset === text.length) return true;
  return typeOf(node) === "parenthetical" && offset === text.length - 1 && text.endsWith(")");
}

/** Where each element the selection touches starts. */
function touched(state: EditorState): number[] {
  const { from, to } = state.selection;
  const starts: number[] = [];
  state.doc.nodesBetween(from, to, (_node, pos) => {
    starts.push(pos);
    return false;
  });
  return starts;
}

/**
 * Changes the element at `pos` to `type`. One that becomes a parenthetical
 * gains the parentheses it lacks, one that stops being one loses them, and
 * only a cue keeps dual. Returns the steps that added a closing ")": a
 * caret at the text's end stays before it.
 */
function retype(tr: Transaction, pos: number, type: ElementType): number[] {
  const node = tr.doc.nodeAt(pos) as Node;
  const was = typeOf(node);
  if (was === type) return [];
  tr.setNodeMarkup(pos, undefined, {
    ...node.attrs,
    type,
    dual: type === "character" && node.attrs.dual,
  });
  const text = node.textContent;
  const start = pos + 1;
  const end = start + node.content.size;
  const closing: number[] = [];
  // The end first, so `start` still holds.
  if (type === "parenthetical") {
    if (!text.endsWith(")")) {
      closing.push(tr.steps.length);
      tr.insert(end, schema.text(")"));
    }
    if (!text.startsWith("(")) tr.insert(start, schema.text("("));
  } else if (was === "parenthetical") {
    if (text.endsWith(")")) tr.delete(end - 1, end);
    if (text.startsWith("(")) tr.delete(start, start + 1);
  }
  return closing;
}

/**
 * Changes every element the selection touches to `type`: the element
 * shortcuts and the top bar. A caret at an element's start moves past an
 * added "(", one at its end stays before an added ")".
 */
export function setElementType(type: ElementType): Command {
  return (state, dispatch) => {
    const starts = touched(state);
    if (starts.length === 0) return false;
    if (!dispatch) return true;
    const tr = state.tr;
    const closing = new Set<number>();
    // From the last, so earlier positions still hold.
    for (const pos of starts.reverse()) {
      for (const step of retype(tr, pos, type)) closing.add(step);
    }
    if (!tr.docChanged) return true;
    const { selection } = state;
    if (selection instanceof TextSelection) {
      const map = (pos: number) =>
        tr.mapping.maps.reduce((at, step, i) => step.map(at, closing.has(i) ? -1 : 1), pos);
      tr.setSelection(TextSelection.create(tr.doc, map(selection.anchor), map(selection.head)));
    }
    dispatch(ownStep(tr.scrollIntoView()));
    return true;
  };
}

/** Inserts `node` at `pos` and puts the caret in it. */
function startElement(tr: Transaction, pos: number, node: Node): Transaction {
  tr.insert(pos, node);
  return tr.setSelection(TextSelection.create(tr.doc, pos + 1 + caretIn(node)));
}

/**
 * Enter ends the element and starts the next by Final Draft's Return
 * column. Inside the text it splits the element into two of its type; at
 * the start it opens an empty one of its type above.
 */
const enter: Command = (state, dispatch) => {
  if (!(state.selection instanceof TextSelection)) return false;
  if (!dispatch) return true;
  const tr = state.tr;
  if (!state.selection.empty) tr.deleteSelection();
  const { $from } = tr.selection;
  const node = $from.parent;
  const type = typeOf(node);
  if (endsText(node, $from.parentOffset)) {
    startElement(tr, $from.after(), blank(NEXT_ON_RETURN[type]));
  } else if ($from.parentOffset === 0) {
    // A split at the start, so the step ends at the caret and typing
    // straight after joins it (`undo.ts`). The empty first part is a new
    // element; a forced break, dual and centring stay with the text.
    const empty = blank(type);
    tr.setNodeMarkup($from.before(), undefined, empty.attrs);
    tr.insert($from.pos, empty.content);
    tr.split($from.pos + empty.content.size, 1, [
      { type: schema.nodes.element, attrs: node.attrs },
    ]);
  } else {
    // The second part keeps the type and centring; a forced break and dual
    // stay with the first.
    tr.split($from.pos, 1, [
      { type: schema.nodes.element, attrs: { type, centred: node.attrs.centred } },
    ]);
  }
  dispatch(newStep(tr.scrollIntoView()));
  return true;
};

/**
 * Tab changes an empty element by Final Draft's Tab column, and at the end
 * of an element's text starts the next one. Elsewhere it does nothing, but
 * always claims the key, so focus never leaves the editor.
 */
const tab: Command = (state, dispatch) => {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return true;
  const { $from } = selection;
  const node = $from.parent;
  if (isBlank(node)) {
    const next = NEXT_ON_TAB[typeOf(node)];
    if (next) setElementType(next)(state, dispatch);
  } else if (endsText(node, $from.parentOffset)) {
    const next = NEXT_ON_TAB_AFTER_TEXT[typeOf(node)];
    if (next && dispatch)
      dispatch(newStep(startElement(state.tr, $from.after(), blank(next)).scrollIntoView()));
  }
  return true;
};

/** The caret's element, when the selection is a caret in a parenthetical. */
function caretInParenthetical(state: EditorState) {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;
  return typeOf(selection.$from.parent) === "parenthetical" ? selection.$from : null;
}

/** Typing ")" before a parenthetical's closing ")" steps over it. */
const closeParenthesis: Command = (state, dispatch) => {
  const $caret = caretInParenthetical(state);
  if ($caret?.parent.textContent.slice($caret.parentOffset) !== ")") return false;
  dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, $caret.pos + 1)));
  return true;
};

/** Typing "(" just after a parenthetical's opening "(" adds nothing. */
const openParenthesis: Command = (state) => {
  const $caret = caretInParenthetical(state);
  return !!$caret && $caret.parentOffset === 1 && $caret.parent.textContent.startsWith("(");
};

/**
 * Backspace in an empty parenthetical removes it with its parentheses; the
 * caret goes to the end of the element before (or the start of the next).
 * The script's only element becomes an empty Action, as a script always
 * has an element.
 */
const removeBlankParenthetical: Command = (state, dispatch) => {
  const $caret = caretInParenthetical(state);
  if (!$caret || !isBlank($caret.parent)) return false;
  if (dispatch) {
    const before = $caret.before();
    const tr = state.tr;
    let caret: number;
    if (state.doc.childCount === 1) {
      tr.replaceWith(before, $caret.after(), blank("action"));
      caret = before + 1;
    } else {
      tr.delete(before, $caret.after());
      caret = $caret.index(0) > 0 ? before - 1 : before + 1;
    }
    dispatch(tr.setSelection(TextSelection.create(tr.doc, caret)).scrollIntoView());
  }
  return true;
};

const isSpeech = (node: Node) => typeOf(node) === "dialogue" || typeOf(node) === "parenthetical";

/** The cue of the speech holding element `index`, if it is in one. */
function cueOf(doc: Node, index: number): number | undefined {
  for (let i = index; i >= 0; i--) {
    const node = doc.child(i);
    if (typeOf(node) === "character") return i;
    if (!isSpeech(node)) return undefined;
  }
  return undefined;
}

/** The next cue directly after the speech that `cue` starts, if any. */
function nextCue(doc: Node, cue: number): number | undefined {
  let i = cue + 1;
  while (i < doc.childCount && isSpeech(doc.child(i))) i++;
  return i < doc.childCount && typeOf(doc.child(i)) === "character" ? i : undefined;
}

/**
 * The cue dual dialogue marks or clears for the speech that `cue` starts:
 * its own when it sits beside the speech before it, else the next speech's
 * cue, else its own to sit beside the speech before. None when that would
 * put three speeches side by side.
 */
function dualTarget(doc: Node, cue: number): number | undefined {
  const isDual = (i: number | undefined) => i !== undefined && !!doc.child(i).attrs.dual;
  if (isDual(cue)) return cue;
  const after = nextCue(doc, cue);
  if (after !== undefined) return isDual(after) || !isDual(nextCue(doc, after)) ? after : undefined;
  const before = cue > 0 ? cueOf(doc, cue - 1) : undefined;
  return before === undefined || isDual(before) ? undefined : cue;
}

/**
 * Whether the speech that `cue` starts sits beside the speech before it,
 * as paginate.ts's `toBlocks` pairs them: a forced break on its cue, or
 * within the speech before, keeps the two apart.
 */
function sitsBeside(doc: Node, cue: number): boolean {
  const before = cue > 0 ? cueOf(doc, cue - 1) : undefined;
  if (before === undefined) return false;
  for (let i = before + 1; i <= cue; i++) if (doc.child(i).attrs.pageBreakBefore) return false;
  return true;
}

/** Whether a forced break before element `index` would part two speeches side by side. */
function partsDual(doc: Node, index: number): boolean {
  const cue = cueOf(doc, index);
  if (cue === undefined) return false;
  const right = cue === index ? cue : nextCue(doc, cue);
  return right !== undefined && !!doc.child(right).attrs.dual && sitsBeside(doc, right);
}

/**
 * Dual dialogue, as Final Draft's command: the speech holding the selection
 * goes beside the speech after it (marking that one's cue dual), or, when
 * none follows directly, beside the speech before it. On a speech already
 * beside another, it puts both back in one column. It marks nothing that a
 * forced break keeps apart, which would change nothing on the page.
 */
const toggleDual: Command = (state, dispatch) => {
  const { doc } = state;
  const cue = cueOf(doc, state.selection.$from.index(0));
  const target = cue === undefined ? undefined : dualTarget(doc, cue);
  if (target === undefined) return false;
  const node = doc.child(target);
  if (!node.attrs.dual && !sitsBeside(doc, target)) return false;
  if (dispatch) {
    let pos = 0;
    for (let i = 0; i < target; i++) pos += doc.child(i).nodeSize;
    const attrs = { ...node.attrs, dual: !node.attrs.dual };
    dispatch(ownStep(state.tr.setNodeMarkup(pos, undefined, attrs)));
  }
  return true;
};

/** Centres every element the selection touches, or, when all are centred, none. */
const toggleCentred: Command = (state, dispatch) => {
  const starts = touched(state);
  if (starts.length === 0) return false;
  if (dispatch) {
    const nodes = starts.map((pos) => state.doc.nodeAt(pos) as Node);
    const centred = nodes.some((node) => !node.attrs.centred);
    const tr = state.tr;
    starts.forEach((pos, i) => {
      tr.setNodeMarkup(pos, undefined, { ...nodes[i]?.attrs, centred });
    });
    dispatch(ownStep(tr));
  }
  return true;
};

/**
 * A forced page break before the element holding the selection's start, as
 * Final Draft's Page Break: the element starts a new page; again, it does
 * not. It adds none that would part two speeches side by side.
 */
const togglePageBreak: Command = (state, dispatch) => {
  const { $from } = state.selection;
  if ($from.depth === 0) return false;
  const node = $from.node(1);
  if (!node.attrs.pageBreakBefore && partsDual(state.doc, $from.index(0))) return false;
  if (dispatch) {
    const attrs = { ...node.attrs, pageBreakBefore: !node.attrs.pageBreakBefore };
    dispatch(ownStep(state.tr.setNodeMarkup($from.before(1), undefined, attrs).scrollIntoView()));
  }
  return true;
};

/** Final Draft's element shortcuts (findings, "Final Draft's keys"). */
const ELEMENT_KEYS: Readonly<Record<string, ElementType>> = {
  "Mod-1": "sceneHeading",
  "Mod-2": "action",
  "Mod-3": "character",
  "Mod-4": "parenthetical",
  "Mod-5": "dialogue",
  "Mod-6": "transition",
  "Mod-7": "shot",
  "Mod-0": "general",
};

/** Every key above, for `keymap`; each is recorded in brief, "Elements and keys". */
export const screenplayKeys: Readonly<Record<string, Command>> = {
  Enter: enter,
  Tab: tab,
  "Shift-Tab": () => true,
  // Over a selection across elements, Backspace and Delete remove what Cut does.
  Backspace: chainCommands(deleteAcross, removeBlankParenthetical),
  "Shift-Backspace": deleteAcross,
  "Mod-Backspace": deleteAcross,
  Delete: deleteAcross,
  "Mod-Delete": deleteAcross,
  "(": openParenthesis,
  ")": closeParenthesis,
  "Mod-b": asOwnStep(toggleMark(schema.marks.bold)),
  "Mod-i": asOwnStep(toggleMark(schema.marks.italic)),
  "Mod-u": asOwnStep(toggleMark(schema.marks.underline)),
  "Mod-Alt-d": toggleDual,
  "Mod-e": toggleCentred,
  "Mod-Enter": togglePageBreak,
  ...Object.fromEntries(
    Object.entries(ELEMENT_KEYS).map(([key, type]) => [key, setElementType(type)]),
  ),
};
