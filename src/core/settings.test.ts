import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  readSettings,
  type Settings,
  writeSettings,
  zoomIn,
  zoomOut,
} from "./settings.ts";

// Written by hand: the file a writer at 125% on white paper, in focus mode,
// with the sidebar collapsed, leaves behind.
const file = `{
  "format": "tir-settings",
  "version": 1,
  "zoom": 1.25,
  "theme": "light",
  "focus": true,
  "sidebar": "collapsed"
}
`;
const settings: Settings = {
  zoom: 1.25,
  theme: "light",
  focus: true,
  sidebarCollapsed: true,
  project: null,
  library: null,
};

describe("the settings file", () => {
  it("writes one setting per line and reads back what it wrote", () => {
    expect(writeSettings(settings)).toBe(file);
    expect(readSettings(file)).toEqual(settings);
    expect(readSettings(writeSettings(DEFAULT_SETTINGS))).toEqual(DEFAULT_SETTINGS);
  });

  it("gives the defaults when there is no file or it is damaged", () => {
    for (const text of [null, "", "{", file.slice(0, 40), "null", "[]", "1.25", '"zoom"']) {
      expect(readSettings(text)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it("gives the defaults for a JSON file that is not Tir's settings", () => {
    expect(readSettings('{"zoom": 1.25, "theme": "light"}')).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(file.replace("tir-settings", "tir-draft"))).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps each readable setting and gives the default for one it cannot read", () => {
    const read = (change: string) => readSettings(file.replace(/"focus": true/, change));
    expect(read('"focus": "yes"')).toEqual({ ...settings, focus: false });
    expect(readSettings(file.replace('"light"', '"sepia"'))).toEqual({
      ...settings,
      theme: "dark",
    });
    expect(readSettings(file.replace('"collapsed"', "true"))).toEqual({
      ...settings,
      sidebarCollapsed: false,
    });
    expect(readSettings(file.replace("1.25", '"125%"'))).toEqual({ ...settings, zoom: 1 });
    // Fields it does not know, as a newer Tir might write, are left alone.
    expect(read('"focus": true, "ruler": "on"')).toEqual(settings);
    expect(readSettings(file.replace('"version": 1', '"version": 7'))).toEqual(settings);
  });

  it("keeps the library the writer set, and reads a file without one as the default", () => {
    // The file above, from before Tir had a library, reads with none set.
    expect(readSettings(file).library).toBeNull();
    const moved = file.replace('"collapsed"', '"collapsed",\n  "library": "~/Scripts/Tir"');
    expect(readSettings(moved)).toEqual({ ...settings, library: "~/Scripts/Tir" });
    expect(writeSettings({ ...settings, library: "~/Scripts/Tir" })).toBe(moved);
    expect(readSettings(moved.replace('"~/Scripts/Tir"', "42")).library).toBeNull();
  });

  it("keeps the project last shown, and reads a file without one as none", () => {
    expect(readSettings(file).project).toBeNull();
    const shown = file.replace('"collapsed"', '"collapsed",\n  "project": "Salt Line 2"');
    expect(readSettings(shown)).toEqual({ ...settings, project: "Salt Line 2" });
    expect(writeSettings({ ...settings, project: "Salt Line 2" })).toBe(shown);
    expect(readSettings(shown.replace('"Salt Line 2"', "null")).project).toBeNull();
  });

  it("takes the nearest zoom step for a zoom that is not one", () => {
    const zoom = (value: string) => readSettings(file.replace("1.25", value)).zoom;
    expect(zoom("1.2")).toBe(1.25);
    expect(zoom("1.04")).toBe(1);
    expect(zoom("0.66")).toBe(0.7);
    expect(zoom("9")).toBe(2);
    expect(zoom("-1")).toBe(0.5);
  });
});

describe("zoom steps", () => {
  it("step in and out by tens of percent below 100% and wider steps above", () => {
    const up = [0.5];
    while (up.length < 12) up.push(zoomIn(up.at(-1) as number));
    expect(up).toEqual([0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2]);
    const down = [2];
    while (down.length < 12) down.push(zoomOut(down.at(-1) as number));
    expect(down).toEqual([2, 1.75, 1.5, 1.25, 1.1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.5]);
  });
});
