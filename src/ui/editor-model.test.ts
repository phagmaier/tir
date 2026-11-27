import { expect, test } from "vitest";
import { everyFormat, featureScript } from "../core/fixtures/scripts.ts";
import type { Element } from "../core/model.ts";
import { fromDocument, toDocument } from "./editor-model.ts";

test("round-trips element attributes, overlapping styles and exact UTF-16 text", () => {
  const elements: Element[] = [
    { type: "sceneHeading", text: "Int. Station", pageBreakBefore: true },
    {
      type: "action",
      text: "À 🚉  platform.\nStill here.",
      centred: true,
      bold: [[2, 14]],
      italic: [[4, 20]],
      underline: [[15, 26]],
    },
    { type: "character", text: "MARA", dual: true },
    { type: "dialogue", text: "" },
  ];
  expect(fromDocument(toDocument(elements))).toEqual(elements);
});

test("round-trips every element type and format, and a feature-length script", () => {
  expect(fromDocument(toDocument(everyFormat.elements))).toEqual(everyFormat.elements);
  const feature = featureScript(150);
  expect(fromDocument(toDocument(feature))).toEqual(feature);
});

test("gives an empty script one empty action to type in", () => {
  expect(fromDocument(toDocument([]))).toEqual([{ type: "action", text: "" }]);
});
