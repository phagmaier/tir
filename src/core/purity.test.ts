// Proves the core's purity guard (architecture, design rule 3) really fails
// when src/core/ reaches for ProseMirror, Tauri, the interface, Node or the
// DOM. Probes are written to a temporary copy of the project layout, never
// into src/core/ itself.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const bin = (name: string) => join(root, "node_modules", ".bin", name);

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "tir-purity-"));
  mkdirSync(join(dir, "src", "core"), { recursive: true });
  copyFileSync(join(root, "biome.json"), join(dir, "biome.json"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function lintCoreFile(name: string, source: string) {
  writeFileSync(join(dir, "src", "core", name), source);
  const run = spawnSync(bin("biome"), ["lint", "--vcs-enabled=false", `src/core/${name}`], {
    cwd: dir,
    encoding: "utf8",
  });
  return { status: run.status, output: run.stdout + run.stderr };
}

function typeCheckCoreSource(source: string) {
  writeFileSync(join(dir, "probe.ts"), source);
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      extends: join(root, "src", "core", "tsconfig.json"),
      include: ["probe.ts"],
      exclude: [],
    }),
  );
  const run = spawnSync(bin("tsc"), ["-p", join(dir, "tsconfig.json")], { encoding: "utf8" });
  return { status: run.status, output: run.stdout + run.stderr };
}

describe("src/core/ import guard", () => {
  it.each([
    'import "prosemirror-model";',
    'import "prosemirror-view/style/prosemirror.css";',
    'import "@tauri-apps/api";',
    'import "@tauri-apps/api/core";',
    'import "../ui/main.ts";',
    'import "node:fs";',
    'export const api = await import("@tauri-apps/api/core");',
  ])("rejects %s", (source) => {
    const { status, output } = lintCoreFile("probe.ts", `${source}\n`);
    expect(status).not.toBe(0);
    expect(output).toContain("noRestrictedImports");
  });

  it("allows imports within the core", () => {
    expect(lintCoreFile("probe.ts", 'import "./format.ts";\n').status).toBe(0);
  });

  it("lets core tests use Node", () => {
    expect(lintCoreFile("probe.test.ts", 'import "node:fs";\n').status).toBe(0);
  });
});

describe("src/core/ type guard", () => {
  it.each([
    ["document.title", "document"],
    ["window.innerWidth", "window"],
    ["process.env", "process"],
  ])("rejects %s", (expression, name) => {
    const { status, output } = typeCheckCoreSource(`export const probe = ${expression};\n`);
    expect(status).not.toBe(0);
    expect(output).toContain(`Cannot find name '${name}'`);
  });

  it("accepts plain ES2024", () => {
    const { status, output } = typeCheckCoreSource("export const probe = [1, 2].at(-1);\n");
    expect(output).toBe("");
    expect(status).toBe(0);
  });
});
