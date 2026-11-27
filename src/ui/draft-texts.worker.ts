/**
 * The worker that makes a save's texts off the interface thread
 * (`textsInWorker` in `saving.ts`): each request is `{ id, script }`, and
 * each answer `{ id, texts }`, or `{ id, error }` when the script cannot
 * be written.
 */
import { draftTexts } from "./draft-texts.ts";

// The DOM's types, which the interface's code is checked with, describe a
// window; a worker has only these of them.
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
};

scope.onmessage = ({ data: { id, script } }) => {
  try {
    scope.postMessage({ id, texts: draftTexts(script) });
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
