import { describe, expect, it } from "vitest";
import { deskKey } from "./desk.ts";

/** A key press as WebKitGTK reports it, such as "Ctrl-Shift-F". */
function keys(combo: string) {
  const parts = combo.split("-");
  // "Ctrl--" is Ctrl with the minus key.
  const key = combo.endsWith("--") ? "-" : (parts.pop() as string);
  return {
    key,
    ctrlKey: parts.includes("Ctrl"),
    shiftKey: parts.includes("Shift"),
    altKey: parts.includes("Alt"),
    metaKey: false,
  };
}

const writing = { focus: false, escTaken: false };
const focused = { focus: true, escTaken: false };

describe("the window's keys (brief, Elements and keys)", () => {
  it("zoom with Ctrl+= or Ctrl++ and Ctrl+−", () => {
    expect(deskKey(keys("Ctrl-="), writing)).toBe("zoomIn");
    // Ctrl+Shift+= types "+", as does the keypad's plus.
    expect(deskKey(keys("Ctrl-Shift-+"), writing)).toBe("zoomIn");
    expect(deskKey(keys("Ctrl-+"), focused)).toBe("zoomIn");
    expect(deskKey(keys("Ctrl--"), writing)).toBe("zoomOut");
  });

  it("turn focus mode on and off with Ctrl+Shift+F, and leave it with Esc", () => {
    expect(deskKey(keys("Ctrl-Shift-F"), writing)).toBe("focus");
    expect(deskKey(keys("Ctrl-Shift-F"), focused)).toBe("focus");
    expect(deskKey(keys("Escape"), focused)).toBe("leaveFocus");
    expect(deskKey(keys("Escape"), writing)).toBeNull();
  });

  it("leave Esc to the autocomplete popup or a field that is open, in focus mode too", () => {
    expect(deskKey(keys("Escape"), { focus: true, escTaken: true })).toBeNull();
    // The other keys still work there.
    expect(deskKey(keys("Ctrl-="), { focus: true, escTaken: true })).toBe("zoomIn");
  });

  it("leave other keys to the script: Ctrl+0 is General, Ctrl+F is find", () => {
    for (const combo of ["Ctrl-0", "Ctrl-f", "Ctrl-Alt-=", "Ctrl-Alt--", "F8", "="]) {
      expect(deskKey(keys(combo), focused), combo).toBeNull();
    }
  });
});
