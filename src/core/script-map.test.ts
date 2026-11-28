// Worked examples of the scene list and page positions, and a check of both
// against the engine's own pages on long scripts. Rows count down from the
// top margin: a scene heading has two blank lines above it, an action one.
import { describe, expect, it } from "vitest";
import { everyFormat, featureScript } from "./fixtures/scripts.ts";
import type { Element, ElementType } from "./model.ts";
import { paginate } from "./paginate.ts";
import { ScriptMap } from "./script-map.ts";

const el = (type: ElementType, text: string, more: Partial<Element> = {}): Element => ({
  type,
  text,
  ...more,
});
const mapOf = (elements: Element[], linesPerPage?: number) =>
  new ScriptMap(elements, paginate(elements, linesPerPage ? { linesPerPage } : {}));

describe("the scene list", () => {
  it("numbers scenes in order, each with the page and row its heading starts on", () => {
    // Rows: the first heading 0, "The lamp turns." 2, the second heading 5
    // (two blank lines after the action's row 2), "Wind." 7; the third
    // heading starts page 2 by a forced break.
    const map = mapOf([
      el("sceneHeading", "int. lamp room - night"),
      el("action", "The lamp turns."),
      el("sceneHeading", "ext. große straße - dawn"),
      el("action", "Wind."),
      el("sceneHeading", "INT. STAIR - NIGHT", { pageBreakBefore: true }),
      el("action", "Steps."),
    ]);
    expect(map.scenes).toEqual([
      { element: 0, offset: 0, page: 1, row: 0, heading: "INT. LAMP ROOM - NIGHT" },
      // Capitals as the engine sets them: "ß", whose capital is longer, stays.
      { element: 2, offset: 0, page: 1, row: 5, heading: "EXT. GROßE STRAßE - DAWN" },
      { element: 4, offset: 0, page: 2, row: 0, heading: "INT. STAIR - NIGHT" },
    ]);
    expect(map.pageCount).toBe(2);
  });

  it("gives a heading that would fall on a page's last line the next page, as the engine moves it", () => {
    // Six rows a page: "One." row 0, "Two." row 2, the heading would sit on
    // row 5 with no room for "Three." under it, so it starts page 2.
    const map = mapOf(
      [
        el("action", "One."),
        el("action", "Two."),
        el("sceneHeading", "INT. HOLD - NIGHT"),
        el("action", "Three."),
      ],
      6,
    );
    expect(map.scenes).toEqual([
      { element: 2, offset: 0, page: 2, row: 0, heading: "INT. HOLD - NIGHT" },
    ]);
    expect(map.pageStart(2)).toEqual({ element: 2, offset: 0, page: 2, row: 0 });
  });

  it("keeps an empty heading as a scene", () => {
    // "Fog." on row 0, then two blank lines: the heading starts row 3.
    const map = mapOf([el("action", "Fog."), el("sceneHeading", "")]);
    expect(map.scenes).toEqual([{ element: 1, offset: 0, page: 1, row: 3, heading: "" }]);
  });

  it("is empty for a script without scene headings, and for an empty script", () => {
    const map = mapOf([el("action", "Fog."), el("transition", "CUT TO:")]);
    expect(map.scenes).toEqual([]);
    expect(map.sceneAt(1)).toBe(-1);
    const empty = mapOf([]);
    expect([empty.scenes, empty.pageCount, empty.pageStart(1)]).toEqual([[], 1, undefined]);
  });

  it("finds the scene holding an element, none before the first heading", () => {
    const map = mapOf([
      el("transition", "FADE IN:"),
      el("sceneHeading", "EXT. PIER - DUSK"),
      el("action", "Gulls."),
      el("sceneHeading", "INT. CABIN - NIGHT"),
      el("character", "MAYA"),
      el("dialogue", "Here."),
    ]);
    expect([0, 1, 2, 3, 4, 5].map((element) => map.sceneAt(element))).toEqual([-1, 0, 0, 1, 1, 1]);
  });
});

describe("page positions", () => {
  it("follows an action split across pages, and starts page 2 where it resumes", () => {
    // Seventeen two-line actions fill page 1 to row 49. The long action takes
    // rows 51 to 53, up to "the top." (offset 143), and resumes at offset 144
    // on page 2's row 0 (as in projection.test.ts).
    const filler = Array.from({ length: 17 }, () =>
      el("action", "Rain on the glass. ".repeat(4).trim()),
    );
    const split = el(
      "action",
      "The lamp goes out. The keeper climbs the stair in the dark, one hand on the rail. He counts the steps under his breath, all the way to the top. Below him the sea keeps on at the rocks, slow and patient, as it has all night.",
    );
    const map = mapOf([...filler, split]);
    expect([0, 143, 144, split.text.length].map((offset) => map.pageAt(17, offset))).toEqual([
      1, 1, 2, 2,
    ]);
    expect(map.pageAt(16, 0)).toBe(1);
    expect(map.firstSpot(17)).toEqual({ element: 17, offset: 0, page: 1, row: 51 });
    expect(map.pageStart(1)).toEqual({ element: 0, offset: 0, page: 1, row: 0 });
    expect(map.pageStart(2)).toEqual({ element: 17, offset: 144, page: 2, row: 0 });
    expect(map.pageStart(3)).toBeUndefined();
  });

  it("starts a page after a split speech at its dialogue, not at the repeated cue above it", () => {
    // 24 one-line actions take rows 0 to 46 and the cue row 48. "One." to
    // "Five." fill rows 49 to 53, (MORE) follows, and page 2 repeats the cue
    // above row 0, where "Six." resumes at offset 29.
    const map = mapOf([
      ...Array.from({ length: 24 }, () => el("action", "Rain.")),
      el("character", "MAYA"),
      el("dialogue", "One.\nTwo.\nThree.\nFour.\nFive.\nSix.\nSeven."),
    ]);
    expect([map.pageAt(25, 28), map.pageAt(25, 29), map.pageAt(24, 0)]).toEqual([1, 2, 1]);
    expect(map.pageStart(2)).toEqual({ element: 25, offset: 29, page: 2, row: 0 });
  });

  it("agrees with the engine's pages for every line of long scripts", () => {
    for (const elements of [featureScript(150), [...everyFormat.elements]]) {
      const pages = paginate(elements);
      const map = new ScriptMap(elements, pages);
      const misses: unknown[] = [];
      const firstLine = new Map<number, { page: number; row: number }>();
      for (const page of pages) {
        const lines = page.lines.filter((line) => line.kind === "element");
        const [top] = lines;
        const start = top && { element: top.element, offset: top.start, page: page.number };
        const got = map.pageStart(page.number);
        if (!start || got?.element !== start.element || got.offset !== start.offset) {
          misses.push({ page: page.number, start: got, want: start });
        }
        for (const line of lines) {
          if (!firstLine.has(line.element)) {
            firstLine.set(line.element, { page: page.number, row: line.row });
          }
          for (const offset of [line.start, line.end]) {
            const at = map.pageAt(line.element, offset);
            if (at !== page.number) misses.push({ element: line.element, offset, at });
          }
        }
      }
      const headings = elements.flatMap((element, index) =>
        element.type === "sceneHeading" ? [index] : [],
      );
      expect(map.scenes.map((scene) => scene.element)).toEqual(headings);
      for (const scene of map.scenes) {
        const want = firstLine.get(scene.element);
        if (scene.page !== want?.page || scene.row !== want.row) misses.push({ scene, want });
      }
      expect(misses).toEqual([]);
      expect(map.pageCount).toBe(pages.length);
    }
  });
});
