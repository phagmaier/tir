import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { getDocumentProxy } from "unpdf";
import { afterEach, expect, it, vi } from "vitest";
import { everyFormat } from "../core/fixtures/scripts.ts";
import { makePdf } from "./pdf-export.ts";

/** A worker that fails, as one whose module cannot load does. */
class FailingWorker extends EventTarget {
  readonly posted: unknown[] = [];
  terminated = false;
  postMessage(message: unknown): void {
    this.posted.push(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  fail(): void {
    this.dispatchEvent(Object.assign(new Event("error"), { message: "failed to load" }));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("makes the PDF on the interface thread when its worker fails", async () => {
  // The font files, as the page's own origin serves them.
  vi.stubGlobal(
    "fetch",
    async (url: string) =>
      new Response(readFileSync(new URL(`./fonts/${basename(url)}`, import.meta.url))),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
  const worker = new FailingWorker();
  const made = makePdf(everyFormat, { titlePage: true }, () => worker as unknown as Worker);
  expect(worker.posted).toEqual([{ script: everyFormat, options: { titlePage: true } }]);
  worker.fail();
  const pdf = await getDocumentProxy(new Uint8Array(await made));
  expect(worker.terminated).toBe(true);
  // The title page and the script's two pages.
  expect(pdf.numPages).toBe(3);
});
