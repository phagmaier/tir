import { describe, expect, it } from "vitest";
import { isSafeName, safeName, uniqueName } from "./file-names.ts";

// Expected names worked by hand from the rules at the top of file-names.ts.
const unsafe: [title: string, name: string][] = [
  ["Salt Line", "Salt Line"],
  ["Act 1/2", "Act 1-2"],
  ["back\\slash|pipe", "back-slash-pipe"],
  ["../../etc/passwd", "-..-etc-passwd"],
  ["..", "Untitled"],
  [".", "Untitled"],
  [".git", "git"],
  ["  ...And Justice for All", "And Justice for All"],
  ["Salt Line: Redux", "Salt Line - Redux"],
  ["10:30 to Yuma", "10-30 to Yuma"],
  ['The "Big" One', "The 'Big' One"],
  ["Who Killed Bambi?", "Who Killed Bambi"],
  ["<*>", "Untitled"],
  ["The End.", "The End"],
  ["Wait...   ", "Wait"],
  ["  Salt\tLine\n\nRedux  ", "Salt Line Redux"],
  ["Salt\u0000Line\u007f", "Salt Line"],
  ["\u202Etxt.exe", "txt.exe"],
  ["Con", "Con_"],
  ["nul", "nul_"],
  ["LPT1.notes", "LPT1_.notes"],
  ["com² ", "com²_"],
  ["Console", "Console"],
  ["Aux Arcs", "Aux Arcs"],
  ["", "Untitled"],
  ["   ", "Untitled"],
  ["\uD800", "Untitled"],
  ["東京物語", "東京物語"],
  ["Ninety Miles of Snow ❄️", "Ninety Miles of Snow ❄️"],
];

describe("safe names", () => {
  it("turn unsafe titles into one readable entry of a folder", () => {
    for (const [title, name] of unsafe) expect([title, safeName(title)]).toEqual([title, name]);
  });

  it("keep accents, composed whichever way the title had them", () => {
    expect(safeName("Toma\u0301s")).toBe("Tom\u00e1s");
    expect(safeName("Tom\u00e1s")).toBe("Tom\u00e1s");
  });

  it("are cut to 120 bytes of UTF-8 between characters", () => {
    expect(safeName("a".repeat(300))).toBe("a".repeat(120));
    // "é" is two bytes.
    expect(safeName("é".repeat(100))).toBe("é".repeat(60));
    // The family emoji is one character of 18 bytes, kept whole or left out.
    expect(safeName(`${"a".repeat(102)}👨‍👩‍👧`)).toBe(`${"a".repeat(102)}👨‍👩‍👧`);
    expect(safeName(`${"a".repeat(103)}👨‍👩‍👧`)).toBe("a".repeat(103));
    // A cut that ends in a space or a dot loses it.
    expect(safeName(`${"a".repeat(118)}. b`)).toBe("a".repeat(118));
  });

  it("are all names the Rust side accepts", () => {
    for (const [title] of unsafe) expect(isSafeName(safeName(title))).toBe(true);
    expect(isSafeName(safeName("x".repeat(400)))).toBe(true);
  });
});

describe("unique names", () => {
  it("number a name already in the folder, ignoring capitals and accents' encoding", () => {
    expect(uniqueName("Salt Line", ["README.md", "Low Tide"])).toBe("Salt Line");
    expect(uniqueName("Salt Line", ["Salt Line"])).toBe("Salt Line 2");
    expect(uniqueName("Salt Line", ["salt line", "SALT LINE 2"])).toBe("Salt Line 3");
    expect(uniqueName("Tom\u00e1s", ["Toma\u0301s"])).toBe("Tom\u00e1s 2");
    // Both small sigmas have one capital, as a case-blind file system compares them.
    expect(uniqueName("Οδυσσευς", ["ΟΔΥΣΣΕΥΣ"])).toBe("Οδυσσευς 2");
    expect(uniqueName("Οδυσσευς", ["οδυσσευσ"])).toBe("Οδυσσευς 2");
    // A capital sharp s has a small one, which has the capitals "SS".
    expect(uniqueName("STRAẞE", ["straße"])).toBe("STRAẞE 2");
    expect(uniqueName("ẞ", ["ss"])).toBe("ẞ 2");
    expect(uniqueName("..", ["Untitled"])).toBe("Untitled 2");
    expect(uniqueName("Con", ["con_"])).toBe("Con_ 2");
  });

  it("are free with each extension given", () => {
    const drafts = [".tir", ".fountain"];
    expect(uniqueName("First Draft", ["First Draft.notes"], drafts)).toBe("First Draft");
    expect(uniqueName("First Draft", ["first draft.fountain"], drafts)).toBe("First Draft 2");
    expect(uniqueName("First Draft", ["First Draft.tir", "First Draft 2.fountain"], drafts)).toBe(
      "First Draft 3",
    );
  });

  it("stay within 120 bytes with their number", () => {
    expect(uniqueName("a".repeat(200), ["a".repeat(120)])).toBe(`${"a".repeat(118)} 2`);
  });
});

describe("the names the Rust side accepts", () => {
  it("are one entry of a folder that is not hidden", () => {
    for (const name of ["Salt Line", "First Draft.tir", "a..b", "x".repeat(255), "東京"]) {
      expect([name, isSafeName(name)]).toEqual([name, true]);
    }
    for (const name of ["", ".", "..", ".git", "a/b", "/abs", "a\\b", "a\0b", "x".repeat(256)]) {
      expect([name, isSafeName(name)]).toEqual([name, false]);
    }
  });
});
