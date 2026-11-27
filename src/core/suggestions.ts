/**
 * Autocomplete's suggestions (brief, "Elements and keys"): character names
 * and cue extensions in a cue, a scene heading's prefix, location and time
 * of day, and transitions, each ranked by its uses in the script. The
 * built-in lists are Final Draft's SmartType defaults, with the brief's five
 * prefixes (findings, "Final Draft's SmartType"). A `Tally` counts the uses
 * and changes only by the uses of elements an edit touched, so a keystroke
 * never reads the whole script again.
 */
import type { Element, ElementType } from "./model.ts";

export type Source = "character" | "extension" | "prefix" | "location" | "time" | "transition";

const BUILT_IN: Readonly<Record<Source, readonly string[]>> = {
  character: [],
  extension: ["(V.O.)", "(O.S.)", "(O.C.)", "(SUBTITLE)"],
  prefix: ["INT.", "EXT.", "INT./EXT.", "I/E.", "EST."],
  location: [],
  time: [
    "DAY",
    "NIGHT",
    "MORNING",
    "AFTERNOON",
    "EVENING",
    "LATER",
    "MOMENTS LATER",
    "CONTINUOUS",
    "THE NEXT DAY",
  ],
  transition: [
    "CUT TO:",
    "FADE IN:",
    "FADE OUT",
    "FADE TO:",
    "DISSOLVE TO:",
    "BACK TO:",
    "MATCH CUT TO:",
    "JUMP CUT TO:",
    "FADE TO BLACK",
  ],
};

/** One use of a suggestion in an element: its source and its text as typed. */
export interface Use {
  readonly source: Source;
  readonly text: string;
}

/** A prefix as typed, with or without its periods, followed by a space. */
const PREFIX = /^(int\.?\/ext|int|ext|est|i\/e)\.?(?=\s)/i;
const CANONICAL: Readonly<Record<string, string>> = {
  "int/ext": "INT./EXT.",
  int: "INT.",
  ext: "EXT.",
  est: "EST.",
  "i/e": "I/E.",
};
/** Between a heading's location and its time of day, as Final Draft separates them. */
const TIME_SEPARATOR = " - ";

/**
 * The uses an element holds. A cue's name is its text before any "(", and
 * each closed "(…)" is an extension. A heading's location runs from its
 * prefix to the last " - ", and its time of day follows that.
 */
export function usesOf(type: ElementType, text: string): Use[] {
  const uses: Use[] = [];
  const add = (source: Source, part: string) => {
    const trimmed = part.trim();
    if (trimmed) uses.push({ source, text: trimmed });
  };
  if (type === "character") {
    const open = text.indexOf("(");
    add("character", open < 0 ? text : text.slice(0, open));
    for (const [extension] of text.matchAll(/\([^()]*\)/g)) add("extension", extension);
  } else if (type === "sceneHeading") {
    const prefix = PREFIX.exec(text);
    const dash = text.lastIndexOf(TIME_SEPARATOR);
    if (prefix) {
      add("prefix", canonicalPrefix(prefix[1] as string));
      const start = prefix[0].length;
      add("location", dash >= start ? text.slice(start, dash) : text.slice(start));
    }
    if (dash >= 0) add("time", text.slice(dash + TIME_SEPARATOR.length));
  } else if (type === "transition") {
    add("transition", text);
  }
  return uses;
}

function canonicalPrefix(typed: string): string {
  return CANONICAL[typed.toLowerCase().replaceAll(".", "")] as string;
}

/**
 * Text for matching regardless of case. A character whose lower case is
 * longer ("İ") stays as it is, so offsets into the folded text hold.
 */
function fold(text: string): string {
  const lower = text.toLowerCase();
  if (lower.length === text.length) return lower;
  let out = "";
  for (const char of text) {
    const folded = char.toLowerCase();
    out += folded.length === char.length ? folded : char;
  }
  return out;
}

interface Entry {
  readonly uses: number;
  /** How often each way of writing it, differing only in case, is used. */
  readonly forms: ReadonlyMap<string, number>;
}

/**
 * How often the script uses each suggestion. Immutable: `with` returns a new
 * tally sharing every source the change leaves alone.
 */
export class Tally {
  private readonly sources: ReadonlyMap<Source, ReadonlyMap<string, Entry>>;

  private constructor(sources: ReadonlyMap<Source, ReadonlyMap<string, Entry>>) {
    this.sources = sources;
  }

  static of(elements: Iterable<Pick<Element, "type" | "text">>): Tally {
    const uses: Use[] = [];
    for (const { type, text } of elements) uses.push(...usesOf(type, text));
    return new Tally(new Map()).with([], uses);
  }

  /** This tally without the `removed` uses and with the `added` ones. */
  with(removed: readonly Use[], added: readonly Use[]): Tally {
    if (removed.length === 0 && added.length === 0) return this;
    const sources = new Map(this.sources);
    const copied = new Map<Source, Map<string, Entry>>();
    const count = ({ source, text }: Use, by: number) => {
      let entries = copied.get(source);
      if (!entries) {
        entries = new Map(this.sources.get(source));
        copied.set(source, entries);
        sources.set(source, entries);
      }
      const key = fold(text);
      const entry = entries.get(key);
      const forms = new Map(entry?.forms);
      const form = (forms.get(text) ?? 0) + by;
      if (form > 0) forms.set(text, form);
      else forms.delete(text);
      const uses = (entry?.uses ?? 0) + by;
      if (uses > 0) entries.set(key, { uses, forms });
      else entries.delete(key);
    };
    for (const use of removed) count(use, -1);
    for (const use of added) count(use, 1);
    return new Tally(sources);
  }

  entries(source: Source): ReadonlyMap<string, Entry> {
    return this.sources.get(source) ?? new Map();
  }
}

/** The way of writing a suggestion the script uses most; on a tie, the one in capitals. */
function mostUsed(forms: ReadonlyMap<string, number>): string {
  let best = "";
  let most = 0;
  for (const [form, uses] of forms) {
    if (uses > most || (uses === most && form < best)) {
      best = form;
      most = uses;
    }
  }
  return best;
}

export interface Suggestion {
  /** As the script writes it most often, else as the built-in list does. */
  readonly text: string;
  /** Uses elsewhere in the script. */
  readonly uses: number;
}

export interface Suggestions {
  readonly source: Source;
  /** Where the part being typed starts in the element's text; it runs to the end. */
  readonly start: number;
  /** What accepting adds after the suggestion: the space after a prefix, " - " after a location. */
  readonly suffix: string;
  /** Most used first; unused built-in ones in Final Draft's order. */
  readonly options: readonly Suggestion[];
}

/**
 * The part of an element that the text's end is typing: a cue's name, or an
 * extension from an unclosed "("; a transition; a heading's prefix while it
 * has no space, then its location, then its time of day from the last
 * " - ". The location and time open as soon as the space or " - " before
 * them is typed; the others need a character.
 */
function slotOf(type: ElementType, text: string): Omit<Suggestions, "options"> | null {
  const typed = (source: Source) => {
    const start = text.length - text.trimStart().length;
    return start < text.length ? { source, start, suffix: "" } : null;
  };
  switch (type) {
    case "character": {
      const open = text.lastIndexOf("(");
      if (open < 0) return typed("character");
      return text.includes(")", open) ? null : { source: "extension", start: open, suffix: "" };
    }
    case "transition":
      return typed("transition");
    case "sceneHeading": {
      if (!/\s/.test(text)) return text ? { source: "prefix", start: 0, suffix: " " } : null;
      const dash = text.lastIndexOf(TIME_SEPARATOR);
      if (dash >= 0) return { source: "time", start: dash + TIME_SEPARATOR.length, suffix: "" };
      const prefix = PREFIX.exec(text);
      if (!prefix) return null;
      const rest = text.slice(prefix[0].length);
      const start = text.length - rest.trimStart().length;
      return { source: "location", start, suffix: TIME_SEPARATOR };
    }
    default:
      return null;
  }
}

/**
 * The suggestions for an element of `type` holding `text`, typed at its end:
 * those that continue the part being typed, ignoring case. The element's
 * `own` uses, which the tally counts, are left out. None when nothing
 * continues it, or when the part already reads as a suggestion in full.
 */
export function suggest(
  tally: Tally,
  type: ElementType,
  text: string,
  own: readonly Use[],
): Suggestions | null {
  const slot = slotOf(type, text);
  if (!slot) return null;
  const typed = fold(text.slice(slot.start));
  const counted = tally.with(own, []).entries(slot.source);
  const builtIn = BUILT_IN[slot.source];
  const known = new Map<string, Suggestion & { readonly order: number }>();
  builtIn.forEach((form, order) => {
    known.set(fold(form), { text: form, uses: 0, order });
  });
  for (const [key, { uses, forms }] of counted) {
    known.set(key, { text: mostUsed(forms), uses, order: known.get(key)?.order ?? builtIn.length });
  }
  if (known.has(typed)) return null;
  const options = [...known]
    .filter(([key]) => key.startsWith(typed))
    .map(([key, option]) => ({ key, ...option }))
    .sort((a, b) => b.uses - a.uses || a.order - b.order || (a.key < b.key ? -1 : 1))
    .map(({ text, uses }) => ({ text, uses }));
  return options.length ? { ...slot, options } : null;
}
