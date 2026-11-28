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

type Report = (kind: LeftOut["kind"], text: string, at: number) => void;
type Revision = (id: string | undefined, at: number) => void;

function revisionReporter(root: Node, report: Report): Revision {
  // A normal FDX carries the full list of its default sets. Report only those
  // used on text, on deletions, or expressly applied to the entire draft.
  const sets = new Map<string, string>();
  for (const set of first(root, "Revisions")?.children ?? []) {
    const { ID, Name } = set.attrs;
    if (ID && Name) sets.set(ID, Name);
  }
  const seen = new Set<string>();
  return (id: string | undefined, at: number) => {
    if (!id || id === "0" || seen.has(id)) return;
    seen.add(id);
    report("revision", sets.get(id) ?? `Revision ${id}`, at);
  };
}

function reportInline(child: Node, at: number, report: Report, revision: Revision): void {
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

/** FDX has no named title fields, only positioned paragraphs. Read the
 * conventional centred title, byline, authors and source in order, with
 * the left and right blocks for contact and draft/date. */
function readTitlePage(page: Node | undefined, report: Report, revision: Revision): TitlePage {
  const fields = new Map<TitleField, string[]>();
  const groups: string[][] = [];
  const contact: string[] = [];
  const date: string[] = [];
  let group: string[] = [];
  for (const paragraph of first(page, "Content")?.children ?? []) {
    if (paragraph.name !== "Paragraph") continue;
    revision(paragraph.attrs.RevisionID, 0);
    for (const child of paragraph.children) {
      reportInline(child, 0, report, revision);
      if (child.name !== "Text") continue;
      const field = TITLE_FIELDS.find((field) => field === child.attrs.TirTitleField);
      if (!field) continue;
      const lines = fields.get(field);
      if (lines) lines.push(child.text ?? "");
      else fields.set(field, [child.text ?? ""]);
    }
    const text = paragraphText(paragraph).trim();
    const { Alignment } = paragraph.attrs;
    if (text && (Alignment === "Center" || Alignment === undefined)) {
      if (group.length === 0) groups.push(group);
      group.push(text);
    } else {
      group = [];
      if (text) (Alignment === "Right" ? date : contact).push(text);
    }
  }

  // FDX itself has no field names. Tir's export labels its visible runs so
  // an arbitrary credit or source is not mistaken for part of another field.
  if (fields.size > 0) {
    const value = (field: TitleField) => fields.get(field)?.join("\n") ?? "";
    return {
      title: value("title"),
      credit: value("credit"),
      authors: value("authors"),
      source: value("source"),
      contact: value("contact"),
      draftDate: fields.has("draftDate")
        ? value("draftDate")
        : (page?.attrs.TirHiddenDraftDate ?? ""),
      showDraftDate: fields.has("draftDate"),
    };
  }

  const lines = groups.flat();
  const creditAt = lines.findIndex((line, i) => i > 0 && /(?:^|\s)by$/i.test(line));
  const titleEnd = creditAt < 0 ? (groups[0]?.length ?? 0) : creditAt;
  const authorStart = titleEnd + (creditAt < 0 ? 0 : 1);
  const sourceAt = lines.findIndex(
    (line, i) => i >= authorStart && /^(?:based\s+on|adapted\s+from|inspired\s+by)\b/i.test(line),
  );
  return {
    title: lines.slice(0, titleEnd).join("\n"),
    credit: lines[creditAt] ?? "",
    authors: lines.slice(authorStart, sourceAt < 0 ? undefined : sourceAt).join("\n"),
    source: sourceAt < 0 ? "" : lines.slice(sourceAt).join("\n"),
    contact: contact.join("\n"),
    draftDate: date.join("\n"),
    showDraftDate: date.length > 0,
  };
}

/** Reads a decoded Final Draft screenplay; throws before returning any data on invalid XML. */
export function readFdx(source: string): ScriptRead {
  const root = parse(source);
  const content = first(root, "Content");
  if (!content) throw new Error("The Final Draft file has no screenplay content.");
  const leftOut: LeftOut[] = [];
  const report: Report = (kind, text, at) => leftOut.push({ kind, text, at });
  const revision = revisionReporter(root, report);
  const elements: Element[] = [];
  for (const paragraph of content.children) {
    const dual = paragraph.name === "DualDialogue" ? paragraph : first(paragraph, "DualDialogue");
    const breakBefore = paragraph.attrs.StartsNewPage === "Yes";
    if (dual) {
      if (dual !== paragraph) {
        const at = elements.length;
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
    revision(deleted.attrs.RevisionID, 0);
  }
  for (const set of first(root, "Revisions")?.children ?? []) {
    if (set.attrs.FullRevision === "Yes") revision(set.attrs.ID, 0);
  }
  for (const note of first(root, "UnanchoredScriptNotes")?.children ?? []) {
    report("scriptNote", noteText(note), 0);
  }
  return { script: { titlePage, elements }, leftOut };
}
