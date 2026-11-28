/**
 * Spell check (brief, "Scope" and "Stack"): Tir's own checker on a Hunspell
 * dictionary, SCOWL's US English (findings, "Spell check"). It reads the
 * parts of Hunspell's affix format that dictionary uses and refuses any
 * other, so a new dictionary cannot change what it accepts unnoticed.
 *
 * Every word the dictionary's affix rules make is listed once, when it is
 * read, so checking a word is a lookup or two and a suggestion can try every
 * word two edits away. Words holding a digit go unchecked: the dictionary's
 * compound rules only build ordinals such as "21st".
 *
 * What the script teaches, its character names and locations, and the
 * words the writer adds are accepted in any capitals (`accepts`), apart
 * from the dictionary, which the interface keeps in a worker.
 */
import { ELEMENT_FORMATS } from "./format.ts";
import { capitals } from "./layout.ts";
import type { ElementType } from "./model.ts";

/** A word in an element's text: where it is, [start, end) in UTF-16 code units, and its text. */
export interface Word {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/**
 * Letters, with their accents, and digits; an apostrophe between two of
 * them stays inside the word ("can't", "Mara’s"). Anything else, such as a
 * hyphen, period or slash, parts words.
 */
const WORD = /[\p{L}\p{M}\p{Nd}]+(?:['’][\p{L}\p{M}\p{Nd}]+)*/gu;
const DIGIT = /\p{Nd}/u;

/** The words of `text`, in order. */
export function wordsOf(text: string): Word[] {
  const words: Word[] = [];
  for (const match of text.matchAll(WORD)) {
    words.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
  }
  return words;
}

/**
 * Words a screenplay uses that the dictionary lacks: the (CONT'D) Tir adds
 * itself, which scripts from other applications hold as typed, and POV.
 */
export const SCREENPLAY_WORDS: readonly string[] = ["cont'd", "pov"];

interface Affix {
  readonly strip: string;
  readonly add: string;
  /** What the word must start (a prefix) or end (a suffix) with; null for any word. */
  readonly condition: RegExp | null;
}

interface AffixClass {
  /** Whether its words take the other kind of affix too (Hunspell's cross product). */
  readonly cross: boolean;
  readonly rules: Affix[];
}

/** Directives Tir's checker can leave aside: see each comment. */
const IGNORED: Readonly<Record<string, true>> = {
  // Tir finds words itself (`wordsOf`).
  WORDCHARS: true,
  // Compounds in SCOWL's dictionary only build ordinals, which hold digits.
  COMPOUNDMIN: true,
  COMPOUNDRULE: true,
};

/** A suggestion's case follows the word's: "Recieve" gives "Receive", "RECIEVE" "RECEIVE". */
type Case = "lower" | "title" | "upper" | "mixed";

/**
 * A suggestion as found: how many edits from the typed word, what kind of
 * edit (the dictionary's capitals or a known word 0, the replacement table
 * 1, two letters swapped 2, another edit 3, a space 4, two edits 5), and
 * how alike the two are.
 */
interface Offer {
  readonly text: string;
  readonly edits: number;
  readonly kind: number;
  readonly score: number;
}

/** At most this many suggestions, the closest first. */
const SUGGESTIONS = 6;
/**
 * Words two edits away are tried only when one edit finds fewer than
 * `FEW`, and for words of up to `LONGEST_FOR_TWO_EDITS` letters: their
 * number grows with the square of the length, to a tenth of a second at ten.
 */
const FEW = 3;
const LONGEST_FOR_TWO_EDITS = 10;

export class Dictionary {
  /** Every word the dictionary holds, written as it is. */
  private readonly forms = new Set<string>();
  /** Words not all in small letters, by their small letters: "paris" → "Paris". */
  private readonly cased = new Map<string, string[]>();
  /** Words accepted but never suggested: Hunspell's NOSUGGEST, on taboo words. */
  private readonly unsuggested = new Set<string>();
  private readonly conversions: readonly (readonly [string, string])[];
  private readonly replacements: readonly (readonly [string, string])[];
  /** The letters to try in suggestions, most common first. */
  private readonly letters: readonly string[];

  private constructor(
    conversions: readonly (readonly [string, string])[],
    replacements: readonly (readonly [string, string])[],
    letters: readonly string[],
  ) {
    this.conversions = conversions;
    this.replacements = replacements;
    this.letters = letters;
  }

  /** Reads a Hunspell dictionary: its affix file's text and its word list's. */
  static parse(aff: string, dic: string): Dictionary {
    const prefixes = new Map<string, AffixClass>();
    const suffixes = new Map<string, AffixClass>();
    const conversions: [string, string][] = [];
    const replacements: [string, string][] = [];
    let letters = "";
    let noSuggest = "";
    let onlyInCompound = "";
    for (const line of aff.split(/\r?\n/)) {
      const fields = line.trim().split(/\s+/);
      const directive = fields[0] as string;
      if (!directive || directive.startsWith("#")) continue;
      const [, first = "", second = "", third = "", fourth = ""] = fields;
      switch (directive) {
        case "SET":
          if (first !== "UTF-8") throw new Error(`The dictionary is in ${first}, not UTF-8.`);
          break;
        case "FLAG":
          throw new Error(`Tir's spell checker reads only one-character flags, not ${first}.`);
        case "TRY":
          letters = first;
          break;
        case "NOSUGGEST":
          noSuggest = first;
          break;
        case "ONLYINCOMPOUND":
          onlyInCompound = first;
          break;
        case "ICONV":
          if (fields.length === 3) conversions.push([first, second]);
          break;
        case "REP":
          if (fields.length === 3) replacements.push([first, second.replaceAll("_", " ")]);
          break;
        case "PFX":
        case "SFX": {
          const classes = directive === "PFX" ? prefixes : suffixes;
          const known = classes.get(first);
          if (!known) {
            classes.set(first, { cross: second === "Y", rules: [] });
            break;
          }
          if (third.includes("/")) {
            throw new Error(`Tir's spell checker reads no affix that takes affixes: ${line}`);
          }
          const strip = second === "0" ? "" : second;
          const condition =
            fourth === "." || fourth === ""
              ? null
              : new RegExp(directive === "PFX" ? `^(?:${fourth})` : `(?:${fourth})$`, "u");
          known.rules.push({ strip, add: third === "0" ? "" : third, condition });
          break;
        }
        default:
          if (!Object.hasOwn(IGNORED, directive)) {
            throw new Error(`Tir's spell checker does not read Hunspell's ${directive}.`);
          }
      }
    }
    const tried = [...new Set(letters.toLowerCase())];
    const dictionary = new Dictionary(conversions, replacements, tried);
    const lines = dic.split(/\r?\n/);
    // The first line is the number of words.
    for (let i = 1; i < lines.length; i++) {
      const entry = (lines[i] as string).trim().split(/\s/)[0] as string;
      if (!entry) continue;
      const slash = entry.indexOf("/");
      const root = slash < 0 ? entry : entry.slice(0, slash);
      const flags = slash < 0 ? "" : entry.slice(slash + 1);
      if (onlyInCompound && flags.includes(onlyInCompound)) continue;
      dictionary.expand(root, flags, prefixes, suffixes, !!noSuggest && flags.includes(noSuggest));
    }
    return dictionary;
  }

  /** Adds `root` and every word its affix `flags` make from it. */
  private expand(
    root: string,
    flags: string,
    prefixes: ReadonlyMap<string, AffixClass>,
    suffixes: ReadonlyMap<string, AffixClass>,
    unsuggested: boolean,
  ): void {
    this.list(root, unsuggested);
    const crossing: string[] = [];
    for (const flag of flags) {
      const affixes = suffixes.get(flag);
      for (const rule of affixes?.rules ?? []) {
        if (!root.endsWith(rule.strip) || root.length <= rule.strip.length) continue;
        if (rule.condition && !rule.condition.test(root)) continue;
        const word = root.slice(0, root.length - rule.strip.length) + rule.add;
        this.list(word, unsuggested);
        if (affixes?.cross) crossing.push(word);
      }
    }
    for (const flag of flags) {
      const affixes = prefixes.get(flag);
      for (const rule of affixes?.rules ?? []) {
        if (!root.startsWith(rule.strip) || root.length <= rule.strip.length) continue;
        if (rule.condition && !rule.condition.test(root)) continue;
        this.list(rule.add + root.slice(rule.strip.length), unsuggested);
        if (!affixes?.cross) continue;
        for (const word of crossing)
          this.list(rule.add + word.slice(rule.strip.length), unsuggested);
      }
    }
  }

  private list(word: string, unsuggested: boolean): void {
    this.forms.add(word);
    if (unsuggested) this.unsuggested.add(word);
    const lower = word.toLowerCase();
    if (lower === word) return;
    const forms = this.cased.get(lower);
    if (!forms) this.cased.set(lower, [word]);
    else if (!forms.includes(word)) forms.push(word);
  }

  /** Adds `word` as a word of its own, taking no affixes. */
  add(word: string): void {
    this.list(this.convert(word), false);
  }

  /**
   * Whether `word` is spelled as the dictionary has it, by Hunspell's rules
   * for capitals: a word in small letters may start with a capital or be
   * all capitals, and a name ("Paris") may be all capitals, but not small.
   */
  has(word: string): boolean {
    const converted = this.convert(word);
    if (this.forms.has(converted)) return true;
    const lower = converted.toLowerCase();
    switch (caseOf(converted)) {
      case "title":
        return this.forms.has(lower);
      case "upper":
        return this.forms.has(lower) || this.cased.has(lower);
      default:
        return false;
    }
  }

  /**
   * Up to six spellings for `word`, in its capitals and with its shape of
   * apostrophe, the fewest edits away first: the dictionary's own capitals
   * for it, and the word without its accents; any of `extra`, such as the
   * script's names, within two edits, or their possessives for a
   * possessive; then, one edit away, Hunspell's replacement table, two
   * letters swapped, and a letter extra, missing or wrong; then a space
   * missing; then two edits away, the most alike first. Among equals, one
   * keeping the word's first letter comes first.
   */
  suggest(word: string, extra: Iterable<string> = []): string[] {
    const typed = this.convert(word);
    const lower = typed.toLowerCase();
    const offered: Offer[] = [];
    const seen = new Set<string>();
    const offer = (text: string, edits: number, kind: number) => {
      const key = text.toLowerCase();
      if (seen.has(key) || this.unsuggested.has(text)) return;
      seen.add(key);
      const score = likeness(lower, key) + (key[0] === lower[0] ? 1 : 0);
      offered.push({ text, edits, kind, score });
    };
    const tryWords = (candidate: string, edits: number, kind: number) => {
      const found = this.spelledWords(candidate);
      if (found) offer(found, edits, kind);
    };
    for (const form of this.cased.get(lower) ?? []) {
      if (form !== typed) offer(form, 0, 0);
    }
    seen.add(lower);
    // The dictionary has no accents: "naïve" is "naive".
    const plain = bare(lower);
    if (plain !== lower) tryWords(plain, 0, 0);
    const owner = lower.endsWith("'s") ? bare(lower.slice(0, -2)) : null;
    for (const known of extra) {
      const converted = this.convert(known);
      const name = bare(converted.toLowerCase());
      // An accent the writer left out or added is no edit: "Tomas" for "Tomás".
      const edits = editDistance(plain, name, 2);
      if (edits <= 2) offer(converted, edits, 0);
      const owned = owner === null ? 3 : editDistance(owner, name, 2);
      if (owned <= 2) offer(`${converted}'s`, owned, 0);
    }
    for (const [from, to] of this.replacements) {
      for (let at = lower.indexOf(from); at >= 0; at = lower.indexOf(from, at + 1)) {
        tryWords(lower.slice(0, at) + to + lower.slice(at + from.length), 1, 1);
      }
    }
    for (let i = 0; i < lower.length - 1; i++) {
      tryWords(lower.slice(0, i) + lower[i + 1] + lower[i] + lower.slice(i + 2), 1, 2);
    }
    const near = this.edits(lower);
    for (const candidate of near) tryWords(candidate, 1, 3);
    // A missing space ranks after every word one edit away: "occur ed" is no "occurred".
    for (let at = 2; at < lower.length - 1; at++) {
      tryWords(`${lower.slice(0, at)} ${lower.slice(at)}`, 2, 4);
    }
    if (offered.length < FEW && lower.length <= LONGEST_FOR_TWO_EDITS) {
      // Repeats cost a lookup each, less than remembering every string tried.
      for (const once of near) {
        for (const candidate of this.edits(once)) tryWords(candidate, 2, 5);
      }
    }
    offered.sort((a, b) => a.edits - b.edits || a.kind - b.kind || b.score - a.score);
    const shape = caseOf(typed);
    // Suggestions keep the apostrophe the writer types, curly or straight.
    const curly = word.includes("’");
    const results: string[] = [];
    for (const { text } of offered) {
      const cased = inCase(text, shape);
      const shown = curly ? cased.replaceAll("'", "’") : cased;
      if (shown !== word && !results.includes(shown)) results.push(shown);
      if (results.length === SUGGESTIONS) break;
    }
    return results;
  }

  /**
   * The dictionary's way of writing `lower`, a word in small letters, if it
   * holds it; for words parted by spaces, each in small letters, as "a lot".
   */
  private spelledWords(lower: string): string | undefined {
    if (!lower.includes(" ")) return this.spelled(lower);
    const words = lower.split(" ");
    return words.every((part) => this.forms.has(part)) ? lower : undefined;
  }

  /** The dictionary's way of writing `lower`, a word in small letters, if it holds it. */
  private spelled(lower: string): string | undefined {
    if (this.forms.has(lower)) return lower;
    return this.cased.get(lower)?.[0];
  }

  /** Every string one edit from `word`: a letter dropped, two swapped, one changed or one added. */
  private edits(word: string): string[] {
    const out: string[] = [];
    for (let i = 0; i < word.length; i++) {
      const before = word.slice(0, i);
      const after = word.slice(i + 1);
      const next = after[0];
      if (next !== undefined) out.push(before + next + word[i] + after.slice(1));
      out.push(before + after);
      for (const letter of this.letters) {
        if (letter !== word[i]) out.push(before + letter + after);
      }
    }
    for (let i = 0; i <= word.length; i++) {
      for (const letter of this.letters) out.push(word.slice(0, i) + letter + word.slice(i));
    }
    return out;
  }

  /** `word` with Hunspell's input conversions, such as the curly apostrophe to a straight one. */
  private convert(word: string): string {
    let out = word;
    for (const [from, to] of this.conversions) out = out.replaceAll(from, to);
    return out;
  }
}

function caseOf(word: string): Case {
  const lower = word.toLowerCase();
  if (word === lower) return "lower";
  const upper = word.toUpperCase();
  if (word === upper) return [...word].length > 1 ? "upper" : "title";
  const first = String.fromCodePoint(word.codePointAt(0) as number);
  const rest = word.slice(first.length);
  return first !== first.toLowerCase() && rest === rest.toLowerCase() ? "title" : "mixed";
}

function inCase(text: string, shape: Case): string {
  if (shape === "upper") return text.toUpperCase();
  if (shape === "title" && text === text.toLowerCase()) {
    const first = String.fromCodePoint(text.codePointAt(0) as number);
    return first.toUpperCase() + text.slice(first.length);
  }
  return text;
}

/**
 * Edits from `a` to `b` (a letter added, dropped, changed, or two side by
 * side swapped), or `most` + 1 when there are more than `most`.
 */
function editDistance(a: string, b: string, most: number): number {
  if (Math.abs(a.length - b.length) > most) return most + 1;
  let older: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        (previous[j] as number) + 1,
        (row[j - 1] as number) + 1,
        (previous[j - 1] as number) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, (older[j - 2] as number) + 1);
      }
      row.push(best);
    }
    older = previous;
    previous = row;
  }
  return previous[b.length] as number;
}

/** `word` without its accents: "tomás" → "tomas". */
function bare(word: string): string {
  return word.normalize("NFD").replace(/\p{M}/gu, "");
}

/** How alike two words are: the share of their letter pairs they have in common. */
function likeness(a: string, b: string): number {
  const pairs = (word: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < word.length - 1; i++) {
      const pair = word.slice(i, i + 2);
      out.set(pair, (out.get(pair) ?? 0) + 1);
    }
    return out;
  };
  const left = pairs(a);
  let shared = 0;
  for (const [pair, count] of pairs(b)) shared += Math.min(count, left.get(pair) ?? 0);
  return (2 * shared) / Math.max(1, a.length + b.length - 2);
}

/**
 * The words of `text`, an element of `type`, that `dictionary` does not
 * hold, checked as the page shows them: in capitals where the element calls
 * for them, so a heading's "paris" is the "PARIS" it shows.
 */
export function misspelled(dictionary: Dictionary, type: ElementType, text: string): Word[] {
  const shown = ELEMENT_FORMATS[type].capitals ? capitals : (word: string) => word;
  return wordsOf(text).filter(
    (word) => !DIGIT.test(word.text) && !dictionary.has(shown(word.text)),
  );
}

/** `word` for comparing regardless of capitals and of the apostrophe's shape. */
export function fold(word: string): string {
  return word.replaceAll("’", "'").toLowerCase();
}

/**
 * Each word of `texts`, such as the script's character names and
 * locations, folded; a possessive also as its word, so "MARA'S KITCHEN"
 * teaches "mara".
 */
export function wordSet(texts: Iterable<string>): Set<string> {
  const words = new Set<string>();
  for (const text of texts) {
    for (const word of wordsOf(text)) {
      const folded = fold(word.text);
      words.add(folded);
      if (folded.endsWith("'s") && folded.length > 2) words.add(folded.slice(0, -2));
    }
  }
  return words;
}

/** Whether `word`, or the word it is the possessive of ("Mara's"), is one of `known`'s folded words. */
export function accepts(known: ReadonlySet<string>, word: string): boolean {
  const folded = fold(word);
  return known.has(folded) || (folded.endsWith("'s") && known.has(folded.slice(0, -2)));
}

/** The word to add to the writer's dictionary for `word`: without a possessive's "'s". */
export function wordToAdd(word: string): string {
  return /['’]s$/i.test(word) && word.length > 2 ? word.slice(0, -2) : word;
}
