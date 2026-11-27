/**
 * What the window opens at launch (brief, "Projects"; architecture,
 * "Saving and opening"): the project last shown on this machine on its
 * active draft, or else the library's first; with none, or when its draft
 * cannot be read, nothing, and the Projects screen shows instead
 * (`projects-screen.ts`). And the file keys: Ctrl+O shows the Projects
 * screen, and Ctrl+S saves at once whatever waits.
 */
import { type ReadResult, readDraft } from "../core/draft-file.ts";
import { newTitlePage, type Script, type TitlePage } from "../core/model.ts";
import type { Library, Project } from "./library.ts";
import type { Place } from "./saving.ts";

/** The name of a new project's draft. */
export const FIRST_DRAFT = "First Draft";
/** The name of a new project whose script has no title. */
export const UNTITLED = "Untitled";

/** A script to show: its draft's place in the library, null while not there, and its project's name. */
export interface Opening {
  readonly script: Script;
  readonly place: Place | null;
  readonly name: string;
}

/** Something to tell the writer in a message box. */
export interface Problem {
  readonly title: string;
  readonly message: string;
}

/** What a script starts as: one empty scene heading, as a screenplay starts. */
export function emptyScript(): Script {
  return { titlePage: newTitlePage(), elements: [{ type: "sceneHeading", text: "" }] };
}

/** The name a project made for a script takes: its title's first line, or else `fallback`. */
export function projectName(titlePage: TitlePage, fallback: string): string {
  return titlePage.title.split("\n")[0]?.trim() || fallback;
}

/** A script not in the library, such as a test script: it becomes a project at its first save. */
export function unplaced(script: Script): Opening {
  return { script, place: null, name: projectName(script.titlePage, UNTITLED) };
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** What opening at launch reads from the library (`library.ts`). */
export interface LibraryReader {
  list(): Promise<Library>;
  read(project: Project, file: string): Promise<string>;
}

/**
 * What Tir opens at launch: the active draft of the project in the folder
 * `last`, or of the library's first project when that is gone; nothing
 * when there is none or its draft cannot be read. With what to tell the
 * writer.
 */
export async function openAtLaunch(
  last: string | null,
  reader: LibraryReader,
): Promise<{ opening: Opening | null; problem: Problem | null }> {
  let library: Library;
  try {
    library = await reader.list();
  } catch (error) {
    const problem = { title: "Tir could not read the library", message: message(error) };
    return { opening: null, problem };
  }
  const lost = library.unreadable.find((folder) => folder.folder === last);
  let problem = lost ? { title: `Tir could not open “${last}”`, message: lost.error } : null;
  const project = library.projects.find((each) => each.folder === last) ?? library.projects[0];
  if (!project) return { opening: null, problem };
  const file = project.info.activeDraft;
  const name = project.info.name;
  let read: ReadResult;
  try {
    read = readDraft(await reader.read(project, file));
  } catch (error) {
    read = { ok: false, error: message(error) };
  }
  if (read.ok) return { opening: { script: read.script, place: { project, file }, name }, problem };
  problem = { title: `Tir could not open “${name}”`, message: read.error };
  return { opening: null, problem };
}

type Keys = Pick<KeyboardEvent, "key" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey">;

export type FileAction = "open" | "save";

/**
 * What a key press does with the script's file (brief, "Elements and
 * keys"): Ctrl+O opens (the Projects screen), and Ctrl+S saves at once
 * whatever waits.
 */
export function fileKey({ key, ctrlKey, shiftKey, altKey, metaKey }: Keys): FileAction | null {
  if (!ctrlKey || shiftKey || altKey || metaKey) return null;
  switch (key.toLowerCase()) {
    case "o":
      return "open";
    case "s":
      return "save";
    default:
      return null;
  }
}

/**
 * Catches the file keys on their way down to the element with focus, as the
 * window's other keys are (`desk.ts`), so they work from any field too.
 */
export function listenForFileKeys(act: (action: FileAction) => void): void {
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.isComposing) return;
      const action = fileKey(event);
      if (!action) return;
      event.preventDefault();
      act(action);
    },
    true,
  );
}
