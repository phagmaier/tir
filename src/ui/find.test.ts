/**
 * Find and replace in the editor's state (brief, "Find and replace"). In
 * element text, "|" is the caret, and "{" and "}" the ends of a selection,
 * which find and replace set to the current match.
 */
import { AllSelection, EditorState, TextSelection } from "prosemirror-state";
import type { DecorationSet } from "prosemirror-view";
import { describe, expect, it } from "vitest";
import type { FindQuery } from "../core/find.ts";
import type { Element } from "../core/model.ts";
import { popupOf } from "./autocomplete.ts";
import {
  action,
  apply,
  cue,
  dialogue,
  heading,
  press,
  run,
  show,
  stateOf,
  typeEach,
} from "./editor-harness.ts";
import { fromDocument } from "./editor-model.ts";
import {
  find,
  findNext,
  findPrevious,
  findStatus,
  replaceAll,
  replaceMatch,
  selectedText,
  setFindQuery,
} from "./find.ts";

const query = (text: string, more: Partial<FindQuery> = {}): FindQuery => ({
  text,
  matchCase: false,
  wholeWord: false,
  ...more,
});
const rename = (text: string) => query(text, { matchCase: true, wholeWord: true });

/** The caret at `offset` into element `index`'s text. */
function caretAt(state: EditorState, index: number, offset: number): EditorState {
  let pos = 1 + offset;
  for (let i = 0; i < index; i++) pos += state.doc.child(i).nodeSize;
  return apply(state, state.tr.setSelection(TextSelection.create(state.doc, pos)));
}

/** The ranges highlighted in `state`, sorted, without the current match's second highlight. */
function highlights(state: EditorState): string[] {
  const set = find.props.decorations?.call(find, state) as DecorationSet | null;
  const ranges = (set?.find() ?? []).map(({ from, to }) => `${from}–${to}`).sort();
  if ((findStatus(state)?.current ?? -1) >= 0) {
    const { from, to } = state.selection;
    ranges.splice(ranges.indexOf(`${from}–${to}`), 1);
  }
  return ranges;
}

describe("renaming a character", () => {
  const script = [
    heading("|INT. BOAT - NIGHT"),
    cue("ELLIS (V.O.)"),
    dialogue("Ellis? It's me. ELLIS'S coat."),
    action("ELLIS’S boat drifts past ELLISON."),
    // Typed in small letters; the page shows ELLIS (CONT'D).
    cue("ellis (cont'd)"),
  ];

  it("changes cues and mentions in action alike, leaving extensions intact", () => {
    const found = run(stateOf(script), setFindQuery(rename("ELLIS")));
    expect(findStatus(found)?.count).toBe(4);
    expect(show(run(found, replaceAll("MARA")))).toEqual([
      heading("INT. BOAT - NIGHT"),
      cue("{MARA} (V.O.)"),
      dialogue("Ellis? It's me. MARA'S coat."),
      action("MARA’S boat drifts past ELLISON."),
      cue("MARA (cont'd)"),
    ]);
  });

  it("one Ctrl+Z undoes Replace all, apart from the typing before it", () => {
    let state = typeEach(stateOf([action("Ellis waits.|"), cue("ELLIS")]), " Ellis");
    // Finding selects the cue's ELLIS, the first match at or after the caret.
    state = run(state, setFindQuery(query("ellis", { wholeWord: true })));
    state = run(state, replaceAll("Mara"));
    expect(show(state).map((el) => el.text)).toEqual(["Mara waits. Mara", "{Mara}"]);
    const undone = press(state, "Ctrl-z").state;
    expect(show(undone).map((el) => el.text)).toEqual(["Ellis waits. Ellis", "{ELLIS}"]);
    const typingUndone = press(undone, "Ctrl-z").state;
    expect(show(typingUndone).map((el) => el.text)).toEqual(["Ellis waits.|", "ELLIS"]);
    const redone = press(undone, "Ctrl-Shift-z").state;
    expect(fromDocument(redone.doc).map((el) => el.text)).toEqual(["Mara waits. Mara", "Mara"]);
  });

  it("a replacement keeps the match's formats", () => {
    const state = run(
      stateOf([action("|ELLIS waits.", { bold: [[0, 5]], underline: [[0, 12]] })]),
      setFindQuery(query("ELLIS")),
    );
    expect(show(run(state, replaceAll("MARA")))).toEqual([
      action("{MARA} waits.", { bold: [[0, 4]], underline: [[0, 11]] }),
    ]);
  });

  it("an empty replacement deletes the matches", () => {
    const state = run(stateOf([action("|Very very good.")]), setFindQuery(query("very ")));
    expect(show(run(state, replaceAll(""))).map((el) => el.text)).toEqual(["|good."]);
  });

  it("a replacement opens no autocomplete popup at the caret", () => {
    let state = run(
      stateOf([cue("MARA"), dialogue("Hi."), cue("|ELLIS")]),
      setFindQuery(query("ELLIS")),
    );
    state = caretAt(state, 2, 5);
    state = run(state, replaceAll("MAR"));
    expect(show(state).at(-1)).toEqual(cue("MAR|"));
    expect(popupOf(state)).toBeNull();
  });
});

describe("the selection as the query", () => {
  it.each<[string, Element[], string | null]>([
    ["as the page shows it, in a cue's capitals", [cue("{ellis} (v.o.)")], "ELLIS"],
    ["as typed, in action", [action("{Ellis} rows.")], "Ellis"],
    ["none for a caret", [action("Ellis| rows.")], null],
    ["none across elements", [action("El{lis"), action("ro}ws")], null],
    ["none across a line break", [action("{Ellis\nrows}")], null],
  ])("%s", (_name, elements, expected) => {
    expect(selectedText(stateOf(elements))).toBe(expected);
  });

  it("none for the whole script, as Ctrl+A selects it", () => {
    const state = stateOf([action("|Ellis rows."), cue("ELLIS")]);
    expect(selectedText(apply(state, state.tr.setSelection(new AllSelection(state.doc))))).toBe(
      null,
    );
  });

  it("with match case, finds the selection itself", () => {
    const state = stateOf([action("ELLIS waits."), cue("{ellis}")]);
    const found = run(state, setFindQuery(rename(selectedText(state) as string)));
    expect(findStatus(found)).toEqual({ count: 2, current: 1 });
  });
});

describe("next, previous and Replace", () => {
  const found = run(stateOf([action("Ellis. |Ellis. Ellis.")]), setFindQuery(query("ellis")));
  const text = (state: EditorState) => show(state)[0]?.text;

  it("finding selects the first match at or after the caret", () => {
    expect(text(found)).toBe("Ellis. {Ellis}. Ellis.");
    expect(findStatus(found)).toEqual({ count: 3, current: 1 });
  });

  it("next and previous go round from the current match", () => {
    const third = run(found, findNext);
    expect(text(third)).toBe("Ellis. Ellis. {Ellis}.");
    expect(text(run(third, findNext))).toBe("{Ellis}. Ellis. Ellis.");
    expect(text(run(run(third, findNext), findPrevious))).toBe("Ellis. Ellis. {Ellis}.");
  });

  it("with no current match, they go from the caret", () => {
    const inside = caretAt(found, 0, 10);
    expect(findStatus(inside)?.current).toBe(-1);
    expect(text(run(inside, findNext))).toBe("Ellis. Ellis. {Ellis}.");
    expect(text(run(inside, findPrevious))).toBe("Ellis. {Ellis}. Ellis.");
  });

  it("Replace replaces the current match and selects the next, each an undo step", () => {
    const once = run(found, replaceMatch("Mara"));
    expect(text(once)).toBe("Ellis. Mara. {Ellis}.");
    const twice = run(once, replaceMatch("Mara"));
    expect(text(twice)).toBe("{Ellis}. Mara. Mara.");
    expect(findStatus(twice)).toEqual({ count: 1, current: 0 });
    expect(text(press(twice, "Ctrl-z").state)).toBe("Ellis. Mara. {Ellis}.");
  });

  it("Replace with no current match selects the next instead", () => {
    const state = run(caretAt(found, 0, 0), replaceMatch("Mara"));
    expect(text(state)).toBe("{Ellis}. Ellis. Ellis.");
  });

  it("a replacement containing the query is not found again by Replace", () => {
    const state = run(found, replaceMatch("Ellison"));
    expect(text(state)).toBe("Ellis. Ellison. {Ellis}.");
  });

  it("with no matches, nothing moves", () => {
    const none = run(stateOf([action("Rain.|")]), setFindQuery(query("snow")));
    expect(findStatus(none)).toEqual({ count: 0, current: -1 });
    expect(findNext(none)).toBe(false);
    expect(replaceAll("hail")(none)).toBe(false);
  });

  it("an empty query stops finding", () => {
    const stopped = run(found, setFindQuery(null));
    expect(findStatus(stopped)).toBeNull();
    expect(highlights(stopped)).toEqual([]);
  });
});

describe("highlights follow edits as a new search finds them", () => {
  /** The highlights a search of `state`'s document from scratch gives. */
  function searched(state: EditorState, q: FindQuery): string[] {
    const fresh = EditorState.create({ doc: state.doc, plugins: [find] });
    return highlights(run(fresh, setFindQuery(q)));
  }

  it.each<[string, (state: EditorState) => EditorState, number]>([
    ["typing a match", (s) => typeEach(s, " Ellis"), 5],
    ["Enter, then a match", (s) => typeEach(press(s, "Enter").state, "Ellis"), 5],
    [
      "an element changed to a cue, which shows capitals",
      (s) => press(caretAt(s, 2, 0), "Ctrl-3").state,
      3,
    ],
    [
      // The same node object at two places: only the steps' range tells them apart.
      "an element put in again just before itself",
      (s) => {
        let at = 0;
        for (let i = 0; i < 3; i++) at += s.doc.child(i).nodeSize;
        return apply(s, s.tr.insert(at, s.doc.child(3)));
      },
      6,
    ],
    [
      "an element deleted",
      (s) => {
        const from = s.doc.child(0).nodeSize + s.doc.child(1).nodeSize;
        return apply(s, s.tr.delete(from, from + s.doc.child(2).nodeSize));
      },
      3,
    ],
  ])("%s", (_name, edit, count) => {
    const q = rename("Ellis");
    // Finding selects the first match; the caret goes back to the first element's end.
    const found = run(
      stateOf([
        action("Ellis rows.|"),
        cue("ELLIS"),
        action("Ellis"),
        dialogue("Ellis? Ellis!"),
        action("Ellison."),
      ]),
      setFindQuery(q),
    );
    const before = caretAt(found, 0, 11);
    expect(findStatus(before)?.count).toBe(4);
    const after = edit(before);
    expect(findStatus(after)?.count).toBe(count);
    expect(highlights(after)).toEqual(searched(after, q));
    const undone = press(after, "Ctrl-z").state;
    expect(highlights(undone)).toEqual(searched(undone, q));
  });
});
