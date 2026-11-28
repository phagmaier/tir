import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readDraft, writeDraft } from "../core/draft-file.ts";
import { newTitlePage, type ProjectInfo, type Script } from "../core/model.ts";
import { newProject, withActiveDraft, withNewDraft, writeProject } from "../core/project-file.ts";
import { devScript } from "./dev-fixtures.ts";
import { type DraftTexts, draftTexts } from "./draft-texts.ts";
import { scriptState } from "./editor.ts";
import { type } from "./editor-harness.ts";
import type { Library, Project } from "./library.ts";
import { emptyScript, FIRST_DRAFT, type Opening } from "./opening.ts";
import {
  lastEdit,
  type Opened,
  PageCounter,
  Projects,
  type ProjectsSide,
  rows,
  whenEdited,
} from "./projects.ts";
import { type Place, SAVE_DELAY_MS, Saver } from "./saving.ts";

const project = (
  folder: string,
  edited: Record<string, number> = {},
  info: ProjectInfo = newProject(folder, FIRST_DRAFT),
): Project => ({ folder, info, text: writeProject(info), files: [info.activeDraft], edited });

const harbour: Script = {
  titlePage: { ...newTitlePage(), title: "Salt Line" },
  elements: [
    { type: "sceneHeading", text: "INT. HARBOUR OFFICE - NIGHT" },
    { type: "action", text: "The gate is locked." },
  ],
};
const station: Script = {
  titlePage: newTitlePage(),
  elements: [{ type: "sceneHeading", text: "INT. STATION - NIGHT" }],
};

// Local times, so the expected words hold in any time zone.
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute).getTime();

describe("the list", () => {
  const twoDrafts: ProjectInfo = {
    name: "Tide Line",
    drafts: [
      { name: "First Draft", file: "First Draft.tir" },
      { name: "Rewrite", file: "Rewrite.tir" },
    ],
    activeDraft: "First Draft.tir",
  };

  it("takes a project's last edit from the newest of its drafts", () => {
    const tide = project(
      "Tide Line",
      // A draft file the project does not name is no edit of it.
      { "First Draft.tir": at(20, 9), "Rewrite.tir": at(25, 9), "Orphan.tir": at(27, 9) },
      twoDrafts,
    );
    expect(lastEdit(tide)).toBe(at(25, 9));
    expect(lastEdit(project("New"))).toBeNull();
  });

  it("puts the project edited last first, then folders Tir cannot read", () => {
    const library: Library = {
      names: [],
      projects: [
        project("Low Tide", { "First Draft.tir": at(14, 9) }),
        project("Untimed"),
        project("Salt Line", { "First Draft.tir": at(27, 15) }),
        project("Bright Water", { "First Draft.tir": at(14, 9) }),
      ],
      unreadable: [
        { folder: "Zebra", error: "The project file is missing." },
        { folder: "Ashes", error: "The project file is damaged: …" },
      ],
    };
    const shown = rows(library, "Low Tide").map((row) => [row.folder, row.open, row.problem]);
    expect(shown).toEqual([
      ["Salt Line", false, null],
      // Edited at the same moment: by name.
      ["Bright Water", false, null],
      ["Low Tide", true, null],
      ["Untimed", false, null],
      ["Ashes", false, "The project file is damaged: …"],
      ["Zebra", false, "The project file is missing."],
    ]);
  });

  it("says when a project was edited as the prototype does", () => {
    const now = at(27, 15, 30);
    expect(whenEdited(now - 30_000, now)).toBe("Just now");
    // A file from a clock a little ahead.
    expect(whenEdited(now + 5_000, now)).toBe("Just now");
    expect(whenEdited(at(27, 15, 29), now)).toBe("1 minute ago");
    expect(whenEdited(at(27, 14, 31), now)).toBe("59 minutes ago");
    expect(whenEdited(at(27, 14, 30), now)).toBe("1 hour ago");
    expect(whenEdited(at(27, 0, 5), now)).toBe("15 hours ago");
    expect(whenEdited(at(26, 23, 50), now)).toBe("Yesterday");
    expect(whenEdited(at(26, 0, 0), now)).toBe("Yesterday");
    expect(whenEdited(at(25, 23, 59), now)).toBe("Nov 25, 2026");
    expect(whenEdited(new Date(2025, 9, 14, 12).getTime(), now)).toBe("Oct 14, 2025");
    // Just after midnight, an hour and a half ago was yesterday.
    expect(whenEdited(at(26, 23, 0), at(27, 0, 30))).toBe("Yesterday");
  });
});

describe("counting pages", () => {
  const spike = writeDraft(devScript("spike"));

  it("counts the active draft's pages as the editor lays them out", async () => {
    const counter = new PageCounter(async () => spike);
    // A forced break before each of the fixture's 120 scenes, each a page.
    expect(await counter.count(project("Station", { "First Draft.tir": 1 }))).toBe(120);
    const short = new PageCounter(async () => writeDraft(station));
    expect(await short.count(project("Station"))).toBe(1);
  });

  it("reads a draft again only once its file has changed", async () => {
    const reads: string[] = [];
    let text = spike;
    const counter = new PageCounter(async (from, file) => {
      reads.push(`${from.folder}/${file}`);
      return text;
    });
    expect(await counter.count(project("Station", { "First Draft.tir": 1 }))).toBe(120);
    expect(await counter.count(project("Station", { "First Draft.tir": 1 }))).toBe(120);
    expect(reads).toEqual(["Station/First Draft.tir"]);
    text = writeDraft(station);
    expect(await counter.count(project("Station", { "First Draft.tir": 2 }))).toBe(1);
    expect(reads).toHaveLength(2);
  });

  it("counts nothing for a draft it cannot read or that is damaged", async () => {
    const missing = new PageCounter(async () => {
      throw new Error("The draft file “First Draft.tir” is missing.");
    });
    expect(await missing.count(project("Station", { "First Draft.tir": 1 }))).toBeNull();
    const damaged = new PageCounter(async () => spike.slice(0, 50));
    expect(await damaged.count(project("Station", { "First Draft.tir": 1 }))).toBeNull();
  });
});

describe("the screen's actions", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /**
   * The Projects screen's actions over a library of "Salt Line", on screen
   * with a change waiting to be saved, and "Tide Line". `did` records what
   * happened outside the page, in order.
   */
  function screen({
    saves = true,
    picked = null as Opened | null,
  }: {
    saves?: boolean;
    picked?: Opened | null;
  } = {}) {
    const did: string[] = [];
    const shown: Opening[] = [];
    const moved: Place[] = [];
    const made: DraftTexts[] = [];
    let closed = 0;
    const tide = project("Tide Line");
    const salt = project("Salt Line");
    const drafts: Record<string, string> = {
      "Salt Line/First Draft.tir": writeDraft(harbour),
      "Tide Line/First Draft.tir": writeDraft(station),
    };
    const gates: Promise<void>[] = [];
    const saver = new Saver(
      {
        texts: async (script) => draftTexts(script),
        write: async (place) => {
          await gates.shift();
          did.push(`saved “${place.project.folder}”`);
          if (!saves) throw new Error("No space left on device.");
        },
        create: async () => {
          throw new Error("The script on screen is in the library.");
        },
      },
      { state: () => {}, failed: () => {}, placed: () => {} },
    );
    let state = scriptState(harbour.elements);
    saver.show({ project: salt, file: "First Draft.tir" }, harbour.titlePage, state.doc);
    const typeOnScreen = (text: string) => {
      state = type(state, text);
      saver.changed(state.doc);
    };
    typeOnScreen("x");
    const library: Library = {
      names: ["Salt Line", "Tide Line"],
      projects: [salt, tide],
      unreadable: [],
    };
    const fail = { remove: false };
    const side: ProjectsSide = {
      list: async () => library,
      read: async (from, file) => {
        did.push(`read “${from.folder}/${file}”`);
        const text = drafts[`${from.folder}/${file}`];
        if (text === undefined) throw new Error(`The draft file “${file}” is missing.`);
        return text;
      },
      texts: async (script) => draftTexts(script),
      create: async (shelf, name, draftName, texts) => {
        did.push(`made “${name}” with “${draftName}” beside ${shelf.names.join(", ")}`);
        made.push(texts);
        const madeProject = project(name, {}, newProject(name, draftName));
        drafts[`${madeProject.folder}/${madeProject.info.activeDraft}`] = texts.draft;
        return madeProject;
      },
      createDraft: async (from, name, texts, active) => {
        const added = withNewDraft(from.info, name, from.files);
        drafts[`${from.folder}/${added.file}`] = texts.draft;
        const info = active ? withActiveDraft(added.project, added.file) : added.project;
        return project(from.folder, {}, info);
      },
      activate: async (from, file) => project(from.folder, {}, withActiveDraft(from.info, file)),
      rename: async (_shelf, from, name) => {
        did.push(`renamed “${from.folder}” “${name}”`);
        const info = { ...from.info, name };
        return { ...from, folder: name, info, text: writeProject(info) };
      },
      remove: async ({ folder }) => {
        did.push(`deleted “${folder}”`);
        if (fail.remove) throw new Error("Permission denied (os error 13)");
      },
      pick: async () => picked,
      tell: async (title, message) => {
        did.push(`told ${title}: ${message}`);
      },
    };
    const projects = new Projects(
      saver,
      side,
      {
        // As the window does: the saver then saves the script shown.
        show: (opening) => {
          shown.push(opening);
          const doc = scriptState(opening.script.elements).doc;
          saver.show(opening.place, opening.script.titlePage, doc);
        },
        moved: (place) => moved.push(place),
        closed: () => closed++,
      },
      () => "Salt Line",
    );
    /** Holds the next save at its start until the function returned is called. */
    const holdNextSave = () => {
      const gate = Promise.withResolvers<void>();
      gates.push(gate.promise);
      return gate.resolve;
    };
    return {
      did,
      shown,
      moved,
      made,
      closed: () => closed,
      saver,
      projects,
      salt,
      tide,
      drafts,
      fail,
      typeOnScreen,
      holdNextSave,
    };
  }

  const cannotSave = (after: string) =>
    `told Tir could not save “Salt Line”: No space left on device. So the script on screen stays, and ${after}`;

  describe("opening a project", () => {
    it("saves the script on screen, then shows the project on its active draft", async () => {
      const { did, shown, projects, tide } = screen();
      expect(await projects.open(tide)).toBe(true);
      expect(did).toEqual(["saved “Salt Line”", "read “Tide Line/First Draft.tir”"]);
      expect(shown).toEqual([
        {
          script: station,
          place: { project: tide, file: "First Draft.tir" },
          name: "Tide Line",
        },
      ]);
    });

    it("keeps the script on screen, opening nothing, when it cannot be saved", async () => {
      const { did, shown, projects, tide } = screen({ saves: false });
      expect(await projects.open(tide)).toBe(false);
      expect(did).toEqual(["saved “Salt Line”", cannotSave("“Tide Line” was not opened.")]);
      expect(shown).toEqual([]);
    });

    it("says why it cannot open a draft, and shows nothing", async () => {
      const { did, shown, projects, tide, drafts } = screen();
      drafts["Tide Line/First Draft.tir"] = writeDraft(station).slice(0, 40);
      expect(await projects.open(tide)).toBe(false);
      expect(did.at(-1)).toMatch(/^told Tir could not open “Tide Line”: The draft file is damaged/);
      expect(shown).toEqual([]);
    });

    it("does one thing at a time: a rename asked for during an open waits for it", async () => {
      const { did, moved, saver, projects, salt, tide, holdNextSave } = screen();
      const release = holdNextSave();
      const opening = projects.open(tide);
      // "Salt Line" is on screen when the rename is asked for, but not when it runs.
      const renaming = projects.rename(salt, "Low Tide");
      let idle = false;
      void projects.idle().then(() => {
        idle = true;
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(did).toEqual([]);
      expect(idle).toBe(false);
      release();
      expect(await opening).toBe(true);
      expect(await renaming).toBe(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(idle).toBe(true);
      expect(did).toEqual([
        "saved “Salt Line”",
        "read “Tide Line/First Draft.tir”",
        "renamed “Salt Line” “Low Tide”",
      ]);
      expect(moved).toEqual([]);
      expect(saver.where?.project.folder).toBe("Tide Line");
    });
  });

  it("makes a project with an empty script after saving the script on screen, and shows it", async () => {
    const { did, shown, made, projects } = screen();
    expect(await projects.create("Harbor Lights", "Draft One")).toBe(true);
    expect(did).toEqual([
      "saved “Salt Line”",
      "made “Harbor Lights” with “Draft One” beside Salt Line, Tide Line",
    ]);
    expect(made).toEqual([draftTexts(emptyScript())]);
    expect(shown).toHaveLength(1);
    expect(shown[0]?.script).toEqual(emptyScript());
    expect(shown[0]?.name).toBe("Harbor Lights");
    expect(shown[0]?.place?.project.folder).toBe("Harbor Lights");
  });

  describe("renaming", () => {
    it("renames the project on screen once it is saved, and saves it in its new folder after", async () => {
      const { did, moved, saver, projects, salt, typeOnScreen } = screen();
      expect(await projects.rename(salt, "Salt Line Redux")).toBe(true);
      expect(did).toEqual(["saved “Salt Line”", "renamed “Salt Line” “Salt Line Redux”"]);
      expect(moved.map((place) => [place.project.folder, place.file])).toEqual([
        ["Salt Line Redux", "First Draft.tir"],
      ]);
      typeOnScreen("y");
      expect(await saver.settle()).toBe(true);
      expect(did.at(-1)).toBe("saved “Salt Line Redux”");
    });

    it("renames the project on screen only once its save under way has finished", async () => {
      const { did, projects, salt, holdNextSave } = screen();
      const release = holdNextSave();
      await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
      const renaming = projects.rename(salt, "Salt Line Redux");
      await vi.advanceTimersByTimeAsync(0);
      expect(did).toEqual([]);
      release();
      expect(await renaming).toBe(true);
      expect(did).toEqual(["saved “Salt Line”", "renamed “Salt Line” “Salt Line Redux”"]);
    });

    it("renames nothing when the project on screen cannot be saved", async () => {
      const { did, moved, saver, projects, salt } = screen({ saves: false });
      expect(await projects.rename(salt, "Salt Line Redux")).toBe(false);
      expect(did).toEqual(["saved “Salt Line”", cannotSave("“Salt Line” was not renamed.")]);
      expect(moved).toEqual([]);
      expect(saver.where?.project.folder).toBe("Salt Line");
    });

    it("renames another project without saving the one on screen or moving it", async () => {
      const { did, moved, saver, projects, tide } = screen();
      expect(await projects.rename(tide, "Low Tide")).toBe(true);
      expect(did).toEqual(["renamed “Tide Line” “Low Tide”"]);
      expect(moved).toEqual([]);
      expect(saver.where?.project.folder).toBe("Salt Line");
    });
  });

  describe("deleting", () => {
    it("deletes the project on screen only after its save under way, then closes it", async () => {
      const { did, closed, projects, holdNextSave } = screen();
      const release = holdNextSave();
      // The save a moment after typing starts, and is held.
      await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
      const deleting = projects.remove("Salt Line", "Salt Line");
      await vi.advanceTimersByTimeAsync(0);
      expect(did).toEqual([]);
      release();
      expect(await deleting).toBe(true);
      expect(did).toEqual(["saved “Salt Line”", "deleted “Salt Line”"]);
      expect(closed()).toBe(1);
    });

    it("deletes the project on screen even when its save fails", async () => {
      const { did, closed, projects } = screen({ saves: false });
      expect(await projects.remove("Salt Line", "Salt Line")).toBe(true);
      expect(did).toEqual(["saved “Salt Line”", "deleted “Salt Line”"]);
      expect(closed()).toBe(1);
    });

    it("keeps the project on screen open when it cannot be deleted, and says if it is not saved either", async () => {
      const { did, closed, projects, fail } = screen();
      fail.remove = true;
      expect(await projects.remove("Salt Line", "Salt Line")).toBe(false);
      expect(did.at(-1)).toBe(
        "told Tir could not delete “Salt Line”: Permission denied (os error 13).",
      );
      expect(closed()).toBe(0);

      const failing = screen({ saves: false });
      failing.fail.remove = true;
      expect(await failing.projects.remove("Salt Line", "Salt Line")).toBe(false);
      expect(failing.did).toEqual([
        "saved “Salt Line”",
        "deleted “Salt Line”",
        "told Tir could not delete “Salt Line”: Permission denied (os error 13). Nor could Tir save it: No space left on device.",
      ]);
      expect(failing.closed()).toBe(0);
    });

    it("deletes another project without saving or closing the one on screen", async () => {
      const { did, closed, saver, projects } = screen();
      expect(await projects.remove("Tide Line", "Tide Line")).toBe(true);
      expect(did).toEqual(["deleted “Tide Line”"]);
      expect(closed()).toBe(0);
      expect(saver.where?.project.folder).toBe("Salt Line");
    });
  });

  describe("screenplay import", () => {
    it("copies the script to a new project and preserves the omissions for the report", async () => {
      const picked = {
        name: "harbor.fountain",
        text: "Title: Harbor Lights\nRevision: Green\n\nEXT. QUAY - DAWN #14#\n\n[[Check tide table]]\n\nThe tide is out.\n",
      };
      const { did, shown, drafts, projects } = screen({ picked });
      const source = await projects.pickScript();
      if (!source) throw new Error("Expected the picked Fountain file");
      expect(source.leftOut).toEqual([
        expect.objectContaining({ kind: "titlePageField", text: "Revision" }),
        expect.objectContaining({ kind: "sceneNumber", text: "14" }),
        expect.objectContaining({ kind: "note", text: "Check tide table" }),
      ]);
      expect(did).toEqual([]);
      const place = await projects.importFile(source, null);
      if (!place) throw new Error("Expected a new project");
      expect(did).toEqual([
        "saved “Salt Line”",
        "made “Harbor Lights” with “First Draft” beside Salt Line, Tide Line",
      ]);
      expect(shown).toEqual([]);
      expect(readDraft(drafts["Harbor Lights/First Draft.tir"] ?? "")).toEqual({
        ok: true,
        script: {
          titlePage: { ...station.titlePage, title: "Harbor Lights", credit: "" },
          elements: [
            { type: "sceneHeading", text: "EXT. QUAY - DAWN" },
            { type: "action", text: "The tide is out." },
          ],
        },
      });
      expect(await projects.open(place.project, place.file)).toBe(true);
      expect(shown[0]?.place).toEqual(place);
    });

    it("adds an independent draft to the open project without activating it until Open it", async () => {
      const picked = { name: "night.shoot.FOUNTAIN", text: "INT. STATION - NIGHT\n" };
      const { drafts, shown, projects, saver, salt } = screen({ picked });
      const before = drafts["Salt Line/First Draft.tir"];
      const source = await projects.pickScript();
      if (!source) throw new Error("Expected the picked Fountain file");
      expect(source.projectName).toBe("night.shoot");
      const place = await projects.importFile(source, salt.folder);
      if (!place) throw new Error("Expected a new draft");
      expect(readDraft(drafts["Salt Line/night.shoot.tir"] ?? "")).toEqual({
        ok: true,
        script: { ...station, titlePage: { ...station.titlePage, credit: "" } },
      });
      expect(drafts["Salt Line/First Draft.tir"]).toBe(before);
      expect(shown).toEqual([]);
      expect(saver.where?.file).toBe("First Draft.tir");
      expect(saver.where?.project.info.drafts.map((draft) => draft.name)).toEqual([
        "First Draft",
        "night.shoot",
      ]);
      expect(await projects.open(place.project, place.file)).toBe(true);
      expect(saver.where?.file).toBe("night.shoot.tir");
      expect(saver.where?.project.info.activeDraft).toBe("night.shoot.tir");
    });

    it("does not copy the source when the current draft cannot be saved", async () => {
      const picked = { name: "q.fountain", text: "EXT. QUAY - DAWN\n" };
      const { did, shown, projects } = screen({ picked, saves: false });
      const source = await projects.pickScript();
      if (!source) throw new Error("Expected the picked Fountain file");
      expect(await projects.importFile(source, null)).toBe(false);
      expect(did).toEqual(["saved “Salt Line”", cannotSave("“q.fountain” was not imported.")]);
      expect(shown).toEqual([]);
    });

    it("does nothing when the file chooser is cancelled", async () => {
      const { did, projects } = screen();
      expect(await projects.pickScript()).toBeNull();
      expect(did).toEqual([]);
    });

    it("opens a Final Draft file as a project, preserving the screenplay and reporting the old number", async () => {
      const picked = {
        name: "pump.house.FDX",
        text: `<FinalDraft DocumentType="Script"><Content>
          <Paragraph Type="Scene Heading" Number="7A"><Text>EXT. PUMP HOUSE - NIGHT</Text></Paragraph>
          <Paragraph Type="General"><Text Style="Bold">Water rises.</Text></Paragraph>
        </Content></FinalDraft>`,
      };
      const { drafts, projects, shown } = screen({ picked });
      const source = await projects.pickScript();
      if (!source) throw new Error("Expected the picked Final Draft file");
      expect(source.leftOut).toEqual([{ kind: "sceneNumber", text: "7A", at: 0 }]);
      const place = await projects.importFile(source, null);
      if (!place) throw new Error("Expected a new project");
      expect(readDraft(drafts["pump.house/First Draft.tir"] ?? "")).toEqual({
        ok: true,
        script: {
          titlePage: { ...station.titlePage, credit: "" },
          elements: [
            { type: "sceneHeading", text: "EXT. PUMP HOUSE - NIGHT" },
            { type: "general", text: "Water rises.", bold: [[0, 12]] },
          ],
        },
      });
      expect(await projects.open(place.project, place.file)).toBe(true);
      expect(shown[0]?.place).toEqual(place);
    });

    it("explains an unreadable Final Draft source before creating anything", async () => {
      const { did, projects } = screen({
        picked: { name: "broken.fdx", text: "<FinalDraft><Content>" },
      });
      expect(await projects.pickScript()).toBeNull();
      expect(did).toEqual([
        expect.stringMatching(/^told Tir could not import “broken.fdx”: .*invalid XML/),
      ]);
    });
  });
});
