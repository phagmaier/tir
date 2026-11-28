import { describe, expect, it } from "vitest";
import {
  ago,
  type BackupStatus,
  checkedNote,
  deletionNote,
  indicator,
  NOT_CONNECTED,
  panel,
  repository,
} from "./backup.ts";

const NOW = Date.UTC(2026, 10, 27, 15, 0);
const MINUTE = 60_000;
const backedUp: BackupStatus = {
  ...NOT_CONNECTED,
  state: "backedUp",
  remote: "git@github.com:you/screenplays.git",
  backedUp: NOW - 3 * MINUTE,
  private: true,
};

describe("when backups were", () => {
  it("reads as a writer would say it", () => {
    expect(ago(NOW - 20_000, NOW)).toBe("just now");
    expect(ago(NOW - MINUTE, NOW)).toBe("1 minute ago");
    expect(ago(NOW - 59 * MINUTE, NOW)).toBe("59 minutes ago");
    expect(ago(NOW - 60 * MINUTE, NOW)).toBe("1 hour ago");
    expect(ago(NOW - 5 * 60 * MINUTE, NOW)).toBe("5 hours ago");
    expect(ago(Date.UTC(2026, 10, 25, 12), NOW)).toBe("on Nov 25");
    expect(ago(Date.UTC(2025, 11, 30, 12), NOW)).toBe("on Dec 30, 2025");
  });
});

describe("the repository's name", () => {
  it("drops GitHub's address forms to the panel's", () => {
    for (const remote of [
      "git@github.com:you/screenplays.git",
      "ssh://git@github.com/you/screenplays.git",
      "https://github.com/you/screenplays.git",
      "https://github.com/you/screenplays",
    ]) {
      expect(repository(remote)).toBe("github.com/you/screenplays");
    }
    // A clone from anywhere else shows as it is.
    expect(repository("/srv/git/screenplays.git")).toBe("/srv/git/screenplays.git");
  });
});

describe("the indicator", () => {
  it("says each state as prototype piece 5 does", () => {
    expect(indicator(backedUp, "saved", null, NOW)).toEqual({
      icon: "cloudok",
      label: "Backed up",
      warn: false,
      title: "Saved on this machine. Backed up to GitHub 3 minutes ago.",
    });
    expect(indicator(backedUp, "saving", null, NOW)).toEqual({
      icon: "spin",
      label: "Backed up",
      warn: false,
      title: "Saving to this machine. Last backed up to GitHub 3 minutes ago.",
    });
    expect(indicator({ ...backedUp, state: "offline", waiting: 6 }, "saved", null, NOW)).toEqual({
      icon: "cloudoff",
      label: "Offline, 6 waiting",
      warn: false,
      title: "Saved on this machine. Offline: 6 changes will back up when GitHub is reachable.",
    });
    expect(indicator({ ...backedUp, state: "paused" }, "saved", null, NOW)).toEqual({
      icon: "alert",
      label: "Backup paused",
      warn: true,
      title:
        "Saved on this machine. Backup paused: GitHub has changes this machine does not, so Tir merged nothing.",
    });
    expect(indicator(NOT_CONNECTED, "saved", null, NOW)).toEqual({
      icon: "cloudoff",
      label: "Not backed up",
      warn: false,
      title: "Saved on this machine only. No GitHub repository is connected yet.",
    });
  });

  it("warns of a failing backup and of one Tir cannot make, with why", () => {
    const failing = indicator(
      { ...backedUp, state: "failing", reason: "Repository not found." },
      "saved",
      null,
      NOW,
    );
    expect(failing.warn).toBe(true);
    expect(failing.label).toBe("Backup failing");
    expect(failing.title).toBe(
      "Saved on this machine. Backup failing: Repository not found. Tir keeps trying.",
    );
    const broken = indicator(
      { ...NOT_CONNECTED, problem: "Tir could not find git on this machine." },
      "saving",
      null,
      NOW,
    );
    // A save under way never hides the warning's icon.
    expect(broken).toMatchObject({ icon: "alert", label: "Not backed up", warn: true });
    expect(broken.title).toBe(
      "Saving to this machine. Not backed up: Tir could not find git on this machine.",
    );
  });

  it("says why a save failed before backup", () => {
    expect(indicator(backedUp, "failed", "No space left.", NOW).title).toBe(
      "Not saved: No space left. Tir tries again in a moment. Backed up to GitHub 3 minutes ago.",
    );
  });
});

describe("the backup panel", () => {
  it("offers what each state allows", () => {
    expect(panel(NOT_CONNECTED, "saved", "~/Screenplays", NOW)).toMatchObject({
      heading: "Not backed up to GitHub",
      text: "Your work is saved on this machine only.",
      actions: ["connect"],
    });
    expect(panel(backedUp, "saved", "~/Screenplays", NOW)).toMatchObject({
      tone: "ok",
      heading: "Backed up",
      text: "Pushed to GitHub 3 minutes ago. Tir backs up again after a few quiet minutes, and when you close it.",
      actions: ["backUpNow", "change"],
      busy: false,
    });
    expect(panel(backedUp, "saving", "~/Screenplays", NOW)).toMatchObject({
      icon: "spin",
      heading: "Saving…",
      busy: true,
    });
    expect(panel({ ...backedUp, state: "pushing" }, "saved", "~/Screenplays", NOW)).toMatchObject({
      heading: "Backing up…",
      busy: true,
    });
    expect(
      panel({ ...backedUp, state: "offline", waiting: 1 }, "saved", "~/Screenplays", NOW).text,
    ).toBe(
      "Your work is saved here. 1 change will back up when GitHub is reachable again; Tir keeps retrying on its own.",
    );
  });

  it("tells how to bring in the other machine's work while paused, with Tir closed", () => {
    const paused = panel({ ...backedUp, state: "paused" }, "saved", "~/Scripts/Tir", NOW);
    expect(paused).toMatchObject({ tone: "warn", actions: ["resume", "change"] });
    expect(paused.note).toEqual([
      "To bring them in, close Tir, run ",
      { code: "git pull" },
      " in ",
      { code: "~/Scripts/Tir" },
      " in a terminal, then open Tir again.",
    ]);
  });

  it("puts a problem first, and offers to connect only without a repository", () => {
    const problem = "Tir could not find git on this machine, so it cannot back up the library.";
    expect(panel({ ...backedUp, problem }, "saved", "~", NOW)).toMatchObject({
      tone: "warn",
      text: problem,
      actions: ["backUpNow", "change"],
    });
    expect(panel({ ...NOT_CONNECTED, problem }, "saved", "~", NOW).actions).toEqual(["connect"]);
  });
});

describe("the connect dialog's notes", () => {
  it("counts what the first backup holds", () => {
    expect(checkedNote({ result: "connected" }, { projects: 4, drafts: 9 }).words.join("")).toBe(
      "Connected. The first backup will hold 4 projects and 9 drafts.",
    );
    expect(checkedNote({ result: "connected" }, { projects: 1, drafts: 1 }).words.join("")).toBe(
      "Connected. The first backup will hold 1 project and 1 draft.",
    );
  });

  it("warns of a public repository and one this login cannot reach", () => {
    const none = { projects: 0, drafts: 0 };
    expect(checkedNote({ result: "public" }, none)).toEqual({
      tone: "warn",
      icon: "alert",
      words: [
        "This repository is public, so anyone could read your scripts. Make it private on GitHub, or use another repository.",
      ],
    });
    const unreachable = checkedNote(
      { result: "unreachable", reason: "Repository not found." },
      none,
    );
    expect(unreachable.words).toContainEqual({ code: "gh auth login" });
    expect(unreachable.words.at(-1)).toBe(" in a terminal. Git said: Repository not found.");
  });
});

describe("the warning before deleting", () => {
  it("says what GitHub keeps", () => {
    expect(deletionNote("none")).toBe("Tir has no backup of it yet, so this can't be undone.");
    expect(deletionNote("all")).toBe(
      "GitHub keeps the backup history, so it can still be recovered from there.",
    );
    expect(deletionNote("older")).toContain("without its latest changes");
  });
});
