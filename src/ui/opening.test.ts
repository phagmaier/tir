import { describe, expect, it } from "vitest";
import { DRAFT_VERSION, writeDraft } from "../core/draft-file.ts";
import { everyFormat } from "../core/fixtures/scripts.ts";
import { newTitlePage, type ProjectInfo, type Script } from "../core/model.ts";
import { newProject, writeProject } from "../core/project-file.ts";
import type { Library, Project } from "./library.ts";
import { FIRST_DRAFT, fileKey, type Opening, openAtLaunch } from "./opening.ts";

const project = (folder: string, info: ProjectInfo = newProject(folder, FIRST_DRAFT)): Project => ({
  folder,
  info,
  text: writeProject(info),
  files: [info.activeDraft],
  edited: {},
});

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

describe("opening at launch", () => {
  // "Tide Line" opens on its second draft, its active one.
  const tide = project("Tide Line", {
    name: "Tide Line",
    drafts: [
      { name: "First Draft", file: "First Draft.tir" },
      { name: "Rewrite", file: "Rewrite.tir" },
    ],
    activeDraft: "Rewrite.tir",
  });
  const salt = project("Salt Line");
  const drafts: Record<string, string> = {
    "Salt Line/First Draft.tir": writeDraft(harbour),
    "Tide Line/First Draft.tir": writeDraft(everyFormat),
    "Tide Line/Rewrite.tir": writeDraft(station),
  };
  const library = (projects: Project[], unreadable: Library["unreadable"] = []): Library => ({
    names: [...projects.map((each) => each.folder), ...unreadable.map((each) => each.folder)],
    projects,
    unreadable,
  });
  const reader = (shelf: Library) => ({
    list: async () => shelf,
    read: async (from: Project, file: string) => {
      const text = drafts[`${from.folder}/${file}`];
      if (text === undefined) throw new Error(`The draft file “${file}” is missing.`);
      return text;
    },
  });
  const opened = ({ opening }: { opening: Opening | null }) =>
    opening && {
      script: opening.script,
      folder: opening.place?.project.folder ?? null,
      file: opening.place?.file ?? null,
      name: opening.name,
    };

  it("opens the project last shown, on its active draft", async () => {
    const shown = await openAtLaunch("Tide Line", reader(library([salt, tide])));
    expect(opened(shown)).toEqual({
      script: station,
      folder: "Tide Line",
      file: "Rewrite.tir",
      name: "Tide Line",
    });
    expect(shown.problem).toBeNull();
  });

  it("opens the library's first project when none was shown or it is gone", async () => {
    for (const last of [null, "Low Tide"]) {
      const shown = await openAtLaunch(last, reader(library([salt, tide])));
      expect(opened(shown)?.folder).toBe("Salt Line");
      expect(shown.opening?.script).toEqual(harbour);
      expect(shown.problem).toBeNull();
    }
  });

  it("opens nothing when the library is empty, so the Projects screen shows", async () => {
    const shown = await openAtLaunch(null, reader(library([])));
    expect(shown).toEqual({ opening: null, problem: null });
  });

  it("says why it cannot open the project last shown, and opens another", async () => {
    const damaged = { folder: "Low Tide", error: "The project file is damaged: …" };
    const shown = await openAtLaunch("Low Tide", reader(library([tide], [damaged])));
    expect(shown.problem).toEqual({
      title: "Tir could not open “Low Tide”",
      message: damaged.error,
    });
    expect(opened(shown)?.folder).toBe("Tide Line");
  });

  it("opens nothing and says why when the draft cannot be read", async () => {
    const newer = writeDraft(harbour).replace(
      `"version": ${DRAFT_VERSION},`,
      `"version": ${DRAFT_VERSION + 1},`,
    );
    for (const text of [newer, undefined]) {
      if (text === undefined) delete drafts["Salt Line/First Draft.tir"];
      else drafts["Salt Line/First Draft.tir"] = text;
      const shown = await openAtLaunch("Salt Line", reader(library([salt])));
      expect(shown.opening).toBeNull();
      expect(shown.problem?.title).toBe("Tir could not open “Salt Line”");
    }
    drafts["Salt Line/First Draft.tir"] = writeDraft(harbour);
  });

  it("opens nothing and says why when the library cannot be read", async () => {
    const failing = {
      list: async (): Promise<Library> => {
        throw new Error("Permission denied (os error 13)");
      },
      read: async () => "",
    };
    expect(await openAtLaunch("Salt Line", failing)).toEqual({
      opening: null,
      problem: {
        title: "Tir could not read the library",
        message: "Permission denied (os error 13)",
      },
    });
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

  it("opens with Ctrl+O and saves with Ctrl+S, and nothing else", () => {
    expect(key("o", { ctrl: true })).toBe("open");
    expect(key("s", { ctrl: true })).toBe("save");
    expect(key("S", { ctrl: true, shift: true })).toBeNull();
    expect(key("O", { ctrl: true, shift: true })).toBeNull();
    expect(key("s", { ctrl: true, alt: true })).toBeNull();
    expect(key("s")).toBeNull();
  });
});
