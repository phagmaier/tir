/**
 * Final Draft's default screenplay format: the one place every format value
 * lives. Each value comes from docs/findings.md, "Final Draft's default
 * screenplay format"; change one only with new evidence recorded there.
 */
import type { ElementType } from "./model.ts";

/** US Letter with Final Draft's margins, in inches. */
export const PAGE = {
  widthIn: 8.5,
  heightIn: 11,
  topMarginIn: 1,
  bottomMarginIn: 1,
  /** The header, holding the page number, sits this far from the top edge. */
  headerIn: 0.5,
} as const;

/** Courier at 12 pt: 10 characters per inch and 6 lines per inch. */
export const FONT_SIZE_PT = 12;
export const CHARS_PER_INCH = 10;
export const LINES_PER_INCH = 6;

/** How one element type is set on the page. Distances are inches from the page's left edge. */
export interface ElementFormat {
  readonly left: number;
  /** The right indent: where right-aligned and centred text is measured to. */
  readonly right: number;
  /** Added to `left` on the element's first line (the parenthetical's hanging "("). */
  readonly firstIndent: number;
  /**
   * Characters a line holds, as measured in Final Draft's PDFs (findings,
   * "Line widths"): as if each character were about 7.08 pt wide rather than
   * the 7.2 pt Final Draft prints, so action's 6 in holds 61 and dialogue's
   * 3.5 in holds 35.
   */
  readonly width: number;
  /** Characters the first line holds, where it differs. */
  readonly firstWidth: number;
  /** Blank lines above the element (Final Draft's SpaceBefore, 12 pt a line). */
  readonly spaceBefore: number;
  readonly align: "left" | "right" | "centre";
  /** Final Draft's AllCaps style. */
  readonly capitals: boolean;
}

function format(
  left: number,
  right: number,
  spaceBefore: number,
  width: number,
  more: Partial<Pick<ElementFormat, "firstIndent" | "firstWidth" | "align" | "capitals">> = {},
): ElementFormat {
  return {
    left,
    right,
    spaceBefore,
    width,
    firstIndent: 0,
    firstWidth: width,
    align: "left",
    capitals: false,
    ...more,
  };
}

/** Final Draft's ElementSettings (findings, the table), with measured widths. */
export const ELEMENT_FORMATS: Readonly<Record<ElementType, ElementFormat>> = {
  sceneHeading: format(1.5, 7.5, 2, 61, { capitals: true }),
  action: format(1.5, 7.5, 1, 61),
  character: format(3.5, 7.25, 1, 38, { capitals: true }),
  parenthetical: format(3.0, 5.5, 0, 25, { firstIndent: -0.1, firstWidth: 26 }),
  dialogue: format(2.5, 6.0, 0, 35),
  transition: format(5.5, 7.1, 1, 16, { align: "right", capitals: true }),
  shot: format(1.5, 7.5, 2, 61, { capitals: true }),
  general: format(1.5, 7.5, 0, 61),
};

export type SpeechType = "character" | "parenthetical" | "dialogue";
export type Column = "left" | "right";

/**
 * Dual dialogue: two columns, 1.5 to 4.375 in and 4.625 to 7.5 in, each
 * holding 29 characters of dialogue, with each cue centred in its column
 * (findings, "Dual dialogue"). The parentheticals' widths rest on few
 * samples.
 */
export const DUAL_FORMATS: Readonly<Record<Column, Readonly<Record<SpeechType, ElementFormat>>>> = {
  left: {
    character: format(1.5, 4.375, 1, 28, { align: "centre", capitals: true }),
    parenthetical: format(1.85, 4.125, 0, 22, { firstIndent: -0.1, firstWidth: 23 }),
    dialogue: format(1.5, 4.375, 0, 29),
  },
  right: {
    character: format(4.625, 7.5, 1, 28, { align: "centre", capitals: true }),
    parenthetical: format(4.975, 7.25, 0, 22, { firstIndent: -0.1, firstWidth: 23 }),
    dialogue: format(4.625, 7.5, 0, 29),
  },
};

/**
 * Final Draft's MoresAndContinueds: DialogueBottom and DialogueTop. With
 * smart quotes on (the default) Final Draft prints a curly apostrophe.
 */
export const MORE = "(MORE)";
export const CONTINUED = "(CONT’D)";

/** Pagination settings (findings, "Pagination"). */
export const PAGINATION = {
  /** 9 in of body between 1 in margins, at 6 lines to the inch; (MORE) may sit on a 55th. */
  linesPerPage: 54,
  /** The fewest lines a split action or speech may leave on either page. */
  minSplitLines: 2,
  /** Page 1 shows no number; page numbers read "2." and so on. */
  firstNumberShown: 2,
  numberSuffix: ".",
} as const;
