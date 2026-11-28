import { SaxesParser } from "saxes";
import { ELEMENT_FORMATS } from "../format.ts";
import type { LeftOut, ScriptRead } from "../import-report.ts";
import {
  ELEMENT_TYPES,
  type Element,
  type ElementType,
  type Span,
  STYLES,
  type Style,
  type TitlePage,
} from "../model.ts";
import {
  DIALOGUE_BREAKS,
  FONT,
  MARGINS,
  PAGE_SIZE,
  type ParagraphSetting,
  paragraphSpec,
  SCENE_BREAKS,
  STYLE_NAMES,
  TITLE_FIELDS,
  type TitleField,
  TYPE_NAMES,
} from "./format.ts";

const MAX_LENGTH = 8 * 1024 * 1024; // Code units here; the native picker caps file bytes.
const MAX_DEPTH = 64;
// Short XML tags can fan out into many model elements and style spans. Omissions
// also become individual DOM rows, so their smaller budget is separate.
const MAX_RETAINED_NODES = 50_000;
const MAX_OMISSIONS = 5_000;

const TYPES = new Map(ELEMENT_TYPES.map((type) => [TYPE_NAMES[type], type] as const));

type Attrs = Readonly<Record<string, string>>;

interface Node {
  readonly name: string;
  readonly attrs: Attrs;
  readonly children: Node[];
  text?: string;
}

// Keep only the FDX branches we read. The parser still validates the entire
// document, including settings and other data that cannot become script text.
const CHILDREN: Readonly<Record<string, readonly string[]>> = {
  FinalDraft: [
    "Content",
    "TitlePage",
    "Revisions",
    "DeletedText",
    "UnanchoredScriptNotes",
    "PageLayout",
    "ElementSettings",
    "MoresAndContinueds",
    "HeaderAndFooter",
  ],
  Content: ["Paragraph", "DualDialogue"],
  TitlePage: ["Content"],
  Paragraph: ["Text", "DualDialogue", "ScriptNote", "DynamicLabel"],
  DualDialogue: ["Paragraph"],
  Revisions: ["Revision"],
  DeletedText: ["DeletedTextLocation"],
  UnanchoredScriptNotes: ["ScriptNote"],
  ScriptNote: ["Paragraph"],
  PageLayout: ["PageSize"],
  ElementSettings: ["FontSpec", "ParagraphSpec"],
  MoresAndContinueds: ["DialogueBreaks", "SceneBreaks"],
  HeaderAndFooter: ["Header", "Footer"],
  Header: ["Paragraph"],
  Footer: ["Paragraph"],
};

const first = (node: Node | undefined, name: string) =>
  node?.children.find((child) => child.name === name);

function parse(source: string): Node {
  if (source.length > MAX_LENGTH) throw new Error("The Final Draft file is too large to import.");
  const parser = new SaxesParser();
  const stack: (Node | undefined)[] = [];
  let root: Node | undefined;
  let retainedNodes = 0;
  parser.on("error", (error) => {
    throw new Error(`The Final Draft file contains invalid XML (${error.message}).`);
  });
  // No DTDs, even internal ones. Saxes only reads the built-in and numeric
  // references; it has no file or network resolver.
  parser.on("doctype", () => {
    throw new Error("Tir cannot import a Final Draft file containing a DOCTYPE declaration.");
  });
  parser.on("opentag", ({ name, attributes: attrs }) => {
    const depth = stack.length;
    if (depth >= MAX_DEPTH) throw new Error("The Final Draft file is nested too deeply to import.");
    const parent = stack[depth - 1];
    const children =
      parent && Object.hasOwn(CHILDREN, parent.name) ? CHILDREN[parent.name] : undefined;
    const keep = depth === 0 || children?.includes(name);
    if (keep && ++retainedNodes > MAX_RETAINED_NODES) {
      throw new Error("The Final Draft file contains too many screenplay records to import.");
    }
    const node: Node | undefined = keep ? { name, attrs, children: [] } : undefined;
    if (depth === 0) root = node;
    else if (node) parent?.children.push(node);
    stack.push(node);
  });
  parser.on("closetag", () => stack.pop());
  const text = (value: string) => {
    const node = stack.at(-1);
    if (node?.name === "Text") node.text = (node.text ?? "") + value;
  };
  parser.on("text", text);
  parser.on("cdata", text);
  parser.write(source).close();

  if (root?.name !== "FinalDraft" || (root.attrs.DocumentType ?? "Script") !== "Script") {
    throw new Error("This is not a Final Draft screenplay.");
  }
  return root;
}

function paragraphText(paragraph: Node): string {
  let text = "";
  for (const child of paragraph.children) if (child.name === "Text") text += child.text ?? "";
  return text;
}

function noteText(note: Node): string {
  return note.children.map(paragraphText).join("\n").trim() || note.attrs.Name || "";
}

type Report = (
  kind: LeftOut["kind"],
  text: string,
  at: LeftOut["at"],
  offset?: LeftOut["offset"],
) => void;
type Revision = (id: string | undefined, at: LeftOut["at"], offset?: LeftOut["offset"]) => void;

/** A file's own settings for one element type. */
interface Settings {
  readonly font: Attrs | undefined;
  readonly paragraph: Attrs | undefined;
}

interface Reader {
  readonly report: Report;
  /** Reports layout or formatting where it first appears, and not again. */
  readonly once: Report;
  readonly revision: Revision;
  /** The file's element settings, by Final Draft's type name. */
  readonly settings: ReadonlyMap<string, Settings>;
}

function revisionReporter(root: Node, report: Report): Revision {
  // A normal FDX carries the full list of its default sets. Report only those
  // used on text, on deletions, or expressly applied to the entire draft.
  const sets = new Map<string, string>();
  for (const set of first(root, "Revisions")?.children ?? []) {
    const { ID, Name } = set.attrs;
    if (ID && Name) sets.set(ID, Name);
  }
  const seen = new Set<string>();
  return (id, at, offset) => {
    if (!id || id === "0" || seen.has(id)) return;
    seen.add(id);
    report("revision", sets.get(id) ?? `Revision ${id}`, at, offset);
  };
}

function reportInline(
  child: Node,
  at: LeftOut["at"],
  offset: number | undefined,
  { report, revision }: Reader,
): void {
  if (child.name === "ScriptNote") report("scriptNote", noteText(child), at, offset);
  else if (child.name === "Text") revision(child.attrs.RevisionID, at, offset);
}

function elementSettings(root: Node): Map<string, Settings> {
  const settings = new Map<string, Settings>();
  for (const node of root.children) {
    const { Type } = node.attrs;
    if (node.name !== "ElementSettings" || !Type) continue;
    settings.set(Type, {
      font: first(node, "FontSpec")?.attrs,
      paragraph: first(node, "ParagraphSpec")?.attrs,
    });
  }
  return settings;
}

/** Whether a file's setting differs from Tir's. An absent setting is Tir's. */
function differs(value: string | undefined, tir: string): boolean {
  if (value === undefined) return false;
  const number = Number(value);
  if (value.trim() && Number.isFinite(number) && Number.isFinite(Number(tir))) {
    return Math.abs(number - Number(tir)) > 0.005;
  }
  return value.replaceAll("’", "'") !== tir;
}

const differsFrom = (values: Attrs | undefined, tir: Readonly<Record<string, string>>) =>
  Object.entries(tir).some(([name, value]) => differs(values?.[name], value));

const LAYOUT: readonly (readonly [string, readonly ParagraphSetting[]])[] = [
  ["alignment", ["Alignment"]],
  ["indents", ["FirstIndent", "LeftIndent", "RightIndent"]],
  ["spacing", ["SpaceBefore", "Spacing", "Leading"]],
];

/** The element layout a paragraph asks for that Tir sets its own way. */
function lostLayout(type: ElementType, paragraph: Attrs, settings: Attrs | undefined): string[] {
  const tir = paragraphSpec(type);
  return LAYOUT.filter(([, names]) =>
    names.some(
      (name) =>
        // Tir keeps a paragraph's own centring, but not a template's.
        !(name === "Alignment" && paragraph.Alignment === "Center") &&
        differs(paragraph[name] ?? settings?.[name], tir[name]),
    ),
  ).map(([aspect]) => `${TYPE_NAMES[type]} ${aspect}`);
}

const EMPHASIS: readonly string[] = Object.values(STYLE_NAMES);

/**
 * The type styles a text run shows that Tir does not keep. A run's own
 * attributes replace its element's. Tir keeps a run's own bold, italic and
 * underline where `emphasis` allows, and capitals where `capitals` does.
 */
function lostFormatting(
  run: Attrs,
  element: Attrs | undefined,
  keeps: { readonly emphasis: boolean; readonly capitals: boolean },
): string[] {
  const value = (name: string) => run[name] ?? element?.[name];
  const lost: string[] = [];
  const font = value("Font");
  if (font && !/courier/i.test(font)) lost.push(`font ${font}`);
  const size = value("Size");
  if (differs(size, FONT.Size)) lost.push(`${size} pt type`);
  const color = value("Color");
  if (color && !/^#0+$/.test(color)) lost.push("coloured text");
  const background = value("Background");
  if (background && !/^#F+$/i.test(background)) lost.push("highlighting");
  const own = run.Style;
  for (const style of (own ?? element?.Style ?? "").split("+")) {
    const kept =
      style === "AllCaps"
        ? keeps.capitals
        : own !== undefined && keeps.emphasis && EMPHASIS.includes(style);
    // Final Draft's names, such as "Strikeout" or "AllCaps", as words.
    if (style && !kept) lost.push(style.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase());
  }
  return lost;
}

function readElement(
  paragraph: Node,
  at: number,
  reader: Reader,
  dual: boolean,
  breakBefore: boolean,
): Element {
  const { report, once, revision } = reader;
  const { Type, Alignment, Number: sceneNumber, StartsNewPage } = paragraph.attrs;
  const known = Type === undefined ? undefined : TYPES.get(Type);
  if (!known) report("elementType", Type || "Unnamed", at);
  if (known === "sceneHeading" && sceneNumber?.trim())
    report("sceneNumber", sceneNumber.trim(), at);
  revision(paragraph.attrs.RevisionID, at);
  // An unknown type is already reported; its own settings no longer apply.
  const settings = known ? reader.settings.get(TYPE_NAMES[known]) : undefined;
  if (known) {
    for (const lost of lostLayout(known, paragraph.attrs, settings?.paragraph)) {
      once("layout", lost, at);
    }
  }
  const keeps = { emphasis: true, capitals: ELEMENT_FORMATS[known ?? "action"].capitals };

  let text = "";
  const marks: Partial<Record<Style, Span[]>> = {};
  for (const child of paragraph.children) {
    reportInline(child, at, text.length, reader);
    if (child.name !== "Text" || !child.text) continue;
    const start = text.length;
    text += child.text;
    for (const lost of lostFormatting(child.attrs, settings?.font, keeps)) {
      once("formatting", lost, at, start);
    }
    if (!child.attrs.Style) continue;
    const styles = child.attrs.Style.split("+");
    for (const style of STYLES) {
      if (!styles.includes(STYLE_NAMES[style])) continue;
      marks[style] ??= [];
      const spans = marks[style];
      const last = spans.at(-1);
      if (last?.[1] === start) spans[spans.length - 1] = [last[0], text.length];
      else spans.push([start, text.length]);
    }
  }
  return {
    type: known ?? "action",
    text,
    ...marks,
    ...(Alignment === "Center" && { centred: true }),
    ...((dual || (known === "character" && paragraph.attrs.TirDual === "Yes")) && { dual: true }),
    ...((breakBefore || StartsNewPage === "Yes") && { pageBreakBefore: true }),
  };
}

const SOURCE_LINE = /^(?:based\s+on|adapted\s+from|inspired\s+by)\b/i;
// "by" after only words that credits use: "Written by", "Screenplay and
// story by", "An original screenplay by". A title or a name can also end in
// "by" ("Stand By"), so any other word keeps the line out of the credit.
const CREDIT =
  /^(?:(?:a|an|the|and|&|for|original|screen|screenplay|story|teleplay|script|film|written|directed|created|adapted|developed|produced|additional|material|dialogue|revisions?|rewrites?)[\s,]+)*by[.:]?$/i;
const TITLE_CAPITALS = "title page all caps";

/** Read Final Draft's positioned paragraphs. A Tir label wins only for its
 * own field; other fields still come from the visible title-page layout. */
function readTitlePage(page: Node | undefined, reader: Reader): TitlePage {
  const { once, revision } = reader;
  const fields = new Map<TitleField, string[]>();
  const centered: { text: string; field: TitleField | undefined; capitals: boolean }[] = [];
  const contact: string[] = [];
  const date: string[] = [];
  let firstGroupEnd = 0;
  let passedFirstGroup = false;
  for (const paragraph of first(page, "Content")?.children ?? []) {
    if (paragraph.name !== "Paragraph") continue;
    revision(paragraph.attrs.RevisionID, null);
    const tagged: Partial<Record<TitleField, string>> = {};
    let unlabelled = "";
    let columnTab = -1;
    // Unlabelled capitals stay only on lines that turn out to be the title.
    let capitals = false;
    for (const child of paragraph.children) {
      reportInline(child, null, undefined, reader);
      if (child.name !== "Text") continue;
      const field = TITLE_FIELDS.find((field) => field === child.attrs.TirTitleField);
      if (child.text?.trim()) {
        // Tir sets the title page in its own plain type.
        for (const lost of lostFormatting(child.attrs, undefined, {
          emphasis: false,
          capitals: true,
        })) {
          once("formatting", `title page ${lost}`, null);
        }
        if (child.attrs.Style?.split("+").includes("AllCaps")) {
          if (!field) capitals = true;
          else if (field !== "title") once("formatting", TITLE_CAPITALS, null);
        }
      }
      if (field) tagged[field] = (tagged[field] ?? "") + (child.text ?? "");
      else {
        if (child.text === "\t" && columnTab < 0) columnTab = unlabelled.length;
        unlabelled += child.text ?? "";
      }
    }
    for (const field of TITLE_FIELDS) {
      const text = tagged[field];
      if (text === undefined) continue;
      const lines = fields.get(field);
      if (lines) lines.push(text);
      else fields.set(field, [text]);
    }

    const { Alignment } = paragraph.attrs;
    const text = unlabelled.trim();
    const field = TITLE_FIELDS.find(
      (field) => field !== "contact" && field !== "draftDate" && tagged[field] !== undefined,
    );
    if ((text || field) && (Alignment === "Center" || Alignment === undefined)) {
      centered.push({ text, field, capitals });
      if (!passedFirstGroup) firstGroupEnd++;
    } else {
      if (centered.length > 0) passedFirstGroup = true;
      if (capitals) once("formatting", TITLE_CAPITALS, null);
      const tab = columnTab;
      if (tab >= 0 && (tagged.contact !== undefined || tagged.draftDate !== undefined)) {
        // Tir writes the two bottom columns on shared rows, separated by a tab.
        const left = unlabelled.slice(0, tab).trim();
        const right = unlabelled.slice(tab + 1).trim();
        if (left) contact.push(left);
        if (right) date.push(right);
      } else if (text) {
        (Alignment === "Right" ? date : contact).push(text);
      }
    }
  }

  // The credit is one line. Any later credit, such as "Story by" under the
  // writers, stays with the authors in printed order.
  const creditAt = centered.findIndex(
    ({ text, field }, i) => field === "credit" || (i > 0 && !field && CREDIT.test(text)),
  );
  const followingField = centered.findIndex(
    ({ field }) => field === "authors" || field === "source",
  );
  const titleEnd = Math.min(
    creditAt < 0 ? firstGroupEnd : creditAt,
    followingField < 0 ? centered.length : followingField,
  );
  const sourceAt = centered.findIndex(
    ({ text, field }, i) =>
      i >= titleEnd && (field === "source" || (!field && SOURCE_LINE.test(text))),
  );
  const title: string[] = [];
  const credit: string[] = [];
  const authors: string[] = [];
  const source: string[] = [];
  centered.forEach(({ text, field, capitals }, i) => {
    if (field) return;
    if (i < titleEnd) {
      title.push(text);
      return;
    }
    if (i === creditAt) credit.push(text);
    else if (sourceAt >= 0 && i >= sourceAt) source.push(text);
    else authors.push(text);
    if (capitals) once("formatting", TITLE_CAPITALS, null);
  });
  const value = (field: TitleField, fallback: string[]) =>
    (fields.get(field) ?? fallback).join("\n");
  const showDraftDate = fields.has("draftDate") || date.length > 0;
  return {
    title: value("title", title),
    credit: value("credit", credit),
    authors: value("authors", authors),
    source: value("source", source),
    contact: value("contact", contact),
    draftDate: showDraftDate ? value("draftDate", date) : (page?.attrs.TirHiddenDraftDate ?? ""),
    showDraftDate,
  };
}

// Revision labels print nothing on an unrevised draft; revisions are reported.
const REVISION_LABELS: readonly (string | undefined)[] = ["Last Revised", "Collated Revisions"];

function prints(part: Node | undefined): { pageNumber: boolean; other: boolean } {
  let pageNumber = false;
  let other = false;
  for (const paragraph of part?.children ?? []) {
    for (const child of paragraph.children) {
      if (child.name === "DynamicLabel") {
        if (child.attrs.Type === "Page #") pageNumber = true;
        else if (!REVISION_LABELS.includes(child.attrs.Type)) other = true;
      } else if (child.name === "Text" && /[^\s.]/.test(child.text ?? "")) {
        other = true;
      }
    }
  }
  return { pageNumber, other };
}

/** Whether the script's header and footer print anything but Tir's page numbers. */
function headerDiffers(node: Node | undefined): boolean {
  if (!node) return false;
  const {
    HeaderVisible = "Yes",
    HeaderFirstPage = "No",
    FooterVisible = "No",
    StartingPage = "1",
  } = node.attrs;
  if (HeaderVisible !== "Yes" || HeaderFirstPage !== "No" || differs(StartingPage, "1")) {
    return true;
  }
  const header = first(node, "Header");
  if (header) {
    const { pageNumber, other } = prints(header);
    if (!pageNumber || other) return true;
  }
  if (FooterVisible !== "Yes") return false;
  const { pageNumber, other } = prints(first(node, "Footer"));
  return pageNumber || other;
}

/** The page settings of the file that Tir's fixed page does not follow. */
function lostPageLayout(root: Node): string[] {
  const lost: string[] = [];
  const layout = first(root, "PageLayout");
  if (differsFrom(first(layout, "PageSize")?.attrs, PAGE_SIZE)) lost.push("page size");
  if (differsFrom(layout?.attrs, MARGINS)) lost.push("page margins");
  if (differs(layout?.attrs.DocumentLeading, "Normal")) lost.push("line spacing");
  if (differs(layout?.attrs.BreakDialogueAndActionAtSentences, "Yes")) {
    lost.push("page breaks within sentences");
  }
  const mores = first(root, "MoresAndContinueds");
  const sceneBreaks = first(mores, "SceneBreaks")?.attrs;
  if (
    differsFrom(first(mores, "DialogueBreaks")?.attrs, DIALOGUE_BREAKS) ||
    differs(sceneBreaks?.SceneBottomOfPage, SCENE_BREAKS.SceneBottomOfPage) ||
    differs(sceneBreaks?.SceneTopOfNext, SCENE_BREAKS.SceneTopOfNext)
  ) {
    lost.push("mores and continueds");
  }
  if (headerDiffers(first(root, "HeaderAndFooter"))) lost.push("header and footer");
  return lost;
}

/** Reads a decoded Final Draft screenplay; throws before returning any data on invalid XML. */
export function readFdx(source: string): ScriptRead {
  const root = parse(source);
  const content = first(root, "Content");
  if (!content) throw new Error("The Final Draft file has no screenplay content.");
  const leftOut: LeftOut[] = [];
  const report: Report = (kind, text, at, offset) => {
    if (leftOut.length === MAX_OMISSIONS) {
      throw new Error("The Final Draft file contains too many omissions for the import report.");
    }
    leftOut.push(offset ? { kind, text, at, offset } : { kind, text, at });
  };
  const reported = new Set<string>();
  const once: Report = (kind, text, at, offset) => {
    const key = `${kind}\n${text}`;
    if (reported.has(key)) return;
    reported.add(key);
    report(kind, text, at, offset);
  };
  const reader: Reader = {
    report,
    once,
    revision: revisionReporter(root, report),
    settings: elementSettings(root),
  };
  const { revision } = reader;
  const elements: Element[] = [];
  for (const paragraph of content.children) {
    const dual = paragraph.name === "DualDialogue" ? paragraph : first(paragraph, "DualDialogue");
    const breakBefore = paragraph.attrs.StartsNewPage === "Yes";
    if (dual) {
      if (dual !== paragraph) {
        const at = dual.children.length > 0 ? elements.length : null;
        revision(paragraph.attrs.RevisionID, at);
        for (const child of paragraph.children) reportInline(child, at, undefined, reader);
      }
      let cues = 0;
      for (const speech of dual.children) {
        const cue = speech.attrs.Type === "Character";
        if (cue) cues++;
        const rightCue = cue && cues === 2;
        const firstSpeech = speech === dual.children[0];
        elements.push(
          readElement(speech, elements.length, reader, rightCue, breakBefore && firstSpeech),
        );
      }
    } else {
      elements.push(readElement(paragraph, elements.length, reader, false, breakBefore));
    }
  }
  const titlePage = readTitlePage(first(root, "TitlePage"), reader);
  for (const deleted of first(root, "DeletedText")?.children ?? []) {
    revision(deleted.attrs.RevisionID, null);
  }
  for (const set of first(root, "Revisions")?.children ?? []) {
    if (set.attrs.FullRevision === "Yes") revision(set.attrs.ID, null);
  }
  for (const note of first(root, "UnanchoredScriptNotes")?.children ?? []) {
    report("scriptNote", noteText(note), null);
  }
  for (const lost of lostPageLayout(root)) report("layout", lost, null);
  return { script: { titlePage, elements }, leftOut };
}
