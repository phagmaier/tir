import { describe, expect, it } from "vitest";
import { readFdx } from "./fdx/read.ts";
import { readFountain } from "./fountain/read.ts";
import { leftOutPages, type ScriptRead } from "./import-report.ts";
import { paginate } from "./paginate.ts";

// At four lines a page, "Rain." takes the first and the action splits after
// "cold." (paginate.test.ts): two lines on page 1, the rest on page 2.
const fountain =
  "Rain.\n\nThe keeper climbs the spiral stair. [[early]] At the top the lamp room is dark and cold. The glass is cracked across and the wind comes through it like a voice. [[late]]";
const fdx = `<FinalDraft DocumentType="Script"><Content>
  <Paragraph Type="Action"><Text>Rain.</Text></Paragraph>
  <Paragraph Type="Action">
    <Text>The keeper climbs the spiral stair.</Text><ScriptNote><Paragraph><Text>early</Text></Paragraph></ScriptNote><Text> At the top the lamp room is dark and cold. The glass is cracked across and the wind comes through it like a voice.</Text><ScriptNote><Paragraph><Text>late</Text></Paragraph></ScriptNote>
  </Paragraph>
</Content><UnanchoredScriptNotes><ScriptNote><Paragraph><Text>anywhere</Text></Paragraph></ScriptNote></UnanchoredScriptNotes></FinalDraft>`;

describe("import report pages", () => {
  it.each<[string, ScriptRead, [string, number | null][]]>([
    [
      "Fountain",
      readFountain(fountain),
      [
        ["early", 1],
        ["late", 2],
      ],
    ],
    [
      "Final Draft",
      readFdx(fdx),
      [
        ["early", 1],
        ["late", 2],
        ["anywhere", null],
      ],
    ],
  ])(
    "give a %s note late in an element that runs onto the next page that page",
    (_, read, expected) => {
      const pages = paginate(read.script.elements, { linesPerPage: 4 });
      expect(pages.map((page) => page.lines.some((line) => line.element === 1))).toEqual([
        true,
        true,
      ]);
      const pageOf = leftOutPages(pages);
      expect(read.leftOut.map((item) => [item.text, pageOf(item)])).toEqual(expected);
    },
  );
});
