/**
 * The Projects screen (brief, "Projects"; prototype piece 6, the list),
 * shown by Ctrl+O or the top bar's project name. It covers the writing
 * window, which stays as it was beneath, hidden, so going back with Esc,
 * or a click on the open project, finds the script, its caret, scroll and
 * undo as they were. Its own top bar holds Tir's name and the saved state;
 * under it the projects, most recent first, with New project and Import…
 * at the top and Rename and Delete in each row's menu, or, with none, the
 * empty library. Dialogs ask for a name, confirm a delete, or choose and
 * report an import. Failures come in message boxes, as elsewhere.
 *
 * Nothing here runs while the writing window shows: its key listener is
 * added only while the screen shows, so a keystroke in the script costs no
 * more (findings, "Editor"). While it shows, the writing window's own keys
 * (zoom, focus mode) do nothing, and Esc closes the menu or dialog open,
 * else goes back.
 */
import { type LeftOutKind, leftOutPages } from "../core/import-report.ts";
import { paginate } from "../core/paginate.ts";
import { usesOf } from "../core/suggestions.ts";
import { type BackupStatus, type Coverage, deletionNote } from "./backup.ts";
import { deskKey } from "./desk.ts";
import type { Library, Project } from "./library.ts";
import { FIRST_DRAFT } from "./opening.ts";
import {
  draftsText,
  type PageCounter,
  type Projects,
  pagesText,
  type Row,
  repeated,
  rows,
  type ScriptImport,
  whenEdited,
} from "./projects.ts";
import type { Place, SaveState } from "./saving.ts";
import { type StatusIndicator, statusIndicator } from "./status-indicator.ts";

/** What the screen needs from the window. */
export interface ScreenSide {
  readonly projects: Projects;
  readonly pages: PageCounter;
  list(): Promise<Library>;
  /** Where the library is, as the writer would type it, for the empty library. */
  place(): Promise<string>;
  /** Saves the script on screen first, so its row is current; a failure is the side's to tell. */
  settle(): Promise<unknown>;
  /** The folder of the project in the writing window; null when none is in the library. */
  openFolder(): string | null;
  /** Goes back to the script in the writing window; false when no script is open. */
  back(): boolean;
  /** How much of the project `folder` GitHub holds, for the warning before deleting it. */
  backupOf(folder: string): Promise<Coverage>;
}

/** A new project's name until the writer gives one (prototype piece 6). */
const NEW_TITLE = "Untitled Screenplay";

const LEFT_OUT: Record<LeftOutKind, string> = {
  note: "Note",
  boneyard: "Boneyard",
  section: "Section",
  synopsis: "Synopsis",
  sceneNumber: "Scene number",
  titlePageField: "Title page field",
  scriptNote: "Script note",
  revision: "Revision marks (text kept)",
  elementType: "Element type (text kept as Action)",
  layout: "Layout",
  formatting: "Formatting",
};

const counted = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** A project's folder, named beside a name another project shares. */
const inFolder = (folder: string) => `folder “${folder}”`;

// Icons from prototype piece 6, on a 16-unit grid.
const ICONS = {
  plus: '<path d="M8 3.5v9M3.5 8h9"/>',
  import: '<path d="M8 2.5v7.5M5 7l3 3 3-3M3 11.5v2h10v-2"/>',
  dots: '<circle cx="3.5" cy="8" r=".9" fill="currentColor"/><circle cx="8" cy="8" r=".9" fill="currentColor"/><circle cx="12.5" cy="8" r=".9" fill="currentColor"/>',
  branch:
    '<circle cx="4.5" cy="3.5" r="1.4"/><circle cx="4.5" cy="12.5" r="1.4"/><circle cx="11.5" cy="5" r="1.4"/><path d="M4.5 4.9v6.2M11.5 6.4c0 2.6-2.2 3.1-4.2 3.5-1.6.3-2.8 1-2.8 1.2"/>',
  clock: '<circle cx="8" cy="8" r="5.6"/><path d="M8 4.8V8l2.2 1.4"/>',
  alert: '<path d="M8 2.3 14.2 13H1.8L8 2.3Z"/><path d="M8 6.4v3M8 11.2v.1"/>',
  file: '<path d="M4 2h5l3 3v9H4Z"/><path d="M9 2v3h3"/>',
  info: '<circle cx="8" cy="8" r="5.6"/><path d="M8 7.5v3M8 5.3v.1"/>',
};

const svg = (name: keyof typeof ICONS, size: number) =>
  `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

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

function button(className: string, label: string, icon?: keyof typeof ICONS): HTMLButtonElement {
  const dom = el("button", className);
  dom.type = "button";
  if (icon) dom.innerHTML = svg(icon, 15);
  dom.append(label);
  return dom;
}

/** A part of a row's second line, with its icon. */
function meta(text: string, icon?: keyof typeof ICONS): HTMLSpanElement {
  const dom = el("span");
  if (icon) dom.innerHTML = svg(icon, 13);
  dom.append(text);
  return dom;
}

interface Field {
  readonly label: string;
  readonly value: string;
}

interface DialogSpec {
  readonly title: string;
  readonly text: string;
  readonly fields?: readonly Field[];
  readonly submit: string;
  readonly danger?: boolean;
  /** Runs once the writer confirms, with each field's value. */
  readonly run: (values: string[]) => void;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export class ProjectsScreen {
  private readonly side: ScreenSide;
  private readonly root: HTMLElement;
  private readonly scroller: HTMLElement;
  private readonly count: HTMLElement;
  private readonly acts: HTMLElement;
  private readonly body: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly dialog: HTMLDialogElement;
  private readonly indicator: StatusIndicator;
  private shownNow = false;
  /** An action is under way: the screen takes no other until it ends. */
  private busy = false;
  /** Counts the screen's showings and listings, so one overtaken stops. */
  private generation = 0;
  private confirmation = 0;
  /** The writing window's scroll, kept for the return. */
  private scroll = 0;
  /** Where the library is, once asked. */
  private place: string | null = null;
  private menuButton: HTMLElement | null = null;

  constructor(side: ScreenSide) {
    this.side = side;
    this.root = el("section");
    this.root.id = "projects";
    this.root.hidden = true;
    this.root.tabIndex = -1;
    this.root.setAttribute("aria-label", "Projects");

    const bar = el("header", "projects-bar");
    const right = el("div", "bar-right");
    bar.append(el("span", "brand", "Tir"), right);
    this.indicator = statusIndicator(right);

    const head = el("div", "projects-head");
    this.count = el("span", "count");
    this.acts = el("div", "acts");
    this.acts.append(...this.actions());
    head.append(el("h1", "", "Projects"), this.count, this.acts);
    this.body = el("div");
    const wrap = el("div", "projects-wrap");
    wrap.append(head, this.body);
    this.scroller = el("div", "projects-scroll");
    this.scroller.append(wrap);
    // A menu stays by its button.
    this.scroller.addEventListener("scroll", () => this.closeMenu(false), { passive: true });

    this.menu = el("div", "pop row-menu");
    this.menu.setAttribute("role", "menu");
    this.menu.hidden = true;
    this.dialog = el("dialog", "dialog");
    this.dialog.setAttribute("aria-labelledby", "dialog-title");
    // A click on the dimmed window around the dialog closes it, as Cancel does.
    this.dialog.addEventListener("click", (event) => {
      if (event.target !== this.dialog) return;
      const { left, right, top, bottom } = this.dialog.getBoundingClientRect();
      const { clientX: x, clientY: y } = event;
      if (x < left || x > right || y < top || y > bottom) this.dialog.close();
    });

    this.root.append(bar, this.scroller, this.menu, this.dialog);
    document.body.append(this.root);
  }

  get shown(): boolean {
    return this.shownNow;
  }

  /** Shows the screen over the writing window, with the saved state as it is. */
  async show(state: SaveState, problem: string | null): Promise<void> {
    if (this.shownNow) return;
    this.shownNow = true;
    this.scroll = scrollY;
    this.indicator.saved(state, problem);
    // No rows until the library is listed afresh: the last showing's would
    // open, or go back to, the wrong project.
    this.count.textContent = "";
    this.body.replaceChildren();
    this.root.hidden = false;
    document.documentElement.classList.add("projects-shown");
    // Out of the script at once, so no key reaches it.
    this.root.focus({ preventScroll: true });
    addEventListener("keydown", this.onKey, true);
    await this.refresh(true);
  }

  /**
   * Leaves the screen: the writing window shows again, scrolled as it was
   * once `focus` has run. Focusing the editor may scroll it: taking focus
   * after a click elsewhere, WebKit puts its selection back and scrolls to
   * it.
   */
  hide(focus?: () => void): void {
    if (!this.shownNow) return;
    this.shownNow = false;
    this.generation++;
    this.closeMenu(false);
    if (this.dialog.open) this.dialog.close();
    removeEventListener("keydown", this.onKey, true);
    this.root.hidden = true;
    document.documentElement.classList.remove("projects-shown");
    focus?.();
    scrollTo(0, this.scroll);
  }

  /** The saved state changed while the screen shows. */
  saved(state: SaveState, problem: string | null): void {
    this.indicator.saved(state, problem);
  }

  /** Backup's status changed. */
  backup(status: BackupStatus): void {
    this.indicator.backup(status);
  }

  /**
   * While Tir closes the screen takes no action, so none starts after
   * closing waited for the last; it works again if the writer keeps Tir open.
   */
  setEditable(on: boolean): void {
    this.root.inert = !on;
    if (on && this.shownNow) this.root.focus({ preventScroll: true });
  }

  /**
   * While the screen shows, the writing window's keys do nothing, and Esc
   * closes the menu, or goes back once nothing is open; an open dialog
   * closes itself on Esc. Up and Down move through an open menu.
   */
  private readonly onKey = (event: KeyboardEvent) => {
    if (event.isComposing) return;
    if (!this.menu.hidden && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      const items = [...this.menu.querySelectorAll<HTMLElement>("button")];
      const at = items.indexOf(document.activeElement as HTMLElement);
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
      return;
    }
    const action = deskKey(event, { focus: true, escTaken: false });
    if (!action) return;
    event.stopPropagation();
    if (action !== "leaveFocus") {
      event.preventDefault();
      return;
    }
    if (this.dialog.open) return;
    event.preventDefault();
    if (!this.menu.hidden) this.closeMenu(true);
    else if (!this.busy) this.side.back();
  };

  /** Import… and New project, for the top of the list and the empty library. */
  private actions(): HTMLButtonElement[] {
    const imports = button("btn", "Import…", "import");
    imports.title = "Import a Fountain or Final Draft file";
    imports.addEventListener("click", () => void this.importScript());
    const create = button("btn primary", "New project", "plus");
    create.dataset.create = "";
    create.addEventListener("click", () => this.newProject());
    return [imports, create];
  }

  /**
   * Runs `action`, one at a time, then lists the library again if the
   * screen still shows; the rows take no other action until then.
   */
  private async act<T>(action: () => Promise<T>, refresh = true): Promise<T | undefined> {
    if (this.busy) return;
    this.busy = true;
    this.root.setAttribute("aria-busy", "true");
    try {
      const result = await action();
      if (refresh && this.shownNow) await this.refresh(false);
      return result;
    } finally {
      this.busy = false;
      this.root.removeAttribute("aria-busy");
    }
  }

  /**
   * Lists the library and shows it, keeping focus on the row it was on;
   * at `first`, on the open project, or else the first.
   */
  private async refresh(first: boolean): Promise<void> {
    const generation = ++this.generation;
    const was = document.activeElement?.closest<HTMLElement>(".prow")?.dataset.folder;
    await this.side.settle();
    let library: Library | null = null;
    let error: string | null = null;
    try {
      library = await this.side.list();
    } catch (failed) {
      error = message(failed);
    }
    if (library && !library.projects.length && !library.unreadable.length && this.place === null) {
      this.place = await this.side.place().catch(() => "");
    }
    if (generation !== this.generation) return;
    const list = library ? rows(library, this.side.openFolder()) : [];
    const counted = this.render(library, list, error);
    const folder = first ? list.find((row) => row.open)?.folder : was;
    const focus =
      this.body.querySelector<HTMLElement>(
        `.prow[data-folder="${CSS.escape(folder ?? "")}"] .open`,
      ) ??
      this.body.querySelector<HTMLElement>(".prow .open") ??
      this.root.querySelector<HTMLElement>("[data-create]:not([hidden] *)");
    focus?.focus({ preventScroll: !first });
    void this.countPages(generation, counted);
  }

  /** Shows `list`, or the empty library, or why the library could not be read; the rows whose pages are to count. */
  private render(
    library: Library | null,
    list: readonly Row[],
    error: string | null,
  ): [Project, HTMLElement][] {
    this.closeMenu(false);
    const n = library?.projects.length ?? 0;
    this.count.textContent = library ? `${n} ${n === 1 ? "screenplay" : "screenplays"}` : "";
    const empty = !error && list.length === 0;
    this.acts.hidden = empty;
    const counted: [Project, HTMLElement][] = [];
    if (error) {
      const box = el("div", "empty");
      box.append(el("h2", "", "Tir could not read the library"), el("p", "", error));
      this.body.replaceChildren(box);
    } else if (empty) {
      const box = el("div", "empty");
      const where = this.place ? ` Your library lives in ${this.place}.` : "";
      const acts = el("div", "acts");
      acts.append(...this.actions());
      box.append(
        el("h2", "", "No screenplays yet"),
        el(
          "p",
          "",
          `Start a new script, or bring one in from a Fountain or Final Draft file.${where}`,
        ),
        acts,
      );
      this.body.replaceChildren(box);
    } else {
      const now = Date.now();
      const plist = el("div", "plist");
      for (const row of list) plist.append(this.row(row, now, counted));
      this.body.replaceChildren(plist);
    }
    return counted;
  }

  private row(row: Row, now: number, counted: [Project, HTMLElement][]): HTMLElement {
    const { project, name } = row;
    const dom = el("div", "prow");
    dom.dataset.folder = row.folder;
    const title = el("div", "t", name);
    if (row.open) title.append(el("span", "tag", "Open"));
    const line = el("div", "m");
    if (project) {
      const { info } = project;
      const draft = info.drafts.find((each) => each.file === info.activeDraft)?.name ?? "";
      const pages = el("span");
      pages.hidden = true;
      counted.push([project, pages]);
      line.append(meta(draft, "branch"), pages, meta(draftsText(info.drafts.length)));
      if (row.edited !== null) line.append(meta(whenEdited(row.edited, now), "clock"));
      if (row.showFolder) line.append(meta(`Folder “${row.folder}”`));
    } else {
      const why = meta(`Tir can't open it. ${row.problem ?? ""}`, "alert");
      why.className = "warn";
      line.append(why);
    }
    // A folder Tir cannot read opens nothing; its menu can still delete it.
    const open = el(project ? "button" : "div", "open");
    open.append(title, line);
    if (open instanceof HTMLButtonElement) {
      open.type = "button";
      open.addEventListener("click", () => {
        if (row.open) {
          if (!this.busy) this.side.back();
        } else void this.act(() => this.side.projects.open(project as Project));
      });
    }
    const more = button("more", "");
    more.innerHTML = svg("dots", 16);
    more.setAttribute(
      "aria-label",
      `More for ${name}${row.showFolder ? `, ${inFolder(row.folder)}` : ""}`,
    );
    more.setAttribute("aria-haspopup", "menu");
    more.setAttribute("aria-expanded", "false");
    more.addEventListener("click", () => this.openMenu(row, more));
    dom.append(open, more);
    return dom;
  }

  /** Fills in each row's pages, one draft at a time, until the screen lists again or leaves. */
  private async countPages(generation: number, counted: [Project, HTMLElement][]): Promise<void> {
    for (const [project, dom] of counted) {
      const pages = await this.side.pages.count(project);
      if (generation !== this.generation) return;
      if (pages === null) continue;
      dom.textContent = pagesText(pages);
      dom.hidden = false;
    }
  }

  private openMenu(row: Row, anchor: HTMLElement): void {
    const again = this.menuButton === anchor;
    this.closeMenu(false);
    if (again || this.busy) return;
    const item = (label: string, run: () => void, danger = false) => {
      const dom = button(danger ? "item danger" : "item", label);
      dom.setAttribute("role", "menuitem");
      dom.addEventListener("click", () => {
        this.closeMenu(true);
        run();
      });
      return dom;
    };
    const { project } = row;
    const items = project ? [item("Rename…", () => this.renameProject(project))] : [];
    items.push(item("Delete…", () => void this.deleteProject(row), true));
    this.menu.replaceChildren(...items);
    this.menu.hidden = false;
    this.menuButton = anchor;
    anchor.setAttribute("aria-expanded", "true");
    const box = anchor.getBoundingClientRect();
    this.menu.style.top = `${box.bottom + 6}px`;
    this.menu.style.left = `${Math.min(innerWidth - this.menu.offsetWidth - 12, box.right - this.menu.offsetWidth)}px`;
    items[0]?.focus();
    document.addEventListener("click", this.clickAway, true);
  }

  /** Closes the row menu; with `refocus`, focus goes back to its button. */
  private closeMenu(refocus: boolean): void {
    const anchor = this.menuButton;
    if (!anchor) return;
    this.menuButton = null;
    this.menu.hidden = true;
    anchor.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", this.clickAway, true);
    if (refocus) anchor.focus();
  }

  /** A click outside the menu and its button closes the menu. */
  private readonly clickAway = (event: MouseEvent) => {
    const target = event.target as Node;
    if (this.menu.contains(target) || this.menuButton?.contains(target)) return;
    this.closeMenu(false);
  };

  private newProject(): void {
    if (this.busy) return;
    this.ask({
      title: "New project",
      text: "A feature screenplay with one draft. You can fill in its title page later.",
      fields: [
        { label: "Title", value: NEW_TITLE },
        { label: "First draft's name", value: FIRST_DRAFT },
      ],
      submit: "Create",
      run: ([title = "", draft = ""]) => {
        const name = title.trim() || NEW_TITLE;
        void this.act(() => this.side.projects.create(name, draft.trim() || FIRST_DRAFT));
      },
    });
  }

  private async importScript(): Promise<void> {
    const source = await this.act(() => this.side.projects.pickScript(), false);
    if (!source || !this.shownNow) return;

    const form = el("form", "import-dialog");
    const heading = el("h2", "", "Import a script");
    heading.id = "dialog-title";
    const file = el("div", "import-file");
    file.innerHTML = svg("file", 18);
    const fileName = el("div", "", source.fileName);
    fileName.append(
      el("small", "", source.format === "fdx" ? "Final Draft file" : "Fountain file"),
    );
    file.append(fileName);

    const choices = el("div", "import-choices");
    choices.setAttribute("role", "radiogroup");
    choices.setAttribute("aria-label", "Where it goes");
    const choice = (title: string, detail: string, checked = false) => {
      const radio = el("input");
      radio.type = "radio";
      radio.name = "import-destination";
      radio.checked = checked;
      const label = el("label");
      const text = el("span");
      text.append(el("b", "", title), el("small", "", detail));
      label.append(radio, text);
      return { label, radio };
    };
    const create = choice("As a new project", `“${source.projectName}”`, true);
    const newProjectCard = el("div");
    newProjectCard.append(create.label);
    choices.append(newProjectCard);
    const target = el("select");
    if (source.targets.length > 0) {
      const add = choice("As a new draft of a project", `Draft name: “${source.draftName}”`);
      const card = el("div");
      target.setAttribute("aria-label", "Project");
      target.disabled = true;
      const shared = repeated(source.targets.map((project) => project.info.name));
      source.targets.forEach((project, i) => {
        const { name } = project.info;
        const option = el("option", "", shared[i] ? `${name} (${inFolder(project.folder)})` : name);
        option.value = project.folder;
        target.append(option);
      });
      const open = this.side.openFolder();
      if (open !== null && source.targets.some((project) => project.folder === open)) {
        target.value = open;
      }
      card.append(add.label, target);
      choices.append(card);
      choices.addEventListener("change", () => {
        target.disabled = !add.radio.checked;
      });
    }

    const note = el("div", "import-note");
    note.innerHTML = svg("info", 16);
    note.append(
      "Tir makes its own copy in your library. The file you picked is never changed, moved or deleted.",
    );
    const cancel = button("btn quiet", "Cancel");
    cancel.addEventListener("click", () => this.dialog.close());
    const confirm = button("btn primary", "Import");
    confirm.type = "submit";
    const actions = el("div", "actions");
    actions.append(cancel, confirm);
    form.append(heading, file, choices, note, actions);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.dialog.close();
      void this.finishImport(source, create.radio.checked ? null : target.value);
    });
    this.dialog.replaceChildren(form);
    this.dialog.showModal();
    create.radio.focus();
  }

  private async finishImport(source: ScriptImport, folder: string | null): Promise<void> {
    const place = await this.act(() => this.side.projects.importFile(source, folder));
    if (place && this.shownNow) this.importReport(source, place, folder === null);
  }

  private importReport(source: ScriptImport, { project, file }: Place, newProject: boolean): void {
    const report = el("div", "import-dialog");
    const heading = el("h2", "", "Imported");
    heading.id = "dialog-title";
    const name = project.info.drafts.find((draft) => draft.file === file)?.name ?? file;
    const destination = newProject
      ? `a new project, “${project.info.name}”`
      : `a new draft, “${name}”, in “${project.info.name}”`;
    report.append(heading, el("p", "", `${source.fileName} is now ${destination}.`));

    const { elements, titlePage } = source.script;
    const pages = paginate(elements);
    let scenes = 0;
    const characters = new Set<string>();
    for (const { type, text } of elements) {
      if (type === "sceneHeading") scenes++;
      if (type === "character") {
        const character = usesOf(type, text).find((use) => use.source === "character");
        if (character) characters.add(character.text.toUpperCase());
      }
    }
    const fields = [
      [titlePage.title, "Title"],
      [titlePage.credit, "Credit"],
      [titlePage.authors, "Author"],
      [titlePage.source, "Source"],
      [titlePage.contact, "Contact"],
      [titlePage.draftDate, "Draft date"],
    ] as const;
    const summary = el("dl", "import-summary");
    summary.append(
      el("dt", "", "Script"),
      el(
        "dd",
        "",
        `${pagesText(pages.length)}, ${counted(scenes, "scene")}, ${counted(characters.size, "character")}`,
      ),
      el("dt", "", "Title page"),
      el(
        "dd",
        "",
        fields
          .filter(([value]) => value.trim())
          .map(([, label]) => label)
          .join(", ") || "None",
      ),
    );
    report.append(summary);

    if (source.leftOut.length > 0) {
      const pageOf = leftOutPages(pages);
      const omissions = el("div", "import-omissions");
      const list = el("ul");
      for (const item of source.leftOut) {
        const li = el("li");
        li.append(el("b", "", LEFT_OUT[item.kind]));
        if (item.text) li.append(": ", el("span", "import-omission-text", item.text));
        const page = pageOf(item);
        if (page !== null) li.append(` (on page ${page})`);
        list.append(li);
      }
      omissions.append(
        el("div", "import-omission-heading", "Left out, because Tir doesn't keep them:"),
        list,
      );
      report.append(omissions);
    } else report.append(el("p", "", "Nothing was left out."));

    const done = button("btn quiet", "Done");
    done.addEventListener("click", () => this.dialog.close());
    const open = button("btn primary", "Open it");
    open.addEventListener("click", () => {
      this.dialog.close();
      void this.act(() => this.side.projects.open(project, file));
    });
    const actions = el("div", "actions");
    actions.append(done, open);
    report.append(actions);
    this.dialog.replaceChildren(report);
    this.dialog.showModal();
    open.focus();
  }

  private renameProject(project: Project): void {
    this.ask({
      title: "Rename project",
      text: "This renames the project in your library. Each draft's title page keeps its own title; change that from the title page.",
      fields: [{ label: "Name", value: project.info.name }],
      submit: "Rename",
      run: ([value = ""]) => {
        const name = value.trim();
        if (!name || name === project.info.name) return;
        void this.act(() => this.side.projects.rename(project, name));
      },
    });
  }

  private async deleteProject(row: Row): Promise<void> {
    const { name } = row;
    const confirmation = ++this.confirmation;
    const generation = this.generation;
    const drafts = row.project?.info.drafts.length;
    const what =
      drafts === undefined
        ? "Everything in its folder"
        : drafts === 1
          ? "Its draft"
          : `Its ${drafts} drafts`;
    const which = row.showFolder ? `This is the “${name}” in the ${inFolder(row.folder)}. ` : "";
    const coverage = await this.side.backupOf(row.folder);
    if (
      confirmation !== this.confirmation ||
      generation !== this.generation ||
      !this.shownNow ||
      this.root.inert ||
      this.dialog.open
    ) {
      return;
    }
    this.ask({
      title: `Delete “${name}”?`,
      text: `${which}${what} will be deleted from this machine. ${deletionNote(coverage)}`,
      submit: "Delete project",
      danger: true,
      run: () => void this.act(() => this.side.projects.remove(row.folder, name)),
    });
  }

  /**
   * Shows a dialog in the page (prototype piece 6): its fields, Cancel and
   * the button `submit`. Enter in a field confirms it, Esc cancels. The
   * first field opens selected; without fields, Cancel has focus.
   */
  private ask({ title, text, fields = [], submit, danger = false, run }: DialogSpec): void {
    this.confirmation++;
    const form = el("form");
    const heading = el("h2", "", title);
    heading.id = "dialog-title";
    form.append(heading, el("p", "", text));
    const inputs = fields.map(({ label, value }, index) => {
      const field = el("div", "field");
      const input = el("input");
      input.type = "text";
      input.id = `dialog-field-${index}`;
      input.value = value;
      input.spellcheck = false;
      input.autocomplete = "off";
      const name = el("label", "", label);
      name.htmlFor = input.id;
      field.append(name, input);
      form.append(field);
      return input;
    });
    const cancel = button("btn quiet", "Cancel");
    cancel.addEventListener("click", () => this.dialog.close());
    const confirm = button(`btn ${danger ? "danger" : "primary"}`, submit);
    confirm.type = "submit";
    const actions = el("div", "actions");
    actions.append(cancel, confirm);
    form.append(actions);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.dialog.close();
      run(inputs.map((input) => input.value));
    });
    this.dialog.replaceChildren(form);
    this.dialog.showModal();
    const first = inputs[0];
    if (first) {
      first.focus();
      first.select();
    } else cancel.focus();
  }
}
