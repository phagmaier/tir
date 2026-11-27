/**
 * Makes a draft's PDF (`src/core/pdf.ts`) in a worker of its own
 * (`pdf.worker.ts`), ended once it answers: shaping the text of a 120-page
 * script into Courier Prime's glyphs takes about half a second (findings,
 * "PDF libraries"), which would stall the window. Should no worker run, the
 * PDF is made here instead, holding the interface up for that long.
 */
import type { Script } from "../core/model.ts";
import type { PdfOptions } from "../core/pdf.ts";

export function makePdf(
  script: Script,
  options: PdfOptions,
  make: () => Worker = () =>
    new Worker(new URL("./pdf.worker.ts", import.meta.url), { type: "module" }),
): Promise<Uint8Array> {
  let worker: Worker;
  try {
    worker = make();
  } catch (error) {
    console.error("Tir makes the PDF on the interface thread:", error);
    return here(script, options);
  }
  return new Promise((resolve, reject) => {
    worker.addEventListener(
      "message",
      ({ data }: MessageEvent<{ bytes?: Uint8Array; error?: string }>) => {
        worker.terminate();
        if (data.bytes) resolve(data.bytes);
        else reject(new Error(data.error));
      },
    );
    worker.addEventListener("error", (event) => {
      worker.terminate();
      console.error("Tir makes the PDF on the interface thread:", event.message);
      here(script, options).then(resolve, reject);
    });
    worker.postMessage({ script, options });
  });
}

/** The PDF made on the interface thread, its code loaded only when needed. */
async function here(script: Script, options: PdfOptions): Promise<Uint8Array> {
  const [{ writePdf }, { courierPrime }] = await Promise.all([
    import("../core/pdf.ts"),
    import("./pdf-fonts.ts"),
  ]);
  return writePdf(script, await courierPrime(), options);
}
