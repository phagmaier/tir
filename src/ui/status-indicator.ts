/**
 * The top bar's indicator, at its right end (prototype piece 5): whether
 * the work is saved, then whether it is backed up to GitHub. The saved half
 * reads "Saved" once the draft holds what is on screen, "Saving…" from the
 * first change until then, and "Not saved" when a save failed; its three
 * labels share one place, each hidden but the current one, so it keeps the
 * widest's width and a change of saved state moves nothing in the bar. The
 * backup half's icon and label are `backup.ts`'s, and the tooltip says both
 * halves in full. The first keystroke after a save changes the indicator,
 * so a change is drawn after that keystroke's frame, as the scene list's
 * changes are (findings, "Editor"). In the writing window the indicator is
 * a button that opens the backup panel; on the Projects screen it only
 * shows.
 */
import { type BackupStatus, type Icon, indicator, NOT_CONNECTED } from "./backup.ts";
import type { SaveState } from "./saving.ts";

const LABELS: Readonly<Record<SaveState, string>> = {
  saved: "Saved",
  saving: "Saving…",
  failed: "Not saved",
};

// Prototype piece 5's icons, on a 16-unit grid.
const CLOUD =
  '<path d="M4.6 12.6h6.7a2.9 2.9 0 0 0 .3-5.8 4 4 0 0 0-7.7.9 2.5 2.5 0 0 0 .7 4.9Z"/>';
export const ICONS: Readonly<Record<Icon, string>> = {
  cloudok: `${CLOUD}<path d="m6.4 9.7 1.2 1.2 2.3-2.5"/>`,
  cloudoff: `${CLOUD}<path d="m2.5 2.5 11 11"/>`,
  alert: '<path d="M8 2.3 14.2 13H1.8L8 2.3Z"/><path d="M8 6.4v3M8 11.2v.1"/>',
  spin: '<path d="M8 2.6a5.4 5.4 0 1 1-5.4 5.4"/>',
  check: '<path d="m3.5 8.5 3 3 6-7"/>',
};

export function icon(name: Icon, size: number): string {
  const spin = name === "spin" ? ' class="spin"' : "";
  return `<svg${spin} viewBox="0 0 16 16" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

export interface StatusIndicator {
  /** The indicator, a button when it opens the panel. */
  readonly element: HTMLElement;
  /** The saved state changed; `problem` is why the last save failed. */
  saved(state: SaveState, problem: string | null): void;
  /** Backup's status changed. */
  backup(status: BackupStatus): void;
}

/**
 * Adds the indicator to the end of `bar`, after a rule; with `open`, a
 * button that calls it.
 */
export function statusIndicator(
  bar: HTMLElement,
  open?: (anchor: HTMLElement) => void,
): StatusIndicator {
  const rule = document.createElement("span");
  rule.className = "sep";
  const dom = document.createElement(open ? "button" : "span");
  dom.className = "status";
  if (dom instanceof HTMLButtonElement && open) {
    dom.type = "button";
    dom.setAttribute("aria-haspopup", "dialog");
    dom.setAttribute("aria-expanded", "false");
    dom.addEventListener("click", () => open(dom));
  }
  const saved = document.createElement("span");
  saved.className = "saved";
  for (const [state, label] of Object.entries(LABELS)) {
    const span = document.createElement("span");
    span.dataset.state = state;
    span.textContent = label;
    saved.append(span);
  }
  const dot = document.createElement("span");
  dot.className = "dot";
  dot.setAttribute("aria-hidden", "true");
  dot.textContent = "·";
  const mark = document.createElement("span");
  mark.className = "backup-icon";
  const label = document.createElement("span");
  label.className = "backup-label";
  dom.append(saved, dot, mark, label);
  bar.append(rule, dom);

  let state: { saved: SaveState; problem: string | null; backup: BackupStatus } = {
    saved: "saved",
    problem: null,
    backup: NOT_CONNECTED,
  };
  let shownIcon: Icon | null = null;
  let waiting = false;
  const show = () => {
    waiting = false;
    saved.dataset.state = state.saved;
    const shown = indicator(state.backup, state.saved, state.problem, Date.now());
    dom.classList.toggle("warn", shown.warn || state.saved === "failed");
    if (shown.icon !== shownIcon) {
      mark.innerHTML = icon(shown.icon, shown.icon === "spin" ? 15 : 16);
      shownIcon = shown.icon;
    }
    if (label.textContent !== shown.label) label.textContent = shown.label;
    dom.title = shown.title;
  };
  show();
  // "3 minutes ago" ages.
  setInterval(() => {
    if (!waiting) show();
  }, 60_000);
  const later = () => {
    if (waiting) return;
    waiting = true;
    // After the next frame, before the one after it.
    requestAnimationFrame(() => setTimeout(show));
  };
  return {
    element: dom,
    saved(next, problem) {
      state = { ...state, saved: next, problem };
      later();
    },
    backup(status) {
      state = { ...state, backup: status };
      later();
    },
  };
}
