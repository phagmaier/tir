/**
 * What a copy or cut takes from the script and a paste puts back (brief,
 * "Copy and paste"). Within Tir the clipboard carries the clipping itself,
 * written by `writeClipping`, so pasted elements keep their types, formats
 * and styles exactly. Other applications get it as Fountain text, and text
 * from them is read as Fountain, with anything ambiguous as action.
 */
import { readElementList } from "./draft-file.ts";
import { readFountain } from "./fountain/read.ts";
import { elementLines, writeFountain } from "./fountain/write.ts";
import type { Element, TitlePage } from "./model.ts";

/**
 * Elements, whole or in part, in script order. An open start means the
 * first is the end part of an element, whose text a paste adds to the text
 * before the caret; an open end means the last is the start part of one,
 * which takes in the text after the caret. Text from within one element is
 * one element open at both ends.
 */
export interface Clipping {
  readonly elements: readonly Element[];
  readonly openStart: boolean;
  readonly openEnd: boolean;
}

/** Text from within one element: a paste puts it in the element at the caret. */
export function isText(clipping: Clipping): boolean {
  return clipping.elements.length === 1 && clipping.openStart && clipping.openEnd;
}

const FORMAT = "tir-clipping";
const VERSION = 1;

/** Tir's own clipboard form of a clipping. */
export function writeClipping({ elements, openStart, openEnd }: Clipping): string {
  return JSON.stringify({ format: FORMAT, version: VERSION, openStart, openEnd, elements });
}

/** A clipping Tir wrote, or null for anything else, which a paste then reads as Fountain. */
export function readClipping(text: string): Clipping | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const { format, version, openStart, openEnd, elements } = data as Record<string, unknown>;
  if (format !== FORMAT || version !== VERSION) return null;
  if (typeof openStart !== "boolean" || typeof openEnd !== "boolean") return null;
  const read = readElementList(elements);
  return read?.length ? { elements: read, openStart, openEnd } : null;
}

const NO_TITLE_PAGE: TitlePage = {
  title: "",
  credit: "",
  authors: "",
  source: "",
  contact: "",
  draftDate: "",
  showDraftDate: false,
};

/**
 * A clipping as Fountain, for other applications. Elements are written as a
 * Fountain file's script would be; text from within one element is written
 * as its lines, with Fountain's emphasis and escapes but no element syntax.
 */
export function clippingToFountain(clipping: Clipping): string {
  const [first] = clipping.elements;
  if (first && isText(clipping)) {
    // As action, the plainest element: the text has no element of its own.
    return elementLines({ ...first, type: "action" }).join("\n");
  }
  return writeFountain({ titlePage: NO_TITLE_PAGE, elements: clipping.elements }).replace(
    /\n$/,
    "",
  );
}

/**
 * Text from another application, read as Fountain. A paste is part of a
 * script, so it has no title page: a block of `Key: value` lines is read as
 * script. What an import would leave out (notes, boneyard, sections,
 * synopses, scene numbers) is left out. One paragraph of action, such as a
 * line of prose, is text for the element at the caret; anything else
 * arrives as whole elements.
 */
export function clippingFromFountain(text: string): Clipping {
  const { elements } = readFountain(text, { titlePage: false }).script;
  const [only] = elements;
  const prose =
    elements.length === 1 && only?.type === "action" && !only.centred && !only.pageBreakBefore;
  return { elements, openStart: prose, openEnd: prose };
}
