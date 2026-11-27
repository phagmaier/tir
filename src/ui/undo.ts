/**
 * Undo and redo, grouped as the brief says ("Elements and keys", Undo):
 * a burst of typing is one step, and every other change is a step of its
 * own, except that typing straight after Enter, or after Tab starting an
 * element, joins that step. ProseMirror's history groups by time and place:
 * changes next to each other, less than half a second apart, join one step.
 * The commands mark their transactions with `ownStep` or `newStep`; a
 * transaction left unmarked is typing.
 */
import { closeHistory, history, redo, undo } from "prosemirror-history";
import { type Command, Plugin, PluginKey, type Transaction } from "prosemirror-state";

const own = new PluginKey("ownStep");

/** Starts a new undo step with `tr`; typing straight after it joins that step. */
export const newStep = (tr: Transaction): Transaction => closeHistory(tr);

/** Makes `tr` an undo step of its own, joined by neither the change before nor the one after. */
export const ownStep = (tr: Transaction): Transaction => closeHistory(tr).setMeta(own, true);

/** Runs `command` as an undo step of its own. */
export const asOwnStep =
  (command: Command): Command =>
  (state, dispatch, view) =>
    command(state, dispatch && ((tr) => dispatch(ownStep(tr))), view);

/**
 * The history and what closes a step after an own step: an empty transaction
 * that closes the history, so the next change starts a step.
 */
export const undoHistory: readonly Plugin[] = [
  history(),
  new Plugin({
    key: own,
    appendTransaction: (transactions, _before, state) =>
      transactions.some((tr) => tr.getMeta(own)) ? closeHistory(state.tr) : null,
  }),
];

/** Ctrl+Z undoes; Ctrl+Shift+Z and Ctrl+Y redo. */
export const undoKeys: Readonly<Record<string, Command>> = {
  "Mod-z": undo,
  "Mod-Shift-z": redo,
  "Mod-y": redo,
};
