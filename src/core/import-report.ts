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
  /** The index of the element it sat beside, or 0 when not anchored to the script. */
  readonly at: number;
}

export interface ScriptRead {
  readonly script: Script;
  readonly leftOut: readonly LeftOut[];
}
