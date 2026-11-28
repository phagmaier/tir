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
      // Both sit inside "A 🐟 slips & dives": the revised run, then the note after it.
      { kind: "revision", text: "Pink", at: 1, offset: 5 },
      { kind: "scriptNote", text: "Check the tide.\nAsk Jo.", at: 1, offset: 10 },
      { kind: "elementType", text: "Outline 1", at: 10 },
      { kind: "formatting", text: "title page underline", at: null },
      { kind: "revision", text: "Revision 3", at: null },
      { kind: "scriptNote", text: "Read aloud.", at: null },
    ]);
  });

  describe("a title page without Tir's labels", () => {
    const page = (...rows: string[]) =>
      readFdx(
        script(
          "",
          `<TitlePage><Content>${rows
            .map((row) =>
              row
                ? `<Paragraph Alignment="Center"><Text>${row}</Text></Paragraph>`
                : '<Paragraph Alignment="Center"/>',
            )
            .join("")}</Content></TitlePage>`,
        ),
      ).script.titlePage;

    it("keeps a title and names ending in “by” out of the credit", () => {
      expect(
        page(
          "The Man Who",
          "Stood By",
          "",
          "Written by",
          "",
          "Jo Vale",
          "Ren By",
          "",
          "Story by",
          "Kit Moss",
          "",
          "Based on the song by",
          "Ash Lee",
        ),
      ).toMatchObject({
        title: "The Man Who\nStood By",
        credit: "Written by",
        // A second credit stays in printed order among the authors.
        authors: "Jo Vale\nRen By\nStory by\nKit Moss",
        source: "Based on the song by\nAsh Lee",
      });
    });

    it.each([
      [["Stand By", "Written by", "Jo Vale"], "Stand By", "Written by", "Jo Vale"],
      [["Passing By", "", "Jo By"], "Passing By", "", "Jo By"],
      [
        ["Neap", "", "An original screenplay by", "", "Jo Vale"],
        "Neap",
        "An original screenplay by",
        "Jo Vale",
      ],
    ])("reads %j as its title, credit and authors", (rows, title, credit, authors) => {
      expect(page(...rows)).toMatchObject({ title, credit, authors });
    });
  });

  it("discloses each kind of layout and formatting Tir does not keep, once, where it first appears", () => {
    const source = script(
      `<Paragraph Type="Scene Heading"><Text>INT. PUMP HOUSE - NIGHT</Text></Paragraph>
      <Paragraph Type="Shot"><Text>The gauge</Text></Paragraph>
      <Paragraph Type="Action" Alignment="Right"><Text>Water rises.</Text></Paragraph>
      <Paragraph Type="Action" Alignment="Center" LeftIndent="1.50"><Text Style="Bold+Italic">Kept.</Text></Paragraph>
      <Paragraph Type="Action" LeftIndent="2.00">
        <Text>Jo </Text><Text Font="Arial" Size="14" Color="#FFFF00000000" Style="Strikeout">wades</Text><Text Style="Strikeout"> in.</Text>
      </Paragraph>
      <Paragraph Type="Character"><Text Style="AllCaps">JO</Text></Paragraph>
      <Paragraph Type="Transition" Alignment="Right"><Text>CUT TO:</Text></Paragraph>`,
      `<ElementSettings Type="Scene Heading"><FontSpec Style="Bold+AllCaps"/></ElementSettings>
      <ElementSettings Type="Shot">
        <FontSpec Background="#8270FFFF04E0" Style="AllCaps"/><ParagraphSpec Alignment="Right"/>
      </ElementSettings>
      <PageLayout TopMargin="90" BottomMargin="72" HeaderMargin="36" FooterMargin="36" DocumentLeading="Tight" BreakDialogueAndActionAtSentences="No">
        <PageSize Width="8.27" Height="11.69"/>
      </PageLayout>
      <MoresAndContinueds><DialogueBreaks DialogueTop="(cont'd)"/></MoresAndContinueds>
      <HeaderAndFooter><Header><Paragraph><Text>Neap</Text><DynamicLabel Type="Page #"/></Paragraph></Header></HeaderAndFooter>`,
    );
    expect(readFdx(source).leftOut).toEqual([
      { kind: "formatting", text: "bold", at: 0 },
      { kind: "layout", text: "Shot alignment", at: 1 },
      { kind: "formatting", text: "highlighting", at: 1 },
      { kind: "layout", text: "Action alignment", at: 2 },
      { kind: "layout", text: "Action indents", at: 4 },
      { kind: "formatting", text: "font Arial", at: 4, offset: 3 },
      { kind: "formatting", text: "14 pt type", at: 4, offset: 3 },
      { kind: "formatting", text: "coloured text", at: 4, offset: 3 },
      { kind: "formatting", text: "strikeout", at: 4, offset: 3 },
      { kind: "layout", text: "page size", at: null },
      { kind: "layout", text: "page margins", at: null },
      { kind: "layout", text: "line spacing", at: null },
      { kind: "layout", text: "page breaks within sentences", at: null },
      { kind: "layout", text: "mores and continueds", at: null },
      { kind: "layout", text: "header and footer", at: null },
    ]);
  });

  it("discloses nothing for Final Draft's defaults written out in full", () => {
    const run =
      'AdornmentStyle="0" Background="#FFFFFFFFFFFF" Color="#000000000000" Font="Courier Final Draft" Size="12"';
    const spec = (type: string, left: string, right: string, before: string, extra = "") =>
      `<ElementSettings Type="${type}"><FontSpec ${run} Style="${extra}"/><ParagraphSpec Alignment="${type === "Transition" ? "Right" : "Left"}" FirstIndent="${type === "Parenthetical" ? "-0.10" : "0.00"}" Leading="Regular" LeftIndent="${left}" RightIndent="${right}" SpaceBefore="${before}" Spacing="1" StartsNewPage="No"/></ElementSettings>`;
    const source = script(
      `<Paragraph Type="Scene Heading"><Text ${run} Style="AllCaps">EXT. QUAY - DAWN</Text></Paragraph>
      <Paragraph Type="Action" Alignment="Left" FirstIndent="0.00" Leading="Regular" LeftIndent="1.50" RightIndent="7.50" SpaceBefore="12" Spacing="1" StartsNewPage="Yes"><Text ${run} Style="">The tide is out.</Text></Paragraph>
      <Paragraph Type="Character"><Text>KIT</Text></Paragraph>
      <Paragraph Type="Parenthetical"><Text>(quietly)</Text></Paragraph>
      <Paragraph Type="Dialogue"><Text ${run} Style="">Late again.</Text></Paragraph>
      <Paragraph Type="Transition"><Text>CUT TO:</Text></Paragraph>
      <Paragraph Type="Shot"><Text>THE BUOY</Text></Paragraph>
      <Paragraph Type="General"><Text>End.</Text></Paragraph>`,
      `${[
        spec("General", "1.50", "7.50", "0"),
        spec("Scene Heading", "1.50", "7.50", "24", "AllCaps"),
        spec("Action", "1.50", "7.50", "12"),
        spec("Character", "3.50", "7.25", "12", "AllCaps"),
        spec("Parenthetical", "3.00", "5.50", "0"),
        spec("Dialogue", "2.50", "6.00", "0"),
        spec("Transition", "5.50", "7.10", "12", "AllCaps"),
        spec("Shot", "1.50", "7.50", "24", "AllCaps"),
      ].join("")}
      <PageLayout BackgroundColor="#FFFFFFFFFFFF" BottomMargin="72" BreakDialogueAndActionAtSentences="Yes" DocumentLeading="Normal" FooterMargin="36" HeaderMargin="36" TopMargin="72" UsesSmartQuotes="Yes">
        <PageSize Height="11.00" Width="8.50"/>
      </PageLayout>
      <MoresAndContinueds>
        <DialogueBreaks AutomaticCharacterContinueds="Yes" BottomOfPage="Yes" DialogueBottom="(MORE)" DialogueTop="(CONT'D)" TopOfNext="Yes"/>
        <SceneBreaks ContinuedNumber="No" SceneBottom="(CONTINUED)" SceneBottomOfPage="No" SceneTop="CONTINUED:" SceneTopOfNext="No"/>
      </MoresAndContinueds>
      <HeaderAndFooter FooterFirstPage="Yes" FooterVisible="No" HeaderFirstPage="No" HeaderVisible="Yes" StartingPage="1">
        <Header><Paragraph><Text ${run}>&#9;</Text><DynamicLabel Type="Collated Revisions"/><Text>&#9;</Text><DynamicLabel Type="Page #"/><Text>.</Text></Paragraph></Header>
        <Footer><Paragraph><Text>Footer not shown</Text></Paragraph></Footer>
      </HeaderAndFooter>
      <TitlePage><Content>
        <Paragraph Alignment="Center"><Text ${run} Style="AllCaps">Neap</Text></Paragraph>
        <Paragraph Alignment="Center"/>
        <Paragraph Alignment="Center"><Text ${run} Style="">Written by</Text></Paragraph>
        <Paragraph Alignment="Center"><Text ${run} Style="">Kit Moss</Text></Paragraph>
      </Content></TitlePage>`,
    );
    expect(readFdx(source).leftOut).toEqual([]);
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
