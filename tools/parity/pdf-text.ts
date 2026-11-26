/**
 * Reads a PDF's text runs with their positions, through pdf.js (unpdf).
 * Positions are PDF points: x from the page's left edge, y up from its
 * bottom edge, at the run's baseline.
 */
import { getDocumentProxy } from "unpdf";

export interface Run {
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

export interface PdfPage {
  readonly height: number;
  readonly runs: readonly Run[];
}

export interface PdfText {
  /** The PDF's Producer and Creator, which name the program that made it. */
  readonly producer: string | null;
  readonly creator: string | null;
  readonly pages: readonly PdfPage[];
}

interface TextItem {
  readonly str?: string;
  readonly transform?: readonly number[];
}

export async function readPdfText(bytes: Uint8Array): Promise<PdfText> {
  // pdf.js may take over the buffer, so it gets a copy.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { info } = (await pdf.getMetadata()) as { info?: Record<string, unknown> };
  const pages: PdfPage[] = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const [, bottom, , top] = page.view as [number, number, number, number];
    const content = await page.getTextContent();
    const runs: Run[] = [];
    for (const item of content.items as TextItem[]) {
      if (!item.str?.trim() || !item.transform) continue;
      runs.push({ text: item.str, x: item.transform[4] as number, y: item.transform[5] as number });
    }
    pages.push({ height: top - bottom, runs });
  }
  const text = (key: string) => (typeof info?.[key] === "string" ? (info[key] as string) : null);
  return { producer: text("Producer"), creator: text("Creator"), pages };
}
