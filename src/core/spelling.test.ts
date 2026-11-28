import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  accepts,
  Dictionary,
  misspelled,
  SCREENPLAY_WORDS,
  wordSet,
  wordsOf,
  wordToAdd,
} from "./spelling.ts";

const read = (name: string) =>
  readFileSync(new URL(`../ui/dictionary/${name}`, import.meta.url), "utf8");

/** A small affix file in Hunspell's format, each rule worked by hand below. */
const AFF = `SET UTF-8
TRY esiantrolhd'
ICONV 1
ICONV ’ '
NOSUGGEST !
ONLYINCOMPOUND c
REP 1
REP f ph

PFX U Y 1
PFX U   0     un         .

SFX S Y 2
SFX S   y     ies        [^aeiou]y
SFX S   0     s          [^y]

SFX D N 1
SFX D   0     ed         .
`;

const DIC = `9
fly/S
lock/USD
Paris
McDonald
graph/S
damn/!
1th/c
the
lot
`;

describe("wordsOf", () => {
  it("keeps apostrophes inside words and parts words at anything else", () => {
    const text = "Mara’s dog—can't stop. Re-enter 3rd café, ‘quoted’ I/E. it'";
    expect(wordsOf(text).map((word) => word.text)).toEqual([
      "Mara’s",
      "dog",
      "can't",
      "stop",
      "Re",
      "enter",
      "3rd",
      "café",
      "quoted",
      "I",
      "E",
      "it",
    ]);
    const cafe = wordsOf(text)[7];
    expect(cafe && text.slice(cafe.start, cafe.end)).toBe("café");
  });

  it("keeps combining accents and other scripts' letters in the word", () => {
    expect(wordsOf("Cafe\u0301 Москва").map((word) => word.text)).toEqual(["Cafe\u0301", "Москва"]);
  });
});

describe("a Hunspell dictionary", () => {
  const dictionary = Dictionary.parse(AFF, DIC);

  it("holds each word its affix rules make, and no other", () => {
    for (const word of ["fly", "flies", "lock", "locks", "locked", "unlock", "unlocks", "graphs"]) {
      expect(dictionary.has(word), word).toBe(true);
    }
    // "flys" fails the [^y] condition; D does not cross with U; 1th is only for compounds.
    for (const word of ["flys", "flyies", "unlocked", "unfly", "1th", "lockeds"]) {
      expect(dictionary.has(word), word).toBe(false);
    }
  });

  it("follows Hunspell's rules for capitals", () => {
    for (const word of ["Fly", "FLIES", "Paris", "PARIS", "McDonald", "MCDONALD", "UNLOCKS"]) {
      expect(dictionary.has(word), word).toBe(true);
    }
    for (const word of ["paris", "Mcdonald", "mcdonald", "fLY", "FLy"]) {
      expect(dictionary.has(word), word).toBe(false);
    }
  });

  it("converts the curly apostrophe before checking", () => {
    dictionary.add("cont'd");
    expect(dictionary.has("CONT’D")).toBe(true);
    expect(dictionary.has("cont’d")).toBe(true);
  });

  it("accepts a taboo word but never suggests it", () => {
    expect(dictionary.has("damn")).toBe(true);
    expect(dictionary.suggest("dam")).not.toContain("damn");
    expect(dictionary.suggest("dafn")).not.toContain("damn");
  });

  it("suggests from the replacement table, the dictionary's capitals and missing spaces", () => {
    expect(dictionary.suggest("grafs")[0]).toBe("graphs");
    expect(dictionary.suggest("paris")).toEqual(["Paris"]);
    expect(dictionary.suggest("thelot")).toContain("the lot");
  });

  it("refuses an affix file with directives it does not read", () => {
    expect(() => Dictionary.parse("SET ISO8859-1\n", "0\n")).toThrow(/UTF-8/);
    expect(() => Dictionary.parse("FLAG long\n", "0\n")).toThrow(/flags/);
    expect(() => Dictionary.parse("KEEPCASE K\n", "0\n")).toThrow(/KEEPCASE/);
  });
});

describe("SCOWL's US English dictionary", () => {
  let dictionary: Dictionary;
  beforeAll(() => {
    dictionary = Dictionary.parse(read("en_US.aff"), read("en_US.dic"));
    for (const word of SCREENPLAY_WORDS) dictionary.add(word);
  });

  it("reads US spelling and flags British", () => {
    for (const word of ["receive", "color", "harbor", "can't", "can’t", "Mara's", "unlocked"]) {
      expect(dictionary.has(word), word).toBe(true);
    }
    for (const word of ["recieve", "colour", "harbour", "teh", "definately"]) {
      expect(dictionary.has(word), word).toBe(false);
    }
  });

  it("finds the misspelled words of an element as the page shows it", () => {
    expect(misspelled(dictionary, "action", "Mara recieves the parcel in paris.")).toEqual([
      { start: 5, end: 13, text: "recieves" },
      { start: 28, end: 33, text: "paris" },
    ]);
    // A heading shows capitals, so "paris" is PARIS; the prefix and CONT'D are words.
    expect(misspelled(dictionary, "sceneHeading", "int. paris offise - night")).toEqual([
      { start: 11, end: 17, text: "offise" },
    ]);
    expect(misspelled(dictionary, "character", "Mara (CONT’D)")).toEqual([]);
    expect(misspelled(dictionary, "transition", "PRE-LAP:")).toEqual([]);
    expect(misspelled(dictionary, "action", "SFX: a walkie-talkie squawks offscreen.")).toEqual([]);
    expect(misspelled(dictionary, "action", "The 21st and 3th floors")).toEqual([]);
  });

  it("suggests the likeliest spelling first, in the word's capitals", () => {
    expect(dictionary.suggest("recieve")[0]).toBe("receive");
    expect(dictionary.suggest("Recieve")[0]).toBe("Receive");
    expect(dictionary.suggest("RECIEVE")[0]).toBe("RECEIVE");
    expect(dictionary.suggest("teh")[0]).toBe("the");
    expect(dictionary.suggest("definately")).toContain("definitely");
    expect(dictionary.suggest("alot")).toContain("a lot");
    expect(dictionary.suggest("harbour")).toContain("harbor");
    expect(dictionary.suggest("recieve").length).toBeLessThanOrEqual(6);
    // A missing space comes after every word one edit away.
    expect(dictionary.suggest("occured")[0]).toBe("occurred");
    // An apostrophe left out of a contraction is one edit, ranked as one.
    expect(dictionary.suggest("dont")[0]).toBe("don't");
    expect(dictionary.suggest("youre")[0]).toBe("you're");
  });

  it("takes an accented word for the one the dictionary holds without accents", () => {
    for (const word of ["café", "Café", "CAFÉ", "naïve", "résumé"]) {
      expect(dictionary.has(word), word).toBe(true);
    }
    expect(dictionary.has("cafëe")).toBe(false);
    expect(dictionary.suggest("cafëe")[0]).toBe("cafe");
  });

  it("keeps the writer's curly apostrophe", () => {
    expect(dictionary.suggest("does’nt")).toContain("doesn’t");
    expect(dictionary.suggest("does'nt")).toContain("doesn't");
  });

  it("offers the script's names among the suggestions, after swapped letters", () => {
    expect(dictionary.suggest("Okafro", ["okafor"])[0]).toBe("Okafor");
    // Many words are one edit from "tep"; the script's name comes first.
    expect(dictionary.suggest("Tep", ["teo"])[0]).toBe("Teo");
    // Two letters swapped is the commonest slip, so "the" comes before TEO.
    const teh = dictionary.suggest("teh", ["teo"]);
    expect(teh[0]).toBe("the");
    expect(teh).toContain("Teo");
    // An accent the writer left out costs nothing: "Tomas" is in the dictionary too.
    expect(dictionary.suggest("TOMAZ", ["tomás"]).slice(0, 2)).toEqual(["TOMÁS", "TOMAS"]);
    expect(dictionary.suggest("Halcyn", ["mara"])).not.toContain("Mara");
    // A misspelled possessive of a name gets the name's possessive.
    expect(dictionary.suggest("Okafro’s", ["okafor"])[0]).toBe("Okafor’s");
    // The script's names come in small letters: a name takes the dictionary's
    // capitals, else a capital to start and any others of the word typed.
    expect(dictionary.suggest("McDonnel", ["mcdonnell"])[0]).toBe("McDonnell");
    expect(dictionary.suggest("McOkafro", ["mcokafor"])[0]).toBe("McOkafor");
    expect(dictionary.suggest("okafro", ["okafor"])[0]).toBe("Okafor");
  });
});

describe("words the script and the writer teach", () => {
  const known = wordSet(["Mara Okafor", "TOMÁS", "Harbour Office", "Kowalski", "TEO'S BOAT"]);

  it("accepts each word of a name or location in any capitals, and its possessive", () => {
    for (const word of [
      "Okafor",
      "OKAFOR",
      "okafor",
      "Okafor's",
      "OKAFOR’S",
      "Tomás",
      "harbour",
      // A possessive in a location teaches its word.
      "Teo",
    ]) {
      expect(accepts(known, word), word).toBe(true);
    }
    for (const word of ["Okafors", "Tomas", "harbours", "Office's's"]) {
      expect(accepts(known, word), word).toBe(false);
    }
  });

  it("adds a possessive to the dictionary as the word it belongs to", () => {
    expect(wordToAdd("Okafor's")).toBe("Okafor");
    expect(wordToAdd("Okafor’s")).toBe("Okafor");
    expect(wordToAdd("Okafor")).toBe("Okafor");
    expect(wordToAdd("Ms")).toBe("Ms");
  });
});
