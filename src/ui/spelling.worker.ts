/**
 * The worker that holds spell check's dictionary (`workerChecker` in
 * `spell-checker.ts`), read once: each request checks elements, answered
 * with each one's misspelled words, or asks for a word's suggestions. A
 * request it cannot answer gets `{ id, error }`.
 */
import { misspelled } from "../core/spelling.ts";
import { loadDictionary } from "./dictionary.ts";
import type { Answer, Request } from "./spell-checker.ts";

// The DOM's types, which the interface's code is checked with, describe a
// window; a worker has only these of them.
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: Answer): void;
};

const dictionary = loadDictionary();

scope.onmessage = async ({ data: request }) => {
  const { id } = request;
  try {
    const loaded = await dictionary;
    if ("check" in request) {
      const words = request.check.map(({ type, text }) => misspelled(loaded, type, text));
      scope.postMessage({ id, words });
    } else {
      scope.postMessage({ id, suggestions: loaded.suggest(request.suggest, request.extra) });
    }
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
