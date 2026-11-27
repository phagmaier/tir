// Proves the core's purity guard (architecture, design rule 3) really fails
// when src/core/ reaches for ProseMirror, Tauri, the interface, Node or the
// DOM. Probes are written to a temporary copy of the project layout, never
// into src/core/ itself.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const bin = (name: string) => join(root, "node_modules", ".bin", name);

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "tir-purity-"));
  mkdirSync(join(dir, "src", "core"), { recursive: true });
  copyFileSync(join(root, "biome.json"), join(dir, "biome.json"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

it("rejects only forbidden core imports", () => {
  const rejected = {
    "prosemirror.ts": 'import "prosemirror-model";',
    "prosemirror-css.ts": 'import "prosemirror-view/style/prosemirror.css";',
    "tauri.ts": 'import "@tauri-apps/api";',
    "tauri-core.ts": 'import "@tauri-apps/api/core";',
    "ui.ts": 'import "../ui/main.ts";',
    "node.ts": 'import "node:fs";',
    // Exercise the guard on dynamic imports as well as static imports.
    "dynamic.ts": 'export const api = await import("@tauri-apps/api/core");',
  };
  const probes = {
    ...rejected,
    "local.ts": 'import "./format.ts";',
    "node.test.ts": 'import "node:fs";',
  };
  const paths = Object.entries(probes).map(([name, source]) => {
    const path = `src/core/${name}`;
    writeFileSync(join(dir, path), `${source}\n`);
    return path;
  });
  const run = spawnSync(
    bin("biome"),
    ["lint", "--vcs-enabled=false", "--reporter=github", ...paths],
    { cwd: dir, encoding: "utf8" },
  );
  const output = run.stdout + run.stderr;
  expect(run.status, output).toBeGreaterThan(0);
  const actual = output
    .split("\n")
    .filter((line) => line.startsWith("::error "))
    .map((line) =>
      line.replace(/^::error title=([^,]+),file=.*\/(src\/core\/[^,]+),.*$/, "$2: $1"),
    );
  const expected = Object.keys(rejected).map(
    (name) => `src/core/${name}: lint/style/noRestrictedImports`,
  );
  expect(actual.sort()).toEqual(expected.sort());
});

it("rejects DOM and Node globals but accepts plain ES2024", () => {
  writeFileSync(
    join(dir, "probe.ts"),
    "export const probe = [document.title, window.innerWidth, process.env, [1, 2].at(-1)];\n",
  );
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      extends: join(root, "src", "core", "tsconfig.json"),
      include: ["probe.ts"],
      exclude: [],
    }),
  );
  const run = spawnSync(bin("tsc"), ["-p", "tsconfig.json", "--pretty", "false"], {
    cwd: dir,
    encoding: "utf8",
  });
  const output = run.stdout + run.stderr;
  expect(run.status, output).toBeGreaterThan(0);
  expect(output.trim().split("\n")).toEqual([
    expect.stringContaining("Cannot find name 'document'"),
    expect.stringContaining("Cannot find name 'window'"),
    expect.stringContaining("Cannot find name 'process'"),
  ]);
});
