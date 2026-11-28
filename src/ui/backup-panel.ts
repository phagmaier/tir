/**
 * The backup panel and the connect dialog (brief, "Saving and backup";
 * prototype piece 5). The top bar's indicator opens the panel, a popover
 * under it with backup's state and its actions: Back up now, Resume backup
 * while paused, and Connect a repository… or Change repository…, which
 * open the connect dialog. The dialog checks the address the writer pastes
 * with the Rust side (`connect_repository`) and connects it only when this
 * machine's git login reaches it, only a login can read it, and it holds
 * nothing the library lacks. The words are `backup.ts`'s.
 */
import {
  type Action,
  type BackupStatus,
  type Checked,
  checkedNote,
  type Note,
  panel,
  repository,
  type Words,
} from "./backup.ts";
import type { SaveState } from "./saving.ts";
import { icon } from "./status-indicator.ts";

export interface BackupSide {
  /** Backup's status as last heard. */
  status(): BackupStatus;
  /** The saved state as last heard. */
  saved(): SaveState;
  /** Where the library is, as the writer would type it. */
  place(): Promise<string>;
  backUpNow(): Promise<BackupStatus | null>;
  resume(): Promise<BackupStatus | null>;
  connect(address: string): Promise<Checked>;
  /** How many projects and drafts the library holds. */
  library(): Promise<{ readonly projects: number; readonly drafts: number }>;
  toast(text: string): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const dom = document.createElement(tag);
  if (className) dom.className = className;
  if (text) dom.textContent = text;
  return dom;
}

function button(className: string, text: string, type: "button" | "submit" = "button") {
  const dom = el("button", className, text);
  dom.type = type;
  return dom;
}

/** `words` as nodes, the code parts as code. */
function written(words: Words): Node[] {
  return words.map((part) =>
    typeof part === "string" ? document.createTextNode(part) : el("code", "", part.code),
  );
}

function note({ tone, icon: name, words }: Note): HTMLElement {
  const dom = el("div", `note${tone ? ` ${tone}` : ""}`);
  const mark = el("span", "note-icon");
  mark.innerHTML = icon(name, 15);
  const text = el("span");
  text.append(...written(words));
  dom.append(mark, text);
  return dom;
}

const LABELS: Readonly<Record<Action, string>> = {
  connect: "Connect a repository…",
  backUpNow: "Back up now",
  resume: "Resume backup",
  change: "Change repository…",
};

export class BackupPanel {
  private readonly side: BackupSide;
  private readonly pop = el("div", "pop backup-panel");
  private readonly dialog = el("dialog", "dialog connect-dialog");
  private readonly address = el("input");
  private readonly result = el("div", "connect-result");
  private readonly go = button("btn primary", "Check and connect", "submit");
  private anchor: HTMLElement | null = null;
  private place = "~/Screenplays";
  /** A Back up now or a Resume waits for its answer. */
  private asking = false;
  /** A check waits for its answer: no other may start until it comes. */
  private checking = false;
  /** The address is connected: the dialog's button closes it. */
  private connected = false;
  /** The action whose button had focus when it was disabled, to have it back. */
  private refocus: string | null = null;

  constructor(side: BackupSide) {
    this.side = side;
    this.pop.id = "backup";
    this.pop.hidden = true;
    this.pop.setAttribute("role", "dialog");
    this.pop.setAttribute("aria-label", "Backup");
    // The panel takes focus while the button that had it waits.
    this.pop.tabIndex = -1;
    document.body.append(this.pop);
    void side.place().then((place) => {
      this.place = place;
      this.update();
    });

    this.dialog.setAttribute("aria-labelledby", "connect-title");
    const form = el("form");
    const heading = el("h2", "", "Back up to GitHub");
    heading.id = "connect-title";
    const intro = el(
      "p",
      "",
      "Tir records your library in git and pushes it to a private GitHub repository, using this machine's existing git login. It stores no passwords or tokens.",
    );
    const field = el("div", "field");
    this.address.id = "connect-address";
    this.address.type = "text";
    this.address.placeholder = "git@github.com:you/screenplays.git";
    this.address.spellcheck = false;
    this.address.autocomplete = "off";
    this.address.setAttribute("aria-describedby", "connect-help");
    const label = el("label", "", "Repository address");
    label.htmlFor = this.address.id;
    const help = el(
      "span",
      "help",
      "Create an empty private repository on GitHub first, then paste its address here.",
    );
    help.id = "connect-help";
    field.append(label, this.address, help);
    this.result.setAttribute("role", "status");
    this.result.setAttribute("aria-live", "polite");
    const cancel = button("btn quiet", "Cancel");
    cancel.addEventListener("click", () => this.dialog.close());
    const actions = el("div", "actions");
    actions.append(cancel, this.go);
    form.append(heading, intro, field, this.result, actions);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.check();
    });
    // A new address is checked afresh.
    this.address.addEventListener("input", () => this.unconnect());
    this.dialog.append(form);
    // A click on the dimmed window around the dialog closes it, as Cancel does.
    this.dialog.addEventListener("click", (event) => {
      if (event.target !== this.dialog) return;
      const { left, right, top, bottom } = this.dialog.getBoundingClientRect();
      const { clientX: x, clientY: y } = event;
      if (x < left || x > right || y < top || y > bottom) this.dialog.close();
    });
    // Focus goes back to the indicator, which opened the panel the dialog
    // came from: the panel has gone.
    this.dialog.addEventListener("close", () => {
      if (this.pop.hidden) removeEventListener("keydown", this.escape, true);
      this.anchor?.focus({ preventScroll: true });
    });
    document.body.append(this.dialog);
  }

  get open(): boolean {
    return !this.pop.hidden || this.dialog.open;
  }

  /** The connect dialog is open: like any dialog, it keeps the window's keys. */
  get dialogOpen(): boolean {
    return this.dialog.open;
  }

  /** Opens the panel under `anchor`, or closes it when it is open. */
  toggle(anchor: HTMLElement): void {
    if (!this.pop.hidden) {
      this.close(true);
      return;
    }
    this.anchor = anchor;
    this.render();
    this.pop.hidden = false;
    anchor.setAttribute("aria-expanded", "true");
    this.position();
    this.pop.querySelector<HTMLButtonElement>(".bp-actions button:enabled")?.focus();
    document.addEventListener("click", this.away, true);
    document.addEventListener("focusin", this.away, true);
    addEventListener("keydown", this.escape, true);
    addEventListener("resize", this.position);
  }

  /** Shows the panel afresh, if it is open, after a change of state. */
  update(): void {
    if (!this.pop.hidden) this.render();
  }

  /** Closes the panel and the dialog, focus back on the indicator when `refocus`. */
  close(refocus: boolean): void {
    if (this.dialog.open) this.dialog.close();
    if (this.pop.hidden) return;
    this.pop.hidden = true;
    this.anchor?.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", this.away, true);
    document.removeEventListener("focusin", this.away, true);
    removeEventListener("keydown", this.escape, true);
    removeEventListener("resize", this.position);
    if (refocus) this.anchor?.focus({ preventScroll: true });
  }

  private render(): void {
    const status = this.side.status();
    const view = panel(status, this.side.saved(), this.place, Date.now());
    const head = el("div", "bp-h");
    const mark = el("span", `bp-ic${view.tone ? ` ${view.tone}` : ""}`);
    mark.innerHTML = icon(view.icon, view.icon === "spin" ? 17 : 18);
    const words = el("div");
    words.append(el("b", "", view.heading), el("span", "bp-text", view.text));
    head.append(mark, words);
    const parts: Node[] = [head];
    if (view.note) {
      const extra = el("div", "note");
      const text = el("span");
      text.append(...written(view.note));
      extra.append(text);
      parts.push(extra);
    }
    const rows = el("dl", "bp-dl");
    if (status.remote) {
      const name = el("dd", "", repository(status.remote));
      if (status.private) name.append(el("small", "", "private"));
      rows.append(el("dt", "", "Repository"), name);
    }
    rows.append(
      el("dt", "", "Library"),
      el("dd", "", this.place),
      el("dt", "", "Saving"),
      el("dd", "", "Automatic, a moment after you stop typing"),
    );
    const actions = el("div", "bp-actions");
    for (const action of view.actions) {
      const quiet = action === "change";
      const dom = button(`btn ${quiet ? "quiet" : "primary"}`, LABELS[action]);
      if (action === "backUpNow" || action === "resume") {
        dom.disabled = this.asking || (action === "backUpNow" && view.busy);
      }
      dom.addEventListener("click", () => this.act(action));
      actions.append(dom);
    }
    parts.push(rows, actions);
    // Focus stays on the button it was on as the panel redraws, or on the
    // panel while that button waits, and goes back to it once it may.
    const active = document.activeElement;
    const focused =
      active === this.pop
        ? this.refocus
        : this.pop.contains(active)
          ? (active as HTMLElement).textContent
          : null;
    this.pop.replaceChildren(...parts);
    this.refocus = null;
    if (focused !== null) {
      const again = [...actions.querySelectorAll("button")].find(
        (dom) => dom.textContent === focused,
      );
      if (again && !again.disabled) again.focus();
      else if (again) {
        this.refocus = focused;
        this.pop.focus();
      } else actions.querySelector<HTMLButtonElement>("button:enabled")?.focus();
    }
    if (!this.pop.hidden) this.position();
  }

  private act(action: Action): void {
    if (action === "connect" || action === "change") {
      this.close(false);
      this.openConnect();
    } else void this.ask(action);
  }

  private async ask(action: "backUpNow" | "resume"): Promise<void> {
    if (this.asking) return;
    this.asking = true;
    this.render();
    const status = await (action === "backUpNow"
      ? this.side.backUpNow()
      : this.side.resume()
    ).catch(() => null);
    this.asking = false;
    this.update();
    if (!status) return;
    if (status.problem) return;
    if (status.state === "backedUp") {
      this.side.toast(
        action === "resume" ? "Backup resumed. Backed up just now." : "Backed up just now",
      );
    } else if (status.state === "offline") {
      this.side.toast("Still offline. Tir will back up as soon as GitHub is reachable.");
    } else if (status.state === "paused") {
      this.side.toast(
        action === "resume"
          ? "GitHub still has changes this machine doesn’t have."
          : "Backup paused: GitHub has changes this machine doesn’t have.",
      );
    } else if (status.state === "failing") {
      this.side.toast("GitHub did not take the backup. Tir keeps trying.");
    }
  }

  private openConnect(): void {
    this.address.value = "";
    this.unconnect();
    this.dialog.showModal();
    this.address.focus();
    addEventListener("keydown", this.escape, true);
  }

  private unconnect(): void {
    this.connected = false;
    this.result.replaceChildren();
    this.go.textContent = "Check and connect";
    this.go.disabled = this.checking;
  }

  private async check(): Promise<void> {
    if (this.connected) {
      this.dialog.close();
      this.side.toast("Connected. Backups now go to GitHub.");
      return;
    }
    if (this.checking) return;
    const address = this.address.value.trim();
    if (!address) {
      this.result.replaceChildren(
        note({ tone: "warn", icon: "alert", words: ["Paste the repository’s address first."] }),
      );
      this.address.focus();
      return;
    }
    // One check at a time: two could connect two repositories in turn.
    this.checking = true;
    this.go.disabled = true;
    this.address.readOnly = true;
    this.result.replaceChildren(
      note({
        tone: "",
        icon: "spin",
        words: ["Checking that this machine can reach the repository…"],
      }),
    );
    const checked = await this.side
      .connect(address)
      .catch((error: unknown): Checked => ({ result: "problem", reason: String(error) }));
    const library =
      checked.result === "connected"
        ? await this.side.library().catch(() => ({ projects: 0, drafts: 0 }))
        : { projects: 0, drafts: 0 };
    this.checking = false;
    this.go.disabled = false;
    this.address.readOnly = false;
    // The dialog was closed, or opened afresh, meanwhile.
    if (!this.dialog.open || this.address.value.trim() !== address) {
      if (checked.result === "connected") this.side.toast("Connected. Backups now go to GitHub.");
      return;
    }
    this.result.replaceChildren(note(checkedNote(checked, library)));
    if (checked.result === "connected") {
      this.connected = true;
      this.go.textContent = "Done";
      this.go.focus();
    } else this.address.focus();
  }

  private readonly away = (event: Event) => {
    if (!(event.target instanceof Node) || this.dialog.open) return;
    if (this.pop.contains(event.target) || this.anchor?.contains(event.target)) return;
    this.close(false);
  };

  // Desk listens on the document in capture; Escape belongs to an open
  // dialog or popover first.
  private readonly escape = (event: KeyboardEvent) => {
    if (event.isComposing || event.key !== "Escape") return;
    if (this.pop.hidden && !this.dialog.open) return;
    event.preventDefault();
    event.stopPropagation();
    if (this.dialog.open) this.dialog.close();
    else this.close(true);
  };

  private readonly position = () => {
    if (!this.anchor || this.pop.hidden) return;
    const { right, bottom } = this.anchor.getBoundingClientRect();
    const width = this.pop.offsetWidth;
    const rightmost = document.documentElement.clientWidth - width - 12;
    this.pop.style.top = `${bottom + 8}px`;
    this.pop.style.left = `${Math.max(12, Math.min(rightmost, right - width))}px`;
  };
}
