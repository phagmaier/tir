/**
 * Fountain's inline syntax: emphasis and backslash escapes within one line
 * (the Fountain 1.1 spec, "Emphasis"). Emphasis is Markdown-style, so
 * delimiters pair as Markdown pairs them: `*italic*`, `**bold**`,
 * `***bold italic***`, and `_underline_`. A delimiter opens only before a
 * non-space and closes only after one, and nothing carries across a line
 * break. A backslash before ASCII punctuation makes it literal.
 */
import { normaliseSpans, type Span, STYLES, type Style } from "../model.ts";

export interface StyledText {
  readonly text: string;
  readonly bold: Span[];
  readonly italic: Span[];
  readonly underline: Span[];
}

const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/;

interface Delimiter {
  readonly char: "*" | "_";
  readonly length: number;
  /** Unmatched characters left in the run; matches use its inner side. */
  remaining: number;
  readonly canOpen: boolean;
  readonly canClose: boolean;
  /** Output offsets where its closing and opening uses meet the text. */
  closeAt: number;
  openAt: number;
}

interface Match {
  readonly style: Style;
  readonly opener: Delimiter;
  readonly closer: Delimiter;
}

/** Parses one line of Fountain into plain text and style spans. */
export function parseInline(line: string): StyledText {
  const nodes: (string | Delimiter)[] = [];
  const chars = [...line];
  let i = 0;
  while (i < chars.length) {
    const char = chars[i] as string;
    const next = chars[i + 1];
    if (char === "\\" && next !== undefined && ASCII_PUNCTUATION.test(next)) {
      nodes.push(next);
      i += 2;
    } else if (char === "*" || char === "_") {
      let end = i;
      while (chars[end] === char) end++;
      const before = chars[i - 1];
      const after = chars[end];
      nodes.push({
        char,
        length: end - i,
        remaining: end - i,
        canOpen: after !== undefined && !/\s/.test(after),
        canClose: before !== undefined && !/\s/.test(before),
        closeAt: 0,
        openAt: 0,
      });
      i = end;
    } else {
      nodes.push(char);
      i++;
    }
  }

  const matches = pairDelimiters(nodes.filter((node) => typeof node !== "string"));

  let text = "";
  for (const node of nodes) {
    if (typeof node === "string") {
      text += node;
    } else {
      node.closeAt = text.length;
      text += node.char.repeat(node.remaining);
      node.openAt = text.length;
    }
  }
  const spans: Record<Style, Span[]> = { bold: [], italic: [], underline: [] };
  for (const { style, opener, closer } of matches)
    spans[style].push([opener.openAt, closer.closeAt]);
  return {
    text,
    bold: normaliseSpans(spans.bold),
    italic: normaliseSpans(spans.italic),
    underline: normaliseSpans(spans.underline),
  };
}

/** Markdown's delimiter pairing, simplified to whitespace flanking. */
function pairDelimiters(delimiters: Delimiter[]): Match[] {
  const matches: Match[] = [];
  const openers: Delimiter[] = [];
  for (const closer of delimiters) {
    if (closer.canClose) {
      while (closer.remaining > 0) {
        const index = findOpener(openers, closer);
        if (index < 0) break;
        const opener = openers[index] as Delimiter;
        const use = closer.char === "*" && opener.remaining >= 2 && closer.remaining >= 2 ? 2 : 1;
        const style: Style = closer.char === "_" ? "underline" : use === 2 ? "bold" : "italic";
        matches.push({ style, opener, closer });
        opener.remaining -= use;
        closer.remaining -= use;
        // Delimiters between a matched pair can no longer open.
        openers.length = opener.remaining > 0 ? index + 1 : index;
      }
    }
    if (closer.canOpen && closer.remaining > 0) openers.push(closer);
  }
  return matches;
}

function findOpener(openers: readonly Delimiter[], closer: Delimiter): number {
  for (let index = openers.length - 1; index >= 0; index--) {
    const opener = openers[index] as Delimiter;
    if (opener.char !== closer.char || opener.remaining === 0) continue;
    // Markdown's "rule of three": a run that can both open and close does
    // not pair with one whose lengths sum to a multiple of three.
    const ambiguous = opener.canClose || closer.canOpen;
    const sum = opener.length + closer.length;
    if (
      closer.char === "*" &&
      ambiguous &&
      sum % 3 === 0 &&
      !(opener.length % 3 === 0 && closer.length % 3 === 0)
    ) {
      continue;
    }
    return index;
  }
  return -1;
}

const MARKERS: Record<Style, string> = { underline: "_", bold: "**", italic: "*" };
// Among styles opening together, underline goes outermost.
const OPEN_ORDER: readonly Style[] = ["underline", "bold", "italic"];

/** Escapes the characters Fountain would read as emphasis, an escape or a note. */
export function escapeText(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) out += escapeChar(text, i);
  return out;
}

function escapeChar(text: string, i: number): string {
  const char = text[i] as string;
  if (char === "\\" || char === "*" || char === "_") return `\\${char}`;
  // Every "[" beside another is escaped, so no "[[" (a note) survives.
  if (char === "[" && (text[i - 1] === "[" || text[i + 1] === "[")) return "\\[";
  return char;
}

/**
 * Writes one line of styled text as Fountain. The text always comes back
 * exactly, and every non-space character keeps its styles, with one
 * exception: Markdown cannot express every crossing of bold and italic
 * (bold "ab" with italic "bc" needs a run like `****` that pairs
 * differently), so such a line loses its italic, then its bold. Styling on
 * spaces may change, because a marker beside a space does not pair.
 */
export function writeInline(styled: StyledText): string {
  const wanted = styleSets(styled);
  for (const dropped of [[], ["italic"], ["italic", "bold"]] as Style[][]) {
    const kept = wanted.map((set) => new Set([...set].filter((s) => !dropped.includes(s))));
    // Spaces first take the styles shared by their neighbours, so an
    // underline runs on across words; failing that, they take none.
    for (const spaces of ["shared", "none"] as const) {
      const written = markUp(styled.text, fillSpaces(styled.text, kept, spaces));
      if (readsBackAs(written, styled.text, kept)) return written;
    }
  }
  return escapeText(styled.text);
}

function styleSets(styled: StyledText): Set<Style>[] {
  const sets = Array.from({ length: styled.text.length }, () => new Set<Style>());
  for (const style of STYLES) {
    for (const [start, end] of styled[style]) {
      for (let i = start; i < end; i++) sets[i]?.add(style);
    }
  }
  return sets;
}

function fillSpaces(text: string, sets: Set<Style>[], mode: "shared" | "none"): Set<Style>[] {
  const isSpace = (i: number) => /\s/.test(text[i] as string);
  return sets.map((set, i) => {
    if (!isSpace(i)) return set;
    if (mode === "none") return new Set();
    let left = i - 1;
    while (left >= 0 && isSpace(left)) left--;
    let right = i + 1;
    while (right < text.length && isSpace(right)) right++;
    const before = sets[left];
    const after = sets[right];
    if (!before || !after) return new Set();
    return new Set([...before].filter((style) => after.has(style)));
  });
}

function readsBackAs(written: string, text: string, wanted: Set<Style>[]): boolean {
  const parsed = parseInline(written);
  if (parsed.text !== text) return false;
  const got = styleSets(parsed);
  return wanted.every(
    (set, i) => /\s/.test(text[i] as string) || sameSet(set, got[i] as Set<Style>),
  );
}

function markUp(text: string, sets: Set<Style>[]): string {
  // Where the run of each style covering a position ends.
  const runEnd = (style: Style, from: number) => {
    let end = from;
    while (end < text.length && sets[end]?.has(style)) end++;
    return end;
  };

  let out = "";
  const open: Style[] = [];
  const emit = (style: Style) => {
    // A "/" before a "*" marker would open boneyard, `/* … */`.
    if (style !== "underline" && out.endsWith("/")) out = `${out.slice(0, -1)}\\/`;
    out += MARKERS[style];
  };
  const closeFrom = (index: number) => {
    for (const style of open.splice(index).reverse()) emit(style);
  };
  for (let i = 0; i < text.length; i++) {
    const wanted = sets[i] as Set<Style>;
    const firstUnwanted = open.findIndex((style) => !wanted.has(style));
    if (firstUnwanted >= 0) closeFrom(firstUnwanted);
    // A marker opens only before a visible character, so at a space any
    // style closed above for nesting reopens at the next word instead.
    if (!/\s/.test(text[i] as string)) {
      // Styles whose runs end later open first, so nested runs never need
      // closing and reopening.
      const opening = [...wanted]
        .filter((style) => !open.includes(style))
        .sort(
          (a, b) => runEnd(b, i) - runEnd(a, i) || OPEN_ORDER.indexOf(a) - OPEN_ORDER.indexOf(b),
        );
      for (const style of opening) {
        emit(style);
        open.push(style);
      }
    }
    out += escapeChar(text, i);
  }
  closeFrom(0);
  return out;
}

function sameSet(a: Set<Style>, b: Set<Style>): boolean {
  return a.size === b.size && [...a].every((style) => b.has(style));
}
