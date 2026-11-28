import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EditorState } from "prosemirror-state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readDraft } from "../core/draft-file.ts";
import { everyFormat } from "../core/fixtures/scripts.ts";
import { readFountain } from "../core/fountain/read.ts";
import { newTitlePage, type Script } from "../core/model.ts";
import { copyOf, newProject, writeProject } from "../core/project-file.ts";
import { devScript } from "./dev-fixtures.ts";
import { type DraftTexts, draftTexts } from "./draft-texts.ts";
import { scriptState } from "./editor.ts";
import { pause, press, type } from "./editor-harness.ts";
import { fromDocument } from "./editor-model.ts";
import type { Project } from "./library.ts";
import {
  type CloseSide,
  closer,
  DraftChanged,
  type Place,
  RETRY_MS,
  SAVE_DELAY_MS,
  SAVE_WITHIN_MS,
  type SaveListener,
  Saver,
  type SaveSide,
  type SaveState,
  textsInWorker,
} from "./saving.ts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tir-saving-"));
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  rmSync(dir, { recursive: true, force: true });
});

const project = (folder: string): Project => {
  const info = newProject(folder, "First Draft");
  return { folder, info, text: writeProject(info), files: [info.activeDraft], edited: {} };
};
const salt: Place = { project: project("Salt Line"), file: "First Draft.tir" };

/**
 * The library's side over a temporary folder: a draft and its copy are
 * files there. A write can be held at `gate`, to be under way, fail with
 * `fail` (an error, or an error's message), or fail after writing the
 * draft and not its copy, with `failCopy`.
 */
class DiskSide implements SaveSide {
  readonly writes: DraftTexts[] = [];
  readonly created: Script[] = [];
  fail: string | Error | null = null;
  failCopy = false;
  gate: Promise<void> | null = null;
  writing = 0;
  mostAtOnce = 0;

  async texts(script: Script): Promise<DraftTexts> {
    return draftTexts(script);
  }

  async write(place: Place, texts: DraftTexts): Promise<void> {
    this.mostAtOnce = Math.max(this.mostAtOnce, ++this.writing);
    try {
      if (this.gate) await this.gate;
      if (this.fail) throw typeof this.fail === "string" ? new Error(this.fail) : this.fail;
      writeFileSync(join(dir, place.file), texts.draft);
      if (this.failCopy) throw new Error("No space left on device");
      writeFileSync(join(dir, copyOf(place.file)), texts.copy);
      this.writes.push(texts);
    } finally {
      this.writing--;
    }
  }

  async create(script: Script, texts: DraftTexts): Promise<Place> {
    this.created.push(script);
    const place = { project: project("Untitled"), file: "First Draft.tir" };
    await this.write(place, texts);
    return place;
  }

  /** The script in the draft file named `file`, and in its Fountain copy. */
  onDisk(file = salt.file): { draft: Script; copy: Script } {
    const read = readDraft(readFileSync(join(dir, file), "utf8"));
    if (!read.ok) throw new Error(read.error);
    return {
      draft: read.script,
      copy: readFountain(readFileSync(join(dir, copyOf(file)), "utf8")).script,
    };
  }
}

/** A holding point for a side's writes: they wait until `open` is called. */
function gate(side: DiskSide): () => void {
  let open!: () => void;
  side.gate = new Promise((resolve) => {
    open = resolve;
  });
  return () => {
    side.gate = null;
    open();
  };
}

class Heard implements SaveListener {
  readonly states: [SaveState, string | null][] = [];
  readonly failures: string[] = [];
  readonly places: Place[] = [];
  state(state: SaveState, problem: string | null): void {
    this.states.push([state, problem]);
  }
  failed(problem: string): void {
    this.failures.push(problem);
  }
  placed(place: Place): void {
    this.places.push(place);
  }
  get last(): SaveState | undefined {
    return this.states.at(-1)?.[0];
  }
}

/** The editor as saving sees it: its state, and every change told to the saver. */
function editing(script: Script, place: Place | null = salt) {
  const side = new DiskSide();
  const heard = new Heard();
  const saver = new Saver(side, heard);
  let state: EditorState = scriptState(script.elements);
  saver.show(place, script.titlePage, state.doc);
  const edit = (next: EditorState) => {
    state = next;
    saver.changed(state.doc);
  };
  return {
    side,
    heard,
    saver,
    typed: (text: string) => edit(type(state, text)),
    undo: () => edit(press(state, "Ctrl-z").state),
    /** The script on screen. */
    script: (): Script => ({ titlePage: script.titlePage, elements: fromDocument(state.doc) }),
  };
}

const pass = (ms: number) => vi.advanceTimersByTimeAsync(ms);

const harbour: Script = {
  titlePage: { ...newTitlePage(), title: "Salt Line" },
  elements: [
    { type: "sceneHeading", text: "INT. HARBOUR OFFICE - NIGHT" },
    { type: "action", text: "The gate is locked." },
  ],
};

describe("saving after a pause", () => {
  it("saves a moment after typing pauses, not while typing goes on", async () => {
    const { side, heard, typed, script } = editing(harbour);
    expect(heard.states).toEqual([["saved", null]]);
    // Short of `SAVE_WITHIN_MS` in all.
    for (const letter of "Wav") {
      typed(letter);
      await pass(SAVE_DELAY_MS - 100);
    }
    expect(side.writes).toEqual([]);
    expect(heard.last).toBe("saving");
    await pass(100);
    expect(side.writes).toHaveLength(1);
    expect(side.onDisk().draft).toEqual(script());
    expect(heard.states).toEqual([
      ["saved", null],
      ["saving", null],
      ["saved", null],
    ]);
    // Nothing more to save, nothing more written.
    await pass(10 * SAVE_DELAY_MS);
    expect(side.writes).toHaveLength(1);
  });

  it.each([
    ["every element type and format", everyFormat],
    ["the 120-page fixture", devScript(null)],
  ])("writes a Fountain copy that matches the draft at every save: %s", async (_, start) => {
    const { side, typed, script } = editing(start);
    for (const text of ["INT. ", "LIGHTHOUSE - DAWN"]) {
      typed(text);
      await pass(SAVE_DELAY_MS);
      const { draft, copy } = side.onDisk();
      expect(draft).toEqual(script());
      expect(copy).toEqual(draft);
    }
    expect(side.writes).toHaveLength(2);
  });

  it("writes nothing when the script is back as it was saved", async () => {
    const { side, heard, saver, typed, undo } = editing(harbour);
    typed("x");
    undo();
    saver.editTitlePage({ ...harbour.titlePage, title: "The Breakwater" });
    saver.editTitlePage({ ...harbour.titlePage });
    await pass(SAVE_DELAY_MS);
    expect(side.writes).toEqual([]);
    expect(heard.last).toBe("saved");
  });

  it("saves one at a time, and what is typed during a save after it", async () => {
    const { side, heard, typed, script } = editing(harbour);
    const open = gate(side);
    typed("a");
    await pass(SAVE_DELAY_MS);
    typed("b");
    await pass(SAVE_DELAY_MS);
    // The first save is still under way; the second waits for it.
    expect(side.writes).toEqual([]);
    open();
    await pass(0);
    expect(side.writes).toHaveLength(2);
    expect(side.mostAtOnce).toBe(1);
    expect(side.onDisk().draft).toEqual(script());
    expect(heard.last).toBe("saved");
  });

  it("saves title-page-only changes and does not mark a newer title page saved during a write", async () => {
    const { side, heard, saver } = editing(harbour);
    const firstPage = {
      ...harbour.titlePage,
      authors: "Ada Shaw\nBen Rivers",
      draftDate: "Revised draft\nNovember 27",
      showDraftDate: true,
    };
    const open = gate(side);
    saver.editTitlePage(firstPage);
    expect(heard.last).toBe("saving");
    await pass(SAVE_DELAY_MS);
    expect(side.writing).toBe(1);
    saver.editTitlePage({ ...firstPage, showDraftDate: false });
    open();
    await pass(0);
    expect(side.onDisk().draft.titlePage).toEqual(firstPage);
    expect(heard.last).toBe("saving");
    await pass(SAVE_DELAY_MS);
    const { draft, copy } = side.onDisk();
    expect(draft).toEqual({ ...harbour, titlePage: { ...firstPage, showDraftDate: false } });
    expect(copy).toEqual(draft);
    expect(heard.last).toBe("saved");
  });

  it("makes a project for a script not in the library at its first save, then saves to it", async () => {
    const { side, heard, typed, script } = editing(harbour, null);
    typed("x");
    await pass(SAVE_DELAY_MS);
    typed("y");
    await pass(SAVE_DELAY_MS);
    expect(side.created).toHaveLength(1);
    expect(heard.places.map((place) => place.project.folder)).toEqual(["Untitled"]);
    expect(side.writes).toHaveLength(2);
    expect(side.onDisk().draft).toEqual(script());
  });

  it("saves typing that never pauses, each key at most SAVE_WITHIN_MS after it was typed", async () => {
    const { side, typed, script } = editing(harbour);
    const every = 200;
    // The heading after each key, and when the key was typed.
    const typedAt: [number, string | undefined][] = [];
    for (let now = 0; now < 10_000; now += every) {
      typed("x");
      typedAt.push([now, script().elements[0]?.text]);
      await pass(every);
      const due = typedAt.filter(([at]) => at <= now + every - SAVE_WITHIN_MS).at(-1);
      if (due) {
        // Typing at the start of the heading: the draft holds that key and all before it.
        const onDisk = side.onDisk().draft.elements[0]?.text ?? "";
        expect(onDisk.length).toBeGreaterThanOrEqual(due[1]?.length ?? 0);
      }
    }
    // A save every few seconds, not one a key.
    expect(side.writes.length).toBeLessThanOrEqual(Math.ceil(10_000 / SAVE_WITHIN_MS));
    await pass(SAVE_DELAY_MS);
    expect(side.onDisk().draft).toEqual(script());
  });

  it("typing on during a long save waits for one save after it, not one a key", async () => {
    const { side, typed, script } = editing(harbour);
    const first = gate(side);
    // The first save starts after `SAVE_WITHIN_MS` and is held throughout.
    for (let key = 0; key < 40; key++) {
      typed("a");
      await pass(200);
    }
    expect(side.writes).toEqual([]);
    first();
    const second = gate(side);
    await pass(0);
    // The second save, held, takes everything typed during the first.
    expect(side.writes).toHaveLength(1);
    typed("b");
    await pass(200);
    second();
    await pass(0);
    // What was typed during the second waits for its own pause.
    expect(side.writes).toHaveLength(2);
    expect(side.mostAtOnce).toBe(1);
    await pass(SAVE_DELAY_MS);
    expect(side.writes).toHaveLength(3);
    expect(side.onDisk().draft).toEqual(script());
  });
});

describe("a save that fails", () => {
  it("is told once, tried again, and forgotten once a save succeeds", async () => {
    const { side, heard, saver, typed, script } = editing(harbour);
    side.fail = "No space left on device.";
    typed("x");
    await pass(SAVE_DELAY_MS);
    expect(heard.states.at(-1)).toEqual(["failed", "No space left on device."]);
    expect(saver.failure).toBe("No space left on device.");
    // Tried again after a while, and sooner after typing, told only once.
    await pass(RETRY_MS);
    typed("y");
    await pass(SAVE_DELAY_MS);
    expect(heard.failures).toEqual(["No space left on device. Tir tries again in a moment."]);
    expect(side.writes).toEqual([]);

    side.fail = null;
    await pass(RETRY_MS);
    expect(side.onDisk().draft).toEqual(script());
    expect(heard.last).toBe("saved");
    expect(saver.failure).toBeNull();
    // A later failure is told again.
    side.fail = "The draft file “First Draft.tir” is missing.";
    typed("z");
    await pass(SAVE_DELAY_MS);
    expect(heard.failures).toHaveLength(2);
  });

  it("writes the script again after a save that wrote the draft but not its copy", async () => {
    const { side, heard, typed, undo, script } = editing(harbour);
    typed("a");
    await pass(SAVE_DELAY_MS);
    // A step of its own for undo, written half: the draft, not its copy.
    pause(1000);
    side.failCopy = true;
    typed("b");
    await pass(SAVE_DELAY_MS);
    expect(heard.last).toBe("failed");
    side.failCopy = false;
    // Back to the text last saved whole: the draft no longer holds it.
    undo();
    expect(script().elements[0]?.text).toBe("aINT. HARBOUR OFFICE - NIGHT");
    await pass(SAVE_DELAY_MS);
    const { draft, copy } = side.onDisk();
    expect(draft).toEqual(script());
    expect(copy).toEqual(draft);
    expect(heard.last).toBe("saved");
  });

  it("says how to keep what is on screen when the draft changed on disk, without promising a retry", async () => {
    const { side, heard, saver, typed } = editing(harbour);
    const refused =
      "“First Draft” has changed on disk since Tir opened it, perhaps by a git pull, so Tir saved nothing over it.";
    side.fail = new DraftChanged(refused);
    typed("x");
    await pass(SAVE_DELAY_MS);
    expect(heard.last).toBe("failed");
    expect(heard.failures).toHaveLength(1);
    const told = heard.failures[0] ?? "";
    expect(told.startsWith(`${refused} `)).toBe(true);
    expect(told).toContain("Export Fountain…");
    expect(told).not.toContain("tries again");
    // The indicator, the close question and the draft actions give the same advice.
    expect(saver.failure).toBe(told);
  });
});

describe("making a save's texts", () => {
  /** A worker that fails, as one whose module cannot load does. */
  class FailingWorker extends EventTarget {
    readonly posted: unknown[] = [];
    postMessage(message: unknown): void {
      this.posted.push(message);
    }
    terminate(): void {}
    fail(): void {
      this.dispatchEvent(Object.assign(new Event("error"), { message: "failed to load" }));
    }
  }

  it("makes them on the interface thread once the worker fails, for the waiting saves too", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const worker = new FailingWorker();
    const texts = textsInWorker(() => worker as unknown as Worker);
    const waiting = texts(harbour);
    expect(worker.posted).toHaveLength(1);
    worker.fail();
    expect(await waiting).toEqual(draftTexts(harbour));
    expect(await texts(everyFormat)).toEqual(draftTexts(everyFormat));
    expect(worker.posted).toHaveLength(1);
    quiet.mockRestore();
  });
});

describe("saving at once", () => {
  it("waits for the save under way, then saves what is on screen", async () => {
    const { side, saver, typed, script } = editing(harbour);
    const open = gate(side);
    typed("a");
    await pass(SAVE_DELAY_MS);
    typed("b");
    let settled: boolean | undefined;
    void saver.settle().then((saved) => {
      settled = saved;
    });
    await pass(0);
    expect(settled).toBeUndefined();
    open();
    await pass(0);
    expect(settled).toBe(true);
    expect(side.onDisk().draft).toEqual(script());
  });

  it("answers false when it cannot save, leaving the telling to its caller", async () => {
    const { side, heard, saver, typed } = editing(harbour);
    side.fail = "Permission denied.";
    typed("a");
    expect(await saver.settle()).toBe(false);
    expect(saver.failure).toBe("Permission denied.");
    expect(heard.failures).toEqual([]);
  });

  it("tells a failure itself when asked to report it, once until a save succeeds", async () => {
    const { side, heard, saver, typed } = editing(harbour);
    side.fail = "Permission denied.";
    typed("a");
    expect(await saver.settle(true)).toBe(false);
    expect(heard.failures).toEqual(["Permission denied. Tir tries again in a moment."]);
    // Not again: neither when reported again nor when tried after a while.
    expect(await saver.settle(true)).toBe(false);
    await pass(RETRY_MS);
    expect(heard.failures).toEqual(["Permission denied. Tir tries again in a moment."]);
    side.fail = null;
    expect(await saver.settle(true)).toBe(true);
  });
});

describe("closing", () => {
  /** The window's side of closing, recording what happened in order. */
  function closing(answer: boolean[] = []) {
    const did: string[] = [];
    const side: CloseSide = {
      hold: async () => {
        did.push("hold");
      },
      close: async () => {
        did.push("close");
      },
      ask: async (title) => {
        did.push(`ask ${title}`);
        return answer.shift() ?? false;
      },
    };
    return { did, side, editable: (on: boolean) => did.push(on ? "editable" : "frozen") };
  }

  it("mid-save, waits for the save, saves what was typed since, and only then closes", async () => {
    const { side, saver, typed, script } = editing(harbour);
    const window = closing();
    const close = closer(saver, window.side, window.editable, () => "Salt Line");
    const open = gate(side);
    typed("a");
    await pass(SAVE_DELAY_MS);
    typed("b");
    const closed = close();
    // The window manager asking again while Tir closes changes nothing.
    void close();
    await pass(0);
    expect(window.did).toEqual(["frozen"]);
    open();
    await closed;
    expect(window.did).toEqual(["frozen", "close"]);
    expect(side.writes).toHaveLength(2);
    expect(side.onDisk().draft).toEqual(script());
    expect(side.onDisk().draft.elements[0]?.text).toBe("abINT. HARBOUR OFFICE - NIGHT");
  });

  it("when the save fails, closes only if the writer chooses to, and otherwise lets typing go on", async () => {
    const { side, saver, typed } = editing(harbour);
    const window = closing([false, true]);
    const close = closer(saver, window.side, window.editable, () => "Salt Line");
    side.fail = "No space left on device.";
    typed("a");
    await close();
    expect(window.did).toEqual([
      "frozen",
      "ask Tir could not save “Salt Line”",
      "hold",
      "editable",
    ]);
    await close();
    expect(window.did.slice(4)).toEqual(["frozen", "ask Tir could not save “Salt Line”", "close"]);
  });
});
