import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readDraft, writeDraft } from "../core/draft-file.ts";
import { readFountain } from "../core/fountain/read.ts";
import { newTitlePage, type ProjectInfo, type Script } from "../core/model.ts";
import {
  newProject,
  withActiveDraft,
  withDraftRenamed,
  withNewDraft,
  withoutDraft,
  writeProject,
} from "../core/project-file.ts";
import { draftTexts } from "./draft-texts.ts";
import { changeDraft, type DraftAction } from "./drafts.ts";
import { scriptState } from "./editor.ts";
import type { Project } from "./library.ts";
import { openAtLaunch } from "./opening.ts";
import { Saver } from "./saving.ts";

const FIRST = "First Draft.tir";
const FORK = "Rewrite.tir";
const titlePage = {
  ...newTitlePage(),
  title: "Salt Line",
  draftDate: "November revision",
  showDraftDate: true,
};
const scene = (text: string): Script["elements"] => [{ type: "sceneHeading", text }];
const original = { titlePage, elements: scene("EXT. HARBOUR - DAY") };

function desk() {
  const files = new Map([[FIRST, writeDraft(original)]]);
  let shelf: Project;
  function publish(info: ProjectInfo): Project {
    shelf = {
      folder: "Salt Line",
      info,
      text: writeProject(info),
      files: [...files.keys()],
      edited: {},
    };
    return shelf;
  }
  const project = publish(newProject("Salt Line", "First Draft"));
  const doc = (script: Script) => scriptState(script.elements).doc;
  const fail = { save: false };
  const saver = new Saver(
    {
      texts: async (script) => draftTexts(script),
      write: async (place, made) => {
        if (fail.save) throw new Error("Disk full");
        files.set(place.file, made.draft);
      },
      create: async () => {
        throw new Error("Expected to save to an existing draft");
      },
    },
    { state: () => {}, failed: () => {}, placed: () => {} },
  );
  saver.show({ project, file: FIRST }, titlePage, doc(original));
  const messages: string[] = [];
  const exports: { name: string; text: string }[] = [];
  const side: Parameters<typeof changeDraft>[1] = {
    texts: async (script) => draftTexts(script),
    read: async (_project, file) => {
      const text = files.get(file);
      if (!text) throw new Error(`Missing draft: ${file}`);
      return text;
    },
    create: async (from, name, made, active) => {
      const added = withNewDraft(from.info, name, [...files.keys()]);
      files.set(added.file, made.draft);
      return publish(active ? withActiveDraft(added.project, added.file) : added.project);
    },
    activate: async (from, file) => publish(withActiveDraft(from.info, file)),
    exportFountain: async (name, text) => {
      exports.push({ name, text });
    },
    rename: async (from, file, name) => {
      const renamed = withDraftRenamed(from.info, file, name, [...files.keys()]);
      files.set(renamed.file, files.get(file) ?? "");
      files.delete(file);
      return { project: publish(renamed.project), file: renamed.file };
    },
    remove: async (from, file) => {
      const info = withoutDraft(from.info, file);
      files.delete(file);
      return publish(info);
    },
    tell: async (title, message) => {
      messages.push(`${title}: ${message}`);
    },
  };
  return {
    exports,
    fail,
    files,
    messages,
    saver,
    edit: (text: string) => saver.changed(doc({ titlePage, elements: scene(text) })),
    async act(action: DraftAction) {
      const result = await changeDraft(saver, side, action);
      if (result && "opening" in result) {
        const { place, script } = result.opening;
        saver.show(place, script.titlePage, doc(script));
      }
      if (result && "moved" in result) saver.move(result.moved);
      return result;
    },
    /** The project file names `file` active, as a change made outside Tir could; the screen keeps its draft. */
    activateElsewhere(file: string) {
      const place = saver.where;
      if (!place) throw new Error("Expected a draft on screen");
      saver.move({ project: publish(withActiveDraft(shelf.info, file)), file: place.file });
    },
    reopen: () =>
      openAtLaunch(project.folder, {
        list: async () => ({ names: [project.folder], projects: [shelf], unreadable: [] }),
        read: side.read,
      }),
  };
}

function contents(files: Map<string, string>, file: string) {
  return readDraft(files.get(file) ?? "");
}

describe("draft actions", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("forks the unsaved scene and title page, then keeps changes to each draft separate", async () => {
    const { act, edit, files, reopen, saver } = desk();
    const revised = { ...titlePage, contact: "Ada Shaw\nada@example.test" };
    const atFork = { titlePage: revised, elements: scene("EXT. FLOODED HARBOUR - NIGHT") };
    edit("EXT. FLOODED HARBOUR - NIGHT");
    saver.editTitlePage(revised);
    await act({ kind: "fork", name: "Rewrite" });
    expect((await reopen()).opening).toMatchObject({ place: { file: FORK }, script: atFork });
    expect(contents(files, FIRST)).toEqual({ ok: true, script: atFork });

    edit("INT. TIDE STATION - MORNING");
    const forkTitle = { ...revised, showDraftDate: false };
    saver.editTitlePage(forkTitle);
    await act({ kind: "switch", file: FIRST });
    expect(saver.snapshot()).toEqual(atFork);
    expect((await reopen()).opening?.place?.file).toBe(FIRST);

    edit("EXT. PIER - NIGHT");
    await act({ kind: "switch", file: FORK });
    expect(saver.snapshot()).toEqual({
      titlePage: forkTitle,
      elements: scene("INT. TIDE STATION - MORNING"),
    });
    expect(contents(files, FIRST)).toEqual({
      ok: true,
      script: { titlePage: revised, elements: scene("EXT. PIER - NIGHT") },
    });
  });

  it("does not fork if the source cannot be saved", async () => {
    const { act, edit, fail, files, messages, saver } = desk();
    fail.save = true;
    edit("INT. UNSAVED ROOM - NIGHT");
    await act({ kind: "fork", name: "Rewrite" });
    expect(files.has(FORK)).toBe(false);
    expect(saver.where?.file).toBe(FIRST);
    expect(saver.snapshot().elements).toEqual(scene("INT. UNSAVED ROOM - NIGHT"));
    expect(messages[0]).toContain("Disk full");
  });

  it("exports the draft on screen with its latest text and title page even if saving fails", async () => {
    const { act, edit, exports, fail, files, saver } = desk();
    const revised = { ...titlePage, contact: "Ada Shaw\nada@example.test" };
    const elements = scene("EXT. FLOODED HARBOUR - NIGHT");
    fail.save = true;
    edit("EXT. FLOODED HARBOUR - NIGHT");
    saver.editTitlePage(revised);
    await act({ kind: "export" });
    const [exported] = exports;
    if (!exported) throw new Error("Expected a Fountain export");
    expect(exported.name).toBe("Salt Line - First Draft.fountain");
    expect(readFountain(exported.text)).toEqual({
      script: { titlePage: revised, elements },
      leftOut: [],
    });
    expect(contents(files, FIRST)).toEqual({ ok: true, script: original });
  });

  it("neither switches nor deletes when the other draft cannot be read", async () => {
    const { act, files, messages, reopen, saver } = desk();
    await act({ kind: "fork", name: "Rewrite" });
    files.set(FIRST, "{damaged draft");
    await act({ kind: "switch", file: FIRST });
    await act({ kind: "delete" });
    expect(saver.where?.file).toBe(FORK);
    expect((await reopen()).opening?.place?.file).toBe(FORK);
    expect(contents(files, FORK)).toEqual({ ok: true, script: original });
    expect(messages).toEqual([
      expect.stringContaining("Tir could not switch drafts: “First Draft” could not be read"),
      expect.stringContaining("Tir could not delete “Rewrite”: “First Draft” could not be read"),
    ]);
  });

  it("renames the draft on screen and saves it to its new file", async () => {
    const { act, activateElsewhere, edit, files, saver } = desk();
    await act({ kind: "fork", name: "Rewrite" });
    activateElsewhere(FIRST);
    await act({ kind: "rename", name: "Polish" });
    expect(saver.where?.file).toBe("Polish.tir");
    edit("INT. BOATHOUSE - DAWN");
    expect(await saver.settle()).toBe(true);
    expect([...files.keys()].sort()).toEqual([FIRST, "Polish.tir"]);
    expect(contents(files, "Polish.tir")).toEqual({
      ok: true,
      script: { titlePage, elements: scene("INT. BOATHOUSE - DAWN") },
    });
    expect(contents(files, FIRST)).toEqual({ ok: true, script: original });
  });

  it("deletes only the draft on screen, then shows the one before it, and never the last", async () => {
    const { act, edit, files, reopen, saver } = desk();
    await act({ kind: "fork", name: "Rewrite" });
    edit("INT. BOATHOUSE - DAWN");
    await act({ kind: "delete" });
    expect([...files.keys()]).toEqual([FIRST]);
    expect(saver.where?.file).toBe(FIRST);
    expect(saver.snapshot()).toEqual(original);
    expect((await reopen()).opening?.place?.file).toBe(FIRST);

    expect(await act({ kind: "delete" })).toBeNull();
    expect(contents(files, FIRST)).toEqual({ ok: true, script: original });
  });
});
