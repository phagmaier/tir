/**
 * Find and replace in the active draft (brief, "Find and replace"). The find
 * bar (`find-bar.ts`) sets the query; this plugin keeps its matches,
 * highlights them, and holds the commands that move between them and
 * replace them. The current match is the selection: Next and Previous
 * select a match, and Replace replaces the selected one, or first selects
 * the next.
 *
 * Making a decoration set costs time for every element times every
 * decoration (findings, "Editor"), so a new query makes the set once, and an
 * edit maps it and patches the elements it changed, the only ones searched
 * again.
 */
import type { Node } from "prosemirror-model";
import {
  type Command,
  type EditorState,
  Plugin,
  PluginKey,
  TextSelection,
  type Transaction,
} from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { type Finder, type FindQuery, finder } from "../core/find.ts";
import { ELEMENT_FORMATS } from "../core/format.ts";
import { capitals } from "../core/layout.ts";
import type { ElementType, Span } from "../core/model.ts";
import { schema } from "./editor-model.ts";
import { changedElements, MANY_STEPS } from "./projection.ts";
import { ownStep } from "./undo.ts";

interface Match {
  readonly from: number;
  readonly to: number;
}

interface Found {
  readonly find: Finder;
  /** Each element's matches by its node, which any change replaces. */
  readonly spans: WeakMap<Node, readonly Span[]>;
  readonly matches: readonly Match[];
  /** Every match's highlight. */
  readonly hits: DecorationSet;
  /** The match the selection covers exactly, as an index into `matches`, or -1. */
  readonly current: number;
  /** The highlights, the current match's included. */
  readonly decorations: DecorationSet;
}

/**
 * A new query, null to stop finding; and a position whose first match at
 * or after it, or else the first, becomes the selection.
 */
interface Meta {
  readonly query?: FindQuery | null;
  readonly select?: number;
}

const key = new PluginKey<Found | null>("find");
const HIT = { class: "find-hit" };
const CURRENT = { class: "find-current" };

export const find = new Plugin<Found | null>({
  key,
  state: {
    init: () => null,
    apply(tr, found, _before, state) {
      const meta = tr.getMeta(key) as Meta | undefined;
      let next = found;
      if (meta?.query !== undefined) {
        const find = meta.query && finder(meta.query);
        next = find ? search(state.doc, find) : null;
      } else if (found && tr.docChanged) {
        next = patch(found, tr);
      }
      return next && withCurrent(next, state);
    },
  },
  appendTransaction(transactions, _before, state) {
    let select: number | undefined;
    for (const tr of transactions) {
      if (select !== undefined) select = tr.mapping.map(select);
      const meta = tr.getMeta(key) as Meta | undefined;
      if (meta?.select !== undefined) select = meta.select;
    }
    const matches = key.getState(state)?.matches;
    if (select === undefined || !matches?.length) return null;
    return selectMatch(state, (matches[firstFrom(matches, select)] ?? matches[0]) as Match);
  },
  props: {
    decorations: (state) => key.getState(state)?.decorations ?? null,
  },
});

/** How many matches the query has, and which is selected (-1 for none); null when not finding. */
export function findStatus(state: EditorState): { count: number; current: number } | null {
  const found = key.getState(state);
  return found ? { count: found.matches.length, current: found.current } : null;
}

/**
 * The selection's text as the page shows it, in capitals where its element
 * calls for them, for the find bar's query; null unless the selection lies
 * on one line of one element.
 */
export function selectedText({ doc, selection }: EditorState): string | null {
  const { from, to, $from, $to } = selection;
  if (from === to || !$from.parent.isTextblock || !$from.sameParent($to)) return null;
  const text = doc.textBetween(from, to);
  if (text.includes("\n")) return null;
  return ELEMENT_FORMATS[$from.parent.attrs.type as ElementType].capitals ? capitals(text) : text;
}

/**
 * Finds `query`, or stops finding when it is null, selecting the first
 * match at or after the selection's start.
 */
export function setFindQuery(query: FindQuery | null): Command {
  return (state, dispatch) => {
    dispatch?.(state.tr.setMeta(key, { query, select: state.selection.from } satisfies Meta));
    return true;
  };
}

/**
 * Selects the match after the current one, or the first at or after the
 * selection's start when none is current; from the last, the first.
 */
export const findNext: Command = (state, dispatch) => step(state, dispatch, true);

/**
 * Selects the match before the current one, or the last before the
 * selection's start when none is current; from the first, the last.
 */
export const findPrevious: Command = (state, dispatch) => step(state, dispatch, false);

function step(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  forward: boolean,
): boolean {
  const found = key.getState(state);
  const count = found?.matches.length;
  if (!found || !count) return false;
  let index: number;
  if (found.current >= 0) {
    index = (found.current + (forward ? 1 : count - 1)) % count;
  } else {
    const after = firstFrom(found.matches, state.selection.from);
    index = forward ? after % count : (after + count - 1) % count;
  }
  dispatch?.(selectMatch(state, found.matches[index] as Match));
  return true;
}

/**
 * Replaces the current match with `text`, as an undo step of its own, and
 * selects the next match after it; with no current match, selects the next
 * one instead.
 */
export function replaceMatch(text: string): Command {
  return (state, dispatch) => {
    const found = key.getState(state);
    if (!found?.matches.length) return false;
    const match = found.matches[found.current];
    if (!match) return findNext(state, dispatch);
    if (dispatch) {
      const tr = replace(state.tr, match, text).setMeta(key, {
        select: match.from + text.length,
      } satisfies Meta);
      dispatch(ownStep(tr));
    }
    return true;
  };
}

/** Replaces every match with `text`, as one undo step. */
export function replaceAll(text: string): Command {
  return (state, dispatch) => {
    const found = key.getState(state);
    if (!found?.matches.length) return false;
    if (dispatch) {
      const tr = state.tr;
      // From the end, so the matches before keep their positions.
      for (let i = found.matches.length - 1; i >= 0; i--) {
        replace(tr, found.matches[i] as Match, text);
      }
      dispatch(ownStep(tr));
    }
    return true;
  };
}

/**
 * Puts `text` in place of `match`, with the formats of its first character.
 * A replacement names itself in `uiEvent`, as paste and cut do, since it is
 * not typing and opens no autocomplete popup.
 */
function replace(tr: Transaction, { from, to }: Match, text: string): Transaction {
  tr.setMeta("uiEvent", "replace");
  if (!text) return tr.delete(from, to);
  const marks = tr.doc.resolve(from).marksAcross(tr.doc.resolve(to)) ?? [];
  return tr.replaceWith(from, to, schema.text(text, marks));
}

function selectMatch(state: EditorState, { from, to }: Match): Transaction {
  return state.tr.setSelection(TextSelection.create(state.doc, from, to));
}

/** `find`'s matches throughout `doc`, highlighted. */
function search(doc: Node, find: Finder): Found {
  const spans = new WeakMap<Node, readonly Span[]>();
  const matches: Match[] = [];
  doc.forEach((node, pos) => {
    for (const [start, end] of spansOf(find, spans, node)) {
      matches.push({ from: pos + 1 + start, to: pos + 1 + end });
    }
  });
  const hits = DecorationSet.create(
    doc,
    matches.map(({ from, to }) => Decoration.inline(from, to, HIT)),
  );
  return { find, spans, matches, hits, current: -1, decorations: hits };
}

/**
 * Follows `tr`: the elements it changed are searched again, and their
 * highlights replaced; after `MANY_STEPS`, every highlight is made afresh.
 */
function patch(found: Found, tr: Transaction): Found {
  const { doc } = tr;
  const positions: number[] = [];
  doc.forEach((_node, pos) => {
    positions.push(pos);
  });
  const { first, last } = changedElements(tr, positions);
  const afresh = tr.steps.length > MANY_STEPS;
  const matches: Match[] = [];
  const fresh: Decoration[] = [];
  doc.forEach((node, pos, index) => {
    const changed = afresh || (index >= first && index <= last);
    for (const [start, end] of spansOf(found.find, found.spans, node)) {
      const match = { from: pos + 1 + start, to: pos + 1 + end };
      matches.push(match);
      if (changed) fresh.push(Decoration.inline(match.from, match.to, HIT));
    }
  });
  let hits: DecorationSet;
  if (afresh) {
    hits = DecorationSet.create(doc, fresh);
  } else {
    hits = found.hits.map(tr.mapping, doc);
    if (first <= last) {
      const end = (positions[last] as number) + doc.child(last).nodeSize;
      const stale = hits.find(positions[first], end);
      if (stale.length) hits = hits.remove(stale);
    }
    if (fresh.length) hits = hits.add(doc, fresh);
  }
  return { ...found, matches, hits, current: -1, decorations: hits };
}

function spansOf(find: Finder, spans: WeakMap<Node, readonly Span[]>, node: Node): readonly Span[] {
  let found = spans.get(node);
  if (!found) {
    found = find(node.attrs.type as ElementType, node.textContent);
    spans.set(node, found);
  }
  return found;
}

/** `found` with the match the selection covers as the current one. */
function withCurrent(found: Found, { doc, selection }: EditorState): Found {
  const at = firstFrom(found.matches, selection.from);
  const match = found.matches[at];
  const current = match && match.from === selection.from && match.to === selection.to ? at : -1;
  if (current === found.current) return found;
  const decorations =
    match && current >= 0
      ? found.hits.add(doc, [Decoration.inline(match.from, match.to, CURRENT)])
      : found.hits;
  return { ...found, current, decorations };
}

/** The index of the first match starting at or after `pos`; past the last when none does. */
function firstFrom(matches: readonly Match[], pos: number): number {
  let low = 0;
  let high = matches.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((matches[mid] as Match).from < pos) low = mid + 1;
    else high = mid;
  }
  return low;
}
