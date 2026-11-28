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
