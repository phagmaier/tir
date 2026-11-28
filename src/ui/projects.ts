/**
 * The Projects screen's rows and what it does with them (brief, "Projects";
 * prototype piece 6, the list). Each row is a project with its active
 * draft, pages, drafts and last edit, most recent first, then any folder
 * Tir cannot read as a project, with why. Opening, making or importing a
 * project shows it in the writing window once the script on screen is
 * saved, and the script stays when it cannot be; renaming or deleting the
 * project on screen first waits for its saves. Imports make a copy in the
 * library and let the writer open it from the report.
 */
import { type ReadResult, readDraft } from "../core/draft-file.ts";
import { readFdx } from "../core/fdx/read.ts";
import { readFountain } from "../core/fountain/read.ts";
import type { ScriptRead } from "../core/import-report.ts";
import type { Script } from "../core/model.ts";
import { paginate } from "../core/paginate.ts";
import type { DraftTexts } from "./draft-texts.ts";
import type { Library, Project } from "./library.ts";
import { emptyScript, FIRST_DRAFT, type Opening, projectName, UNTITLED } from "./opening.ts";
import type { Place, Saver } from "./saving.ts";

/** One row of the list: a project, or a folder Tir cannot read as one. */
export interface Row {
  readonly folder: string;
  /** What the list calls it: the project's name, or its folder's for one Tir cannot read. */
  readonly name: string;
  /**
   * Whether the row shows its folder, which no two share: another row has
   * its name. Never for a folder Tir cannot read, named by its folder.
   */
  readonly showFolder: boolean;
  /** Null for a folder Tir cannot read as a project, as `problem` says. */
  readonly project: Project | null;
  readonly problem: string | null;
  /** When its drafts were last written, in milliseconds since 1970; null when unknown. */
  readonly edited: number | null;
  /** Whether it is the project in the writing window. */
  readonly open: boolean;
}

/** When `project`'s script was last edited: the newest of its drafts' files. */
export function lastEdit(project: Project): number | null {
  let last: number | null = null;
  for (const { file } of project.info.drafts) {
    const time = project.edited[file];
    if (time !== undefined && (last === null || time > last)) last = time;
  }
  return last;
}

/**
 * The list's rows: the projects, the one edited last first and those
 * edited at the same moment by name, then the folders Tir cannot read, by
 * name. `open` is the folder of the project in the writing window.
 */
export function rows(library: Library, open: string | null): Row[] {
  const projects = library.projects.map(
    (project): Row => ({
      folder: project.folder,
      name: project.info.name,
      showFolder: false,
      project,
      problem: null,
      edited: lastEdit(project),
      open: project.folder === open,
    }),
  );
  projects.sort(
    (a, b) =>
      (b.edited ?? Number.NEGATIVE_INFINITY) - (a.edited ?? Number.NEGATIVE_INFINITY) ||
      a.name.localeCompare(b.name),
  );
  const unreadable = library.unreadable
    .map(
      ({ folder, error }): Row => ({
        folder,
        name: folder,
        showFolder: false,
        project: null,
        problem: error,
        edited: null,
        open: false,
      }),
    )
    .sort((a, b) => a.folder.localeCompare(b.folder));
  const all = [...projects, ...unreadable];
  const shared = repeated(all.map((row) => row.name));
  return all.map((row, i) => (row.project && shared[i] ? { ...row, showFolder: true } : row));
}

/**
 * Whether each of `names` is another's too, as the writer sees them. A
 * project's name need not be unique; its folder is, so a repeated name is
 * shown with its folder.
 */
export function repeated(names: readonly string[]): boolean[] {
  const keys = names.map((name) => name.normalize("NFC"));
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return keys.map((key) => (counts.get(key) ?? 0) > 1);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * When something was last edited, as the list shows it, at `now`: "Just
 * now", "5 minutes ago", "3 hours ago" the same day, "Yesterday", then the
 * date, "Oct 14, 2026" (prototype piece 6).
 */
export function whenEdited(time: number, now: number): string {
  const ago = now - time;
  if (ago < MINUTE) return "Just now";
  if (ago < HOUR) return `${count(Math.floor(ago / MINUTE), "minute", "minutes")} ago`;
  const then = new Date(time);
  const today = new Date(now);
  const day = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  if (day(then) === day(today)) return `${count(Math.floor(ago / HOUR), "hour", "hours")} ago`;
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (day(then) === yesterday.getTime()) return "Yesterday";
  return DATE.format(then);
}

/** "113 pages", "1 draft". */
export const pagesText = (n: number) => count(n, "page", "pages");
export const draftsText = (n: number) => count(n, "draft", "drafts");

/**
 * Counts the pages of each project's active draft as the editor lays it
 * out, reading and paginating the draft (a few milliseconds a draft;
 * findings, "Editor"), and remembers each count until the draft's file
 * changes.
 */
export class PageCounter {
  private readonly read: (project: Project, file: string) => Promise<string>;
  private readonly known = new Map<string, { edited: number; pages: number }>();

  constructor(read: (project: Project, file: string) => Promise<string>) {
    this.read = read;
  }

  /** The pages of `project`'s active draft; null when it cannot be read. */
  async count(project: Project): Promise<number | null> {
    const file = project.info.activeDraft;
    const edited = project.edited[file];
    const key = `${project.folder}/${file}`;
    const known = this.known.get(key);
    if (known && known.edited === edited) return known.pages;
    let read: ReadResult;
    try {
      read = readDraft(await this.read(project, file));
    } catch {
      return null;
    }
    if (!read.ok) return null;
    const pages = paginate(read.script.elements).length;
    if (edited !== undefined) this.known.set(key, { edited, pages });
    return pages;
  }
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
/** `text` ending as a sentence: the Rust side's messages for system errors end without a full stop. */
const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

/** A source picked in the native dialog, without its path. */
export interface Opened {
  readonly name: string;
  readonly text: string;
}

export interface ScriptImport extends ScriptRead {
  readonly format: "fdx" | "fountain";
  readonly fileName: string;
  readonly projectName: string;
  readonly draftName: string;
  readonly targets: readonly Project[];
}

/** What the screen's actions need outside the page (`library.ts`, the dialogs). */
export interface ProjectsSide {
  list(): Promise<Library>;
  read(project: Project, file: string): Promise<string>;
  texts(script: Script): Promise<DraftTexts>;
  create(library: Library, name: string, draftName: string, texts: DraftTexts): Promise<Project>;
  createDraft(project: Project, name: string, texts: DraftTexts, active: boolean): Promise<Project>;
  activate(project: Project, file: string): Promise<Project>;
  rename(library: Library, project: Project, name: string): Promise<Project>;
  remove(project: { readonly folder: string }): Promise<void>;
  /** Picks and reads a screenplay source; null when the dialog is cancelled. */
  pick(): Promise<Opened | null>;
  tell(title: string, message: string): Promise<void>;
}

/** What the actions change in the writing window. */
export interface ProjectsWindow {
  /** Shows `opening` in the writing window, in place of the script there. */
  show(opening: Opening): void;
  /** The project on screen was renamed: its draft is now at `place`, where the saver now saves. */
  moved(place: Place): void;
  /** The project on screen was deleted: no script is open. */
  closed(): void;
}

/**
 * What the Projects screen does: open, make, rename, delete and import
 * projects, one at a time, each answering whether it was done. Anything
 * that goes wrong is told in a message box.
 */
export class Projects {
  private readonly saver: Saver;
  private readonly side: ProjectsSide;
  private readonly window: ProjectsWindow;
  /** The project on screen's name, for a message. */
  private readonly name: () => string;
  /** The last action asked for; each waits for the one before. */
  private last: Promise<unknown> = Promise.resolve();

  constructor(saver: Saver, side: ProjectsSide, window: ProjectsWindow, name: () => string) {
    this.saver = saver;
    this.side = side;
    this.window = window;
    this.name = name;
  }

  /** Opens a project on its active draft, or activates a draft opened from the import report. */
  open(project: Project, file = project.info.activeDraft): Promise<boolean> {
    return this.queue(async () => {
      const name = project.info.name;
      if (!(await this.saved(`“${name}” was not opened.`))) return false;
      let read: ReadResult;
      try {
        read = readDraft(await this.side.read(project, file));
      } catch (error) {
        read = { ok: false, error: message(error) };
      }
      if (!read.ok) {
        await this.side.tell(`Tir could not open “${name}”`, read.error);
        return false;
      }
      if (file !== project.info.activeDraft) {
        try {
          project = await this.side.activate(project, file);
        } catch (error) {
          await this.side.tell(`Tir could not open “${name}”`, message(error));
          return false;
        }
      }
      const opening = { script: read.script, place: { project, file }, name };
      return this.showWhenSaved(opening, `“${name}”`);
    });
  }

  /** Makes the project `name`, an empty script in one draft, `draftName`, and opens it. */
  create(name: string, draftName: string): Promise<boolean> {
    return this.queue(async () => {
      if (!(await this.saved(`“${name}” was not made.`))) return false;
      const script = emptyScript();
      let project: Project;
      try {
        const texts = await this.side.texts(script);
        project = await this.side.create(await this.side.list(), name, draftName, texts);
      } catch (error) {
        await this.side.tell(`Tir could not make “${name}”`, message(error));
        return false;
      }
      const opening = {
        script,
        place: { project, file: project.info.activeDraft },
        name: project.info.name,
      };
      return this.showWhenSaved(opening, `“${project.info.name}”, now in the library,`);
    });
  }

  /**
   * Renames `project`, as listed, `name`. The project on screen is saved
   * first, and its saves then go to its new folder.
   */
  rename(project: Project, name: string): Promise<boolean> {
    return this.queue(async () => {
      const was = project.info.name;
      const open = this.isOpen(project.folder);
      if (open && !(await this.saved(`“${was}” was not renamed.`))) return false;
      let renamed: Project;
      try {
        renamed = await this.side.rename(await this.side.list(), project, name);
      } catch (error) {
        await this.side.tell(`Tir could not rename “${was}”`, message(error));
        return false;
      }
      const place = this.saver.where;
      if (open && place) {
        const moved = { project: renamed, file: place.file };
        this.saver.move(moved);
        this.window.moved(moved);
      }
      return true;
    });
  }

  /**
   * Deletes the project in `folder`, named `name`, with everything in it.
   * A save of the project on screen under way or waiting finishes first,
   * so none lands after; then no script is open.
   */
  remove(folder: string, name: string): Promise<boolean> {
    return this.queue(async () => {
      const open = this.isOpen(folder);
      // What it could not save goes with the project, unless it stays.
      const saved = !open || (await this.saver.settle());
      try {
        await this.side.remove({ folder });
      } catch (error) {
        const unsaved = saved ? "" : ` Nor could Tir save it: ${this.saver.failure ?? ""}`;
        await this.side.tell(
          `Tir could not delete “${name}”`,
          `${sentence(message(error))}${unsaved}`,
        );
        return false;
      }
      if (open) this.window.closed();
      return true;
    });
  }

  /** Resolves once every action asked for has finished, so closing waits for them. */
  idle(): Promise<void> {
    return this.last.then(() => {});
  }

  /** Picks and reads the source before asking where to put it. No files are written. */
  async pickScript(): Promise<ScriptImport | null> {
    let name: string | undefined;
    try {
      const picked = await this.side.pick();
      if (!picked) return null;
      name = picked.name;
      const dot = name.lastIndexOf(".");
      const format = name.slice(dot + 1).toLowerCase();
      if (dot < 0 || (format !== "fdx" && format !== "fountain")) {
        throw new Error("Choose a Fountain (.fountain) or Final Draft (.fdx) file.");
      }
      const read = format === "fdx" ? readFdx(picked.text) : readFountain(picked.text);
      const stem = name.slice(0, dot).trim() || UNTITLED;
      return {
        ...read,
        format,
        fileName: picked.name,
        projectName: projectName(read.script.titlePage, stem),
        draftName: stem,
        targets: (await this.side.list()).projects,
      };
    } catch (error) {
      await this.side.tell(
        name ? `Tir could not import “${name}”` : "Tir could not import the script",
        message(error),
      );
      return null;
    }
  }

  /** Copies the source into the library, without switching away from the draft on screen. */
  importFile(source: ScriptImport, folder: string | null): Promise<Place | false> {
    return this.queue<Place>(async () => {
      const { fileName, script } = source;
      if (!(await this.saved(`“${fileName}” was not imported.`))) return false;
      try {
        const library = await this.side.list();
        const texts = await this.side.texts(script);
        if (folder === null) {
          const project = await this.side.create(library, source.projectName, FIRST_DRAFT, texts);
          return { project, file: project.info.activeDraft };
        }
        const target = library.projects.find((project) => project.folder === folder);
        if (!target) throw new Error("The chosen project is no longer available.");
        const project = await this.side.createDraft(target, source.draftName, texts, false);
        // A new draft is appended without replacing or activating any existing draft.
        const added = project.info.drafts.at(-1) as (typeof project.info.drafts)[number];
        const current = this.saver.where;
        if (current?.project.folder === project.folder) {
          const place = { project, file: current.file };
          this.saver.move(place);
          this.window.moved(place);
        }
        return { project, file: added.file };
      } catch (error) {
        await this.side.tell(`Tir could not import “${fileName}”`, message(error));
        return false;
      }
    });
  }

  private isOpen(folder: string): boolean {
    return this.saver.where?.project.folder === folder;
  }

  private queue<T>(action: () => Promise<T | false>): Promise<T | false> {
    const next = this.last.then(action).catch((error: unknown) => {
      console.error(error);
      return false as const;
    });
    this.last = next;
    return next;
  }

  /**
   * Shows `opening` once the script on screen is saved, with nothing
   * awaited in between, so nothing typed meanwhile is lost; `what` names
   * it in the message when the script cannot be saved.
   */
  private async showWhenSaved(opening: Opening, what: string): Promise<boolean> {
    if (!(await this.saved(`${what} was not opened.`))) return false;
    this.window.show(opening);
    return true;
  }

  /** Saves the script on screen; when it cannot, tells the writer that it stays, and `after`. */
  private async saved(after: string): Promise<boolean> {
    if (await this.saver.settle()) return true;
    await this.side.tell(
      `Tir could not save “${this.name()}”`,
      `${this.saver.failure ?? ""} So the script on screen stays, and ${after}`,
    );
    return false;
  }
}
