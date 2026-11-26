/**
 * The Fountain 1.1 line rules (fountain.io/syntax) that both the reader and
 * the writer use, so the writer can tell when the reader would misread a
 * line. Each takes a raw line, markup and escapes included.
 */
import { ELEMENT_TYPES, type ElementType } from "../model.ts";

/** INT, EXT, EST, INT./EXT, INT/EXT or I/E, then a dot or a space; any case. */
const HEADING_PREFIX = /^(?:int\.?\/ext|int|ext|est|i\/e)[. ]/i;
/** "#1A#" at the end of a heading: letters, digits, dashes and dots. */
export const SCENE_NUMBER = /\s*(?<!\\)#([\p{L}\p{N}.-]+)#\s*$/u;

export function isHeading(line: string): boolean {
  return HEADING_PREFIX.test(line.trimStart());
}

/** A single leading "." before a letter or digit forces a scene heading. */
export function isForcedHeading(line: string): boolean {
  return /^\.[\p{L}\p{N}]/u.test(line.trimStart());
}

/** `>THE END<`: the text between, or null. */
export function centredText(line: string): string | null {
  const t = line.trim();
  if (t.length < 2 || !t.startsWith(">") || !endsUnescaped(t, "<")) return null;
  return t.slice(1, -1).trim();
}

/** Upper case and ending in "TO:", with nothing after the colon. */
export function isTransition(line: string): boolean {
  const t = line.trimStart();
  return t.endsWith("TO:") && !/\p{Ll}/u.test(t);
}

/** A trailing "^" marks the second speech of dual dialogue. */
export function splitDual(cue: string): { readonly cue: string; readonly dual: boolean } {
  const t = cue.trim();
  if (!endsUnescaped(t, "^")) return { cue: t, dual: false };
  return { cue: t.slice(0, -1).trimEnd(), dual: true };
}

/**
 * A character cue: its name, before any "(" extension, has a letter and no
 * lower case. "R2D2" is a cue; "23" is not.
 */
export function isCue(line: string): boolean {
  const name = (splitDual(line).cue.split("(")[0] as string).trim();
  return /\p{L}/u.test(name) && !/\p{Ll}/u.test(name);
}

export function isPageBreak(line: string): boolean {
  return /^={3,}$/.test(line.trim());
}

export function isSection(line: string): boolean {
  return line.trimStart().startsWith("#");
}

export function isSynopsis(line: string): boolean {
  return line.trimStart().startsWith("=") && !isPageBreak(line);
}

export function isLyric(line: string): boolean {
  return line.trimStart().startsWith("~");
}

/** `Key: value` on a title page. */
export const TITLE_KEY = /^(\p{L}[\p{L}\p{N} ()&'’-]*?)\s*:(.*)$/u;
/** A title page value's further lines are indented by three spaces or a tab. */
export const TITLE_CONTINUATION = /^(?: {3,}|\t)\S/;

/** Tir's own type note, `[[tir:shot]]`, for elements Fountain cannot force. */
export function markerType(note: string): ElementType | null {
  const match = /^\s*tir:\s*(\w+)\s*$/.exec(note);
  const type = match?.[1];
  return (ELEMENT_TYPES as readonly string[]).includes(type ?? "") ? (type as ElementType) : null;
}

export function marker(type: ElementType): string {
  return `[[tir:${type}]]`;
}

/** Ends with `char` not escaped by an odd number of backslashes. */
function endsUnescaped(text: string, char: string): boolean {
  if (!text.endsWith(char)) return false;
  let slashes = 0;
  for (let i = text.length - 2; i >= 0 && text[i] === "\\"; i--) slashes++;
  return slashes % 2 === 0;
}
