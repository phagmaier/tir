import type { Script } from "./model.ts";

export type LeftOutKind =
  | "note"
  | "boneyard"
  | "section"
  | "synopsis"
  | "sceneNumber"
  | "titlePageField"
  | "scriptNote"
  | "revision"
  | "elementType";

export interface LeftOut {
  readonly kind: LeftOutKind;
  readonly text: string;
  /** The index of the body element it sat beside, or null without a body location. */
  readonly at: number | null;
}

export interface ScriptRead {
  readonly script: Script;
  readonly leftOut: readonly LeftOut[];
}
