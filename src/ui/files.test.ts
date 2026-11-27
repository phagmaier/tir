import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Node } from "prosemirror-model";
import { type EditorState, Selection } from "prosemirror-state";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DRAFT_VERSION, writeDraft } from "../core/draft-file.ts";
import { everyFormat } from "../core/fixtures/scripts.ts";
import { type Element, newTitlePage, type Script } from "../core/model.ts";
import { popupOf } from "./autocomplete.ts";
import { devScript } from "./dev-fixtures.ts";
import { scriptState } from "./editor.ts";
import { action, apply, cue, dialogue, heading, press, type, typeEach } from "./editor-harness.ts";
import { fromDocument } from "./editor-model.ts";
import { type FileSide, fileKey, type Opened, type Screen, ScriptFiles } from "./files.ts";

/** The editor as opening and saving see it, its state made as the editor makes it. */
class TestScreen implements Screen {
  state: EditorState;
  shownTitle = "";
  readonly savedTo: string[] = [];

  constructor(elements: readonly Element[]) {
    this.state = scriptState(elements);
  }

  doc(): Node {
    return this.state.doc;
  }

  open(elements: readonly Element[]): void {
    this.state = scriptState(elements);
  }

  title(text: string): void {
    this.shownTitle = text;
  }

  saved(name: string): void {
    this.savedTo.push(name);
  }
}

/**
 * The Rust side over a directory: the dialogs answer from `picks` in turn,
 * a file name or null for Cancel, and the questions from `answers`. Saving
 * writes the draft opened or last saved, else asks.
 */
class DiskSide implements FileSide {
  readonly picks: (string | null)[] = [];
  readonly answers: boolean[] = [];
  readonly asked: string[] = [];
  readonly told: [title: string, message: string][] = [];
  private readonly dir: string;
  private draft: string | null = null;
  private read: string | null = null;

  constructor(dir: string) {
    this.dir = dir;
  }

  async open(): Promise<Opened | null> {
    const name = this.picks.shift() ?? null;
    if (name === null) return null;
    this.read = name;
    return { name, draft: name.endsWith(".tir"), text: readFileSync(join(this.dir, name), "utf8") };
  }

  async keep(): Promise<void> {
    if (this.read !== null) this.draft = this.read.endsWith(".tir") ? this.read : null;
    this.read = null;
  }

  async save(text: string, choose: boolean): Promise<string | null> {
    const name = choose || this.draft === null ? (this.picks.shift() ?? null) : this.draft;
    if (name === null) return null;
    writeFileSync(join(this.dir, name), text);
    this.draft = name;
    return name;
  }

  async ask(_title: string, question: string): Promise<boolean> {
    this.asked.push(question);
    return this.answers.shift() ?? false;
  }

  async tell(title: string, message: string): Promise<void> {
    this.told.push([title, message]);
  }
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tir-files-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const file = (name: string) => readFileSync(join(dir, name), "utf8");

function filesFor(script: Script) {
  const screen = new TestScreen(script.elements);
  const side = new DiskSide(dir);
  return { screen, side, files: new ScriptFiles(screen, side, script.titlePage) };
}

const harbour: Script = {
  titlePage: { ...newTitlePage(), title: "Salt Line" },
  elements: [
    heading("INT. HARBOUR OFFICE - NIGHT"),
    action("The gate is locked."),
    cue("TEO"),
    dialogue("Open up."),
  ],
};

describe("saving and opening a draft file", () => {
  it.each([
    ["every element type and format", everyFormat],
    ["the 120-page fixture", devScript(null)],
  ])("%s saves and opens again as it was", async (_, script) => {
    const writer = filesFor(script);
    writer.side.picks.push("draft.tir");
    await writer.files.save();
    expect(writer.screen.savedTo).toEqual(["draft.tir"]);
    const saved = file("draft.tir");

    const reader = filesFor(harbour);
    reader.side.picks.push("draft.tir");
    await reader.files.open();
    expect(fromDocument(reader.screen.doc())).toEqual(script.elements);
    expect(reader.screen.shownTitle).toBe(script.titlePage.title || "Untitled");
    // Saved again, to the file it came from without a dialog, the title
    // page included, the file is as it was.
    await reader.files.save();
    expect(reader.screen.savedTo).toEqual(["draft.tir"]);
    expect(file("draft.tir")).toBe(saved);
    expect(reader.side.told).toEqual([]);
  });

  it("opens a Fountain file as its script and title", async () => {
    writeFileSync(
      join(dir, "salt.fountain"),
      "Title: Salt Line\nAuthor: Mara Ellison\n\nINT. HARBOUR OFFICE - NIGHT\n\nThe gate is locked.\n\nTEO\nOpen up.\n",
    );
    const { screen, side, files } = filesFor({ titlePage: newTitlePage(), elements: [action("")] });
    side.picks.push("salt.fountain");
    await files.open();
    expect(fromDocument(screen.doc())).toEqual(harbour.elements);
    expect(screen.shownTitle).toBe("Salt Line");
  });

  it.each([
    ["a damaged draft", (text: string) => text.slice(0, text.length / 2), "is damaged"],
    [
      "a newer draft",
      (text: string) =>
        text.replace(`"version": ${DRAFT_VERSION},`, `"version": ${DRAFT_VERSION + 1},`),
      "saved by a newer version of Tir",
    ],
  ])("refuses %s whole and keeps the script on screen", async (_, damage, why) => {
    writeFileSync(join(dir, "bad.tir"), damage(writeDraft(everyFormat)));
    const { screen, side, files } = filesFor(harbour);
    side.picks.push("salt.tir");
    await files.save();
    screen.state = type(screen.state, "x");
    const before = screen.doc();

    side.picks.push("bad.tir");
    await files.open();
    expect(side.told).toHaveLength(1);
    expect(side.told[0]?.[0]).toBe("Tir could not open “bad.tir”");
    expect(side.told[0]?.[1]).toContain(why);
    expect(side.asked).toEqual([]);
    expect(screen.doc()).toBe(before);
    expect(screen.shownTitle).toBe("Salt Line");
    // The script still saves to its own file.
    await files.save();
    expect(screen.savedTo).toEqual(["salt.tir", "salt.tir"]);
    expect(file("salt.tir")).toContain("xINT. HARBOUR OFFICE - NIGHT");
  });
});

describe("opening over the script on screen", () => {
  beforeEach(() => {
    writeFileSync(join(dir, "other.tir"), writeDraft(everyFormat));
  });

  it("asks before discarding changes, and Cancel keeps them", async () => {
    const { screen, side, files } = filesFor(harbour);
    screen.state = type(screen.state, "x");
    const changed = screen.doc();
    side.picks.push("other.tir", "other.tir");
    side.answers.push(false, true);

    await files.open();
    expect(side.asked).toHaveLength(1);
    expect(side.asked[0]).toContain("“other.tir”");
    expect(screen.doc()).toBe(changed);
    expect(screen.shownTitle).toBe("Salt Line");

    await files.open();
    expect(side.asked).toHaveLength(2);
    expect(fromDocument(screen.doc())).toEqual(everyFormat.elements);
  });

  it("asks nothing when the script is as opened or saved", async () => {
    const { screen, side, files } = filesFor(harbour);
    side.picks.push("other.tir");
    await files.open();
    // Changed, then undone back to the file's text.
    screen.state = press(type(screen.state, "x"), "Ctrl-z").state;
    side.picks.push("other.tir");
    await files.open();
    // Changed, then saved.
    screen.state = type(screen.state, "x");
    side.picks.push("other.tir");
    await files.save();
    await files.open();
    expect(side.asked).toEqual([]);
  });

  it("leaves the changes unsaved when a save is cancelled or fails", async () => {
    const { screen, side, files } = filesFor(harbour);
    // The Rust side has said why, or the dialog was closed.
    side.save = async () => null;
    screen.state = type(screen.state, "x");
    await files.save();
    expect(screen.savedTo).toEqual([]);
    side.picks.push("other.tir");
    await files.open();
    expect(side.asked).toHaveLength(1);
  });

  it("starts the opened script's undo history and suggestions afresh", async () => {
    const { screen, side, files } = filesFor(harbour);
    screen.state = typeEach(screen.state, "abc");
    side.picks.push("station.tir");
    writeFileSync(
      join(dir, "station.tir"),
      writeDraft({
        titlePage: newTitlePage(),
        elements: [heading("INT. STATION - NIGHT"), cue("MARA"), dialogue("Still here.")],
      }),
    );
    side.answers.push(true);
    await files.open();
    const opened = screen.doc();

    const undone = press(screen.state, "Ctrl-z");
    expect(undone.handled).toBe(false);
    expect(undone.state.doc).toBe(opened);

    // A new cue at the end offers the opened script's names only.
    let state = apply(screen.state, screen.state.tr.setSelection(Selection.atEnd(opened)));
    state = press(state, "Enter").state;
    state = press(state, "Tab").state;
    expect(popupOf(typeEach(state, "T"))).toBeNull();
    expect(popupOf(typeEach(state, "M"))?.options.map((option) => option.text)).toEqual(["MARA"]);
  });
});

describe("the file keys", () => {
  const key = (key: string, mods: Partial<Record<"ctrl" | "shift" | "alt", boolean>> = {}) =>
    fileKey({
      key,
      ctrlKey: !!mods.ctrl,
      shiftKey: !!mods.shift,
      altKey: !!mods.alt,
      metaKey: false,
    });

  it("opens with Ctrl+O, saves with Ctrl+S and asks where with Ctrl+Shift+S", () => {
    expect(key("o", { ctrl: true })).toBe("open");
    expect(key("s", { ctrl: true })).toBe("save");
    expect(key("S", { ctrl: true, shift: true })).toBe("saveAs");
    expect(key("O", { ctrl: true, shift: true })).toBeNull();
    expect(key("s", { ctrl: true, alt: true })).toBeNull();
    expect(key("s")).toBeNull();
  });
});
