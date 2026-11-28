import {
  ELEMENT_FORMATS,
  LINES_PER_INCH,
  NEXT_ON_RETURN,
  NEXT_ON_TAB,
  PAGE,
  PAGINATION,
  TITLE_PAGE,
} from "../format.ts";
import { type Element, type Script, STYLES, type TitlePage } from "../model.ts";
import {
  DIALOGUE_BREAKS,
  FONT,
  MARGINS,
  PAGE_SIZE,
  paragraphSpec,
  SCENE_BREAKS,
  STYLE_NAMES,
  type TitleField,
  TYPE_NAMES,
} from "./format.ts";

const XML_ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
  "\r": "&#13;",
  "\n": "&#10;",
  "\t": "&#9;",
};

function escapeXml(text: string): string {
  if (/[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u.test(text)) {
    throw new Error("The draft contains a character Final Draft XML cannot represent.");
  }
  // Character references keep CR in text and keep all three kinds of
  // whitespace from being normalised when the value is in an attribute.
  return text.replace(/[&<>"'\r\n\t]/g, (character) => XML_ENTITIES[character] as string);
}

function attributes(values: Readonly<Record<string, string>>): string {
  return Object.entries(values)
    .map(([name, value]) => `${name}="${escapeXml(value)}"`)
    .join(" ");
}

const TYPE_ORDER = [
  "general",
  "sceneHeading",
  "action",
  "character",
  "parenthetical",
  "dialogue",
  "transition",
  "shot",
] as const;

const FONT_ATTRIBUTES = attributes(FONT);
const SINGLE_SPACED = 'Leading="Regular" Spacing="1" StartsNewPage="No"';
const elementSettings = TYPE_ORDER.map((type, shortcut) => {
  const tab = NEXT_ON_TAB[type];
  return `  <ElementSettings Type="${TYPE_NAMES[type]}">
    <FontSpec ${FONT_ATTRIBUTES} Style="${ELEMENT_FORMATS[type].capitals ? "AllCaps" : ""}"/>
    <ParagraphSpec ${attributes(paragraphSpec(type))} StartsNewPage="No"/>
    <Behavior PaginateAs="${TYPE_NAMES[type === "shot" ? "sceneHeading" : type]}" ReturnKey="${TYPE_NAMES[NEXT_ON_RETURN[type]]}"${tab ? ` TabKey="${TYPE_NAMES[tab]}"` : ""} Shortcut="${shortcut}" WinShortcut="${shortcut}"/>
  </ElementSettings>`;
}).join("\n");

const pageLayout = `  <PageLayout ${attributes(MARGINS)} DocumentLeading="Normal" BreakDialogueAndActionAtSentences="Yes" UsesSmartQuotes="Yes">
    <PageSize ${attributes(PAGE_SIZE)}/>
  </PageLayout>`;

const pageHeader = `  <HeaderAndFooter HeaderVisible="Yes" HeaderFirstPage="No" FooterVisible="No" FooterFirstPage="No" StartingPage="1">
    <Header>
      <Paragraph Alignment="Left" FirstIndent="0.00" LeftIndent="1.25" RightIndent="-1.00" SpaceBefore="0" ${SINGLE_SPACED}><Text>&#9;</Text><Text>&#9;</Text><DynamicLabel Type="Page #" ${FONT_ATTRIBUTES}/><Text>${PAGINATION.numberSuffix}</Text><Tabstops><Tabstop Position="4.50" Type="Center"/><Tabstop Position="7.25" Type="Right"/></Tabstops></Paragraph>
    </Header>
    <Footer/>
  </HeaderAndFooter>`;
const continueds = `  <MoresAndContinueds>
    <FontSpec ${FONT_ATTRIBUTES} Style=""/>
    <DialogueBreaks ${attributes(DIALOGUE_BREAKS)}/>
    <SceneBreaks ${attributes(SCENE_BREAKS)}/>
  </MoresAndContinueds>`;

function textRun(text: string, style = "", field?: TitleField): string {
  return `<Text${style ? ` Style="${style}"` : ""}${field ? ` TirTitleField="${field}"` : ""}>${escapeXml(text)}</Text>`;
}

function elementRuns(element: Element): string {
  const { text } = element;
  if (!element.bold?.length && !element.italic?.length && !element.underline?.length) {
    return textRun(text);
  }

  // The model gives each style as a sorted list of disjoint spans. Walk
  // their endpoints together, cutting the text only where a style changes.
  const indices = [0, 0, 0];
  let runs = "";
  for (let start = 0; start < text.length; ) {
    let end = text.length;
    let style = "";
    for (const [i, mark] of STYLES.entries()) {
      const spans = element[mark];
      let at = indices[i] as number;
      if (spans?.[at]?.[1] === start) indices[i] = ++at;
      const span = spans?.[at];
      if (!span) continue;
      if (span[0] <= start) {
        style += (style ? "+" : "") + STYLE_NAMES[mark];
        end = Math.min(end, span[1]);
      } else {
        end = Math.min(end, span[0]);
      }
    }
    if (style && ELEMENT_FORMATS[element.type].capitals) style += "+AllCaps";
    runs += textRun(text.slice(start, end), style);
    start = end;
  }
  return runs;
}

const NEW_PAGE = ' StartsNewPage="Yes"';

function paragraph(
  element: Element,
  pageBreak = !!element.pageBreakBefore,
  danglingDual = !!element.dual,
): string {
  const alignment = element.centred ? ' Alignment="Center"' : "";
  const dual = danglingDual ? ' TirDual="Yes"' : "";
  return `<Paragraph Type="${TYPE_NAMES[element.type]}"${alignment}${pageBreak ? NEW_PAGE : ""}${dual}>${elementRuns(element)}</Paragraph>`;
}

function speechEnd(elements: readonly Element[], cue: number): number {
  let end = cue + 1;
  while (end < elements.length) {
    const next = elements[end];
    if (next?.pageBreakBefore || (next?.type !== "parenthetical" && next?.type !== "dialogue"))
      break;
    end++;
  }
  return end;
}

function writeContent(elements: readonly Element[]): string {
  const lines = ["  <Content>"];
  for (let i = 0; i < elements.length; ) {
    const element = elements[i] as Element;
    if (element.type === "character") {
      const right = speechEnd(elements, i);
      const next = elements[right];
      if (next?.type === "character" && next.dual && !next.pageBreakBefore) {
        const end = speechEnd(elements, right);
        lines.push(`    <Paragraph${element.pageBreakBefore ? NEW_PAGE : ""}><DualDialogue>`);
        for (; i < end; i++) {
          const speech = elements[i] as Element;
          // A dangling mark on the left cue is not implied by the wrapper.
          lines.push(`      ${paragraph(speech, false, i < right && !!speech.dual)}`);
        }
        lines.push("    </DualDialogue></Paragraph>");
        continue;
      }
      for (; i < right; i++) lines.push(`    ${paragraph(elements[i] as Element)}`);
    } else {
      lines.push(`    ${paragraph(element)}`);
      i++;
    }
  }
  lines.push("  </Content>");
  return lines.join("\n");
}

const TITLE_RIGHT = (PAGE.widthIn - PAGE.rightMarginIn).toFixed(2);
function titleRow(alignment: string, runs = ""): string {
  return `      <Paragraph Alignment="${alignment}" FirstIndent="0.00" LeftIndent="${PAGE.leftMarginIn.toFixed(2)}" RightIndent="${TITLE_RIGHT}" SpaceBefore="0" ${SINGLE_SPACED}>${runs || textRun("")}</Paragraph>`;
}
const BLANK_ROW = titleRow("Left");
const TITLE_TOP_ROWS = (TITLE_PAGE.centreTopIn - PAGE.topMarginIn) * LINES_PER_INCH;

function writeTitlePage(page: TitlePage): string {
  const hiddenDate = !page.showDraftDate && page.draftDate;
  const lines = [
    `  <TitlePage${hiddenDate ? ` TirHiddenDraftDate="${escapeXml(hiddenDate)}"` : ""}>`,
    '    <HeaderAndFooter HeaderVisible="No" FooterVisible="No"/>',
    "    <Content>",
  ];
  const rows: string[] = Array(TITLE_TOP_ROWS).fill(BLANK_ROW);
  for (const field of ["title", "credit", "authors", "source"] as const) {
    if (field !== "title") {
      if (!page[field]) continue;
      rows.push(BLANK_ROW);
    }
    for (const line of page[field].split("\n")) {
      rows.push(titleRow("Center", textRun(line, field === "title" ? "AllCaps" : "", field)));
    }
  }

  const contact = page.contact ? page.contact.split("\n") : [];
  const date = page.showDraftDate ? page.draftDate.split("\n") : [];
  const bottomRows = Math.max(contact.length, date.length);
  if (bottomRows) {
    while (rows.length < PAGINATION.linesPerPage - bottomRows) rows.push(BLANK_ROW);
    for (let row = -bottomRows; row < 0; row++) {
      const left = contact.at(row);
      const right = date.at(row);
      if (left === undefined) rows.push(titleRow("Right", textRun(right ?? "", "", "draftDate")));
      else if (right === undefined) rows.push(titleRow("Left", textRun(left, "", "contact")));
      else {
        const tabStop = `<Tabstops><Tabstop Position="${TITLE_RIGHT}" Type="Right"/></Tabstops>`;
        rows.push(
          titleRow(
            "Left",
            `${textRun(left, "", "contact")}<Text>&#9;</Text>${textRun(right, "", "draftDate")}${tabStop}`,
          ),
        );
      }
    }
  }
  return [...lines, ...rows, "    </Content>", "  </TitlePage>"].join("\n");
}

/** Writes UTF-8 Final Draft XML; the receiving app lays out the live elements. */
export function writeFdx(script: Script): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<FinalDraft DocumentType="Script" Template="No" Version="6">',
    writeContent(script.elements),
    pageHeader,
    pageLayout,
    elementSettings,
    writeTitlePage(script.titlePage),
    continueds,
    "</FinalDraft>\n",
  ].join("\n");
}
