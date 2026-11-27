/**
 * Courier Prime's four font files, which the PDF embeds (`src/core/pdf.ts`):
 * the files the editor's `@font-face` rules load, fetched from the page's
 * own origin.
 */
import type { FontFace, PdfFonts } from "../core/pdf.ts";
import bold from "./fonts/CourierPrime-Bold.ttf?url";
import boldItalic from "./fonts/CourierPrime-BoldItalic.ttf?url";
import italic from "./fonts/CourierPrime-Italic.ttf?url";
import regular from "./fonts/CourierPrime-Regular.ttf?url";

const FILES: Readonly<Record<FontFace, string>> = { regular, bold, italic, boldItalic };

export async function courierPrime(): Promise<PdfFonts> {
  const faces = Object.keys(FILES) as FontFace[];
  const files = await Promise.all(
    faces.map(async (face) => {
      const response = await fetch(FILES[face]);
      if (!response.ok) throw new Error(`Courier Prime could not be loaded (${response.status}).`);
      return new Uint8Array(await response.arrayBuffer());
    }),
  );
  return Object.fromEntries(faces.map((face, i) => [face, files[i]])) as unknown as PdfFonts;
}
