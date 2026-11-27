/**
 * Opening and saving the script's file (task 1.9), the stand-in until
 * Stage 2's library and automatic saving (brief, "Saving and backup").
 * Ctrl+O opens a Tir draft or a Fountain file picked in the system's
 * dialog. Ctrl+S saves the draft to the `.tir` file it was opened from or
 * last saved to; when there is none, as after opening a Fountain file, the
 * system's Save dialog asks for one, and Ctrl+Shift+S always asks. The Rust
 * side (`src-tauri/src/script_file.rs`) shows the dialogs and keeps the
 * path, so the page never names a file, and it writes only `.tir` files.
 *
 * A file the readers refuse, such as a damaged or newer draft, leaves the
 * script on screen as it was, and a system message box says why. Opening
 * over changes not yet saved asks first.
 */
import { invoke } from "@tauri-apps/api/core";
import type { Node } from "prosemirror-model";
import { type ReadResult, readDraft, writeDraft } from "../core/draft-file.ts";
import { readFountain } from "../core/fountain/read.ts";
import type { Element, Script, TitlePage } from "../core/model.ts";
import { fromDocument } from "./editor-model.ts";

/** A file the Rust side read: its name, whether it is a Tir draft (else it is Fountain), its text. */
export interface Opened {
  readonly name: string;
  readonly draft: boolean;
  readonly text: string;
}

/** What the Rust side does for opening and saving: the system's dialogs, and the files. */
export interface FileSide {
  /**
   * Asks for a file and reads it; null when the dialog is closed, or when
   * the file cannot be read, which the Rust side says itself.
   */
  open(): Promise<Opened | null>;
  /** Makes the file `open` read last the script's own. */
  keep(): Promise<void>;
  /**
   * Saves `text`, a draft file, to the script's file, asking for one when
   * there is none or `choose` is set; the file's name, or null when the
   * dialog is closed or the file cannot be written, which the Rust side
   * says itself.
   */
  save(text: string, choose: boolean, title: string): Promise<string | null>;
  /** Asks `question` under `title`: true for the button `yes`, false for Cancel. */
  ask(title: string, question: string, yes: string): Promise<boolean>;
  /** Shows what failed, `title`, and why, `message`, until it is dismissed. */
  tell(title: string, message: string): Promise<void>;
}

/** The Rust side's commands (`src-tauri/src/script_file.rs`). */
export const rustSide: FileSide = {
  open: () => invoke("open_script"),
  keep: () => invoke("keep_opened"),
  save: (text, choose, title) => invoke("save_draft", { text, choose, title }),
  ask: (title, question, yes) => invoke("ask", { title, question, yes }),
  tell: (title, message) => invoke("tell", { title, message }),
};

/** The script on screen, as opening and saving see it. */
export interface Screen {
  /** The editor's document. */
  doc(): Node;
  /** Shows `elements` in place of the script, with an undo history of their own. */
  open(elements: readonly Element[]): void;
  /** Shows the script's title in the top bar. */
  title(text: string): void;
  /** Says for a moment that the script was saved to the file `name`. */
  saved(name: string): void;
}

export class ScriptFiles {
  private readonly screen: Screen;
  private readonly side: FileSide;
  private titlePage: TitlePage;
  /** The document as last opened or saved: when the editor's differs, it has changes not saved. */
  private savedDoc: Node;
  /** The last open or save asked for; each waits for the one before. */
  private last: Promise<void> = Promise.resolve();

  constructor(screen: Screen, side: FileSide, titlePage: TitlePage) {
    this.screen = screen;
    this.side = side;
    this.titlePage = titlePage;
    this.savedDoc = screen.doc();
    screen.title(titlePage.title || "Untitled");
  }

  /** Asks for a file and shows its script in place of the one on screen. */
  open(): Promise<void> {
    return this.queue("Tir could not open the file", async () => {
      const opened = await this.side.open();
      if (!opened) return;
      // A draft is refused whole when damaged or newer; Fountain reads whatever it holds.
      const read: ReadResult = opened.draft
        ? readDraft(opened.text)
        : { ok: true, script: readFountain(opened.text).script };
      if (!read.ok) {
        await this.side.tell(`Tir could not open “${opened.name}”`, read.error);
        return;
      }
      if (
        this.changed() &&
        !(await this.side.ask(
          "Discard the changes on screen?",
          `The script on screen has changes that are not saved. Opening “${opened.name}” discards them.`,
          "Discard",
        ))
      ) {
        return;
      }
      await this.side.keep();
      this.show(read.script);
    });
  }

  /** Saves the script as a draft, to a file picked in the Save dialog when there is none yet or `choose` is set. */
  save(choose = false): Promise<void> {
    return this.queue("Tir could not save the script", async () => {
      const doc = this.screen.doc();
      const text = writeDraft({ titlePage: this.titlePage, elements: fromDocument(doc) });
      const name = await this.side.save(text, choose, this.titlePage.title);
      if (name === null) return;
      this.savedDoc = doc;
      this.screen.saved(name);
    });
  }

  /** Runs `task` after the open or save before it, saying under `failure` why it failed if it does. */
  private queue(failure: string, task: () => Promise<void>): Promise<void> {
    this.last = this.last.then(task).catch(async (error: unknown) => {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      await this.side.tell(failure, message).catch(console.error);
    });
    return this.last;
  }

  private changed(): boolean {
    const doc = this.screen.doc();
    return doc !== this.savedDoc && !doc.eq(this.savedDoc);
  }

  private show({ titlePage, elements }: Script): void {
    this.titlePage = titlePage;
    this.screen.open(elements);
    this.savedDoc = this.screen.doc();
    this.screen.title(titlePage.title || "Untitled");
  }
}

type Keys = Pick<KeyboardEvent, "key" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey">;

export type FileAction = "open" | "save" | "saveAs";

/**
 * What a key press does with the script's file, recorded in brief,
 * "Elements and keys": Ctrl+O opens, Ctrl+S saves, Ctrl+Shift+S saves to a
 * file picked anew.
 */
export function fileKey({ key, ctrlKey, shiftKey, altKey, metaKey }: Keys): FileAction | null {
  if (!ctrlKey || altKey || metaKey) return null;
  switch (key.toLowerCase()) {
    case "o":
      return shiftKey ? null : "open";
    case "s":
      return shiftKey ? "saveAs" : "save";
    default:
      return null;
  }
}

/**
 * Catches the file keys on their way down to the element with focus, as the
 * window's other keys are (`desk.ts`), so they work from any field too.
 */
export function listenForFileKeys(files: ScriptFiles): void {
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.isComposing) return;
      const action = fileKey(event);
      if (!action) return;
      event.preventDefault();
      if (action === "open") void files.open();
      else void files.save(action === "saveAs");
    },
    true,
  );
}
