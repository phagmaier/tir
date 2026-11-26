/**
 * The script model: the source of truth that every format (the draft file,
 * Fountain, FDX, PDF) is read into or written from (architecture, design
 * rule 2). Terms follow docs/brief.md.
 */

/** Final Draft's film elements (brief, "Elements and keys"). */
export const ELEMENT_TYPES = [
  "sceneHeading",
  "action",
  "character",
  "parenthetical",
  "dialogue",
  "transition",
  "shot",
  "general",
] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

export const STYLES = ["bold", "italic", "underline"] as const;
export type Style = (typeof STYLES)[number];

/**
 * A styled stretch of an element's text, from `start` up to but not
 * including `end`, counted in UTF-16 code units as JavaScript strings are.
 * An element's spans for one style are sorted, non-empty, and neither
 * overlap nor touch (see `normaliseSpans`).
 */
export type Span = readonly [start: number, end: number];

/** One paragraph of the script with a type. */
export interface Element {
  readonly type: ElementType;
  /**
   * The text as typed. Layout applies capitals where the element type calls
   * for them; a parenthetical keeps its parentheses in the text, as FDX and
   * Fountain do. A "\n" is a line break inside the element, as Fountain
   * allows in action and dialogue.
   */
  readonly text: string;
  readonly bold?: readonly Span[];
  readonly italic?: readonly Span[];
  readonly underline?: readonly Span[];
  /** Centred on the page, as Fountain's `>THE END<`. */
  readonly centred?: true;
  /** On a character cue: this speech sits beside the speech before it. */
  readonly dual?: true;
  /** A forced page break: the element starts a new page. */
  readonly pageBreakBefore?: true;
}

/**
 * A draft's title page (brief, "Title page"). Fields may hold several lines
 * separated by "\n". The draft and date show only when `showDraftDate` is
 * on, which it is not by default because spec scripts omit it.
 */
export interface TitlePage {
  readonly title: string;
  readonly credit: string;
  readonly authors: string;
  readonly source: string;
  readonly contact: string;
  readonly draftDate: string;
  readonly showDraftDate: boolean;
}

/** What a draft holds: its title page and its elements. */
export interface Script {
  readonly titlePage: TitlePage;
  readonly elements: readonly Element[];
}

export function newTitlePage(): TitlePage {
  return {
    title: "",
    credit: "Written by",
    authors: "",
    source: "",
    contact: "",
    draftDate: "",
    showDraftDate: false,
  };
}

/**
 * A project's record of one of its drafts: its name, shown in the top bar,
 * and its file in the project's `drafts/` folder. Stage 2 stores these in
 * `project.json`.
 */
export interface DraftInfo {
  readonly name: string;
  readonly file: string;
}

/** A project: one feature screenplay, its drafts and its active draft. */
export interface ProjectInfo {
  readonly name: string;
  readonly drafts: readonly DraftInfo[];
  /** The `file` of the draft open for editing. */
  readonly activeDraft: string;
}

/**
 * Puts one style's spans in their canonical form: empty spans dropped,
 * sorted, and overlapping or touching spans merged. Two elements styled
 * alike therefore compare equal.
 */
export function normaliseSpans(spans: readonly Span[]): Span[] {
  const sorted = spans.filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}
