/**
 * The draft file: Tir's own format for one draft (brief, "Storage";
 * architecture, "The draft file"). It is one JSON document with every
 * element on its own line, so a git diff of a draft reads like the script.
 * Reading validates everything and refuses a damaged or newer file whole,
 * never loading part of it.
 */
import {
  ELEMENT_TYPES,
  type Element,
  type ElementType,
  normaliseSpans,
  type Script,
  type Span,
  STYLES,
  type TitlePage,
} from "./model.ts";

export const DRAFT_FORMAT = "tir-draft";
/** Raise this whenever the format changes in a way older readers would misread. */
export const DRAFT_VERSION = 1;

export type ReadResult =
  | { readonly ok: true; readonly script: Script }
  | { readonly ok: false; readonly error: string };

// Key order for writing; also the complete list of keys a reader accepts.
const TOP_KEYS = ["format", "version", "titlePage", "elements"] as const;
const TITLE_PAGE_TEXT_KEYS = [
  "title",
  "credit",
  "authors",
  "source",
  "contact",
  "draftDate",
] as const satisfies readonly (keyof TitlePage)[];
const TITLE_PAGE_KEYS = [...TITLE_PAGE_TEXT_KEYS, "showDraftDate"] as const;
const FLAGS = ["centred", "dual", "pageBreakBefore"] as const;
const ELEMENT_KEYS = ["type", "text", ...STYLES, ...FLAGS] as const;

export function writeDraft(script: Script): string {
  const titlePage = TITLE_PAGE_KEYS.map(
    (key) => `    ${JSON.stringify(key)}: ${JSON.stringify(script.titlePage[key])}`,
  ).join(",\n");
  const elements = script.elements.map((element) => `    ${elementLine(element)}`).join(",\n");
  const text = [
    "{",
    `  "format": ${JSON.stringify(DRAFT_FORMAT)},`,
    `  "version": ${DRAFT_VERSION},`,
    `  "titlePage": {\n${titlePage}\n  },`,
    elements ? `  "elements": [\n${elements}\n  ]` : `  "elements": []`,
    "}",
    "",
  ].join("\n");
  // A file Tir cannot read back would lose the draft at the next open, so a
  // model that breaks an invariant fails the save instead.
  const check = readDraft(text);
  if (!check.ok) throw new Error(`Tir made a draft file it could not read back. ${check.error}`);
  return text;
}

function elementLine(element: Element): string {
  // Building the object key by key fixes the order JSON.stringify writes.
  const ordered: Record<string, unknown> = { type: element.type, text: element.text };
  for (const style of STYLES) {
    const spans = normaliseSpans(element[style] ?? []);
    if (spans.length > 0) ordered[style] = spans;
  }
  for (const flag of FLAGS) if (element[flag]) ordered[flag] = true;
  // JSON leaves U+2028 and U+2029 unescaped, and some viewers break lines
  // at them; escaping keeps each element on one line.
  return JSON.stringify(ordered).replace(
    /[\u2028\u2029]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16)}`,
  );
}

/** Thrown inside the reader only; `readDraft` turns it into a result. */
class Refusal extends Error {}

function damaged(detail: string): Refusal {
  return new Refusal(`The draft file is damaged: ${detail}.`);
}

export function readDraft(text: string): ReadResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? ` (${error.message})` : "";
    return { ok: false, error: `The draft file is damaged: it is not complete JSON${reason}.` };
  }
  try {
    return { ok: true, script: readScript(data) };
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, error: error.message };
    throw error;
  }
}

function readScript(data: unknown): Script {
  if (!isRecord(data) || data.format !== DRAFT_FORMAT) {
    throw new Refusal("This file is not a Tir draft.");
  }
  // The version comes first: a newer file may hold anything after it.
  const version = data.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw damaged("its format version is missing or invalid");
  }
  if (version > DRAFT_VERSION) {
    throw new Refusal(
      `This draft was saved by a newer version of Tir (draft format ${version}; this version reads format ${DRAFT_VERSION}). Update Tir to open it.`,
    );
  }
  rejectUnknownKeys(data, TOP_KEYS, "the file");
  if (!Array.isArray(data.elements)) throw damaged("the element list is missing");
  return {
    titlePage: readTitlePage(data.titlePage),
    elements: data.elements.map((element, index) => readElement(element, index + 1)),
  };
}

function readTitlePage(data: unknown): TitlePage {
  if (!isRecord(data)) throw damaged("the title page is missing");
  rejectUnknownKeys(data, TITLE_PAGE_KEYS, "the title page");
  const text = (key: (typeof TITLE_PAGE_TEXT_KEYS)[number]): string => {
    const value = data[key];
    if (typeof value !== "string")
      throw damaged(`the title page's "${key}" is missing or not text`);
    return value;
  };
  if (typeof data.showDraftDate !== "boolean") {
    throw damaged(`the title page's "showDraftDate" is missing or not true or false`);
  }
  return {
    title: text("title"),
    credit: text("credit"),
    authors: text("authors"),
    source: text("source"),
    contact: text("contact"),
    draftDate: text("draftDate"),
    showDraftDate: data.showDraftDate,
  };
}

function readElement(data: unknown, number: number): Element {
  const where = `element ${number}`;
  if (!isRecord(data)) throw damaged(`${where} is not an element`);
  rejectUnknownKeys(data, ELEMENT_KEYS, where);
  const type = data.type;
  if (!isElementType(type)) throw damaged(`${where} has an unknown type ${JSON.stringify(type)}`);
  const text = data.text;
  if (typeof text !== "string") throw damaged(`${where} has no text`);

  const element: { -readonly [K in keyof Element]: Element[K] } = { type, text };
  for (const style of STYLES) {
    if (data[style] === undefined) continue;
    const spans = normaliseSpans(
      readSpans(data[style], text.length, `${where}'s ${style} styling`),
    );
    if (spans.length > 0) element[style] = spans;
  }
  for (const flag of FLAGS) {
    if (data[flag] === undefined) continue;
    if (data[flag] !== true) throw damaged(`${where}'s "${flag}" can only be true`);
    element[flag] = true;
  }
  if (element.dual && type !== "character") {
    throw damaged(`${where} is marked as dual dialogue but is not a character cue`);
  }
  return element;
}

function readSpans(data: unknown, length: number, what: string): Span[] {
  if (!Array.isArray(data)) throw damaged(`${what} is not a list of spans`);
  return data.map((span): Span => {
    const valid =
      Array.isArray(span) &&
      span.length === 2 &&
      Number.isInteger(span[0]) &&
      Number.isInteger(span[1]) &&
      span[0] >= 0 &&
      span[0] < span[1] &&
      span[1] <= length;
    if (!valid) throw damaged(`${what} has a span outside the text: ${JSON.stringify(span)}`);
    return [span[0], span[1]];
  });
}

function rejectUnknownKeys(data: Record<string, unknown>, known: readonly string[], where: string) {
  for (const key of Object.keys(data)) {
    if (!known.includes(key)) throw damaged(`${where} has an unexpected field "${key}"`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isElementType(value: unknown): value is ElementType {
  return (ELEMENT_TYPES as readonly unknown[]).includes(value);
}
