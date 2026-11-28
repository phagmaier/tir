import { describe, expect, it, vi } from "vitest";
import { workerChecker } from "./spell-checker.ts";

// The page fetches the dictionary; the test reads the same files from disk.
// A mock's factory runs before the test's imports, so it imports its own.
vi.mock("./dictionary.ts", async () => {
  const { readFileSync } = await import("node:fs");
  const { Dictionary } = await import("../core/spelling.ts");
  const read = (name: string) =>
    readFileSync(new URL(`./dictionary/${name}`, import.meta.url), "utf8");
  return { loadDictionary: async () => Dictionary.parse(read("en_US.aff"), read("en_US.dic")) };
});

/** A worker that fails, as one whose module cannot load does. */
class FailingWorker extends EventTarget {
  readonly posted: unknown[] = [];
  postMessage(message: unknown): void {
    this.posted.push(message);
  }
  terminate(): void {}
  fail(): void {
    this.dispatchEvent(Object.assign(new Event("error"), { message: "failed to load" }));
  }
}

describe("checking spelling off the interface thread", () => {
  it("checks on the interface thread once the worker fails, for the waiting requests too", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const worker = new FailingWorker();
    const checker = workerChecker(() => worker as unknown as Worker);
    const waiting = checker.check([{ type: "action", text: "Teh tide turns." }]);
    expect(worker.posted).toHaveLength(1);
    worker.fail();
    expect(await waiting).toEqual([[{ start: 0, end: 3, text: "Teh" }]]);
    expect((await checker.suggest("teh", [], []))[0]).toBe("the");
    expect(worker.posted).toHaveLength(1);
    quiet.mockRestore();
  });
});
