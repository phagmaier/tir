// Original test scripts, written for Tir's tests. Other people's scripts
// never enter version control (AGENTS.md).
import type { Element, Script } from "../model.ts";

/** Every element type and every format the model holds. */
export const everyFormat: Script = {
  titlePage: {
    title: "Salt Line",
    credit: "Written by",
    authors: "Mara Ellison",
    source: "Based on the short story by Tomás Ruiz",
    contact: "Mara Ellison\n12 Harbour Row\nPortsmouth\nmara@example.com",
    draftDate: "Second draft\n26 November 2026",
    showDraftDate: true,
  },
  elements: [
    { type: "sceneHeading", text: "EXT. HARBOUR WALL - NIGHT" },
    { type: "action", text: "Waves break over the stone. A lamp swings above the empty quay." },
    {
      type: "action",
      text: "The gate is locked. Again. She kicks it anyway.",
      bold: [[12, 18]],
      italic: [[12, 26]],
      underline: [
        [0, 3],
        [40, 46],
      ],
    },
    { type: "character", text: "MAYA" },
    { type: "parenthetical", text: "(out of breath)" },
    { type: "dialogue", text: "Tomás said six — not seven.", bold: [[11, 14]] },
    { type: "character", text: "TOMÁS", dual: true },
    { type: "dialogue", text: "Six. I said six." },
    { type: "shot", text: "CLOSE ON THE LAMP" },
    { type: "action", text: "" },
    { type: "transition", text: "CUT TO:" },
    {
      type: "sceneHeading",
      text: "INT. HARBOUR OFFICE - CONTINUOUS",
      pageBreakBefore: true,
    },
    { type: "general", text: "A sign on the wall: “No boats after dark.”" },
    { type: "action", text: "TIDE TABLE\nHigh water 05:52\nLow water 12:07" },
    { type: "action", text: "THE END", centred: true },
  ],
};

// A seeded generator keeps the script the same on every run.
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
 * An original feature script in the usual proportions of scenes, action and
 * speeches, without forced page breaks. 150 scenes come to about 122 pages.
 */
export function featureScript(scenes: number): Element[] {
  const next = random(120);
  const pick = <T>(items: readonly T[]) => items[Math.floor(next() * items.length)] as T;
  const words =
    "the lamp harbour keeper glass night wall boat tide stair window rope salt bell light cold dark water old long slow".split(
      " ",
    );
  const sentence = () => {
    const text = Array.from({ length: 4 + Math.floor(next() * 12) }, () => pick(words)).join(" ");
    return `${text[0]?.toUpperCase()}${text.slice(1)}${pick([".", ".", ".", "?", "!"])}`;
  };
  const sentences = (most: number) =>
    Array.from({ length: 1 + Math.floor(next() * most) }, sentence).join(" ");
  const names = ["MAYA", "TOMÁS", "THE KEEPER", "ISLA", "OLD FINN"];
  const script: Element[] = [];
  for (let s = 0; s < scenes; s++) {
    script.push({
      type: "sceneHeading",
      text: `${pick(["INT.", "EXT."])} ${pick(words).toUpperCase()} - ${pick(["DAY", "NIGHT"])}`,
    });
    for (let beat = 0; beat < 4 + Math.floor(next() * 12); beat++) {
      if (next() < 0.4) {
        script.push({ type: "action", text: sentences(5) });
      } else {
        script.push({ type: "character", text: pick(names) });
        if (next() < 0.2) script.push({ type: "parenthetical", text: `(${pick(words)})` });
        script.push({ type: "dialogue", text: sentences(4) });
      }
    }
    if (next() < 0.15) script.push({ type: "transition", text: "CUT TO:" });
  }
  return script;
}
