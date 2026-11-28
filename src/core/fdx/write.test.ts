import { SaxesParser } from "saxes";
import { describe, expect, it } from "vitest";
import { everyFormat } from "../fixtures/scripts.ts";
import { newTitlePage, type Script } from "../model.ts";
import { readFdx } from "./read.ts";
import { writeFdx } from "./write.ts";

interface Tag {
  readonly path: string;
  readonly attrs: Readonly<Record<string, string>>;
  text: string;
}

// Inspect the XML a receiving app sees, independently of Tir's reader.
function tagsOf(script: Script): Tag[] {
  const tags: Tag[] = [];
  const stack: Tag[] = [];
  const parser = new SaxesParser();
  parser.on("opentag", ({ name, attributes }) => {
    const tag = { path: `${stack.at(-1)?.path ?? ""}/${name}`, attrs: attributes, text: "" };
    tags.push(tag);
    stack.push(tag);
  });
  parser.on("closetag", () => stack.pop());
  parser.on("text", (text) => {
    const tag = stack.at(-1);
    if (tag) tag.text += text;
  });
  parser.write(writeFdx(script)).close();
  return tags;
}

const empty = { titlePage: newTitlePage(), elements: [] };

describe("Final Draft export", () => {
  it.each([
    ["every element type and flag", everyFormat],
    ["an empty draft with its default credit", empty],
    [
      "a literal title and hidden draft date",
      {
        titlePage: {
          title: 'The "Neap" <&> 🐟\n',
          credit: " A screenplay\n\nby <two> writers ",
          authors: 'Jo & "Ren"',
          source: "from a <story> of Jo's",
          contact: "Line one & two\n\nSecond\tline <here>",
          draftDate: '"Private" <&>\r\n\tSecond',
          showDraftDate: false,
        },
        elements: [{ type: "action", text: '  🐟&<tag>]]>\r\n\t"fish"  ' }],
      },
    ],
    [
      "consecutive speeches, a forced break and an unfinished pair",
      {
        titlePage: { ...newTitlePage(), showDraftDate: true },
        elements: [
          { type: "character", text: "JO", pageBreakBefore: true },
          { type: "dialogue", text: "Ready." },
          { type: "character", text: "REN", dual: true },
          { type: "parenthetical", text: "(listening)" },
          { type: "dialogue", text: "Now?" },
          { type: "dialogue", text: "Wait.", pageBreakBefore: true },
          { type: "character", text: "JO", dual: true },
          { type: "dialogue", text: "Too late." },
        ],
      },
    ],
  ] as const)("round-trips %s exactly", (_name, script) => {
    expect(readFdx(writeFdx(script))).toEqual({ script, leftOut: [] });
  });

  it("writes the eight native element specifications from the Final Draft defaults", () => {
    const tags = tagsOf(empty);
    const settings = tags.filter(({ path }) => path === "/FinalDraft/ElementSettings");
    const specs = (name: string) =>
      tags.filter(({ path }) => path.endsWith(`/ElementSettings/${name}`));
    const fonts = specs("FontSpec");
    const paragraphs = specs("ParagraphSpec");
    const behaviors = specs("Behavior");
    expect(
      settings.map(({ attrs: { Type } }, i) => {
        const p = paragraphs[i]?.attrs ?? {};
        const b = behaviors[i]?.attrs ?? {};
        return [
          Type,
          p.LeftIndent,
          p.RightIndent,
          p.FirstIndent,
          p.SpaceBefore,
          p.Alignment,
          fonts[i]?.attrs.Style,
          b.ReturnKey,
          b.TabKey ?? "",
          b.Shortcut,
        ];
      }),
    ).toEqual([
      ["General", "1.50", "7.50", "0.00", "0", "Left", "", "General", "", "0"],
      ["Scene Heading", "1.50", "7.50", "0.00", "24", "Left", "AllCaps", "Action", "Action", "1"],
      ["Action", "1.50", "7.50", "0.00", "12", "Left", "", "Action", "Character", "2"],
      ["Character", "3.50", "7.25", "0.00", "12", "Left", "AllCaps", "Dialogue", "Transition", "3"],
      ["Parenthetical", "3.00", "5.50", "-0.10", "0", "Left", "", "Dialogue", "Dialogue", "4"],
      ["Dialogue", "2.50", "6.00", "0.00", "0", "Left", "", "Action", "Parenthetical", "5"],
      [
        "Transition",
        "5.50",
        "7.10",
        "0.00",
        "12",
        "Right",
        "AllCaps",
        "Scene Heading",
        "Scene Heading",
        "6",
      ],
      ["Shot", "1.50", "7.50", "0.00", "24", "Left", "AllCaps", "Action", "", "7"],
    ]);
    expect(fonts.map(({ attrs: { Font, Size } }) => [Font, Size])).toEqual(
      Array.from({ length: 8 }, () => ["Courier Final Draft", "12"]),
    );
    expect(behaviors.at(-1)?.attrs.PaginateAs).toBe("Scene Heading");
  });

  it("uses Letter, omits the first page number and enables dialogue continueds only", () => {
    const tags = tagsOf(empty);
    const attrs = (path: string) => tags.find((tag) => tag.path === `/FinalDraft/${path}`)?.attrs;
    expect(attrs("PageLayout")).toMatchObject({
      TopMargin: "72",
      BottomMargin: "72",
      HeaderMargin: "36",
      FooterMargin: "36",
      BreakDialogueAndActionAtSentences: "Yes",
      UsesSmartQuotes: "Yes",
    });
    expect(attrs("PageLayout/PageSize")).toEqual({ Width: "8.50", Height: "11.00" });
    expect(attrs("HeaderAndFooter")).toMatchObject({
      HeaderFirstPage: "No",
      HeaderVisible: "Yes",
      StartingPage: "1",
    });
    expect(attrs("HeaderAndFooter/Header/Paragraph/DynamicLabel")?.Type).toBe("Page #");
    expect(attrs("TitlePage/HeaderAndFooter")?.HeaderVisible).toBe("No");
    expect(attrs("MoresAndContinueds/DialogueBreaks")).toMatchObject({
      AutomaticCharacterContinueds: "Yes",
      BottomOfPage: "Yes",
      TopOfNext: "Yes",
      DialogueBottom: "(MORE)",
      DialogueTop: "(CONT'D)",
    });
    expect(attrs("MoresAndContinueds/SceneBreaks")).toMatchObject({
      SceneBottomOfPage: "No",
      SceneTopOfNext: "No",
    });
  });

  it("places both speakers in one native dual-dialogue block and keeps the date off the printed title page", () => {
    const tags = tagsOf({
      ...everyFormat,
      titlePage: { ...everyFormat.titlePage, showDraftDate: false },
    });
    const dual = "/FinalDraft/Content/Paragraph/DualDialogue/Paragraph";
    expect(tags.filter(({ path }) => path === dual).map(({ attrs }) => attrs.Type)).toEqual([
      "Character",
      "Parenthetical",
      "Dialogue",
      "Character",
      "Dialogue",
    ]);
    const title = "/FinalDraft/TitlePage/Content/Paragraph";
    const rows = tags.filter(({ path }) => path === title);
    const runs = tags.filter(({ path }) => path === `${title}/Text`);
    expect(rows[15]?.attrs.Alignment).toBe("Center");
    expect(runs[15]).toMatchObject({ text: "Salt Line", attrs: { Style: "AllCaps" } });
    expect(rows[53]?.attrs.Alignment).toBe("Left");
    expect(runs[53]?.text).toBe("mara@example.com");
    expect(runs.map(({ text }) => text)).not.toContain("Second draft");
  });

  it("refuses text that cannot be represented in XML 1.0 instead of making an unreadable file", () => {
    expect(() =>
      writeFdx({ ...empty, elements: [{ type: "action", text: "abc\u0000def" }] }),
    ).toThrow(/cannot represent/);
  });
});
