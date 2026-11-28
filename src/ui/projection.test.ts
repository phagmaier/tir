import { undo } from "prosemirror-history";
import type { Node } from "prosemirror-model";
import { type Command, EditorState, TextSelection, type Transaction } from "prosemirror-state";
import { describe, expect, it } from "vitest";
import { featureScript } from "../core/fixtures/scripts.ts";
import { layoutElement } from "../core/layout.ts";
import type { Element } from "../core/model.ts";
import { paginate } from "../core/paginate.ts";
import { paste } from "./clipboard.ts";
import { screenplayKeys } from "./commands.ts";
import { action, heading, stateOf } from "./editor-harness.ts";
import { fromDocument, schema, toDocument } from "./editor-model.ts";
import { type Block, MANY_STEPS, Projection } from "./projection.ts";
import { ownStep, undoHistory } from "./undo.ts";

const TOP_PX = 96;

/** What the decorations draw, in document order. */
const drawn = (projection: Projection) =>
  projection.decorations
    .find()
    .map((d) => [d.from, d.to, d.spec])
    .sort((a, b) => (a[0] as number) - (b[0] as number));

const blocks = (projection: Projection) =>
  Array.from({ length: projection.doc.childCount }, (_, i) => projection.block(i));

/** Where element `index` starts. */
function startOf(doc: Node, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize;
  return pos;
}

describe("line breaks", () => {
  it("ends each line on its last character, whatever styles split it", () => {
    // 61 characters fit: "small" ends at 58, so the line ends on the space at 58.
    const text = "The lights on the empty platform start to flicker. A small bird picks at a gap.";
    const projection = new Projection(toDocument([{ type: "action", text, bold: [[4, 30]] }]));
    expect(drawn(projection)).toEqual([[1 + 58, 1 + 59, { class: "line-end" }]]);
    expect(projection.block(0)).toEqual({ gap: TOP_PX, x: 1.5 });
  });

  it("leaves a typed line break to end its own line", () => {
    const projection = new Projection(
      toDocument([{ type: "action", text: "TIDE TABLE\nHigh water 05:52" }]),
    );
    expect(drawn(projection)).toEqual([]);
  });

  it("keeps a combining accent with its letter", () => {
    // A word of 70 "é"s, each an e and a combining acute (two code units),
    // breaks after 61 of them, so the second line starts at code unit 122.
    const text = "e\u0301".repeat(70);
    const projection = new Projection(toDocument([{ type: "action", text }]));
    expect(drawn(projection)).toEqual([[1 + 120, 1 + 122, { class: "line-end" }]]);
  });

  it("indents a centred line that starts elsewhere than the first", () => {
    const element: Element = {
      type: "action",
      text: "The lamp went out before the boat came in, and the harbour was dark.",
      centred: true,
    };
    const [first, second] = layoutElement(element).lines;
    const projection = new Projection(toDocument([element]));
    const shift = Math.round(((second?.x as number) - (first?.x as number)) * 1e6) / 1e6;
    expect(drawn(projection)).toEqual([
      [1 + (second?.start as number) - 1, 1 + (second?.start as number), { class: "line-end" }],
      [
        1 + (second?.start as number),
        2 + (second?.start as number),
        { style: `margin-left: ${shift}in` },
      ],
    ]);
    expect(projection.block(0)?.x).toBe(first?.x);
  });

  it("opens a page's gap where an element splits across pages", () => {
    // Seventeen two-line actions fill page 1 to row 50. The long action takes
    // rows 51 to 53, up to "the top.", and goes on at row 0 of page 2, at 144.
    const filler = Array.from({ length: 17 }, () => ({
      type: "action" as const,
      text: "Rain on the glass. ".repeat(4).trim(),
    }));
    const split: Element = {
      type: "action",
      text: "The lamp goes out. The keeper climbs the stair in the dark, one hand on the rail. He counts the steps under his breath, all the way to the top. Below him the sea keeps on at the rocks, slow and patient, as it has all night.",
    };
    const script = [...filler, split];
    const rows = paginate(script).flatMap((page, p) =>
      page.lines.filter((line) => line.element === filler.length).map((line) => [p, line.row]),
    );
    expect(rows).toEqual([
      [0, 51],
      [0, 52],
      [0, 53],
      [1, 0],
      [1, 1],
    ]);
    // Page 2's row 0 sits a sheet and its gutter (1,086 px) below page 1's,
    // and row 53 ends 54 rows (864 px) below it: a gap of 222 px.
    const projection = new Projection(toDocument(script));
    const pos = startOf(projection.doc, filler.length);
    expect(drawn(projection).filter(([from]) => (from as number) > pos)).toEqual([
      [pos + 1 + 59, pos + 1 + 60, { class: "line-end" }],
      [pos + 1 + 119, pos + 1 + 120, { class: "line-end" }],
      [pos + 1 + 143, pos + 1 + 144, { class: "page-gap", style: "--gap: 222px" }],
      [pos + 1 + 205, pos + 1 + 206, { class: "line-end" }],
    ]);
  });

  it("shows only the last of the typed line breaks the engine drops where a speech splits", () => {
    // As in "sheets" below, page 1's rows 49 to 53 take "One." to "Five.";
    // the engine drops the white space after "Five." (offsets 28 and 29), so
    // "Six." (30) starts page 2. The first line break would add a row: it is
    // hidden, and the second carries the gap of a page split at row 53, 222 px.
    const script: Element[] = [
      ...Array.from({ length: 24 }, (): Element => ({ type: "action", text: "Rain." })),
      { type: "character", text: "MAYA" },
      { type: "dialogue", text: "One.\nTwo.\nThree.\nFour.\nFive.\n\nSix.\nSeven." },
    ];
    const projection = new Projection(toDocument(script));
    const pos = startOf(projection.doc, 25) + 1;
    expect(drawn(projection).filter(([from]) => (from as number) >= pos)).toEqual([
      [pos + 28, pos + 29, { class: "skipped" }],
      [pos + 29, pos + 30, { class: "page-gap", style: "--gap: 222px" }],
    ]);
    // Up and Down across that gap go between "Five." (23 to 28) and "Six." (30 to 34).
    expect(projection.lineAcrossGap(25, 26, true)).toEqual({ from: 23, start: 30, end: 34 });
    expect(projection.lineAcrossGap(25, 31, false)).toEqual({ from: 30, start: 23, end: 28 });
    expect(projection.lineAcrossGap(25, 18, true)).toBeNull();
    expect(projection.lineAcrossGap(25, 36, false)).toBeNull();
  });
});

describe("capitals", () => {
  it("keeps a character whose capital is longer as typed, where capitals apply", () => {
    // The editor shows capitals with CSS, which would print "ß" as "SS". In
    // the cue "ß" is at offset 3; the action shows its text as typed anyway.
    const projection = new Projection(
      toDocument([
        { type: "character", text: "großmann" },
        { type: "action", text: "Großmann waits." },
      ]),
    );
    expect(drawn(projection)).toEqual([[1 + 3, 1 + 4, { class: "keep-case" }]]);
  });
});

describe("tabs", () => {
  it("gives each tab a span of its own, which the editor sets one cell wide", () => {
    // A browser takes a tab to a tab stop; the engine gives it one cell.
    const projection = new Projection(
      toDocument([{ type: "action", text: "Name:\tMara\tAge:\t34" }]),
    );
    expect(drawn(projection)).toEqual([
      [1 + 5, 1 + 6, { class: "tab" }],
      [1 + 10, 1 + 11, { class: "tab" }],
      [1 + 15, 1 + 16, { class: "tab" }],
    ]);
  });
});

describe("sheets", () => {
  it("numbers pages from 2 and places (MORE), repeated cues and the automatic (CONT'D)", () => {
    // 24 one-line actions take rows 0 to 46; the cue takes row 48. Rows 49
    // to 53 hold five of the seven dialogue lines, so (MORE) sits on row 54,
    // the cue repeats on page 2's row -1, and the last two lines take rows 0
    // and 1. After action, MAYA's next cue (row 5) gets (CONT'D) after her
    // name's four characters. A row is 16 px below the 96 px top margin.
    const script: Element[] = [
      ...Array.from({ length: 24 }, (): Element => ({ type: "action", text: "Rain." })),
      { type: "character", text: "MAYA" },
      { type: "dialogue", text: "One.\nTwo.\nThree.\nFour.\nFive.\nSix.\nSeven." },
      { type: "action", text: "She turns." },
      { type: "character", text: "Maya" },
      { type: "dialogue", text: "Again." },
    ];
    expect(new Projection(toDocument(script)).sheets).toEqual([
      { label: null, printed: [{ text: "(MORE)", top: 96 + 54 * 16, x: 3.5 }] },
      {
        label: "2.",
        printed: [
          { text: "MAYA (CONT’D)", top: 96 - 16, x: 3.5 },
          { text: " (CONT’D)", top: 96 + 5 * 16, x: 3.9 },
        ],
      },
    ]);
  });
});

describe("dual dialogue", () => {
  // Two lines at 29 characters a column: "Wait, and a good deal longer" (28),
  // "than that.".
  const long = "Wait, and a good deal longer than that.";
  const dual = (left: string, right: string) =>
    blocks(
      new Projection(
        toDocument([
          { type: "character", text: "MAYA" },
          { type: "dialogue", text: left },
          { type: "character", text: "TOMÁS", dual: true },
          { type: "dialogue", text: right },
          { type: "action", text: "Rain." },
        ]),
      ),
    );

  it("puts each speech in its column, the right one pulled up beside the left", () => {
    // The left speech takes rows 0 and 1; the right cue goes back up the two
    // rows to row 0, and the action follows on row 3, a row below "Right.".
    expect(dual("Left.", "Right.")).toEqual([
      { gap: TOP_PX, x: 2.7375, column: "left" },
      { gap: 0, x: 1.5, column: "left" },
      { gap: -32, x: 5.8125, column: "right" },
      { gap: 0, x: 4.625, column: "right" },
      { gap: 16, x: 1.5 },
    ]);
  });

  it("reaches the shorter column's last paragraph down to the longer one's end", () => {
    // The longer column ends a row (16 px) lower, on row 2; the action
    // follows on row 4.
    expect(dual(long, "Right.")).toEqual([
      { gap: TOP_PX, x: 2.7375, column: "left" },
      { gap: 0, x: 1.5, column: "left" },
      { gap: -48, x: 5.8125, column: "right" },
      { gap: 0, x: 4.625, column: "right", below: 16 },
      { gap: 16, x: 1.5 },
    ]);
    expect(dual("Left.", long)).toEqual([
      { gap: TOP_PX, x: 2.7375, column: "left" },
      { gap: 0, x: 1.5, column: "left", below: 16 },
      { gap: -48, x: 5.8125, column: "right" },
      { gap: 0, x: 4.625, column: "right" },
      { gap: 16, x: 1.5 },
    ]);
  });
});

/** The index of the first cue. */
function firstCue(doc: Node): number {
  let index = 0;
  while (doc.child(index).attrs.type !== "character") index++;
  return index;
}

/** Edits that move lines and page breaks, each as a transaction on the state. */
const edits: [string, (state: EditorState) => Transaction][] = [
  ["type a letter", (s) => s.tr.insertText("x", startOf(s.doc, 5) + 3)],
  [
    "add a line, moving later page breaks",
    (s) => s.tr.insertText(" The tide comes in over the wall.", startOf(s.doc, 7) + 2),
  ],
  ["remove a line", (s) => s.tr.delete(startOf(s.doc, 7) + 2, startOf(s.doc, 7) + 40)],
  ["split an element", (s) => s.tr.split(startOf(s.doc, 12) + 6)],
  ["join two elements", (s) => s.tr.join(startOf(s.doc, 20))],
  [
    "change an element's type",
    (s) =>
      s.tr.setNodeMarkup(startOf(s.doc, 30), undefined, {
        ...s.doc.child(30).attrs,
        type: "action",
      }),
  ],
  [
    "bold across a line break",
    (s) =>
      s.tr.addMark(startOf(s.doc, 40) + 50, startOf(s.doc, 40) + 70, schema.marks.bold.create()),
  ],
  ["delete several elements", (s) => s.tr.delete(startOf(s.doc, 50) + 3, startOf(s.doc, 58) + 3)],
  [
    "insert an element at the start",
    (s) => s.tr.insert(0, schema.node("element", { type: "action" }, schema.text("Fog."))),
  ],
  [
    "change two distant places at once",
    (s) => s.tr.insertText("y", startOf(s.doc, 80) + 2).insertText("z", startOf(s.doc, 3) + 2),
  ],
  ["empty an element", (s) => s.tr.delete(startOf(s.doc, 9) + 1, startOf(s.doc, 10) - 1)],
  [
    "make a speech dual",
    (s) => {
      // The first cue straight after dialogue: its speech goes beside that one.
      let index = 1;
      while (
        s.doc.child(index).attrs.type !== "character" ||
        s.doc.child(index - 1).attrs.type !== "dialogue"
      ) {
        index++;
      }
      const attrs = { ...s.doc.child(index).attrs, dual: true };
      return s.tr.setNodeMarkup(startOf(s.doc, index), undefined, attrs);
    },
  ],
  ["type an ß into a cue", (s) => s.tr.insertText("ß", startOf(s.doc, firstCue(s.doc)) + 2)],
  [
    "make that cue an action",
    (s) => {
      const index = firstCue(s.doc);
      const attrs = { ...s.doc.child(index).attrs, type: "action" };
      return s.tr.setNodeMarkup(startOf(s.doc, index), undefined, attrs);
    },
  ],
  [
    "paste thirty elements inside one, splitting it",
    (s) => {
      const at = s.apply(s.tr.setSelection(TextSelection.create(s.doc, startOf(s.doc, 60) + 4)));
      const elements = fromDocument(s.doc).slice(10, 40);
      return transactionOf(at, paste({ elements, openStart: false, openEnd: false }));
    },
  ],
  ["undo that paste", (s) => transactionOf(s, undo)],
  [
    "replace every “the” between the first and last ten elements, a step each, as Replace all does",
    (s) => {
      const found: number[] = [];
      const [from, to] = [startOf(s.doc, 10), startOf(s.doc, s.doc.childCount - 10)];
      s.doc.nodesBetween(from, to, (node, pos) => {
        for (const match of (node.text ?? "").matchAll(/the/gi)) found.push(pos + match.index);
      });
      const tr = s.tr;
      for (const at of found.reverse()) tr.insertText("a longer word", at, at + 3);
      expect(tr.steps.length).toBeGreaterThan(MANY_STEPS);
      return ownStep(tr);
    },
  ],
  ["undo that Replace all", (s) => transactionOf(s, undo)],
];

/** The transaction `command` dispatches in `state`. */
function transactionOf(state: EditorState, command: Command): Transaction {
  let tr: Transaction | undefined;
  command(state, (dispatched) => {
    tr = dispatched;
  });
  return tr as Transaction;
}

describe("following edits", () => {
  it("matches a projection made afresh, and restyles every block that moved", () => {
    let state = EditorState.create({
      schema,
      doc: toDocument(featureScript(25)),
      plugins: [...undoHistory],
    });
    const projection = new Projection(state.doc);
    // The paragraphs' block styles, as the editor's DOM keeps them.
    let styles: (Block | undefined)[] = blocks(projection);
    for (const [name, edit] of edits) {
      const tr = edit(state);
      const before = state.doc;
      state = state.apply(tr);
      const restyle = projection.apply(tr);
      const fresh = new Projection(state.doc);
      expect(drawn(projection), name).toEqual(drawn(fresh));
      expect(projection.height, name).toBe(fresh.height);
      expect(projection.sheets, name).toEqual(fresh.sheets);
      // ProseMirror keeps the paragraphs of unchanged nodes and their styles.
      const doc = state.doc;
      const shift = doc.childCount - before.childCount;
      const most = Math.min(doc.childCount, before.childCount);
      let prefix = 0;
      while (prefix < most && doc.child(prefix) === before.child(prefix)) prefix++;
      let suffix = 0;
      while (
        suffix < most - prefix &&
        doc.child(doc.childCount - 1 - suffix) === before.child(before.childCount - 1 - suffix)
      ) {
        suffix++;
      }
      styles = Array.from({ length: doc.childCount }, (_, i) => {
        if (i < prefix) return styles[i];
        if (i >= doc.childCount - suffix) return styles[i - shift];
        return undefined;
      });
      for (const { index, before: was } of restyle) {
        // The editor restyles an unchanged node's paragraph where it was.
        if (was !== undefined) expect(before.nodeAt(was), name).toBe(doc.child(index));
        styles[index] = projection.block(index);
      }
      expect(styles, name).toEqual(blocks(fresh));
    }
  });
});

describe("the scene list and page position following edits", () => {
  it("follows headings typed, retyped, moved, deleted and pasted, and the caret", () => {
    // Pages come only from forced breaks, so each is worked out by hand.
    let state = stateOf([
      heading("int. lamp room - night"),
      action("The lamp turns."),
      action("|"),
      heading("EXT. CLIFF - DAY", { pageBreakBefore: true }),
      action("Wind."),
    ]);
    const projection = new Projection(state.doc);
    const step = (tr: Transaction) => {
      state = state.apply(tr);
      if (tr.docChanged) projection.apply(tr);
    };
    const key = (combo: string) => step(transactionOf(state, screenplayKeys[combo] as Command));
    const caretAt = (pos: number) =>
      step(state.tr.setSelection(TextSelection.create(state.doc, pos)));
    const list = () => projection.map.scenes.map((scene) => `${scene.heading} p${scene.page}`);
    const caret = () => [
      projection.sceneAt(state.selection.head),
      projection.pageAt(state.selection.head),
      projection.map.pageCount,
    ];
    expect(list()).toEqual(["INT. LAMP ROOM - NIGHT p1", "EXT. CLIFF - DAY p2"]);
    expect(caret()).toEqual([0, 1, 2]);

    // The empty action becomes a heading (Ctrl+1) and is typed into.
    key("Mod-1");
    expect(list()).toEqual(["INT. LAMP ROOM - NIGHT p1", " p1", "EXT. CLIFF - DAY p2"]);
    for (const char of "ext. pier - dusk") step(state.tr.insertText(char));
    expect(list()).toEqual([
      "INT. LAMP ROOM - NIGHT p1",
      "EXT. PIER - DUSK p1",
      "EXT. CLIFF - DAY p2",
    ]);
    expect(caret()).toEqual([1, 1, 2]);

    // A forced break before it (Ctrl+Enter) moves it, and the scene after, a page on.
    key("Mod-Enter");
    expect(list()).toEqual([
      "INT. LAMP ROOM - NIGHT p1",
      "EXT. PIER - DUSK p2",
      "EXT. CLIFF - DAY p3",
    ]);
    expect(caret()).toEqual([1, 2, 3]);

    // The cliff's heading becomes action (Ctrl+2); its forced break stays.
    caretAt(startOf(state.doc, 3) + 1);
    key("Mod-2");
    expect(list()).toEqual(["INT. LAMP ROOM - NIGHT p1", "EXT. PIER - DUSK p2"]);
    expect(caret()).toEqual([1, 3, 3]);

    // The pier's heading is deleted whole, its forced break with it.
    step(state.tr.delete(startOf(state.doc, 2), startOf(state.doc, 3)));
    expect(list()).toEqual(["INT. LAMP ROOM - NIGHT p1"]);
    expect(projection.map.pageCount).toBe(2);

    // Two scenes pasted after "The lamp turns.", then the paste undone.
    caretAt(startOf(state.doc, 2) - 1);
    const elements: Element[] = [
      heading("INT. HOLD - NIGHT"),
      action("Dark."),
      heading("EXT. DECK - NIGHT"),
    ];
    step(transactionOf(state, paste({ elements, openStart: false, openEnd: false })));
    expect(list()).toEqual([
      "INT. LAMP ROOM - NIGHT p1",
      "INT. HOLD - NIGHT p1",
      "EXT. DECK - NIGHT p1",
    ]);
    expect(caret()).toEqual([2, 1, 2]);
    step(transactionOf(state, undo));
    expect(list()).toEqual(["INT. LAMP ROOM - NIGHT p1"]);
    expect(caret()).toEqual([0, 1, 2]);
  });
});
