import { capitals } from "./layout.ts";
import type { Element } from "./model.ts";

export type Finding =
  | {
      readonly kind:
        | "cueWithoutDialogue"
        | "speechWithoutCue"
        | "headingPrefix"
        | "emptyElement"
        | "emptyScene";
      readonly index: number;
    }
  | {
      readonly kind: "nearDuplicateName";
      readonly index: number;
      readonly name: string;
      readonly suggested: string;
    };

const HEADING_PREFIX = /^(?:INT\.\/EXT\.|INT\.|EXT\.|I\/E\.|EST\.)(?=\s|$)/i;
const NAME = /^[\p{L}\p{M}]+(?:[ ’'-][\p{L}\p{M}]+)*$/u;
const LETTER = /^\p{L}$/u;

/** An insertion, deletion, substitution or adjacent swap of letters, not punctuation. */
function oneNameEdit(a: readonly string[], b: readonly string[]): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const left = endA - start;
  const right = endB - start;
  if (Math.max(left, right) === 1) {
    return (
      (!left || LETTER.test(a[start] as string)) && (!right || LETTER.test(b[start] as string))
    );
  }
  return (
    left === 2 &&
    right === 2 &&
    a[start] === b[start + 1] &&
    a[start + 1] === b[start] &&
    LETTER.test(a[start] as string) &&
    LETTER.test(a[start + 1] as string)
  );
}

/** The brief's six formatting rules, in draft order. Nothing changes the model. */
export function checkFormatting(elements: readonly Element[]): Finding[] {
  // The one blank Action in a new draft is the starting place, not a stray line.
  if (elements.length === 1 && elements[0]?.type === "action" && !elements[0].text.trim()) {
    return [];
  }
  const findings: Finding[] = [];
  const names = new Map<string, { index: number; count: number; letters: string[] }>();
  let speaker = false;
  let silentCue = -1;
  let emptyScene = -1;
  elements.forEach(({ type, text }, index) => {
    const trimmed = text.trim();
    const empty = !trimmed || (type === "parenthetical" && /^\(\s*\)$/.test(trimmed));
    if (empty) findings.push({ kind: "emptyElement", index });

    if (type === "sceneHeading") {
      if (emptyScene !== -1) findings.push({ kind: "emptyScene", index: emptyScene });
      emptyScene = empty ? -1 : index;
      if (!empty && !HEADING_PREFIX.test(trimmed)) findings.push({ kind: "headingPrefix", index });
    } else if (!empty) {
      emptyScene = -1;
    }

    if (type === "parenthetical" || type === "dialogue") {
      if (empty) return;
      if (!speaker) findings.push({ kind: "speechWithoutCue", index });
      if (type === "dialogue") silentCue = -1;
      return;
    }
    if (silentCue !== -1) findings.push({ kind: "cueWithoutDialogue", index: silentCue });
    speaker = type === "character" && !empty;
    silentCue = speaker ? index : -1;
    if (!speaker) return;

    // Extensions, including a written (CONT’D), don't change the name.
    const open = trimmed.indexOf("(");
    const name = capitals((open < 0 ? trimmed : trimmed.slice(0, open)).trim().normalize("NFC"));
    if (!NAME.test(name)) return;
    const used = names.get(name);
    if (used) used.count++;
    else {
      const letters = [...name];
      if (letters.length >= 4) names.set(name, { index, count: 1, letters });
    }
  });
  if (silentCue !== -1) findings.push({ kind: "cueWithoutDialogue", index: silentCue });
  if (emptyScene !== -1) findings.push({ kind: "emptyScene", index: emptyScene });

  // A one-off spelling near exactly one established name is worth asking about.
  // Leave repeated spellings, numbered roles and ambiguous matches alone.
  const established = [...names].filter(([, { count }]) => count > 1);
  if (established.length) {
    for (const [name, { index, count, letters }] of names) {
      if (count !== 1) continue;
      let suggested: string | undefined;
      for (const [other, used] of established) {
        if (!oneNameEdit(letters, used.letters)) continue;
        if (suggested) {
          suggested = undefined;
          break;
        }
        suggested = other;
      }
      if (suggested) findings.push({ kind: "nearDuplicateName", index, name, suggested });
    }
  }
  return findings.sort((a, b) => a.index - b.index);
}
