// Expected lines are worked by hand from docs/findings.md's table: 10
// characters to the inch, so a line of n characters is n/10 inch wide.
import { describe, expect, it } from "vitest";
import { type Layout, LayoutCache, layoutElement } from "./layout.ts";
import type { Element, ElementType } from "./model.ts";

const el = (type: ElementType, text: string, more: Partial<Element> = {}): Element => ({
  type,
  text,
  ...more,
});
const shown = (layout: Layout) => layout.lines.map((line) => line.text);
const xs = (layout: Layout) => layout.lines.map((line) => Number(line.x.toFixed(4)));

describe("each element's indent, spacing and capitals", () => {
  it.each<[ElementType, string, string, number, number]>([
    // type, text, shown, x (in), space before (lines)
    ["sceneHeading", "int. lighthouse - night", "INT. LIGHTHOUSE - NIGHT", 1.5, 2],
    ["action", "The lamp turns.", "The lamp turns.", 1.5, 1],
    ["character", "maya (v.o.)", "MAYA (V.O.)", 3.5, 1],
    // The parenthetical's "(" hangs a tenth of an inch left of its text.
    ["parenthetical", "(quietly)", "(quietly)", 2.9, 0],
    ["dialogue", "Go on.", "Go on.", 2.5, 0],
    // Right-aligned on 7.10 in: "cut to:" is 7 characters, 0.7 in.
    ["transition", "cut to:", "CUT TO:", 6.4, 1],
    ["shot", "close on the lamp", "CLOSE ON THE LAMP", 1.5, 2],
    ["general", "A note.", "A note.", 1.5, 0],
  ])("%s", (type, text, expected, x, spaceBefore) => {
    const layout = layoutElement(el(type, text));
    expect(layout).toEqual({
      spaceBefore,
      lines: [{ start: 0, end: text.length, text: expected, x }],
    });
  });
});

describe("wrapping at each element's width", () => {
  it("fits 61 characters of action on a line, and breaks at the last space that fits", () => {
    // 12 words of 4 letters and 11 spaces make 59 characters; a 13th word
    // would make 64.
    const text = Array(13).fill("abcd").join(" ");
    const layout = layoutElement(el("action", text));
    expect(shown(layout)).toEqual([Array(12).fill("abcd").join(" "), "abcd"]);
    expect(layout.lines.map((l) => [l.start, l.end])).toEqual([
      [0, 59],
      [60, 64],
    ]);
  });

  it("keeps a line of exactly 61 characters whole, one more than the indents give", () => {
    // "abcdefg" and nine "abcde" with nine spaces: 7 + 45 + 9 = 61.
    const full = ["abcdefg", ...Array(9).fill("abcde")].join(" ");
    expect(shown(layoutElement(el("action", full)))).toEqual([full]);
    expect(shown(layoutElement(el("action", `${full} x`)))).toEqual([full, "x"]);
  });

  it("wraps dialogue at 35 characters", () => {
    // "You said the boat leaves at six, not" is 36 characters, one too many.
    const layout = layoutElement(el("dialogue", "You said the boat leaves at six, not seven."));
    expect(shown(layout)).toEqual(["You said the boat leaves at six,", "not seven."]);
    expect(xs(layout)).toEqual([2.5, 2.5]);
  });

  it("wraps a cue at 38 characters", () => {
    // 38 fit (findings, "Line widths"); "ON" would make 39.
    expect(shown(layoutElement(el("character", "THE OLD WOMAN WHO KEEPS THE LIGHTHOUSE")))).toEqual(
      ["THE OLD WOMAN WHO KEEPS THE LIGHTHOUSE"],
    );
    const name = "THE OLD MAN WHO KEEPS THE LIGHTHOUSE ON";
    expect(shown(layoutElement(el("character", name)))).toEqual([
      "THE OLD MAN WHO KEEPS THE LIGHTHOUSE",
      "ON",
    ]);
  });

  it("gives a parenthetical's first line 26 characters from 2.9 in, then 25 from 3.0 in", () => {
    // "(" and 24 letters, then a space: the next word would pass 26. The
    // second line, 22 letters, a space and "c)", is exactly 25.
    const text = `(${"a".repeat(24)} ${"b".repeat(22)} c)`;
    const layout = layoutElement(el("parenthetical", text));
    expect(shown(layout)).toEqual([`(${"a".repeat(24)}`, `${"b".repeat(22)} c)`]);
    expect(xs(layout)).toEqual([2.9, 3.0]);
    // 26 characters on the first line fit exactly; 25 then fit on the next.
    const exact = layoutElement(el("parenthetical", `(${"a".repeat(25)} ${"b".repeat(25)}`));
    expect(shown(exact)).toEqual([`(${"a".repeat(25)}`, "b".repeat(25)]);
  });

  it("right-aligns every line of a transition at 7.10 in, 16 characters wide", () => {
    const layout = layoutElement(el("transition", "slow fade to the harbour at dawn:"));
    // "SLOW FADE TO THE" and "HARBOUR AT DAWN:" are 16 characters each.
    expect(shown(layout)).toEqual(["SLOW FADE TO THE", "HARBOUR AT DAWN:"]);
    expect(xs(layout)).toEqual([5.5, 5.5]);
    expect(xs(layoutElement(el("transition", "MATCH CUT TO:")))).toEqual([5.8]);
  });

  it("breaks after a hyphen inside a word, which may hang one past the width", () => {
    // "Everybody in the harbour has a well-" is 36: the hyphen hangs.
    expect(
      shown(layoutElement(el("dialogue", "Everybody in the harbour has a well-known secret."))),
    ).toEqual(["Everybody in the harbour has a well-", "known secret."]);
    // "wells-" would end at 37, two past, so the break is at the space.
    expect(
      shown(layoutElement(el("dialogue", "Everybody in the harbour has a wells-known secret."))),
    ).toEqual(["Everybody in the harbour has a", "wells-known secret."]);
    // A hyphen ending the text, or standing alone, also hangs: both lines are 36.
    expect(shown(layoutElement(el("dialogue", "I never said you ought to go, Tomás-")))).toEqual([
      "I never said you ought to go, Tomás-",
    ]);
    expect(
      shown(layoutElement(el("dialogue", "The lamp was lit and the door shut - then the wind."))),
    ).toEqual(["The lamp was lit and the door shut -", "then the wind."]);
    // After a double hyphen; not after a hyphen with a space beside it.
    expect(
      shown(layoutElement(el("dialogue", "I waited by the old harbour wall--then left."))),
    ).toEqual(["I waited by the old harbour wall--", "then left."]);
    expect(
      shown(layoutElement(el("dialogue", "I waited by the old harbour, sure - then left."))),
    ).toEqual(["I waited by the old harbour, sure -", "then left."]);
  });

  it("drops spaces at a break and keeps runs of spaces inside a line", () => {
    const text = `${"a".repeat(57)}    word  two`;
    expect(shown(layoutElement(el("action", text)))).toEqual(["a".repeat(57), "word  two"]);
  });
});

describe("centred text", () => {
  it("centres each line between the element's indents", () => {
    // Action runs 1.5 to 7.5 in; "THE END" is 0.7 in wide: 1.5 + (6 - 0.7) / 2.
    const layout = layoutElement(el("action", "THE END\nfor now", { centred: true }));
    expect(shown(layout)).toEqual(["THE END", "for now"]);
    expect(xs(layout)).toEqual([4.15, 4.15]);
  });
});

describe("line breaks inside an element", () => {
  it("start a new line at the element's indent, keeping action's leading spaces", () => {
    const layout = layoutElement(el("action", "TIDE TABLE\n  High water 05:52"));
    expect(layout.lines).toEqual([
      { start: 0, end: 10, text: "TIDE TABLE", x: 1.5 },
      { start: 11, end: 29, text: "  High water 05:52", x: 1.5 },
    ]);
  });

  it("give a parenthetical's later lines the 3.0 in indent", () => {
    expect(xs(layoutElement(el("parenthetical", "(to the gulls,\nnot unkindly)")))).toEqual([
      2.9, 3.0,
    ]);
  });

  it("keep an empty line", () => {
    expect(shown(layoutElement(el("dialogue", "One.\n\nTwo.")))).toEqual(["One.", "", "Two."]);
  });
});

describe("edge cases", () => {
  it("lays out an empty element as one empty line", () => {
    expect(layoutElement(el("action", ""))).toEqual({
      spaceBefore: 1,
      lines: [{ start: 0, end: 0, text: "", x: 1.5 }],
    });
    expect(layoutElement(el("transition", "")).lines).toEqual([
      { start: 0, end: 0, text: "", x: 7.1 },
    ]);
  });

  it("breaks a word longer than a line where the line is full", () => {
    const word = "x".repeat(70);
    expect(shown(layoutElement(el("action", `a ${word}`)))).toEqual([
      "a",
      "x".repeat(61),
      "x".repeat(9),
    ]);
    expect(shown(layoutElement(el("dialogue", "y".repeat(40))))).toEqual([
      "y".repeat(35),
      "y".repeat(5),
    ]);
  });

  it("counts an accented letter as one character, composed or not", () => {
    const composed = "é".repeat(60);
    const decomposed = "e\u0301".repeat(60);
    expect(layoutElement(el("action", composed)).lines).toHaveLength(1);
    const layout = layoutElement(el("action", `${decomposed} é`));
    // 60 decomposed letters are 120 UTF-16 units but one full line.
    expect(layout.lines.map((l) => [l.start, l.end])).toEqual([
      [0, 120],
      [121, 122],
    ]);
  });

  it("counts other non-ASCII characters as one each", () => {
    const text = `${"—".repeat(30)}${"ñ".repeat(29)}👍 next`;
    const layout = layoutElement(el("action", text));
    // 30 + 29 + 1 = 60 characters on the first line; the emoji is 2 units.
    expect(shown(layout)).toEqual([`${"—".repeat(30)}${"ñ".repeat(29)}👍`, "next"]);
    expect(layout.lines[0]?.end).toBe(61);
  });

  it("capitalises accented letters but keeps ß, whose capital is two letters", () => {
    expect(shown(layoutElement(el("character", "josé straße")))).toEqual(["JOSÉ STRAßE"]);
  });

  it("right-aligns a transition by its visible width, ignoring trailing spaces", () => {
    expect(xs(layoutElement(el("transition", "CUT TO:   ")))).toEqual([6.4]);
  });
});

describe('dual dialogue columns (findings, "Dual dialogue")', () => {
  it.each<["left" | "right", ElementType, number]>([
    // A cue is centred in its column: "(YES)" is 0.5 in wide in 2.875 in.
    ["left", "character", 2.6875],
    ["left", "parenthetical", 1.75],
    ["left", "dialogue", 1.5],
    ["right", "character", 5.8125],
    ["right", "parenthetical", 4.875],
    ["right", "dialogue", 4.625],
  ])("%s column %s starts at %s in", (column, type, x) => {
    expect(xs(layoutElement(el(type, "(Yes)"), column))).toEqual([x]);
  });

  it("wraps column dialogue at 29 characters", () => {
    // "Six o'clock, I said, and not" is 28; with " a" it would be 30.
    const layout = layoutElement(
      el("dialogue", "Six o'clock, I said, and not a minute later."),
      "left",
    );
    expect(shown(layout)).toEqual(["Six o'clock, I said, and not", "a minute later."]);
  });

  it("leaves other elements in their usual place", () => {
    expect(xs(layoutElement(el("action", "Rain."), "right"))).toEqual([1.5]);
  });
});

describe("the layout cache", () => {
  it("keeps the same text apart when type, centring or column differ", () => {
    const text = "The lamp went out before the boat came in.";
    const cases: [Element, ("left" | "right")?][] = [
      [el("action", text)],
      [el("action", text, { centred: true })],
      [el("dialogue", text)],
      [el("dialogue", text), "left"],
      [el("dialogue", text), "right"],
      [el("character", text)],
    ];
    const cache = new LayoutCache();
    // The second run reads what the first kept.
    for (let run = 0; run < 2; run++) {
      cache.startRun();
      for (const [element, column] of cases) {
        expect(cache.layout(element, column)).toEqual(layoutElement(element, column));
      }
    }
  });
});
