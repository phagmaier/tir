// Original test scripts, written for Tir's tests. Other people's scripts
// never enter version control (AGENTS.md).
import type { Script } from "../model.ts";

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
