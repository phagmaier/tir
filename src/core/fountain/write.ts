/**
 * Writes the model as Fountain 1.1 (fountain.io/syntax). Each element is
 * written plainly where Fountain's inference reads it back as the same
 * element, forced (`!`, `.`, `>`, `@`) where that is needed, and otherwise
 * with Tir's type note, `[[tir:shot]]`, which other Fountain apps hide as a
 * note. Fountain has no shot, general, or way to force dialogue, so those
 * need the note. Each choice is checked by reading the paragraph back.
 *
 * What a Fountain round trip does not keep: whitespace at the end of a line,
 * indentation outside action, tabs, an empty first or last line of an
 * element, a line break in a character cue, centring inside a speech, empty
 * lines inside title page fields, and some bold and italic spans that cross
 * mid-word (see inline.ts).
 */
import { type Element, type ElementType, type Script, STYLES, type TitlePage } from "../model.ts";
import { escapeText, type StyledText, writeInline } from "./inline.ts";
import { readFountain } from "./read.ts";
import { isLyric, isPageBreak, isSection, isSynopsis, marker, SCENE_NUMBER } from "./syntax.ts";

const SPEECH: readonly ElementType[] = ["parenthetical", "dialogue"];

export function writeFountain(script: Script): string {
  const blocks: string[] = [];
  const titlePage = writeTitlePage(script.titlePage);
  if (titlePage) blocks.push(titlePage);

  const { elements } = script;
  let i = 0;
  while (i < elements.length) {
    const element = elements[i] as Element;
    if (element.pageBreakBefore) blocks.push("===");
    const first = blocks.length === 0;
    if (element.type === "character") {
      // A cue and the parentheticals and dialogue under it form one paragraph.
      let end = i + 1;
      while (end < elements.length) {
        const next = elements[end] as Element;
        if (!SPEECH.includes(next.type) || next.pageBreakBefore) break;
        end++;
      }
      blocks.push(writeSpeech(elements.slice(i, end), first));
      i = end;
    } else {
      blocks.push(writeParagraph(element, first));
      i++;
    }
  }
  return blocks.length > 0 ? `${blocks.join("\n\n")}\n` : "";
}

function writeTitlePage(page: TitlePage): string {
  const fields: [string, string, boolean][] = [
    ["Title", page.title, false],
    ["Credit", page.credit, false],
    ["Author", page.authors, false],
    ["Source", page.source, false],
    // A draft date that is not shown goes under a key Fountain apps ignore.
    page.showDraftDate
      ? ["Draft date", page.draftDate, true]
      : ["Hidden draft date", page.draftDate, false],
    ["Contact", page.contact, false],
  ];
  const lines: string[] = [];
  for (const [key, value, always] of fields) {
    // A blank line would end the title page, so empty lines are dropped.
    const values = value
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => escapeText(line.trim()));
    if (values.length === 0) {
      if (always) lines.push(`${key}:`);
    } else if (values.length === 1) {
      lines.push(`${key}: ${values[0]}`);
    } else {
      lines.push(`${key}:`, ...values.map((line) => `    ${line}`));
    }
  }
  return lines.join("\n");
}

/** Writes an element that is not part of a speech, in the plainest form that reads back. */
function writeParagraph(element: Element, first: boolean): string {
  const lines = elementLines(element);
  const [line, ...rest] = lines as [string, ...string[]];
  const heading = element.type === "sceneHeading" || element.type === "shot";
  const head = heading ? escapeSceneNumber(line) : line;
  // A prefix stands in for an empty first line's two spaces.
  const forced = (prefix: string) => `${prefix}${head.trim() === "" ? "" : head}`;
  const join = (firstLine: string, others = rest) => [firstLine, ...others].join("\n");
  const noted = (firstLine: string, others = rest) =>
    join(`${firstLine} ${marker(element.type)}`, others);

  const candidates: string[] = [];
  if (element.centred) {
    const centred = lines.map((l) => `>${l.trim()}<`);
    candidates.push(centred.join("\n"), noted(centred[0] as string, centred.slice(1)));
  } else {
    candidates.push(join(head));
    if (element.type === "action") candidates.push(join(forced("!")));
    if (heading) candidates.push(join(forced(".")), noted(forced(".")));
    if (element.type === "transition") candidates.push(join(forced(">")));
    candidates.push(noted(forced("!")));
  }
  const expected = [withoutPageBreak(element)];
  return (
    candidates.find((c) => readsBack(c, expected, { first, strict: true })) ??
    candidates.find((c) => readsBack(c, expected, { first, strict: false })) ??
    (candidates.at(-1) as string)
  );
}

/** Writes a cue and its speech as one paragraph, checking each element as it goes. */
function writeSpeech(speech: readonly Element[], first: boolean): string {
  const [cue, ...rest] = speech as [Element, ...Element[]];
  const expected = speech.map(withoutPageBreak);
  // A caret ending the cue's own text would read as dual dialogue.
  const ownCue = (elementLines(cue)[0] as string).replace(/\^$/, "\\^");
  const cueLine = ownCue + (cue.dual ? " ^" : "");
  // A plain cue needs a line under it; a cue standing alone is forced.
  const more = rest.length > 0;
  const cueForm =
    more && readsBack(cueLine, expected.slice(0, 1), { first, strict: true, more })
      ? cueLine
      : `@${cueLine}`;

  const lines = [cueForm];
  rest.forEach((element, k) => {
    const [head, ...others] = elementLines(element) as [string, ...string[]];
    const plain = [...lines, head, ...others].join("\n");
    const noted = [...lines, `${head} ${marker(element.type)}`, ...others].join("\n");
    const sofar = expected.slice(0, k + 2);
    const chosen =
      [plain, noted].find((c) => readsBack(c, sofar, { first, strict: true })) ??
      [plain, noted].find((c) => readsBack(c, sofar, { first, strict: false })) ??
      noted;
    lines.splice(0, lines.length, ...chosen.split("\n"));
  });
  return lines.join("\n");
}

interface Check {
  /** The first paragraph of the file, which could be taken for a title page. */
  readonly first: boolean;
  /** Compare styles on visible characters too, not just types, text and flags. */
  readonly strict: boolean;
  /** Read as if more lines followed in the same paragraph. */
  readonly more?: boolean;
}

/** Whether a paragraph reads back as these elements. */
function readsBack(paragraph: string, expected: readonly Element[], check: Check): boolean {
  const probe = check.more ? `${paragraph}\nX` : paragraph;
  // After a title page, a later paragraph cannot be taken for one.
  const read = readFountain(check.first ? probe : `Title: -\n\n${probe}`).script.elements;
  const got = check.more ? read.slice(0, expected.length) : read;
  const key = (element: Element) => signature(element, check.strict);
  return (
    got.length === expected.length && got.every((e, i) => key(e) === key(expected[i] as Element))
  );
}

/** What must survive: type, text and flags, and in strict mode each visible character's styles. */
function signature(element: Element, strict: boolean): string {
  const { text } = element;
  const styles: string[] = [];
  for (let i = 0; strict && i < text.length; i++) {
    const visible = !/\s/.test(text[i] as string);
    styles.push(
      visible
        ? STYLES.filter((style) => element[style]?.some(([s, e]) => s <= i && i < e)).join()
        : "",
    );
  }
  return JSON.stringify([element.type, text, !!element.centred, !!element.dual, styles]);
}

/** An element's lines, styled and escaped, so no line reads as Fountain syntax. */
function elementLines(element: Element): string[] {
  const lines: string[] = [];
  let start = 0;
  for (const text of element.text.split("\n")) {
    const end = start + text.length;
    const styled: StyledText = { text, bold: [], italic: [], underline: [] };
    for (const style of STYLES) {
      for (const [s, e] of element[style] ?? []) {
        if (s < end && e > start)
          styled[style].push([Math.max(s, start) - start, Math.min(e, end) - start]);
      }
    }
    lines.push(escapeLine(writeInline(styled), element.type));
    start = end + 1;
  }
  return lines;
}

function escapeLine(line: string, type: ElementType): string {
  // Two spaces keep an empty line inside an element.
  if (line.trim() === "") return "  ";
  const special =
    isSection(line) ||
    isSynopsis(line) ||
    isPageBreak(line) ||
    isLyric(line) ||
    (type === "dialogue" && line.trimStart().startsWith("("));
  if (!special) return line;
  const indent = line.length - line.trimStart().length;
  return `${line.slice(0, indent)}\\${line.slice(indent)}`;
}

function escapeSceneNumber(line: string): string {
  return line.replace(SCENE_NUMBER, (number) => number.replace("#", "\\#"));
}

function withoutPageBreak(element: Element): Element {
  const { pageBreakBefore: _, ...rest } = element;
  return rest;
}
