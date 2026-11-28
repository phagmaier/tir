/**
 * The library through the Rust side's commands (`src-tauri/src/library.rs`;
 * architecture, "Library on disk"). The page names a project by its folder
 * and a draft by its file, never by a path, and makes every name and every
 * file's text here, from the core; the Rust side refuses a name that is not
 * one entry of its folder, and writes. A draft is always written with its
 * Fountain copy (`DraftTexts`). Each change to a project sends the project
 * file's text it was made from, and the Rust side refuses it when the file
 * has changed since, so a change from an older reading never undoes a
 * newer one. Each change returns the project as it leaves it; after a
 * change fails, `listLibrary` reads what is there.
 */
import { invoke } from "@tauri-apps/api/core";
import { uniqueName } from "../core/file-names.ts";
import type { ProjectInfo } from "../core/model.ts";
import {
  copyOf,
  newProject,
  readProject,
  withActiveDraft,
  withDraftRenamed,
  withNewDraft,
  withoutDraft,
  writeProject,
} from "../core/project-file.ts";
import type { DraftTexts } from "./draft-texts.ts";

/** A project in the library. */
export interface Project {
  readonly folder: string;
  readonly info: ProjectInfo;
  /** The project file's text as Tir last read or wrote it. */
  readonly text: string;
  /** The entries of its `drafts` folder. */
  readonly files: readonly string[];
  /**
   * When each draft file was last written, in milliseconds since 1970, as
   * last listed: none for a draft made since.
   */
  readonly edited: Readonly<Record<string, number>>;
}

/** A folder of the library that is no project Tir can open, and why. */
export interface Unreadable {
  readonly folder: string;
  readonly error: string;
}

export interface Library {
  /** Every entry of the library that is not hidden: a new project's folder may be none of them. */
  readonly names: readonly string[];
  readonly projects: readonly Project[];
  readonly unreadable: readonly Unreadable[];
}

/** A folder as `list_library` gives it: its project file's text, or why it has none. */
interface Listed {
  readonly folder: string;
  readonly text: string | null;
  readonly problem: string | null;
  readonly files: readonly string[];
  readonly edited: Readonly<Record<string, number>>;
}

/** The library's projects, and the folders whose project file Tir cannot read. */
export async function listLibrary(): Promise<Library> {
  const listing = await invoke<{ names: string[]; projects: Listed[] }>("list_library");
  const projects: Project[] = [];
  const unreadable: Unreadable[] = [];
  for (const { folder, text, problem, files, edited } of listing.projects) {
    if (text === null) {
      unreadable.push({ folder, error: problem ?? "" });
      continue;
    }
    const read = readProject(text);
    if (read.ok) projects.push({ folder, info: read.project, text, files, edited });
    else unreadable.push({ folder, error: read.error });
  }
  return { names: listing.names, projects, unreadable };
}

/**
 * Where the library is, as the writer would type it, such as
 * "~/Screenplays", to show. No command takes a path back.
 */
export function libraryPlace(): Promise<string> {
  return invoke("library_place");
}

/** Makes a project, `name`, in a folder named from it, with one draft, `draftName`, holding `texts`. */
export async function createProject(
  library: Library,
  name: string,
  draftName: string,
  texts: DraftTexts,
): Promise<Project> {
  const folder = uniqueName(name, library.names);
  const info = newProject(name, draftName);
  const text = writeProject(info);
  await invoke("create_project", {
    folder,
    project: text,
    draft: info.activeDraft,
    text: texts.draft,
    copy: texts.copy,
  });
  return { folder, info, text, files: [copyOf(info.activeDraft), info.activeDraft], edited: {} };
}

/** Renames `project` `name`; its folder takes the new name too. */
export async function renameProject(
  library: Library,
  project: Project,
  name: string,
): Promise<Project> {
  const folder = uniqueName(
    name,
    library.names.filter((entry) => entry !== project.folder),
  );
  const info = { ...project.info, name };
  const text = writeProject(info);
  await invoke("rename_project", {
    folder: project.folder,
    to: folder,
    was: project.text,
    project: text,
  });
  return { ...project, folder, info, text };
}

/**
 * Deletes a project's folder and everything in it, readable or not. The
 * Rust side deletes only a folder with a project file.
 */
export async function deleteProject(project: { readonly folder: string }): Promise<void> {
  await invoke("delete_project", { folder: project.folder });
}

/** Adds a draft, `name`, holding `texts`, to `project`; it becomes the active draft when `active`. */
export async function createDraft(
  project: Project,
  name: string,
  texts: DraftTexts,
  active: boolean,
): Promise<Project> {
  const added = withNewDraft(project.info, name, project.files);
  const info = active ? withActiveDraft(added.project, added.file) : added.project;
  const text = writeProject(info);
  await invoke("create_draft", {
    folder: project.folder,
    draft: added.file,
    text: texts.draft,
    copy: texts.copy,
    was: project.text,
    project: text,
  });
  return {
    ...project,
    info,
    text,
    files: [...project.files, added.file, copyOf(added.file)],
  };
}

/** The text of the draft in `file`. */
export function readDraftText(project: { readonly folder: string }, file: string): Promise<string> {
  return invoke("read_draft", { folder: project.folder, draft: file });
}

/** Saves the draft in `file`: its file and its Fountain copy. */
export async function saveDraft(
  project: { readonly folder: string },
  file: string,
  texts: DraftTexts,
): Promise<void> {
  await invoke("write_draft", {
    folder: project.folder,
    draft: file,
    text: texts.draft,
    copy: texts.copy,
  });
}

/**
 * Renames the draft in `file` `name`; its file, and its Fountain copy, take
 * the new name too. Gives the project as renamed and the draft's new file.
 */
export async function renameDraft(
  project: Project,
  file: string,
  name: string,
): Promise<{ project: Project; file: string }> {
  const renamed = withDraftRenamed(project.info, file, name, project.files);
  const to = renamed.file;
  const text = writeProject(renamed.project);
  await invoke("rename_draft", {
    folder: project.folder,
    draft: file,
    to,
    was: project.text,
    project: text,
  });
  const moved = (entry: string) =>
    entry === file ? to : entry === copyOf(file) ? copyOf(to) : entry;
  const files = project.files.map(moved);
  return { project: { ...project, info: renamed.project, text, files }, file: to };
}

/** Deletes the draft in `file`, and its Fountain copy; never a project's last draft. */
export async function deleteDraft(project: Project, file: string): Promise<Project> {
  const info = withoutDraft(project.info, file);
  const text = writeProject(info);
  await invoke("delete_draft", {
    folder: project.folder,
    draft: file,
    was: project.text,
    project: text,
  });
  const gone = [file, copyOf(file)];
  return { ...project, info, text, files: project.files.filter((entry) => !gone.includes(entry)) };
}

/** Makes the draft in `file` the one `project` opens on. */
export async function setActiveDraft(project: Project, file: string): Promise<Project> {
  const info = withActiveDraft(project.info, file);
  const text = writeProject(info);
  await invoke("write_project", { folder: project.folder, was: project.text, project: text });
  return { ...project, info, text };
}

/** The words the writer added to the dictionary, `dictionary.txt` in the library, one a line. */
export async function readDictionary(): Promise<string[]> {
  const text = await invoke<string>("read_dictionary");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Adds `word` to the writer's dictionary; the Rust side makes the library if need be. */
export async function addToDictionary(word: string): Promise<void> {
  await invoke("add_to_dictionary", { word });
}
