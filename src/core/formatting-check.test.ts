import { describe, expect, it } from "vitest";
import { checkFormatting } from "./formatting-check.ts";
import type { Element, ElementType } from "./model.ts";

const element = (type: ElementType, text: string, attrs: Partial<Element> = {}): Element => ({
  type,
  text,
  ...attrs,
});
const action = (text: string) => element("action", text);
const cue = (text: string) => element("character", text);
const dialogue = (text: string) => element("dialogue", text);
const heading = (text: string) => element("sceneHeading", text);
const paren = (text: string) => element("parenthetical", text);
const findings = (...elements: Element[]) =>
  checkFormatting(elements).map(({ kind, index }) => `${kind}:${index}`);

describe("formatting check", () => {
  it("looks through parentheticals and empty dialogue for spoken text, but not past the next cue or action", () => {
    expect(
      findings(
        cue("AVA"),
        paren("(under her breath)"),
        dialogue(" "),
        cue("BEN"),
        paren("(louder)"),
        dialogue("I heard that."),
        paren("(to the room)"),
        dialogue("We should go."),
        cue("DEV"),
        action("Dev puts down the phone."),
        dialogue("Wait."),
        cue("KIT"),
      ),
    ).toEqual([
      "cueWithoutDialogue:0",
      "emptyElement:2",
      "cueWithoutDialogue:8",
      "speechWithoutCue:10",
      "cueWithoutDialogue:11",
    ]);
  });

  it("flags each orphaned speech element; a blank cue cannot make a speaker", () => {
    expect(
      findings(paren("(into the phone)"), dialogue("Hello?"), cue(""), dialogue("Are you there?")),
    ).toEqual(["speechWithoutCue:0", "speechWithoutCue:1", "emptyElement:2", "speechWithoutCue:3"]);
  });

  it("accepts a second dialogue beside the first and a speech with a forced page break", () => {
    expect(
      findings(
        cue("AVA"),
        dialogue("Now!"),
        element("character", "BEN", { dual: true }),
        dialogue("Not yet."),
        cue("DEV"),
        element("dialogue", "Quiet.", { pageBreakBefore: true }),
      ),
    ).toEqual([]);
  });

  it.each(["int.", "Ext.", "INT./EXT.", "I/E.", "est."])(
    "accepts the heading prefix %s",
    (prefix) => {
      expect(findings(heading(`${prefix} HALL - DAY`), action("A door opens."))).toEqual([]);
    },
  );

  it.each(["HALL - DAY", "INT HALL - DAY", "INT./EXT HALL - DAY", "INTERNATIONAL - DAY"])(
    "flags a heading with the wrong prefix: %s",
    (text) => {
      expect(findings(heading(text), action("A door opens."))).toEqual(["headingPrefix:0"]);
    },
  );

  it("flags blank elements including automatic parentheses, but not a new blank draft", () => {
    expect(findings(action(""))).toEqual([]);
    expect(
      findings(
        cue("AVA"),
        paren("(  )"),
        dialogue("Come in."),
        action(" \t\n"),
        action("(The door opens.)"),
      ),
    ).toEqual(["emptyElement:1", "emptyElement:3"]);
  });

  it("flags scenes with no content before the next heading or the end", () => {
    expect(
      findings(
        heading("EXT. YARD - DAY"),
        action(""),
        heading("INT. HALL - DAY"),
        element("shot", "WIDE ON THE HALL"),
        heading("INT. CELLAR - DAY"),
      ),
    ).toEqual(["emptyScene:0", "emptyElement:1", "emptyScene:4"]);
  });

  it.each<[string, string]>([
    ["JHON", "JOHN"],
    ["JOHNN", "JOHN"],
    ["JOHN", "JOHNN"],
    ["JAHN", "JOHN"],
  ])("flags a one-off typo in a repeated name: %s beside %s", (typo, name) => {
    expect(
      checkFormatting([
        cue(`${name.toLowerCase()} (V.O.)`),
        dialogue("First."),
        cue(`${name} (CONT’D)`),
        dialogue("Second."),
        cue(`${typo} (O.S.)`),
        dialogue("Third."),
      ]),
    ).toEqual([{ kind: "nearDuplicateName", index: 4, name: typo, suggested: name }]);
  });

  it("does not guess between established names, numbered roles, or equally plausible matches", () => {
    const names = [
      "MARA",
      "MARA",
      "MAYA",
      "MAYA",
      "MARIA",
      "MARIA",
      "GUARD 1",
      "GUARD 1",
      "GUARD 2",
      "MARA (O.S.)",
      "MALA",
    ];
    expect(findings(...names.flatMap((name) => [cue(name), dialogue("Here.")]))).toEqual([]);
  });
});
