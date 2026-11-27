import { describe, expect, it } from "vitest";
import type { ProjectInfo } from "./model.ts";
import {
  newProject,
  readProject,
  withActiveDraft,
  withDraftRenamed,
  withNewDraft,
  withoutDraft,
  writeProject,
} from "./project-file.ts";

// Written by hand: a project with two drafts, the second active.
const file = `{
  "format": "tir-project",
  "version": 1,
  "name": "Salt Line",
  "activeDraft": "Rewrite, Nov 2026.tir",
  "drafts": [
    {"name":"First Draft","file":"First Draft.tir"},
    {"name":"Rewrite, Nov 2026","file":"Rewrite, Nov 2026.tir"}
  ]
}
`;
const saltLine: ProjectInfo = {
  name: "Salt Line",
  drafts: [
    { name: "First Draft", file: "First Draft.tir" },
    { name: "Rewrite, Nov 2026", file: "Rewrite, Nov 2026.tir" },
  ],
  activeDraft: "Rewrite, Nov 2026.tir",
};

const refusal = (text: string) => {
  const read = readProject(text);
  return read.ok ? null : read.error;
};

describe("the project file", () => {
  it("writes one draft per line and reads back what it wrote", () => {
    expect(writeProject(saltLine)).toBe(file);
    expect(readProject(file)).toEqual({ ok: true, project: saltLine });
    const odd: ProjectInfo = {
      name: "Tomás\u2028«Ñ» 🌊",
      drafts: [{ name: 'A "draft"\nof two lines', file: "Tomás.tir" }],
      activeDraft: "Tomás.tir",
    };
    const text = writeProject(odd);
    expect(text.split("\n")).toHaveLength(10);
    expect(readProject(text)).toEqual({ ok: true, project: odd });
  });

  it("refuses a damaged file whole, saying it is damaged", () => {
    const change = (from: string, to: string) => file.replace(from, to);
    const damaged = [
      "",
      "{",
      file.slice(0, file.length / 2),
      change('"version": 1', '"version": "1"'),
      change('"version": 1', '"version": 0'),
      change('"version": 1,\n', ""),
      change('"name": "Salt Line"', '"name": null'),
      change('"name": "Salt Line",\n', ""),
      change('"name": "Salt Line"', '"name": "Salt Line", "colour": "red"'),
      change(/"drafts": \[[^\]]*\]/.exec(file)?.[0] ?? "", '"drafts": []'),
      change('"drafts"', '"draft"'),
      change('{"name":"First Draft",', '{"name":"First Draft","words":1,'),
      change('{"name":"First Draft",', "{"),
      change('{"name":"First Draft","file":"First Draft.tir"}', '"First Draft.tir"'),
      change('"Rewrite, Nov 2026.tir"', '"Polish.tir"'),
      change('"activeDraft": "Rewrite, Nov 2026.tir",\n', ""),
      change('"file":"First Draft.tir"', '"file":"Rewrite, Nov 2026.tir"'),
    ];
    for (const text of damaged)
      expect([text, refusal(text)]).toEqual([text, expect.stringMatching(/damaged/)]);
  });

  it("refuses a draft file that is not in the project's drafts folder", () => {
    for (const name of [
      "../First Draft.tir",
      "/home/you/First Draft.tir",
      "drafts/First Draft.tir",
      "..\\First Draft.tir",
      ".tir",
      ".First Draft.tir",
      "First Draft.fountain",
      "First Draft",
      "",
    ]) {
      const text = file.replaceAll('"First Draft.tir"', JSON.stringify(name));
      expect([name, refusal(text)]).toEqual([name, expect.stringMatching(/damaged/)]);
    }
  });

  it("refuses another file or a newer project, saying so", () => {
    expect(refusal(file.replace("tir-project", "tir-draft"))).toBe(
      "This file is not a Tir project.",
    );
    expect(refusal('{"name": "Salt Line"}')).toBe("This file is not a Tir project.");
    const newer = file.replace('"version": 1', '"version": 2').replace('"name"', '"title"');
    expect(refusal(newer)).toMatch(/newer version of Tir/);
  });

  it("is never written when it could not be read back", () => {
    expect(() => writeProject({ ...saltLine, activeDraft: "Polish.tir" })).toThrow();
    expect(() => writeProject({ ...saltLine, drafts: [] })).toThrow();
    const escaping = { name: "x", file: "../x.tir" };
    expect(() =>
      writeProject({ ...saltLine, drafts: [escaping], activeDraft: "../x.tir" }),
    ).toThrow();
  });
});

describe("a project's changes", () => {
  it("make a new project with one active draft named from its name", () => {
    expect(newProject("Salt Line: Redux", "First Draft")).toEqual({
      name: "Salt Line: Redux",
      drafts: [{ name: "First Draft", file: "First Draft.tir" }],
      activeDraft: "First Draft.tir",
    });
    expect(newProject("Salt Line", "../Draft").drafts[0]?.file).toBe("-Draft.tir");
  });

  it("add a draft in a file nothing in the folder has, nor its copy", () => {
    const inFolder = [
      "First Draft.tir",
      "First Draft.fountain",
      "Rewrite.fountain",
      "Rewrite, Nov 2026.tir",
    ];
    const added = withNewDraft(saltLine, "Rewrite", inFolder);
    expect(added.file).toBe("Rewrite 2.tir");
    expect(added.project).toEqual({
      ...saltLine,
      drafts: [...saltLine.drafts, { name: "Rewrite", file: "Rewrite 2.tir" }],
    });
    // A listed draft's file is taken even when the folder's list missed it.
    expect(withNewDraft(saltLine, "first draft", []).file).toBe("first draft 2.tir");
    expect(withNewDraft(saltLine, "Polish", inFolder).file).toBe("Polish.tir");
  });

  it("rename a draft and move it to a file named from the new name", () => {
    const inFolder = [
      "First Draft.tir",
      "First Draft.fountain",
      "Rewrite, Nov 2026.tir",
      "Polish.tir",
    ];
    const renamed = withDraftRenamed(saltLine, "Rewrite, Nov 2026.tir", "Final", inFolder);
    expect(renamed).toEqual({
      project: {
        ...saltLine,
        drafts: [saltLine.drafts[0], { name: "Final", file: "Final.tir" }],
        activeDraft: "Final.tir",
      },
      file: "Final.tir",
    });
    // A name that gives the same file keeps it, and its copy does not count against it.
    expect(withDraftRenamed(saltLine, "First Draft.tir", "First Draft?", inFolder).file).toBe(
      "First Draft.tir",
    );
    expect(withDraftRenamed(saltLine, "First Draft.tir", "first draft", inFolder).file).toBe(
      "first draft.tir",
    );
    expect(withDraftRenamed(saltLine, "First Draft.tir", "Polish", inFolder)).toEqual({
      project: {
        ...saltLine,
        drafts: [{ name: "Polish", file: "Polish 2.tir" }, saltLine.drafts[1]],
      },
      file: "Polish 2.tir",
    });
  });

  it("delete a draft but never the last, making a neighbour active", () => {
    const three: ProjectInfo = {
      ...saltLine,
      drafts: [...saltLine.drafts, { name: "Polish", file: "Polish.tir" }],
      activeDraft: "First Draft.tir",
    };
    expect(withoutDraft(three, "Polish.tir")).toEqual({ ...three, drafts: saltLine.drafts });
    // The active draft goes: the one before it, or else the one after, takes over.
    expect(withoutDraft({ ...three, activeDraft: "Polish.tir" }, "Polish.tir").activeDraft).toBe(
      "Rewrite, Nov 2026.tir",
    );
    expect(withoutDraft(three, "First Draft.tir").activeDraft).toBe("Rewrite, Nov 2026.tir");
    const one = newProject("Salt Line", "First Draft");
    expect(() => withoutDraft(one, "First Draft.tir")).toThrow();
    expect(() => withoutDraft(three, "Missing.tir")).toThrow();
  });

  it("make another draft active, only one of its own", () => {
    expect(withActiveDraft(saltLine, "First Draft.tir").activeDraft).toBe("First Draft.tir");
    expect(() => withActiveDraft(saltLine, "../First Draft.tir")).toThrow();
  });
});
