import { CONTINUED, ELEMENT_FORMATS, FONT_SIZE_PT, LINES_PER_INCH, MORE, PAGE } from "../format.ts";
import type { ElementType, Style, TitlePage } from "../model.ts";

export const TYPE_NAMES: Readonly<Record<ElementType, string>> = {
  sceneHeading: "Scene Heading",
  action: "Action",
  character: "Character",
  parenthetical: "Parenthetical",
  dialogue: "Dialogue",
  transition: "Transition",
  shot: "Shot",
  general: "General",
};

export const STYLE_NAMES: Readonly<Record<Style, string>> = {
  bold: "Bold",
  italic: "Italic",
  underline: "Underline",
};

export const TITLE_FIELDS = [
  "title",
  "credit",
  "authors",
  "source",
  "contact",
  "draftDate",
] as const satisfies readonly (keyof TitlePage)[];
export type TitleField = (typeof TITLE_FIELDS)[number];

// Tir's layout in Final Draft's terms, from format.ts. The writer declares
// these settings; the reader reports a file's settings that differ from them.
const POINTS_PER_INCH = 72;
const LINE_PT = POINTS_PER_INCH / LINES_PER_INCH;

export const FONT = { Font: "Courier Final Draft", Size: String(FONT_SIZE_PT) } as const;

export type ParagraphSetting =
  | "Alignment"
  | "FirstIndent"
  | "LeftIndent"
  | "RightIndent"
  | "SpaceBefore"
  | "Spacing"
  | "Leading";

/** How Tir sets an element, as a Final Draft ParagraphSpec. */
export function paragraphSpec(type: ElementType): Readonly<Record<ParagraphSetting, string>> {
  const { align, firstIndent, left, right, spaceBefore } = ELEMENT_FORMATS[type];
  return {
    Alignment: align === "right" ? "Right" : "Left",
    FirstIndent: firstIndent.toFixed(2),
    LeftIndent: left.toFixed(2),
    RightIndent: right.toFixed(2),
    SpaceBefore: String(spaceBefore * LINE_PT),
    Spacing: "1",
    Leading: "Regular",
  };
}

export const PAGE_SIZE = {
  Width: PAGE.widthIn.toFixed(2),
  Height: PAGE.heightIn.toFixed(2),
} as const;

export const MARGINS = {
  TopMargin: String(PAGE.topMarginIn * POINTS_PER_INCH),
  BottomMargin: String(PAGE.bottomMarginIn * POINTS_PER_INCH),
  HeaderMargin: String(PAGE.headerIn * POINTS_PER_INCH),
  // Final Draft's default; Tir prints no footer.
  FooterMargin: "36",
} as const;

export const DIALOGUE_BREAKS = {
  AutomaticCharacterContinueds: "Yes",
  BottomOfPage: "Yes",
  TopOfNext: "Yes",
  DialogueBottom: MORE,
  // Final Draft stores a straight apostrophe and prints a curly one.
  DialogueTop: CONTINUED.replace("’", "'"),
} as const;

export const SCENE_BREAKS = {
  ContinuedNumber: "No",
  SceneBottom: "(CONTINUED)",
  SceneBottomOfPage: "No",
  SceneTop: "CONTINUED:",
  SceneTopOfNext: "No",
} as const;
