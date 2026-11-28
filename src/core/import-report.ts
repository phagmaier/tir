import type { Script } from "./model.ts";
import type { Page } from "./paginate.ts";

export type LeftOutKind =
  | "note"
  | "boneyard"
  | "section"
  | "synopsis"
  | "sceneNumber"
  | "titlePageField"
  | "scriptNote"
  | "revision"
  | "elementType"
  /** Page or element layout Tir sets its own way, such as margins or indents. */
  | "layout"
  /** Type styles Tir does not keep, such as a font, colour or strikeout. */
  | "formatting";

export interface LeftOut {
  readonly kind: LeftOutKind;
  readonly text: string;
  /** The index of the body element it sat in or beside, or null without a body location. */
  readonly at: number | null;
  /** Where in that element's text it sat, in UTF-16 code units; absent at the element's start. */
  readonly offset?: number;
}

export interface ScriptRead {
  readonly script: Script;
  readonly leftOut: readonly LeftOut[];
}

/**
 * Finds the script page each left-out item sat on: the page of the element
 * line holding its offset, so a note late in an element that runs onto the
 * next page gives that page. Null without a body location.
 */
export function leftOutPages(pages: readonly Page[]): (item: LeftOut) => number | null {
  const lines = new Map<number, { readonly page: number; readonly end: number }[]>();
  for (const page of pages) {
    for (const { kind, element, end } of page.lines) {
      if (kind !== "element") continue;
      const list = lines.get(element);
      if (list) list.push({ page: page.number, end });
      else lines.set(element, [{ page: page.number, end }]);
    }
  }
  return ({ at, offset = 0 }) => {
    const list = at === null ? undefined : lines.get(at);
    if (!list) return null;
    return (list.find((line) => offset <= line.end) ?? list.at(-1))?.page ?? null;
  };
}
