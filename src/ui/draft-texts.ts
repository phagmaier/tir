/**
 * What a save writes for a draft (brief, "Storage"): the draft file, and
 * the Fountain copy beside it that keeps the script readable on GitHub and
 * without Tir. The editor makes both in a worker (`draft-texts.worker.ts`),
 * since writing the Fountain of a long script takes longer than a frame
 * (findings, "Editor").
 */
import { writeDraft } from "../core/draft-file.ts";
import { writeFountain } from "../core/fountain/write.ts";
import type { Script } from "../core/model.ts";

export interface DraftTexts {
  /** The draft file's text. */
  readonly draft: string;
  /** Its Fountain copy's text. */
  readonly copy: string;
}

export function draftTexts(script: Script): DraftTexts {
  return { draft: writeDraft(script), copy: writeFountain(script) };
}
