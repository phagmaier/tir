/**
 * Where things sit in the paginated script, for finding one's way about it
 * (brief, "Scene sidebar" and "Scope", Page position): each scene with the
 * page its heading starts on, the page holding any place in the text, and
 * where each page starts. All of it comes from the engine's pages, never
 * from the screen (architecture, design rule 1).
 */
import { capitals } from "./layout.ts";
import type { Element } from "./model.ts";
import type { Page } from "./paginate.ts";

/** A place in an element's text, with the page and row of the line it starts. */
export interface Spot {
  /** The element, by its index in the script. */
  readonly element: number;
  /** An offset in the element's text. */
  readonly offset: number;
  /** The page number, from 1. */
  readonly page: number;
  /** The line's row on the page, counted down from the top margin. */
  readonly row: number;
}

/**
 * A scene, starting at its heading's first line. Scenes are numbered in
 * order from 1, on screen only (brief, "Scene sidebar").
 */
export interface Scene extends Spot {
  /** The heading as the engine sets it, in capitals; empty until written. */
  readonly heading: string;
}

export class ScriptMap {
  readonly scenes: readonly Scene[];
  readonly pageCount: number;
  /** The page of each element's first line. */
  private readonly firstPage: Int32Array;
  /** For an element whose lines run onto later pages: each later page and the offset it resumes at. */
  private readonly resumes = new Map<number, number[]>();
  /** Each page's first line of element text: a repeated cue above it is not where the page starts. */
  private readonly starts: (Spot | undefined)[];

  constructor(elements: readonly Element[], pages: readonly Page[]) {
    this.pageCount = pages.length;
    const firstPage = new Int32Array(elements.length);
    const firstRow = new Int32Array(elements.length);
    const lastPage = new Int32Array(elements.length);
    this.starts = pages.map(({ number, lines }) => {
      let start: Spot | undefined;
      for (const line of lines) {
        if (line.kind !== "element") continue;
        const element = line.element;
        start ??= { element, offset: line.start, page: number, row: line.row };
        if (lastPage[element] === number) continue;
        if (lastPage[element] === 0) {
          firstPage[element] = number;
          firstRow[element] = line.row;
        } else {
          const resumes = this.resumes.get(element) ?? [];
          resumes.push(number, line.start);
          this.resumes.set(element, resumes);
        }
        lastPage[element] = number;
      }
      return start;
    });
    this.firstPage = firstPage;
    const scenes: Scene[] = [];
    elements.forEach((element, index) => {
      if (element.type !== "sceneHeading") return;
      scenes.push({
        element: index,
        offset: 0,
        page: firstPage[index] as number,
        row: firstRow[index] as number,
        heading: capitals(element.text),
      });
    });
    this.scenes = scenes;
  }

  /** The page holding `offset` in element `element`'s text: that of the last line starting at or before it. */
  pageAt(element: number, offset: number): number {
    let page = this.firstPage[element] as number;
    const resumes = this.resumes.get(element);
    if (resumes) {
      for (let i = 0; i < resumes.length && offset >= (resumes[i + 1] as number); i += 2) {
        page = resumes[i] as number;
      }
    }
    return page;
  }

  /** Where page `number` starts: its first line of element text. */
  pageStart(number: number): Spot | undefined {
    return this.starts[number - 1];
  }

  /** The scene holding element `element`, as an index into `scenes`; -1 before the first heading. */
  sceneAt(element: number): number {
    let low = 0;
    let high = this.scenes.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if ((this.scenes[mid] as Scene).element <= element) low = mid + 1;
      else high = mid;
    }
    return low - 1;
  }
}
