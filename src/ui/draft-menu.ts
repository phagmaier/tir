/** The draft picker and its actions (brief, "Drafts"; prototype pieces 1 and 5). */
import type { DraftAction } from "./drafts.ts";
import type { Library } from "./library.ts";
import type { Place } from "./saving.ts";

interface DraftMenuSide {
  place(): Place | null;
  list(): Promise<Library>;
  run(action: DraftAction): void;
}

// Prototype piece 5's icons, on a 16-unit grid.
const BRANCH =
  '<circle cx="4.5" cy="3.5" r="1.4"/><circle cx="4.5" cy="12.5" r="1.4"/><circle cx="11.5" cy="5" r="1.4"/><path d="M4.5 4.9v6.2M11.5 6.4c0 2.6-2.2 3.1-4.2 3.5-1.6.3-2.8 1-2.8 1.2"/>';
const CHEVRON = '<path d="M4.5 6.5 8 10l3.5-3.5"/>';
const CHECK = '<path d="m3.5 8.5 3 3 6-7"/>';
const svg = (shape: string) =>
  `<svg class="draft-icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shape}</svg>`;

const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const OLD_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

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

function nameInput(): HTMLInputElement {
  const dom = el("input");
  dom.required = true;
  dom.autocomplete = "off";
  dom.spellcheck = false;
  dom.addEventListener("input", () => dom.setCustomValidity(""));
  return dom;
}

function submittedName(input: HTMLInputElement): string {
  const name = input.value.trim();
  if (!name) {
    input.setCustomValidity("Enter a draft name.");
    input.reportValidity();
  }
  return name;
}

interface Row {
  readonly file: string;
  readonly button: HTMLButtonElement;
  readonly time: HTMLElement;
}

export class DraftMenu {
  private readonly menu = el("div", "pop draft-menu");
  private readonly dialog = el("dialog", "dialog draft-dialog");
  private readonly label = el("span", "draft-label");
  private readonly trigger: HTMLButtonElement;
  private readonly side: DraftMenuSide;

  constructor(trigger: HTMLButtonElement, side: DraftMenuSide) {
    this.trigger = trigger;
    this.side = side;
    trigger.hidden = true;
    trigger.innerHTML = svg(BRANCH) + svg(CHEVRON);
    trigger.insertBefore(this.label, trigger.lastChild);
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", "draft-menu");
    trigger.addEventListener("click", () => {
      if (this.menu.hidden) this.open();
      else this.dismiss();
    });

    // A disclosure, not an ARIA menu: its inline form takes normal Tab and text input.
    this.menu.id = "draft-menu";
    this.menu.hidden = true;
    this.menu.setAttribute("role", "group");
    this.menu.setAttribute("aria-labelledby", "draft-menu-title");
    this.menu.addEventListener("keydown", this.navigate);
    trigger.after(this.menu);

    this.dialog.setAttribute("aria-labelledby", "draft-dialog-title");
    this.dialog.addEventListener("click", (event) => {
      if (event.target !== this.dialog) return;
      const { left, right, top, bottom } = this.dialog.getBoundingClientRect();
      const { clientX: x, clientY: y } = event;
      if (x < left || x > right || y < top || y > bottom) this.dialog.close();
    });
    this.dialog.addEventListener("close", () => {
      if (this.menu.hidden && !this.dialog.open) {
        window.removeEventListener("keydown", this.escape, true);
      }
    });
    document.body.append(this.dialog);
  }

  setPlace(place: Place | null): void {
    this.dismiss();
    if (this.dialog.open) this.dialog.close();
    const name = place
      ? place.project.info.drafts.find(({ file }) => file === place.file)?.name
      : undefined;
    this.trigger.hidden = name === undefined;
    this.trigger.title = name ?? "";
    this.label.textContent = name ?? "";
  }

  /** Closes the popover, returning keyboard focus to its trigger. */
  dismiss(): void {
    this.closeMenu(true);
  }

  get dialogOpen(): boolean {
    return this.dialog.open;
  }

  private open(): void {
    const place = this.side.place();
    if (!place) return;
    const { project, file } = place;
    const active = project.info.drafts.find((draft) => draft.file === file);
    if (!active) return;

    const heading = el("h2", "draft-heading", `Drafts of ${project.info.name}`);
    heading.id = "draft-menu-title";
    const rows = project.info.drafts.map((draft): Row => {
      const selected = draft.file === file;
      const row = button("draft-row", "");
      const check = el("span", "draft-check");
      const time = el("small");
      if (selected) {
        row.setAttribute("aria-current", "true");
        check.innerHTML = svg(CHECK);
      }
      row.append(check, el("span", "draft-name", draft.name), time);
      row.addEventListener("click", () => {
        this.dismiss();
        if (!selected) this.side.run({ kind: "switch", file: draft.file });
      });
      return { file: draft.file, button: row, time };
    });

    const fork = button("draft-action", "Fork this draft…");
    fork.append(el("small", "", "copies it as it is now"));
    fork.addEventListener("click", () => this.showFork(fork, active.name));
    const rename = button("draft-action", "Rename…");
    rename.addEventListener("click", () => this.ask("rename", active.name));
    const exportPdf = button("draft-action", "Export PDF…");
    exportPdf.addEventListener("click", () => this.askPdf(active.name));
    const exportFountain = button("draft-action", "Export Fountain…");
    exportFountain.addEventListener("click", () => {
      this.dismiss();
      this.side.run({ kind: "exportFountain" });
    });
    const exportFdx = button("draft-action", "Export Final Draft…");
    exportFdx.addEventListener("click", () => {
      this.dismiss();
      this.side.run({ kind: "exportFdx" });
    });
    const remove = button("draft-action danger", "Delete…");
    remove.disabled = rows.length === 1;
    if (remove.disabled) remove.append(el("small", "", "A project needs at least one draft"));
    remove.addEventListener("click", () => this.ask("delete", active.name));

    this.menu.replaceChildren(
      heading,
      ...rows.map((row) => row.button),
      el("hr"),
      fork,
      rename,
      exportPdf,
      exportFountain,
      exportFdx,
      remove,
    );
    this.menu.hidden = false;
    this.trigger.setAttribute("aria-expanded", "true");
    this.position();
    this.menu.scrollTop = 0;
    rows.find((row) => row.file === file)?.button.focus();
    document.addEventListener("click", this.away, true);
    document.addEventListener("focusin", this.away, true);
    window.addEventListener("keydown", this.escape, true);
    window.addEventListener("resize", this.position);
    void this.showTimes(project.folder, heading, rows);
  }

  private closeMenu(refocus: boolean): void {
    if (this.menu.hidden) return;
    this.menu.hidden = true;
    this.trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", this.away, true);
    document.removeEventListener("focusin", this.away, true);
    window.removeEventListener("keydown", this.escape, true);
    window.removeEventListener("resize", this.position);
    if (refocus) this.trigger.focus({ preventScroll: true });
  }

  private readonly away = (event: Event) => {
    if (!(event.target instanceof Node)) return;
    if (this.menu.contains(event.target) || this.trigger.contains(event.target)) return;
    this.closeMenu(false);
  };

  // Desk listens on the document in capture; Escape belongs to an open popover or dialog first.
  private readonly escape = (event: KeyboardEvent) => {
    if (event.isComposing || event.key !== "Escape") return;
    if (this.menu.hidden && !this.dialog.open) return;
    event.preventDefault();
    event.stopPropagation();
    if (this.dialog.open) this.dialog.close();
    else this.dismiss();
  };

  private readonly navigate = (event: KeyboardEvent) => {
    if (event.isComposing || !(event.target instanceof HTMLButtonElement)) return;
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    const buttons = [...this.menu.querySelectorAll<HTMLButtonElement>("button:enabled")];
    const at = buttons.indexOf(event.target);
    if (at < 0) return;
    event.preventDefault();
    buttons[(at + step + buttons.length) % buttons.length]?.focus();
  };

  private readonly position = () => {
    const { left, bottom } = this.trigger.getBoundingClientRect();
    const rightmost = document.documentElement.clientWidth - this.menu.offsetWidth - 8;
    this.menu.style.left = `${Math.max(8, Math.min(left, rightmost))}px`;
    this.menu.style.setProperty("--draft-menu-top", `${bottom + 8}px`);
  };

  private async showTimes(folder: string, heading: Element, rows: readonly Row[]): Promise<void> {
    // The menu still works without a fresh listing; unknown dates stay blank.
    const library = await this.side.list().catch(() => null);
    if (this.menu.hidden || this.menu.firstElementChild !== heading) return;
    const project = library?.projects.find((candidate) => candidate.folder === folder);
    if (!project) return;
    const now = new Date();
    for (const row of rows) {
      const edited = project.edited[row.file];
      if (edited === undefined) continue;
      const date = new Date(edited);
      if (!Number.isFinite(date.getTime())) continue;
      const age = now.getTime() - edited;
      const format = date.getFullYear() === now.getFullYear() ? SHORT_DATE : OLD_DATE;
      row.time.textContent = age >= 0 && age < 60_000 ? "Now" : format.format(date);
    }
  }

  private showFork(fork: HTMLButtonElement, active: string): void {
    const form = el("form");
    const field = el("div", "draft-fork");
    const input = nameInput();
    input.placeholder = "New draft’s name";
    input.setAttribute("aria-label", "Name for the new draft");
    input.setAttribute("aria-describedby", "draft-fork-note");
    const note = el(
      "div",
      "draft-note",
      `Copies “${active}” as it is now. The original stays unchanged.`,
    );
    note.id = "draft-fork-note";
    field.append(input, button("draft-submit", "Fork", "submit"));
    form.append(field, note);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = submittedName(input);
      if (!name) return;
      this.dismiss();
      this.side.run({ kind: "fork", name });
    });
    fork.before(form);
    input.focus();
    fork.remove();
  }

  private ask(kind: "rename" | "delete", active: string): void {
    // The native dialog will return focus to the trigger, not to a hidden menu item.
    this.dismiss();
    const deleting = kind === "delete";
    const form = el("form");
    const heading = el("h2", "", deleting ? `Delete “${active}”?` : "Rename draft");
    heading.id = "draft-dialog-title";
    form.append(heading);
    let input: HTMLInputElement | null = null;
    if (deleting) {
      const warning = el(
        "p",
        "",
        "This draft will be permanently deleted from this machine. Tir has no backup of it yet, so this can't be undone.",
      );
      warning.id = "draft-delete-warning";
      form.append(warning);
      this.dialog.setAttribute("aria-describedby", warning.id);
    } else {
      this.dialog.removeAttribute("aria-describedby");
      const field = el("div", "field");
      input = nameInput();
      input.id = "draft-rename-name";
      input.value = active;
      const name = el("label", "", "Name");
      name.htmlFor = input.id;
      field.append(name, input);
      form.append(field);
    }
    const cancel = button("btn quiet", "Cancel");
    cancel.addEventListener("click", () => this.dialog.close());
    const confirm = deleting
      ? button("btn danger", "Delete draft", "submit")
      : button("btn primary", "Rename", "submit");
    const actions = el("div", "actions");
    actions.append(cancel, confirm);
    form.append(actions);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!this.dialog.open) return;
      if (input) {
        const name = submittedName(input);
        if (!name) return;
        this.dialog.close();
        if (name !== active) this.side.run({ kind: "rename", name });
      } else {
        this.dialog.close();
        this.side.run({ kind: "delete" });
      }
    });
    (input ?? cancel).autofocus = true;
    this.dialog.replaceChildren(form);
    this.dialog.showModal();
    input?.select();
    window.addEventListener("keydown", this.escape, true);
  }

  /** Whether the PDF has the title page (brief, "PDF export"): ticked each time. */
  private askPdf(active: string): void {
    this.dismiss();
    const form = el("form");
    const heading = el("h2", "", "Export PDF");
    heading.id = "draft-dialog-title";
    const note = el("p", "", `“${active}”, page for page as Tir shows it, on white paper.`);
    note.id = "draft-pdf-note";
    this.dialog.setAttribute("aria-describedby", note.id);
    const titlePage = el("input");
    titlePage.type = "checkbox";
    titlePage.checked = true;
    const toggle = el("label", "draft-toggle");
    toggle.append(titlePage, "Include the title page");
    const cancel = button("btn quiet", "Cancel");
    cancel.addEventListener("click", () => this.dialog.close());
    const confirm = button("btn primary", "Export…", "submit");
    const actions = el("div", "actions");
    actions.append(cancel, confirm);
    form.append(heading, note, toggle, actions);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!this.dialog.open) return;
      this.dialog.close();
      this.side.run({ kind: "exportPdf", titlePage: titlePage.checked });
    });
    confirm.autofocus = true;
    this.dialog.replaceChildren(form);
    this.dialog.showModal();
    window.addEventListener("keydown", this.escape, true);
  }
}
