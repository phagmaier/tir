/**
 * Backup as the page shows it (brief, "Saving and backup"; architecture,
 * "Backup"): how the Rust side reports it (`backup.rs`), and the words and
 * icons the top bar's indicator, the backup panel and the connect dialog
 * give each state (prototype piece 5). No DOM here, so tests read the words.
 */
import type { SaveState } from "./saving.ts";

export type BackupState = "off" | "backedUp" | "pushing" | "offline" | "failing" | "paused";

/** How backup stands (`backup::Status`). */
export interface BackupStatus {
  readonly state: BackupState;
  /** The connected repository's address. */
  readonly remote: string | null;
  /** Commits GitHub does not have yet. */
  readonly waiting: number;
  /** Saved changes awaiting their local commit. */
  readonly pending: boolean;
  /** When the newest commit GitHub has was made, in milliseconds since 1970. */
  readonly backedUp: number | null;
  /** Why the last push or check failed, while Tir tries again. */
  readonly reason: string | null;
  /** Why Tir cannot record the library's changes, if it cannot. */
  readonly problem: string | null;
  /** This destination last passed a privacy check. */
  readonly private: boolean;
}

export const NOT_CONNECTED: BackupStatus = {
  state: "off",
  remote: null,
  waiting: 0,
  pending: false,
  backedUp: null,
  reason: null,
  problem: null,
  private: false,
};

/** What came of connecting a repository (`backup::Checked`). */
export type Checked =
  | { readonly result: "connected" }
  | { readonly result: "notGitHub" }
  | { readonly result: "offline"; readonly reason: string }
  | { readonly result: "unreachable"; readonly reason: string }
  | { readonly result: "public" }
  | { readonly result: "unknown"; readonly reason: string }
  | { readonly result: "holds" }
  | { readonly result: "problem"; readonly reason: string };

/** How much of a project or draft GitHub holds (`git::Coverage`). */
export type Coverage = "none" | "all" | "older" | "unknown";

export type Icon = "cloudok" | "cloudoff" | "alert" | "spin" | "check";

/** Text in which `code` parts show as code, such as a command to type. */
export type Words = readonly (string | { readonly code: string })[];

/** The indicator's backup half, and its tooltip, which says both halves. */
export interface Shown {
  readonly icon: Icon;
  readonly label: string;
  readonly warn: boolean;
  readonly title: string;
}

export type Action = "connect" | "backUpNow" | "resume" | "change";

/** The backup panel's head, note and actions. */
export interface PanelView {
  readonly tone: "" | "ok" | "warn";
  readonly icon: Icon;
  readonly heading: string;
  readonly text: string;
  readonly note: Words | null;
  readonly actions: readonly Action[];
  /** Back up now waits: a save or a push is under way. */
  readonly busy: boolean;
}

/** A note in the connect dialog. */
export interface Note {
  readonly tone: "" | "ok" | "warn";
  readonly icon: Icon;
  readonly words: Words;
}

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const DAY_AND_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** When `then` was, from `now`: "just now", "3 minutes ago", "on Nov 26". */
export function ago(then: number, now: number): string {
  const minutes = Math.floor((now - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${plural(minutes, "minute")} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${plural(hours, "hour")} ago`;
  const date = new Date(then);
  const format = date.getFullYear() === new Date(now).getFullYear() ? DAY : DAY_AND_YEAR;
  return `on ${format.format(date)}`;
}

/** The repository as the panel names it: "github.com/you/screenplays". */
export function repository(remote: string): string {
  const github =
    /^(?:git@github\.com:|ssh:\/\/git@github\.com\/|https:\/\/github\.com\/)(.+?)(?:\.git)?\/?$/;
  const match = github.exec(remote);
  return match ? `github.com/${match[1]}` : remote;
}

function savedSentence(saved: SaveState, problem: string | null, off: boolean): string {
  if (saved === "saving") return "Saving to this machine.";
  if (saved === "failed") return `Not saved: ${problem ?? ""} Tir tries again in a moment.`;
  return off ? "Saved on this machine only." : "Saved on this machine.";
}

function waiting(backup: BackupStatus): boolean {
  return backup.pending || backup.waiting > 0 || backup.backedUp === null || !backup.private;
}

/** The indicator's backup half, given the saved state beside it. */
export function indicator(
  backup: BackupStatus,
  saved: SaveState,
  problem: string | null,
  now: number,
): Shown {
  const off = backup.state === "off" && !backup.problem;
  const first = savedSentence(saved, problem, off);
  const shown = (icon: Icon, label: string, warn: boolean, sentence: string): Shown => ({
    // A save under way turns the cloud, as in prototype piece 5.
    icon: saved === "saving" && !warn ? "spin" : icon,
    label,
    warn,
    title: `${first} ${sentence}`,
  });
  if (backup.problem)
    return shown("alert", "Not backed up", true, `Not backed up: ${backup.problem}`);
  switch (backup.state) {
    case "off":
      return shown("cloudoff", "Not backed up", false, "No GitHub repository is connected yet.");
    case "pushing":
      return shown("spin", "Backing up…", false, "Backing up to GitHub.");
    case "offline":
      if (backup.waiting === 0)
        return shown("cloudoff", "Offline", false, "Tir can’t reach GitHub and will try again.");
      return shown(
        "cloudoff",
        `Offline, ${backup.waiting} waiting`,
        false,
        `Offline: ${plural(backup.waiting, "change")} will back up when GitHub is reachable.`,
      );
    case "failing":
      return shown(
        "alert",
        "Backup failing",
        true,
        `Backup failing: ${backup.reason ?? ""} Tir keeps trying.`,
      );
    case "paused":
      return shown(
        "alert",
        "Backup paused",
        true,
        "Backup paused: GitHub has changes this machine does not, so Tir merged nothing.",
      );
    case "backedUp": {
      const when = backup.backedUp === null ? "" : ` ${ago(backup.backedUp, now)}`;
      if (saved !== "saved" || waiting(backup)) {
        const last = when ? ` Last backed up to GitHub${when}.` : "";
        return shown("cloudoff", "Backup pending", false, `Changes not yet backed up.${last}`);
      }
      return shown("cloudok", "Backed up", false, `Backed up to GitHub${when}.`);
    }
  }
}

/** The backup panel for `backup`, given the saved state and where the library is. */
export function panel(
  backup: BackupStatus,
  saved: SaveState,
  place: string,
  now: number,
): PanelView {
  const connected = backup.remote !== null;
  const view = (
    tone: PanelView["tone"],
    icon: Icon,
    heading: string,
    text: string,
    actions: readonly Action[],
    { note = null, busy = false }: { note?: Words | null; busy?: boolean } = {},
  ): PanelView => ({ tone, icon, heading, text, note, actions, busy });
  const backUp: readonly Action[] = ["backUpNow", "change"];
  if (backup.problem) {
    return view("warn", "alert", "Not backed up", backup.problem, connected ? backUp : ["connect"]);
  }
  switch (backup.state) {
    case "off":
      return view(
        "",
        "cloudoff",
        "Not backed up to GitHub",
        "Your work is saved on this machine only.",
        ["connect"],
      );
    case "paused":
      return view(
        "warn",
        "alert",
        "Backup paused",
        "GitHub has changes this machine doesn’t have, perhaps from another computer. Tir merged nothing, and your work here is safe.",
        ["resume", "change"],
        {
          note: [
            "To bring them in, close Tir, run ",
            {
              code: 'git pull --no-rebase --no-edit origin "refs/heads/$(git branch --show-current)"',
            },
            " in ",
            { code: place },
            " in a terminal, then open Tir again.",
            ...(backup.reason ? [` Last check: ${backup.reason}`] : []),
          ],
        },
      );
    case "offline":
      return view(
        "",
        "cloudoff",
        "Offline",
        backup.waiting > 0
          ? `Your work is saved here. ${plural(backup.waiting, "change")} will back up when GitHub is reachable again; Tir keeps retrying on its own.`
          : "Tir can’t reach GitHub. It keeps retrying on its own.",
        backUp,
      );
    case "failing":
      return view(
        "warn",
        "alert",
        "Backup failing",
        `GitHub did not take the last backup: ${backup.reason ?? ""} Tir keeps trying on its own.`,
        backUp,
      );
    case "pushing":
      return view("", "spin", "Backing up…", "Sending your changes to GitHub.", backUp, {
        busy: true,
      });
    case "backedUp":
      if (saved === "saving") {
        return view(
          "",
          "spin",
          "Saving…",
          "Writing your changes to this machine. A backup follows after a few quiet minutes.",
          backUp,
        );
      }
      if (saved === "failed" || waiting(backup)) {
        return view(
          "",
          "cloudoff",
          "Backup pending",
          "The latest changes are not yet backed up to GitHub.",
          backUp,
        );
      }
      return view(
        "ok",
        "cloudok",
        "Backed up",
        `Pushed to GitHub${backup.backedUp === null ? "" : ` ${ago(backup.backedUp, now)}`}. Tir backs up again after a few quiet minutes, and when you close it.`,
        backUp,
      );
  }
}

/** What the connect dialog says of `checked`; `library` counts what the first backup holds. */
export function checkedNote(
  checked: Checked,
  library: { readonly projects: number; readonly drafts: number },
): Note {
  const warn = (words: Words): Note => ({ tone: "warn", icon: "alert", words });
  switch (checked.result) {
    case "connected":
      return {
        tone: "ok",
        icon: "check",
        words: [
          `Connected. The first backup will hold ${plural(library.projects, "project")} and ${plural(library.drafts, "draft")}.`,
        ],
      };
    case "notGitHub":
      return warn([
        "That isn’t a GitHub repository’s address. Copy it from the repository’s Code button on GitHub, such as ",
        { code: "git@github.com:you/screenplays.git" },
        ".",
      ]);
    case "offline":
      return warn([
        "Tir couldn’t reach GitHub. Check that this machine is online, then try again.",
      ]);
    case "unreachable":
      return warn([
        "Tir couldn’t reach that repository with this machine’s git login. Check the address, or sign in with ",
        { code: "gh auth login" },
        ` in a terminal. Git said: ${checked.reason}`,
      ]);
    case "public":
      return warn([
        "This repository is public, so anyone could read your scripts. Make it private on GitHub, or use another repository.",
      ]);
    case "unknown":
      return warn([
        `Tir couldn’t check whether this repository is private (${checked.reason.replace(/\.$/, "")}). Try again in a minute.`,
      ]);
    case "holds":
      return warn([
        "This repository already holds work that isn’t in this library. Use a new, empty private repository. To use this one on a second computer, clone it as that computer’s library instead, with Tir closed.",
      ]);
    case "problem":
      return warn([checked.reason]);
  }
}

/** The second sentence of the warning before a project or draft is deleted. */
export function deletionNote(coverage: Coverage): string {
  switch (coverage) {
    case "all":
      return "GitHub keeps the backup history, so it can still be recovered from there.";
    case "older":
      return "GitHub has a different version at this path. Tir couldn’t confirm that it holds this version.";
    case "none":
      return "Tir found no backup at this path. This can’t be undone in Tir.";
    case "unknown":
      return "Tir couldn’t verify the backup. This can’t be undone in Tir.";
  }
}
