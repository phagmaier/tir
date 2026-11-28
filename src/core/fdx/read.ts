import { SaxesParser } from "saxes";
import type { LeftOut, ScriptRead } from "../import-report.ts";
import {
  ELEMENT_TYPES,
  type Element,
  type Span,
  STYLES,
  type Style,
  type TitlePage,
} from "../model.ts";
import { STYLE_NAMES, TITLE_FIELDS, type TitleField, TYPE_NAMES } from "./format.ts";

const MAX_LENGTH = 8 * 1024 * 1024; // Code units here; the native picker caps file bytes.
const MAX_DEPTH = 64;
// Short XML tags can fan out into many model elements and style spans. Omissions
// also become individual DOM rows, so their smaller budget is separate.
const MAX_RETAINED_NODES = 50_000;
const MAX_OMISSIONS = 5_000;

const TYPES = new Map(ELEMENT_TYPES.map((type) => [TYPE_NAMES[type], type] as const));

interface Node {
  readonly name: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: Node[];
  text?: string;
}

// Keep only the FDX branches we read. The parser still validates the entire
// document, including settings and other data that cannot become script text.
const CHILDREN: Readonly<Record<string, readonly string[]>> = {
  FinalDraft: ["Content", "TitlePage", "Revisions", "DeletedText", "UnanchoredScriptNotes"],
  Content: ["Paragraph", "DualDialogue"],
  TitlePage: ["Content"],
  Paragraph: ["Text", "DualDialogue", "ScriptNote"],
  DualDialogue: ["Paragraph"],
  Revisions: ["Revision"],
  DeletedText: ["DeletedTextLocation"],
  UnanchoredScriptNotes: ["ScriptNote"],
  ScriptNote: ["Paragraph"],
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

type Report = (kind: LeftOut["kind"], text: string, at: LeftOut["at"]) => void;
type Revision = (id: string | undefined, at: LeftOut["at"]) => void;

function revisionReporter(root: Node, report: Report): Revision {
  // A normal FDX carries the full list of its default sets. Report only those
  // used on text, on deletions, or expressly applied to the entire draft.
  const sets = new Map<string, string>();
  for (const set of first(root, "Revisions")?.children ?? []) {
    const { ID, Name } = set.attrs;
    if (ID && Name) sets.set(ID, Name);
  }
  const seen = new Set<string>();
  return (id, at) => {
    if (!id || id === "0" || seen.has(id)) return;
    seen.add(id);
    report("revision", sets.get(id) ?? `Revision ${id}`, at);
  };
}

function reportInline(child: Node, at: LeftOut["at"], report: Report, revision: Revision): void {
  if (child.name === "ScriptNote") report("scriptNote", noteText(child), at);
  else if (child.name === "Text") revision(child.attrs.RevisionID, at);
}

function readElement(
  paragraph: Node,
  at: number,
  report: Report,
  revision: Revision,
  dual: boolean,
  breakBefore: boolean,
): Element {
  const { Type, Alignment, Number: sceneNumber, StartsNewPage } = paragraph.attrs;
  const known = Type === undefined ? undefined : TYPES.get(Type);
  if (!known) report("elementType", Type || "Unnamed", at);
  if (known === "sceneHeading" && sceneNumber?.trim())
    report("sceneNumber", sceneNumber.trim(), at);
  revision(paragraph.attrs.RevisionID, at);

  let text = "";
  const marks: Partial<Record<Style, Span[]>> = {};
  for (const child of paragraph.children) {
    reportInline(child, at, report, revision);
    if (child.name !== "Text" || !child.text) continue;
    const start = text.length;
    text += child.text;
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
const BYLINE = /(?:^|\s)by[.:]?$/i;

/** Read Final Draft's positioned paragraphs. A Tir label wins only for its
 * own field; other fields still come from the visible title-page layout. */
function readTitlePage(page: Node | undefined, report: Report, revision: Revision): TitlePage {
  const fields = new Map<TitleField, string[]>();
  const centered: { text: string; field: TitleField | undefined }[] = [];
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
    for (const child of paragraph.children) {
      reportInline(child, null, report, revision);
      if (child.name !== "Text") continue;
      const field = TITLE_FIELDS.find((field) => field === child.attrs.TirTitleField);
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
      centered.push({ text, field });
      if (!passedFirstGroup) firstGroupEnd++;
    } else {
      if (centered.length > 0) passedFirstGroup = true;
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

  const creditAt = centered.findIndex(
    ({ text, field }, i) =>
      field === "credit" || (i > 0 && !field && BYLINE.test(text) && !SOURCE_LINE.test(text)),
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
  centered.forEach(({ text, field }, i) => {
    if (field) return;
    if (
      i === creditAt ||
      (i >= titleEnd &&
        (sourceAt < 0 || i < sourceAt) &&
        BYLINE.test(text) &&
        !SOURCE_LINE.test(text))
    ) {
      credit.push(text);
    } else if (i < titleEnd) title.push(text);
    else if (sourceAt >= 0 && i >= sourceAt) source.push(text);
    else authors.push(text);
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

/** Reads a decoded Final Draft screenplay; throws before returning any data on invalid XML. */
export function readFdx(source: string): ScriptRead {
  const root = parse(source);
  const content = first(root, "Content");
  if (!content) throw new Error("The Final Draft file has no screenplay content.");
  const leftOut: LeftOut[] = [];
  const report: Report = (kind, text, at) => {
    if (leftOut.length === MAX_OMISSIONS) {
      throw new Error("The Final Draft file contains too many omissions for the import report.");
    }
    leftOut.push({ kind, text, at });
  };
  const revision = revisionReporter(root, report);
  const elements: Element[] = [];
  for (const paragraph of content.children) {
    const dual = paragraph.name === "DualDialogue" ? paragraph : first(paragraph, "DualDialogue");
    const breakBefore = paragraph.attrs.StartsNewPage === "Yes";
    if (dual) {
      if (dual !== paragraph) {
        const at = dual.children.length > 0 ? elements.length : null;
        revision(paragraph.attrs.RevisionID, at);
        for (const child of paragraph.children) reportInline(child, at, report, revision);
      }
      let cues = 0;
      for (const speech of dual.children) {
        const cue = speech.attrs.Type === "Character";
        if (cue) cues++;
        const rightCue = cue && cues === 2;
        const firstSpeech = speech === dual.children[0];
        elements.push(
          readElement(
            speech,
            elements.length,
            report,
            revision,
            rightCue,
            breakBefore && firstSpeech,
          ),
        );
      }
    } else {
      elements.push(readElement(paragraph, elements.length, report, revision, false, breakBefore));
    }
  }
  const titlePage = readTitlePage(first(root, "TitlePage"), report, revision);
  for (const deleted of first(root, "DeletedText")?.children ?? []) {
    revision(deleted.attrs.RevisionID, null);
  }
  for (const set of first(root, "Revisions")?.children ?? []) {
    if (set.attrs.FullRevision === "Yes") revision(set.attrs.ID, null);
  }
  for (const note of first(root, "UnanchoredScriptNotes")?.children ?? []) {
    report("scriptNote", noteText(note), null);
  }
  return { script: { titlePage, elements }, leftOut };
}
