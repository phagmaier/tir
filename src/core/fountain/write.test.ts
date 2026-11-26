import { describe, expect, it } from "vitest";
import { everyFormat } from "../fixtures/scripts.ts";
import { type Element, type ElementType, type Script, STYLES, type TitlePage } from "../model.ts";
import { readFountain } from "./read.ts";
import { writeFountain } from "./write.ts";

const noTitle: TitlePage = {
  title: "",
  credit: "",
  authors: "",
  source: "",
  contact: "",
  draftDate: "",
  showDraftDate: false,
};
const body = (...elements: Element[]) => writeFountain({ titlePage: noTitle, elements });
const roundTrip = (script: Script) => readFountain(writeFountain(script)).script;

describe("writeFountain forces a type wherever inference would misread", () => {
  it.each<[string, Element[], string]>([
    // Action
    ["plain action", [{ type: "action", text: "Rain." }], "Rain."],
    [
      "an all-caps action line over more action, which would read as a cue",
      [{ type: "action", text: "BANG\nThe door shakes." }],
      "!BANG\nThe door shakes.",
    ],
    [
      "a lone all-caps action line, which reads as action",
      [{ type: "action", text: "THE END" }],
      "THE END",
    ],
    ["action like a heading", [{ type: "action", text: "INT. NOTHING" }], "!INT. NOTHING"],
    ["action like a transition", [{ type: "action", text: "CUT TO:" }], "!CUT TO:"],
    ["action like a forced heading", [{ type: "action", text: ".45 calibre" }], "!.45 calibre"],
    ["action starting with !", [{ type: "action", text: "!wow" }], "!!wow"],
    ["action starting with @", [{ type: "action", text: "@home" }], "!@home"],
    ["action like centred text", [{ type: "action", text: ">arrows<" }], "!>arrows<"],
    ["action like a lyric", [{ type: "action", text: "~tilde" }], "\\~tilde"],
    ["action like a section", [{ type: "action", text: "# not a section" }], "\\# not a section"],
    [
      "action like a synopsis",
      [{ type: "action", text: "= not a synopsis" }],
      "\\= not a synopsis",
    ],
    ["action like a page break", [{ type: "action", text: "===" }], "\\==="],
    ["an empty action", [{ type: "action", text: "" }], "!"],
    ["an empty line inside action", [{ type: "action", text: "One.\n\nTwo." }], "One.\n  \nTwo."],
    ["centred action", [{ type: "action", text: "THE END", centred: true }], ">THE END<"],
    // Scene headings and shots
    ["a heading", [{ type: "sceneHeading", text: "INT. HOUSE - DAY" }], "INT. HOUSE - DAY"],
    ["a heading without a prefix", [{ type: "sceneHeading", text: "FLASHBACK" }], ".FLASHBACK"],
    [
      "a heading ending like a scene number",
      [{ type: "sceneHeading", text: "INT. ROOM #4#" }],
      "INT. ROOM \\#4#",
    ],
    [
      "a shot, which Fountain lacks",
      [{ type: "shot", text: "CLOSE ON THE LAMP" }],
      ".CLOSE ON THE LAMP [[tir:shot]]",
    ],
    [
      "general, which Fountain lacks",
      [{ type: "general", text: "A sign." }],
      "!A sign. [[tir:general]]",
    ],
    // Transitions
    ["a transition", [{ type: "transition", text: "CUT TO:" }], "CUT TO:"],
    ["a transition not ending in TO:", [{ type: "transition", text: "FADE OUT." }], ">FADE OUT."],
    // Speeches
    [
      "a speech",
      [
        { type: "character", text: "MAYA" },
        { type: "parenthetical", text: "(quietly)" },
        { type: "dialogue", text: "Go." },
      ],
      "MAYA\n(quietly)\nGo.",
    ],
    [
      "a mixed-case cue",
      [
        { type: "character", text: "Maya" },
        { type: "dialogue", text: "Go." },
      ],
      "@Maya\nGo.",
    ],
    ["a cue with nothing under it", [{ type: "character", text: "MAYA" }], "@MAYA"],
    [
      "dual dialogue",
      [
        { type: "character", text: "TOMÁS", dual: true },
        { type: "dialogue", text: "Six." },
      ],
      "TOMÁS ^\nSix.",
    ],
    [
      "dialogue like a parenthetical",
      [
        { type: "character", text: "MAYA" },
        { type: "dialogue", text: "(laughs) No." },
      ],
      "MAYA\n\\(laughs) No.",
    ],
    [
      "two dialogues in a row",
      [
        { type: "character", text: "MAYA" },
        { type: "dialogue", text: "One." },
        { type: "dialogue", text: "Two." },
      ],
      "MAYA\nOne.\nTwo. [[tir:dialogue]]",
    ],
    [
      "a parenthetical without parentheses",
      [
        { type: "character", text: "MAYA" },
        { type: "parenthetical", text: "quietly" },
        { type: "dialogue", text: "Go." },
      ],
      "MAYA\nquietly [[tir:parenthetical]]\nGo.",
    ],
    [
      "dialogue with no cue",
      [
        { type: "action", text: "Rain." },
        { type: "dialogue", text: "Hello?" },
      ],
      "Rain.\n\n!Hello? [[tir:dialogue]]",
    ],
    [
      "a forced page break",
      [
        { type: "action", text: "Rain." },
        { type: "sceneHeading", text: "INT. HOUSE - DAY", pageBreakBefore: true },
      ],
      "Rain.\n\n===\n\nINT. HOUSE - DAY",
    ],
    [
      "a first line that would read as a title page",
      [{ type: "action", text: "Title: the sign says nothing" }],
      "!Title: the sign says nothing",
    ],
  ])("%s", (_name, elements, expected) => {
    expect(body(...elements)).toBe(`${expected}\n`);
    expect(readFountain(`${expected}\n`).script.elements).toEqual(elements);
  });
});

describe("writeFountain: the title page", () => {
  it("writes each field Fountain's way", () => {
    expect(writeFountain({ titlePage: everyFormat.titlePage, elements: [] })).toBe(
      [
        "Title: Salt Line",
        "Credit: Written by",
        "Author: Mara Ellison",
        "Source: Based on the short story by Tomás Ruiz",
        "Draft date:",
        "    Second draft",
        "    26 November 2026",
        "Contact:",
        "    Mara Ellison",
        "    12 Harbour Row",
        "    Portsmouth",
        "    mara@example.com",
        "",
      ].join("\n"),
    );
  });

  it("keeps a draft date that is not shown under a key other apps ignore", () => {
    const titlePage = { ...noTitle, title: "Salt Line", draftDate: "First draft" };
    expect(writeFountain({ titlePage, elements: [] })).toBe(
      "Title: Salt Line\nHidden draft date: First draft\n",
    );
    expect(roundTrip({ titlePage, elements: [] }).titlePage).toEqual(titlePage);
  });

  it("writes nothing for an empty title page and an empty script", () => {
    expect(writeFountain({ titlePage: noTitle, elements: [] })).toBe("");
  });
});

describe("model → Fountain → model", () => {
  it("keeps the every-format fixture unchanged", () => {
    expect(roundTrip(everyFormat)).toEqual(everyFormat);
  });

  it("keeps a new title page's default credit", () => {
    const titlePage = { ...noTitle, credit: "Written by" };
    expect(roundTrip({ titlePage, elements: [] }).titlePage).toEqual(titlePage);
  });
});

// A seeded generator keeps failures reproducible.
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * An element as Fountain keeps it: everything but the styling of spaces,
 * which a marker cannot sit beside (inline.ts).
 */
function visible(element: Element) {
  const { bold: _b, italic: _i, underline: _u, ...rest } = element;
  const styles = [...element.text].map((char, i) =>
    /\s/.test(char)
      ? ""
      : STYLES.filter((style) => element[style]?.some(([s, e]) => s <= i && i < e)).join(),
  );
  return { ...rest, styles };
}

describe("random scripts", () => {
  // Words chosen to trip inference: prefixes, cues, transitions, Fountain's
  // special characters, and non-ASCII text.
  const words = [
    "INT.",
    "EXT.",
    "int",
    "I/E",
    "MAYA",
    "Maya",
    "CUT",
    "TO:",
    "(V.O.)",
    "(beat)",
    "the",
    "lamp",
    "Tomás",
    "ÉTÉ",
    "!",
    "@",
    "#",
    "=",
    "===",
    "~",
    ">",
    "<",
    ".",
    "..",
    "^",
    "*",
    "**",
    "_",
    "\\",
    "[[",
    "]]",
    "/*",
    "*/",
    "#1#",
    "Title:",
    "R2D2",
    "23",
    "—",
    "“quoted”",
  ];
  const types: ElementType[] = [
    "sceneHeading",
    "action",
    "character",
    "parenthetical",
    "dialogue",
    "transition",
    "shot",
    "general",
  ];

  it("come back with the same elements and visible styles, within the documented limits", () => {
    const next = random(7);
    const pick = <T>(items: readonly T[]) => items[Math.floor(next() * items.length)] as T;
    const phrase = () =>
      Array.from({ length: 1 + Math.floor(next() * 5) }, () => pick(words)).join(" ");

    for (let round = 0; round < 300; round++) {
      const elements: Element[] = Array.from({ length: 1 + Math.floor(next() * 10) }, () => {
        const type = pick(types);
        const multiLine = ["action", "dialogue", "general", "sceneHeading", "transition"];
        const lineCount = multiLine.includes(type) && next() < 0.3 ? 2 + Math.floor(next() * 2) : 1;
        let text = next() < 0.08 ? "" : Array.from({ length: lineCount }, phrase).join("\n");
        if (type === "parenthetical" && next() < 0.7) text = `(${phrase()})`;
        const element: { -readonly [K in keyof Element]: Element[K] } = { type, text };
        // Styles over whole words, as an editor applies them.
        const bounds = [...text.matchAll(/\S+/g)].map((m) => [m.index, m.index + m[0].length]);
        for (const style of STYLES) {
          if (bounds.length > 0 && next() < 0.25) {
            const a = pick(bounds) as number[];
            const b = pick(bounds) as number[];
            const span: [number, number] = [
              Math.min(a[0] as number, b[0] as number),
              Math.max(a[1] as number, b[1] as number),
            ];
            if (!text.slice(span[0], span[1]).includes("\n")) element[style] = [span];
          }
        }
        if (type === "action" && next() < 0.1 && !text.includes("\n")) element.centred = true;
        if (type === "character" && next() < 0.2) element.dual = true;
        if (next() < 0.05) element.pageBreakBefore = true;
        return element;
      });
      const titlePage: TitlePage =
        next() < 0.5
          ? noTitle
          : {
              ...noTitle,
              title: phrase(),
              credit: "Written by",
              contact: `${phrase()}\n${phrase()}`,
              draftDate: phrase(),
              showDraftDate: next() < 0.5,
            };
      const script: Script = { titlePage, elements };
      const fountain = writeFountain(script);
      const back = roundTrip(script);
      // The Fountain text heads any failure message.
      expect(back.titlePage, fountain).toEqual(titlePage);
      expect(back.elements.map(visible), fountain).toEqual(elements.map(visible));
    }
  });
});
