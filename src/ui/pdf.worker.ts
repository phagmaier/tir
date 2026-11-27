/**
 * The worker that makes a PDF off the interface thread (`makePdf` in
 * `pdf-export.ts`): the request is `{ script, options }`, and the answer
 * `{ bytes }`, or `{ error }` when the PDF cannot be made.
 */
import { writePdf } from "../core/pdf.ts";
import { courierPrime } from "./pdf-fonts.ts";

// The DOM's types, which the interface's code is checked with, describe a
// window; a worker has only these of them.
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

scope.onmessage = async ({ data: { script, options } }) => {
  try {
    const bytes = await writePdf(script, await courierPrime(), options);
    scope.postMessage({ bytes }, [bytes.buffer as ArrayBuffer]);
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
