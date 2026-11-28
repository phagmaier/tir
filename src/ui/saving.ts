/**
 * Automatic saving (brief, "Saving and backup"; architecture, "Saving and
 * opening"). The script on screen is saved to its draft in the library a
 * moment after typing pauses, or a few seconds after a change when typing
 * goes on without that pause, and at once before another script takes its
 * place or the window closes (`settle`). Each save writes the draft file
 * and its Fountain copy, made off the interface thread. A script not in
 * the library yet, such as the empty script of an empty library, becomes a
 * project at its first save. Saves go one at a time, each writing the
 * script as it then is; a save that fails is tried again, and the writer
 * is told once until a save succeeds.
 */
import type { Node } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import type { Script, TitlePage } from "../core/model.ts";
import { type DraftTexts, draftTexts } from "./draft-texts.ts";
import { fromDocument } from "./editor-model.ts";
import type { Project } from "./library.ts";

/** The pause in typing after which the script is saved. */
export const SAVE_DELAY_MS = 1000;
/**
 * The longest a change waits for that pause: typing that never pauses is
 * saved this long after the first change no save has taken, so a crash
 * loses at most this, and the time a save takes, of writing.
 */
export const SAVE_WITHIN_MS = 3000;
/** How long after a failed save the next try comes, unless typing brings it sooner. */
export const RETRY_MS = 5000;

/**
 * Refused because the draft has changed on disk since Tir read or wrote
 * it, as a `git pull` changes it: no later save of the script on screen
 * can fix that. `SaveSide.write` rejects with it.
 */
export class DraftChanged extends Error {}

/** What the writer can do with the script on screen once its draft has changed on disk. */
const KEEP_WHAT_IS_ON_SCREEN =
  "Saving again cannot fix this. To keep what is on screen, first choose Export Fountain… in the draft menu. Then close Tir without saving and open it again to see the draft as it is now; Import… on the Projects screen can add the exported script to the project as a new draft.";

/**
 * Saved: the draft holds what is on screen. Saving: it does not yet, and a
 * save waits for a pause or is under way. Failed: the last save failed.
 */
export type SaveState = "saved" | "saving" | "failed";

/** A draft's place in the library: its project, and its file there. */
export interface Place {
  readonly project: Project;
  readonly file: string;
}

/** What a save needs done outside the editor. */
export interface SaveSide {
  /** The texts a save writes for `script`. */
  texts(script: Script): Promise<DraftTexts>;
  /** Writes `texts` to the draft at `place`; rejects with `DraftChanged` when the draft changed on disk. */
  write(place: Place, texts: DraftTexts): Promise<void>;
  /** Makes a project holding `texts`, for a script not in the library yet; its draft's place. */
  create(script: Script, texts: DraftTexts): Promise<Place>;
}

/** What the rest of the window hears from saving. */
export interface SaveListener {
  /** The saved state changed; `problem` is why the last save failed. */
  state(state: SaveState, problem: string | null): void;
  /**
   * A save no caller waited for failed, the first since one succeeded: the
   * writer should hear `message`, why and what comes next, once.
   */
  failed(message: string): void;
  /** The script on screen was put in the library at `place`, a new project. */
  placed(place: Place): void;
}

export class Saver {
  private readonly side: SaveSide;
  private readonly listener: SaveListener;
  private place: Place | null = null;
  private titlePage!: TitlePage;
  private savedTitlePage!: TitlePage;
  /** The editor's document, as last heard. */
  private doc!: Node;
  /** The document as the draft holds it. */
  private saved!: Node;
  /** Counts the scripts shown, so a save finishing for one shown before changes nothing. */
  private shown = 0;
  private state: SaveState = "saved";
  private problem: string | null = null;
  /** Whether the writer has heard of the failures since the last save that succeeded. */
  private told = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** When the first change no save has taken yet was made (`performance.now()`); null with none. */
  private unsavedSince: number | null = null;
  private running: Promise<boolean> | null = null;
  /** Whether a save the timer started waits for the one under way. */
  private queued = false;

  /** Call `show` first: the editor is made with the saver's plugin, before there is a document. */
  constructor(side: SaveSide, listener: SaveListener) {
    this.side = side;
    this.listener = listener;
  }

  /** The draft's place, or null while the script on screen is not in the library. */
  get where(): Place | null {
    return this.place;
  }

  /** The script on screen, including its title page, for saving or forking. */
  snapshot(): Script {
    return { titlePage: this.titlePage, elements: fromDocument(this.doc) };
  }

  /** Why the last save failed, while it is the last. */
  get failure(): string | null {
    return this.problem;
  }

  /**
   * The script on screen is now `doc` with `titlePage`, as the draft at
   * `place` holds it, or not in the library when `place` is null. Wait for
   * `settle` first: a save under way is for the script shown before.
   */
  show(place: Place | null, titlePage: TitlePage, doc: Node): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.unsavedSince = null;
    this.shown++;
    this.place = place;
    this.titlePage = this.savedTitlePage = titlePage;
    this.doc = this.saved = doc;
    this.problem = null;
    this.told = false;
    this.state = "saved";
    this.listener.state("saved", null);
  }

  /**
   * The draft on screen is now at `place`, as after its project was
   * renamed: the saves after it go there. Wait for `settle` first, since a
   * save under way writes to the place it started with.
   */
  move(place: Place): void {
    this.place = place;
  }

  /** The editor's document is now `doc`: it is saved once typing pauses. */
  changed(doc: Node): void {
    this.doc = doc;
    this.schedule();
  }

  /** The form has changed the title page of the draft on screen. */
  editTitlePage(titlePage: TitlePage): void {
    this.titlePage = titlePage;
    this.schedule();
  }

  private schedule(): void {
    if (this.state === "saved") this.setState("saving");
    const now = performance.now();
    this.unsavedSince ??= now;
    this.wait(Math.min(SAVE_DELAY_MS, this.unsavedSince + SAVE_WITHIN_MS - now));
  }

  /**
   * Saves at once whatever waits, after the save under way, until the draft
   * holds what is on screen; false when a save failed, which the caller
   * tells the writer of. With `report`, a failure is told as one no caller
   * waits for is: once, until a save succeeds.
   */
  async settle(report = false): Promise<boolean> {
    clearTimeout(this.timer);
    this.timer = undefined;
    for (;;) {
      while (this.running) await this.running;
      if (this.isSaved()) {
        this.markSaved();
        return true;
      }
      if (!(await this.save(report))) return false;
    }
  }

  private wait(ms: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        void this.saveWhenFree();
      },
      Math.max(0, ms),
    );
  }

  /**
   * Saves once the save under way has finished, if anything is left to
   * save. One waits at a time: typing past `SAVE_WITHIN_MS` during a long
   * save would otherwise queue a save a key, where one, starting after it,
   * takes everything typed.
   */
  private async saveWhenFree(): Promise<void> {
    if (this.queued) return;
    this.queued = true;
    try {
      while (this.running) await this.running;
    } finally {
      this.queued = false;
    }
    if (this.isSaved()) this.markSaved();
    else await this.save(true);
  }

  /** Writes the script as it is now; true when it was written. */
  private save(unwaited: boolean): Promise<boolean> {
    const running = this.write(unwaited).finally(() => {
      if (this.running === running) this.running = null;
    });
    this.running = running;
    return running;
  }

  private async write(unwaited: boolean): Promise<boolean> {
    const shown = this.shown;
    const doc = this.doc;
    const place = this.place;
    const script = this.snapshot();
    this.unsavedSince = null;
    try {
      const texts = await this.side.texts(script);
      if (place) {
        await this.side.write(place, texts);
      } else {
        const made = await this.side.create(script, texts);
        if (shown !== this.shown) return true;
        this.place = made;
        this.listener.placed(made);
      }
      if (shown !== this.shown) return true;
      this.saved = doc;
      this.savedTitlePage = script.titlePage;
      this.problem = null;
      this.told = false;
      this.setState(this.isSaved() ? "saved" : "saving");
      return true;
    } catch (error) {
      if (shown !== this.shown) return false;
      const why = error instanceof Error ? error.message : String(error);
      // The Rust side's messages for system errors end without a full stop.
      const problem = /[.!?]$/.test(why) ? why : `${why}.`;
      const changed = error instanceof DraftChanged;
      this.problem = changed ? `${problem} ${KEEP_WHAT_IS_ON_SCREEN}` : problem;
      this.setState("failed");
      if (unwaited && !this.told) {
        this.listener.failed(
          changed ? this.problem : `${this.problem} Tir tries again in a moment.`,
        );
      }
      this.told = true;
      // Typing brings the next try sooner. A changed draft is tried too,
      // in case it is put back as Tir last saw it.
      if (!this.timer) this.wait(RETRY_MS);
      return false;
    }
  }

  /**
   * Whether the draft holds what is on screen. After a save fails, what it
   * holds is unknown, since the draft may be written and its copy not,
   * until a save succeeds.
   */
  private isSaved(): boolean {
    return (
      this.problem === null &&
      sameTitlePage(this.titlePage, this.savedTitlePage) &&
      (this.doc === this.saved || this.doc.eq(this.saved))
    );
  }

  private markSaved(): void {
    this.unsavedSince = null;
    this.problem = null;
    this.told = false;
    this.setState("saved");
  }

  private setState(state: SaveState): void {
    if (state === this.state && state !== "failed") return;
    this.state = state;
    this.listener.state(state, this.problem);
  }
}

function sameTitlePage(a: TitlePage, b: TitlePage): boolean {
  return (
    a === b ||
    (a.title === b.title &&
      a.credit === b.credit &&
      a.authors === b.authors &&
      a.source === b.source &&
      a.contact === b.contact &&
      a.draftDate === b.draftDate &&
      a.showDraftDate === b.showDraftDate)
  );
}

/** Tells `saver` of each change to the editor's document. */
export function savingPlugin(saver: Saver): Plugin {
  return new Plugin({
    view: () => ({
      update(view, previous) {
        if (view.state.doc !== previous.doc) saver.changed(view.state.doc);
      },
    }),
  });
}

/** What closing the window needs outside the page (`src-tauri/src/closing.rs`). */
export interface CloseSide {
  /** The page saves before the window closes; again after the writer kept Tir open. */
  hold(): Promise<void>;
  /** Closes the window. */
  close(): Promise<void>;
  /** Asks `question` under `title`: true for the button `yes`, false for Cancel. */
  ask(title: string, question: string, yes: string): Promise<boolean>;
}

/**
 * What a request to close the window does: typing stops, so nothing typed
 * after the last save is lost, then the window closes once the draft holds
 * the script. When a save fails, the writer chooses between closing
 * without it and keeping Tir open, typing again. `name` names the project
 * in the question.
 */
export function closer(
  saver: Saver,
  side: CloseSide,
  editable: (on: boolean) => void,
  name: () => string,
): () => Promise<void> {
  let closing = false;
  return async () => {
    if (closing) return;
    closing = true;
    editable(false);
    try {
      const close =
        (await saver.settle()) ||
        (await side.ask(
          `Tir could not save “${name()}”`,
          `${saver.failure ?? ""} Closing now loses what was written since the last save.`,
          "Close without saving",
        ));
      if (close) {
        await side.close();
        return;
      }
    } catch (error) {
      console.error("Tir could not close:", error);
    }
    // The next request to close is held for the page again, from its start.
    await side.hold().catch(console.error);
    editable(true);
    closing = false;
  };
}

/**
 * Makes a save's texts in a worker, off the interface thread
 * (`draft-texts.worker.ts`). A worker that cannot be made, or that fails,
 * answers nothing more, so from then on the texts are made here instead: a
 * save then holds the interface up for a moment, but still happens.
 */
export function textsInWorker(
  make: () => Worker = () =>
    new Worker(new URL("./draft-texts.worker.ts", import.meta.url), { type: "module" }),
): (script: Script) => Promise<DraftTexts> {
  const here = async (script: Script) => draftTexts(script);
  const waiting = new Map<
    number,
    { script: Script; resolve(texts: DraftTexts): void; reject(error: Error): void }
  >();
  let next = 0;
  let worker: Worker | null = null;
  try {
    worker = make();
  } catch (error) {
    console.error("Tir makes its saves on the interface thread:", error);
  }
  worker?.addEventListener(
    "message",
    ({ data }: MessageEvent<{ id: number; texts?: DraftTexts; error?: string }>) => {
      const request = waiting.get(data.id);
      waiting.delete(data.id);
      if (data.texts) request?.resolve(data.texts);
      else request?.reject(new Error(data.error));
    },
  );
  worker?.addEventListener("error", (event) => {
    console.error("Tir makes its saves on the interface thread:", event.message);
    worker?.terminate();
    worker = null;
    for (const { script, resolve, reject } of waiting.values()) here(script).then(resolve, reject);
    waiting.clear();
  });
  return (script) => {
    const live = worker;
    if (!live) return here(script);
    return new Promise((resolve, reject) => {
      const id = next++;
      waiting.set(id, { script, resolve, reject });
      live.postMessage({ id, script });
    });
  };
}
