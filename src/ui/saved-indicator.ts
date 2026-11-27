/**
 * The top bar's saved state, at its right end (prototype piece 5, whose
 * indicator also shows backup, Stage 6's half): "Saved" once the draft
 * holds what is on screen, "Saving…" from the first change until then, and
 * "Not saved" when a save failed, why in its tooltip. The three labels
 * share one place, each hidden but the current one, so the indicator keeps
 * the widest's width and a change of state moves nothing in the bar. The
 * first keystroke after a save changes it, so the change is drawn after
 * that keystroke's frame, as the scene list's changes are (findings,
 * "Editor").
 */
import type { SaveState } from "./saving.ts";

const LABELS: Readonly<Record<SaveState, string>> = {
  saved: "Saved",
  saving: "Saving…",
  failed: "Not saved",
};

const TOOLTIPS: Readonly<Record<Exclude<SaveState, "failed">, string>> = {
  saved: "Saved on this machine.",
  saving: "Saving to this machine.",
};

/** Adds the indicator to the end of `bar`; the function returned shows a state. */
export function savedIndicator(
  bar: HTMLElement,
): (state: SaveState, problem: string | null) => void {
  const rule = document.createElement("span");
  rule.className = "sep";
  const dom = document.createElement("span");
  dom.className = "saved";
  for (const [state, label] of Object.entries(LABELS)) {
    const span = document.createElement("span");
    span.dataset.state = state;
    span.textContent = label;
    dom.append(span);
  }
  bar.append(rule, dom);

  let next: { state: SaveState; problem: string | null } | null = null;
  const show = () => {
    if (!next) return;
    const { state, problem } = next;
    next = null;
    dom.dataset.state = state;
    dom.title =
      state === "failed" ? `Not saved: ${problem} Tir tries again in a moment.` : TOOLTIPS[state];
  };
  next = { state: "saved", problem: null };
  show();
  return (state, problem) => {
    const waiting = next !== null;
    next = { state, problem };
    // After the next frame, before the one after it.
    if (!waiting) requestAnimationFrame(() => setTimeout(show));
  };
}
