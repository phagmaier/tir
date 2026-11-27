/**
 * A project's file, `project.json` in its folder (architecture, "Library on
 * disk"): the project's name, its drafts' names and files, and which draft
 * is active. Reading refuses a damaged or newer file whole, as the draft
 * file does, so Tir never saves over a project it could not read. The
 * functions after it give a project as a change leaves it, with the draft
 * file the change names.
 */

import { isSafeName, uniqueName } from "./file-names.ts";
import { isRecord, oneLineJson } from "./json.ts";
import type { DraftInfo, ProjectInfo } from "./model.ts";

export const PROJECT_FORMAT = "tir-project";
/** Raise this whenever the format changes in a way older readers would misread. */
export const PROJECT_VERSION = 1;

/** A draft's file ends with this; the Fountain copy beside it ends with `COPY_EXTENSION`. */
export const DRAFT_EXTENSION = ".tir";
export const COPY_EXTENSION = ".fountain";

export type ProjectRead =
  | { readonly ok: true; readonly project: ProjectInfo }
  | { readonly ok: false; readonly error: string };

// Key order for writing; also the complete list of keys a reader accepts.
const TOP_KEYS = ["format", "version", "name", "activeDraft", "drafts"] as const;
const DRAFT_KEYS = ["name", "file"] as const;

export function writeProject(project: ProjectInfo): string {
  const drafts = project.drafts
    .map((draft) => `    ${oneLineJson({ name: draft.name, file: draft.file })}`)
    .join(",\n");
  const text = [
    "{",
    `  "format": ${JSON.stringify(PROJECT_FORMAT)},`,
    `  "version": ${PROJECT_VERSION},`,
    `  "name": ${oneLineJson(project.name)},`,
    `  "activeDraft": ${oneLineJson(project.activeDraft)},`,
    `  "drafts": [\n${drafts}\n  ]`,
    "}",
    "",
  ].join("\n");
  // A file Tir cannot read back would lose the project at the next start.
  const check = readProject(text);
  if (!check.ok) throw new Error(`Tir made a project file it could not read back. ${check.error}`);
  return text;
}

/** Thrown inside the reader only; `readProject` turns it into a result. */
class Refusal extends Error {}

function damaged(detail: string): Refusal {
  return new Refusal(`The project file is damaged: ${detail}.`);
}

export function readProject(text: string): ProjectRead {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? ` (${error.message})` : "";
    return { ok: false, error: `The project file is damaged: it is not complete JSON${reason}.` };
  }
  try {
    return { ok: true, project: readData(data) };
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, error: error.message };
    throw error;
  }
}

function readData(data: unknown): ProjectInfo {
  if (!isRecord(data) || data.format !== PROJECT_FORMAT) {
    throw new Refusal("This file is not a Tir project.");
  }
  // The version comes first: a newer file may hold anything after it.
  const version = data.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw damaged("its format version is missing or invalid");
  }
  if (version > PROJECT_VERSION) {
    throw new Refusal(
      `This project was saved by a newer version of Tir (project format ${version}; this version reads format ${PROJECT_VERSION}). Update Tir to open it.`,
    );
  }
  rejectUnknownKeys(data, TOP_KEYS, "the file");
  if (typeof data.name !== "string") throw damaged(`the project's "name" is missing or not text`);
  if (!Array.isArray(data.drafts) || data.drafts.length === 0) {
    throw damaged("the draft list is missing or empty");
  }
  const drafts = data.drafts.map((draft, index) => readDraftInfo(draft, index + 1));
  const files = new Set<string>();
  for (const { file } of drafts) {
    if (files.has(file)) throw damaged(`two drafts have the file "${file}"`);
    files.add(file);
  }
  if (typeof data.activeDraft !== "string" || !files.has(data.activeDraft)) {
    throw damaged("its active draft is not one of its drafts");
  }
  return { name: data.name, drafts, activeDraft: data.activeDraft };
}

function readDraftInfo(data: unknown, number: number): DraftInfo {
  const where = `draft ${number}`;
  if (!isRecord(data)) throw damaged(`${where} is not a draft`);
  rejectUnknownKeys(data, DRAFT_KEYS, where);
  if (typeof data.name !== "string") throw damaged(`${where} has no name`);
  if (!isDraftFile(data.file)) {
    throw damaged(
      `${where}'s file ${JSON.stringify(data.file)} is not a draft file in the project`,
    );
  }
  return { name: data.name, file: data.file };
}

/** Whether `file` names a draft's file in the project's `drafts` folder. */
export function isDraftFile(file: unknown): file is string {
  return typeof file === "string" && file.endsWith(DRAFT_EXTENSION) && isSafeName(file);
}

function rejectUnknownKeys(data: Record<string, unknown>, known: readonly string[], where: string) {
  for (const key of Object.keys(data)) {
    if (!known.includes(key)) throw damaged(`${where} has an unexpected field "${key}"`);
  }
}

/** A project's change, and the draft file it names. */
export interface ProjectChange {
  readonly project: ProjectInfo;
  readonly file: string;
}

/** A new project, `name`, with one draft, `draftName`, which is active. */
export function newProject(name: string, draftName: string): ProjectInfo {
  const file = draftFile(draftName, []);
  return { name, drafts: [{ name: draftName, file }], activeDraft: file };
}

/**
 * `project` with a new draft, `name`, after the others, in a file named
 * from it. `inFolder` lists the entries of the project's `drafts` folder,
 * none of which the file or its Fountain copy may replace.
 */
export function withNewDraft(
  project: ProjectInfo,
  name: string,
  inFolder: readonly string[],
): ProjectChange {
  const file = draftFile(name, [...inFolder, ...project.drafts.map((draft) => draft.file)]);
  return { project: { ...project, drafts: [...project.drafts, { name, file }] }, file };
}

/**
 * `project` with the draft in `file` renamed `name`, and the file it moves
 * to: one named from `name`, which is `file` itself when the name gives it
 * again. `inFolder` is as for `withNewDraft`.
 */
export function withDraftRenamed(
  project: ProjectInfo,
  file: string,
  name: string,
  inFolder: readonly string[],
): ProjectChange {
  draftIn(project, file);
  // The draft's own file and copy are free for it.
  const own = [file, copyOf(file)];
  const taken = [...inFolder, ...project.drafts.map((draft) => draft.file)].filter(
    (entry) => !own.includes(entry),
  );
  const to = draftFile(name, taken);
  return {
    project: {
      ...project,
      drafts: project.drafts.map((draft) => (draft.file === file ? { name, file: to } : draft)),
      activeDraft: project.activeDraft === file ? to : project.activeDraft,
    },
    file: to,
  };
}

/**
 * `project` without the draft in `file`. A project keeps at least one
 * draft. When the active draft goes, the one before it in the list, or
 * else the one after, becomes active.
 */
export function withoutDraft(project: ProjectInfo, file: string): ProjectInfo {
  draftIn(project, file);
  if (project.drafts.length === 1) throw new Error("A project keeps at least one draft.");
  const index = project.drafts.findIndex((draft) => draft.file === file);
  const drafts = project.drafts.filter((draft) => draft.file !== file);
  const activeDraft =
    project.activeDraft === file
      ? (drafts[Math.max(0, index - 1)] as DraftInfo).file
      : project.activeDraft;
  return { ...project, drafts, activeDraft };
}

/** `project` with the draft in `file` active. */
export function withActiveDraft(project: ProjectInfo, file: string): ProjectInfo {
  draftIn(project, file);
  return { ...project, activeDraft: file };
}

/** The Fountain copy's file for the draft in `file`. */
export function copyOf(file: string): string {
  return file.slice(0, -DRAFT_EXTENSION.length) + COPY_EXTENSION;
}

/** A draft file named from `name` that neither it nor its copy makes the same as one in `taken`. */
function draftFile(name: string, taken: readonly string[]): string {
  return uniqueName(name, taken, [DRAFT_EXTENSION, COPY_EXTENSION]) + DRAFT_EXTENSION;
}

function draftIn(project: ProjectInfo, file: string): void {
  if (!project.drafts.some((draft) => draft.file === file)) {
    throw new Error(`The project has no draft in "${file}".`);
  }
}
