import { describe, expect, it } from "vitest";
import { readFdx } from "./read.ts";
import { writeFdx } from "./write.ts";

const script = (content: string, extras = "") =>
  `<FinalDraft DocumentType="Script" Version="6"><Content>${content}</Content>${extras}</FinalDraft>`;

const storyArchitect = script(
  '<Paragraph Type="Dialogue"><Text>Fish</Text><Text> </Text><Text>nets</Text></Paragraph>',
  `<TitlePage><Content>
    <Paragraph Type="General" Alignment="Center"><Text>Neap</Text></Paragraph>
    <Paragraph Type="General" Alignment="Center"/>
    <Paragraph Type="General" Alignment="Center"><Text>Ren Moss</Text></Paragraph>
    <Paragraph Type="General" Alignment="Left"><Text>scripts@example.test</Text></Paragraph>
  </Content></TitlePage>`,
);

const finalDraft = `<?xml version="1.0" encoding="UTF-8"?>
${script(
  `
    <Paragraph Type="Scene Heading" Number="7A"><Text>Ext. Pump House - Night</Text></Paragraph>
    <Paragraph Type="Action" Alignment="Center">
      <Text>A 🐟 </Text><Text Style="Bold+Italic" RevisionID="2">slips</Text>
      <ScriptNote ID="1"><Paragraph><Text>Check the tide.</Text></Paragraph><Paragraph><Text>Ask Jo.</Text></Paragraph></ScriptNote>
      <Text Style="Italic+Underline" RevisionID="2"> &amp; dives</Text><Text>\nThen silence.</Text>
    </Paragraph>
    <Paragraph Type="Shot" StartsNewPage="Yes"><Text>Under the pier</Text></Paragraph>
    <Paragraph Type="General"><Text>The north gate</Text></Paragraph>
    <Paragraph>
      <DualDialogue>
        <Paragraph Type="Character"><Text>JO</Text></Paragraph>
        <Paragraph Type="Parenthetical"><Text>(over the radio)</Text></Paragraph>
        <Paragraph Type="Dialogue"><Text>Ready?</Text></Paragraph>
        <Paragraph Type="Character"><Text>REN</Text></Paragraph>
        <Paragraph Type="Dialogue"><Text><![CDATA[Wait <here>.]]></Text></Paragraph>
      </DualDialogue>
    </Paragraph>
    <Paragraph Type="Transition"><Text>Cut to:</Text></Paragraph>
    <Paragraph Type="Outline 1"><Text>High water</Text></Paragraph>
    <Paragraph Type="Action"><Text RevisionID="0">Water rises.</Text></Paragraph>
  `,
  `<TitlePage>
    <HeaderAndFooter><Header><Paragraph><Text>Not a title field</Text></Paragraph></Header></HeaderAndFooter>
    <Content>
      <Paragraph Alignment="Left"/>
      <Paragraph Alignment="Center"><Text Style="Underline+AllCaps">The Glass Tide</Text></Paragraph>
      <Paragraph Alignment="Center"/>
      <Paragraph Alignment="Center"><Text>Screenplay by</Text></Paragraph>
      <Paragraph Alignment="Center"/>
      <Paragraph Alignment="Center"><Text>Jo Vale</Text></Paragraph>
      <Paragraph Alignment="Center"><Text>Ren Moss</Text></Paragraph>
      <Paragraph Alignment="Center"/>
      <Paragraph Alignment="Center"><Text>Based on the short film</Text></Paragraph>
      <Paragraph Alignment="Center"><Text>Neap</Text></Paragraph>
      <Paragraph Alignment="Left"><Text>Vale &amp; Moss</Text></Paragraph>
      <Paragraph Alignment="Full"><Text>scripts@example.test</Text></Paragraph>
      <Paragraph Alignment="Right"><Text>Second Draft</Text></Paragraph>
      <Paragraph Alignment="Right"><Text>27 Nov 2026</Text></Paragraph>
    </Content>
  </TitlePage>
  <Revisions><Revision ID="1" Name="Blue"/><Revision ID="2" Name="Pink"/></Revisions>
  <DeletedText><DeletedTextLocation Offset="55" RevisionID="3"/></DeletedText>
  <UnanchoredScriptNotes><ScriptNote ID="2"><Paragraph><Text>Read aloud.</Text></Paragraph></ScriptNote></UnanchoredScriptNotes>`,
)}`;

describe("Final Draft import", () => {
  it("preserves all eight screenplay types, combined emphasis, explicit layout, and both speakers", () => {
    expect(readFdx(finalDraft).script.elements).toEqual([
      { type: "sceneHeading", text: "Ext. Pump House - Night" },
      {
        type: "action",
        text: "A 🐟 slips & dives\nThen silence.",
        centred: true,
        bold: [[5, 10]],
        italic: [[5, 18]],
        underline: [[10, 18]],
      },
      { type: "shot", text: "Under the pier", pageBreakBefore: true },
      { type: "general", text: "The north gate" },
      { type: "character", text: "JO" },
      { type: "parenthetical", text: "(over the radio)" },
      { type: "dialogue", text: "Ready?" },
      { type: "character", text: "REN", dual: true },
      { type: "dialogue", text: "Wait <here>." },
      { type: "transition", text: "Cut to:" },
      { type: "action", text: "High water" },
      { type: "action", text: "Water rises." },
    ]);
  });

  it("maps conventional title placement to editable fields, excluding headers and footers", () => {
    expect(readFdx(finalDraft).script.titlePage).toEqual({
      title: "The Glass Tide",
      credit: "Screenplay by",
      authors: "Jo Vale\nRen Moss",
      source: "Based on the short film\nNeap",
      contact: "Vale & Moss\nscripts@example.test",
      draftDate: "Second Draft\n27 Nov 2026",
      showDraftDate: true,
    });
  });

  it("recovers external title fields without overriding labels or reading the byline as an author", () => {
    const source = script(
      "",
      `<TitlePage TirHiddenDraftDate="Old date"><Content>
        <Paragraph Alignment="Center"><Text>Old title</Text></Paragraph>
        <Paragraph Alignment="Center"><Text TirTitleField="title">The Glass Tide</Text></Paragraph>
        <Paragraph/>
        <Paragraph Alignment="Center"><Text>Written by</Text></Paragraph>
        <Paragraph Alignment="Center"><Text>Old author</Text></Paragraph>
        <Paragraph Alignment="Center"><Text TirTitleField="authors">Ren Moss</Text></Paragraph>
        <Paragraph/>
        <Paragraph Alignment="Center"><Text>Based on a novel by</Text></Paragraph>
        <Paragraph Alignment="Center"><Text>Jo Vale</Text></Paragraph>
        <Paragraph Alignment="Left"><Text>Old contact</Text></Paragraph>
        <Paragraph Alignment="Left">
          <Text TirTitleField="contact">scripts@example.test</Text><Text>&#9;</Text><Text>New date</Text>
        </Paragraph>
      </Content></TitlePage>`,
    );
    expect(readFdx(source).script.titlePage).toEqual({
      title: "The Glass Tide",
      credit: "Written by",
      authors: "Ren Moss",
      source: "Based on a novel by\nJo Vale",
      contact: "scripts@example.test",
      draftDate: "New date",
      showDraftDate: true,
    });
  });

  it("uses a labelled credit as a boundary even when changes leave no blank rows", () => {
    const source = script(
      "",
      `<TitlePage TirHiddenDraftDate="Private date"><Content>
        <Paragraph Alignment="Center"><Text>Neap</Text></Paragraph>
        <Paragraph Alignment="Center"><Text TirTitleField="credit">A screenplay</Text></Paragraph>
        <Paragraph Alignment="Center"><Text>Jo Vale</Text></Paragraph>
        <Paragraph Alignment="Full"><Text>scripts@example.test</Text></Paragraph>
      </Content></TitlePage>`,
    );
    expect(readFdx(source).script.titlePage).toEqual({
      title: "Neap",
      credit: "A screenplay",
      authors: "Jo Vale",
      source: "",
      contact: "scripts@example.test",
      draftDate: "Private date",
      showDraftDate: false,
    });
  });

  it("reports lost metadata without reporting unused revision sets or dropping revised text", () => {
    expect(readFdx(finalDraft).leftOut).toEqual([
      { kind: "sceneNumber", text: "7A", at: 0 },
      { kind: "revision", text: "Pink", at: 1 },
      { kind: "scriptNote", text: "Check the tide.\nAsk Jo.", at: 1 },
      { kind: "elementType", text: "Outline 1", at: 10 },
      { kind: "revision", text: "Revision 3", at: null },
      { kind: "scriptNote", text: "Read aloud.", at: null },
    ]);
  });

  it("reports notes and revisions on the paragraph wrapping a dual pair and on the title page", () => {
    const source = script(
      `<Paragraph Type="Action"><Text>Two radios crackle.</Text></Paragraph>
      <Paragraph RevisionID="1">
        <DualDialogue>
          <Paragraph Type="Character"><Text>JO</Text></Paragraph>
          <Paragraph Type="Dialogue"><Text>Ready.</Text></Paragraph>
          <Paragraph Type="Character"><Text>REN</Text></Paragraph>
          <Paragraph Type="Dialogue"><Text>Go.</Text></Paragraph>
        </DualDialogue>
        <ScriptNote><Paragraph><Text>Read this together.</Text></Paragraph></ScriptNote>
      </Paragraph>`,
      `<TitlePage><Content>
        <Paragraph Alignment="Center" RevisionID="2"><Text>The Glass Tide</Text></Paragraph>
      </Content></TitlePage>
      <Revisions>
        <Revision ID="1" Name="Blue"/>
        <Revision ID="2" Name="Pink"/>
        <Revision ID="3" Name="Yellow" FullRevision="Yes"/>
      </Revisions>`,
    );
    expect(readFdx(source).leftOut).toEqual([
      { kind: "revision", text: "Blue", at: 1 },
      { kind: "scriptNote", text: "Read this together.", at: 1 },
      { kind: "revision", text: "Pink", at: null },
      { kind: "revision", text: "Yellow", at: null },
    ]);
  });

  it("reads a Story Architect-style title page without inventing a credit or date", () => {
    expect(readFdx(storyArchitect)).toEqual({
      script: {
        titlePage: {
          title: "Neap",
          credit: "",
          authors: "Ren Moss",
          source: "",
          contact: "scripts@example.test",
          draftDate: "",
          showDraftDate: false,
        },
        elements: [{ type: "dialogue", text: "Fish nets" }],
      },
      leftOut: [],
    });
  });

  it.each([
    ["a Final Draft script", finalDraft],
    ["a Story Architect script", storyArchitect],
  ])("exports and reimports everything Tir kept from %s", (_name, source) => {
    const { script } = readFdx(source);
    expect(readFdx(writeFdx(script))).toEqual({ script, leftOut: [] });
  });

  it("refuses an XML fixture with an external entity declaration", () => {
    const doctype = '<!DOCTYPE FinalDraft [<!ENTITY attachment SYSTEM "file:///not-a-script">]>';
    expect(() =>
      readFdx(doctype + script('<Paragraph Type="Action"><Text>&attachment;</Text></Paragraph>')),
    ).toThrow(/DOCTYPE/);
  });

  it.each([
    ["not an FDX root", "<Other><Content/></Other>"],
    [
      "no screenplay content",
      '<FinalDraft DocumentType="Script"><TitlePage><Content/></TitlePage></FinalDraft>',
    ],
    ["truncated XML", '<FinalDraft DocumentType="Script"><Content>'],
    ["unbound entity", script('<Paragraph Type="Action"><Text>&missing;</Text></Paragraph>')],
  ])("refuses %s", (_reason, source) => {
    expect(() => readFdx(source)).toThrow(/Final Draft/);
  });

  it("refuses an oversized source and excessive XML nesting", () => {
    expect(() => readFdx(script(`<!--${" ".repeat(8 * 1024 * 1024)}-->`))).toThrow(/too large/);
    expect(() => readFdx(script(`${"<Ignored>".repeat(70)}${"</Ignored>".repeat(70)}`))).toThrow(
      /nested/,
    );
  });

  it("refuses compact files that expand into too many script elements or report rows", () => {
    expect(() => readFdx(script('<Paragraph Type="Action"/>'.repeat(50_001)))).toThrow(
      /too many screenplay records/,
    );
    const notes = `<UnanchoredScriptNotes>${"<ScriptNote/>".repeat(5_001)}</UnanchoredScriptNotes>`;
    expect(() => readFdx(script("", notes))).toThrow(/too many omissions/);
  });
});
