/**
 * Find (brief, "Find and replace"): where a query matches an element's text
 * as the page shows it, in capitals where the element calls for them, so
 * match case compares what the writer sees. Capitals keep the text's length
 * (`capitals`), so a match's offsets are offsets into the text as typed.
 *
 * A word is a run of letters, combining marks and digits in any script, so
 * an accented letter continues a word and an apostrophe or hyphen ends one:
 * whole word finds ELLIS in "ELLIS'S" and not "Tom" in "Tomás". A straight
 * and a curly apostrophe match each other.
 */
import { ELEMENT_FORMATS } from "./format.ts";
import { capitals } from "./layout.ts";
import type { ElementType, Span } from "./model.ts";

export interface FindQuery {
  readonly text: string;
  readonly matchCase: boolean;
  readonly wholeWord: boolean;
}

/** Where a query matches an element's text, in order, as offsets into the text as typed. */
export type Finder = (type: ElementType, text: string) => Span[];

// A word character ending, and one starting, a stretch of text. A stretch of
// two code units holds the whole of a character beyond the Basic
// Multilingual Plane, as a surrogate pair.
const WORD_ENDS = /[\p{L}\p{M}\p{N}]$/u;
const WORD_STARTS = /^[\p{L}\p{M}\p{N}]/u;

/** Curly apostrophes as straight ones, keeping the text's length. */
const straight = (text: string) => text.replaceAll("’", "'");

/** The finder for `query`; null for an empty query, which finds nothing. */
export function finder({ text, matchCase, wholeWord }: FindQuery): Finder | null {
  if (!text) return null;
  // Only the syntax characters: escaping others, such as "-", is an error
  // in a Unicode expression.
  const literal = straight(text).replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");
  const pattern = new RegExp(literal, matchCase ? "gu" : "giu");
  return (type, typed) => {
    const shown = straight(ELEMENT_FORMATS[type].capitals ? capitals(typed) : typed);
    const spans: Span[] = [];
    pattern.lastIndex = 0;
    for (let match = pattern.exec(shown); match; match = pattern.exec(shown)) {
      const start = match.index;
      const end = start + match[0].length;
      if (wholeWord && (joins(shown, start) || joins(shown, end))) {
        // A whole word may still start inside the refused match.
        pattern.lastIndex = start + ((shown.codePointAt(start) as number) > 0xffff ? 2 : 1);
      } else {
        spans.push([start, end]);
      }
    }
    return spans;
  };
}

/** Whether a word runs on across offset `at`: word characters on both sides of it. */
function joins(text: string, at: number): boolean {
  return (
    WORD_ENDS.test(text.slice(Math.max(0, at - 2), at)) && WORD_STARTS.test(text.slice(at, at + 2))
  );
}
