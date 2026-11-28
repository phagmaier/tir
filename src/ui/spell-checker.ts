/**
 * Spell check's dictionary work, off the interface thread: reading the
 * dictionary takes a tenth of a second, and a suggestion up to that again
 * (findings, "Spell check"), so the dictionary lives in a worker of its own
 * (`spelling.worker.ts`). Should no worker run, the dictionary is read here
 * instead, holding the interface up once for that long.
 */
import type { ElementType } from "../core/model.ts";
import { type Dictionary, misspelled, type Word } from "../core/spelling.ts";
import { loadDictionary } from "./dictionary.ts";

/** An element as spell check sends it. */
export interface Checked {
  readonly type: ElementType;
  readonly text: string;
}

export interface Checker {
  /** Each element's words the dictionary does not hold, in its order. */
  check(elements: readonly Checked[]): Promise<Word[][]>;
  /** Spellings for `word`, the closest first, `extra` (such as the script's names) among them. */
  suggest(word: string, extra: readonly string[]): Promise<string[]>;
}

/** A request to the worker: elements to check, or a word to suggest spellings for. */
export type Request =
  | { readonly id: number; readonly check: readonly Checked[] }
  | { readonly id: number; readonly suggest: string; readonly extra: readonly string[] };

export interface Answer {
  readonly id: number;
  readonly words?: Word[][];
  readonly suggestions?: string[];
  readonly error?: string;
}

export function workerChecker(
  make: () => Worker = () =>
    new Worker(new URL("./spelling.worker.ts", import.meta.url), { type: "module" }),
): Checker {
  let local: Promise<Dictionary> | null = null;
  // The dictionary here, read only when no worker runs.
  const here = async (request: Request): Promise<Answer> => {
    local ??= loadDictionary();
    const dictionary = await local;
    if ("check" in request) {
      return {
        id: request.id,
        words: request.check.map(({ type, text }) => misspelled(dictionary, type, text)),
      };
    }
    return { id: request.id, suggestions: dictionary.suggest(request.suggest, request.extra) };
  };
  const waiting = new Map<
    number,
    { request: Request; resolve(answer: Answer): void; reject(error: Error): void }
  >();
  let next = 0;
  let worker: Worker | null = null;
  try {
    worker = make();
  } catch (error) {
    console.error("Tir checks spelling on the interface thread:", error);
  }
  worker?.addEventListener("message", ({ data }: MessageEvent<Answer>) => {
    const request = waiting.get(data.id);
    waiting.delete(data.id);
    if (data.error === undefined) request?.resolve(data);
    else request?.reject(new Error(data.error));
  });
  worker?.addEventListener("error", (event) => {
    console.error("Tir checks spelling on the interface thread:", event.message);
    worker?.terminate();
    worker = null;
    for (const { request, resolve, reject } of waiting.values()) {
      here(request).then(resolve, reject);
    }
    waiting.clear();
  });
  const ask = (request: Request): Promise<Answer> => {
    const live = worker;
    if (!live) return here(request);
    const { promise, resolve, reject } = Promise.withResolvers<Answer>();
    waiting.set(request.id, { request, resolve, reject });
    live.postMessage(request);
    return promise;
  };
  return {
    check: async (elements) => (await ask({ id: next++, check: elements })).words ?? [],
    suggest: async (word, extra) =>
      (await ask({ id: next++, suggest: word, extra })).suggestions ?? [],
  };
}
