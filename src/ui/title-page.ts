import { FONT_SIZE_PT, LINES_PER_INCH, PAGE, TITLE_PAGE } from "../core/format.ts";
import { newTitlePage, type TitlePage } from "../core/model.ts";

const TEXT_FIELDS = ["title", "credit", "authors", "source", "contact", "draftDate"] as const;

function required<T extends Element>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Missing title page element: ${selector}`);
  return node;
}

/** The title page sits over the mounted script, leaving its selection and history alone. */
export class TitlePageView {
  private readonly root: HTMLElement;
  private readonly pages: HTMLElement;
  private readonly trigger: HTMLButtonElement;
  private readonly form: HTMLFormElement;
  private readonly title: HTMLTextAreaElement;
  private readonly render: () => void;
  private page = newTitlePage();
  private scriptScroll = { x: 0, y: 0 };

  constructor(
    root: HTMLElement,
    pages: HTMLElement,
    change: (page: TitlePage) => void,
    focusScript: () => void,
  ) {
    this.root = root;
    this.pages = pages;
    this.trigger = required(document, "#title-page-row");
    this.form = required(root, "form");
    this.title = required(this.form, "#tp-title");
    const toggle = required<HTMLInputElement>(this.form, "#tp-show-draft-date");
    const dateField = required<HTMLElement>(root, "#tp-draft-field");
    const preview = required<HTMLElement>(root, ".title-preview");
    preview.style.cssText = [
      `--paper-width: ${PAGE.widthIn}in`,
      `--paper-height: ${PAGE.heightIn}in`,
      `--font-size: ${FONT_SIZE_PT}pt`,
      `--row-height: calc(1in / ${LINES_PER_INCH})`,
      `--title-top: ${TITLE_PAGE.centreTopIn}in`,
      `--margin-left: ${PAGE.leftMarginIn}in`,
      `--margin-right: ${PAGE.rightMarginIn}in`,
      `--margin-bottom: ${PAGE.bottomMarginIn}in`,
    ].join("; ");
    const print = TEXT_FIELDS.map(
      (key) => [key, required<HTMLElement>(preview, `[data-print="${key}"]`)] as const,
    );
    const draw = () => {
      dateField.hidden = !this.page.showDraftDate;
      for (const [key, node] of print) {
        const text = this.page[key];
        const empty = !text.trim();
        const printed = key === "title" && empty ? "TITLE" : text;
        if (node.textContent !== printed) node.textContent = printed;
        node.hidden = key === "draftDate" ? !this.page.showDraftDate : key !== "title" && empty;
        if (key === "title") node.classList.toggle("title-placeholder", empty);
      }
    };

    const fields = TEXT_FIELDS.map(
      (key) => [key, required<HTMLTextAreaElement>(this.form, `[name="${key}"]`)] as const,
    );
    this.render = () => {
      for (const [key, field] of fields) field.value = this.page[key];
      toggle.checked = this.page.showDraftDate;
      draw();
    };
    const update = (page: TitlePage) => {
      this.page = page;
      draw();
      change(page);
    };
    for (const [key, field] of fields) {
      field.addEventListener("input", () => update({ ...this.page, [key]: field.value }));
    }
    toggle.addEventListener("input", () => update({ ...this.page, showDraftDate: toggle.checked }));
    this.form.addEventListener("submit", (event) => event.preventDefault());

    const back = () => {
      if (!this.close()) return;
      focusScript();
      scrollTo(this.scriptScroll.x, this.scriptScroll.y);
    };
    this.trigger.addEventListener("click", () => {
      if (root.hidden) this.open();
      else back();
    });
    // Draft menus and Projects get Esc first on the window. Desk's Esc for
    // focus mode is registered after this listener on the document.
    document.addEventListener(
      "keydown",
      (event) => {
        if (
          root.hidden ||
          this.form.closest("[inert]") ||
          event.isComposing ||
          event.key !== "Escape"
        ) {
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        back();
      },
      true,
    );
  }

  load(page: TitlePage): void {
    this.page = page;
  }

  nameDraft(name: string): void {
    for (const label of document.querySelectorAll("[data-title-draft]")) label.textContent = name;
  }

  open(): void {
    this.scriptScroll = { x: scrollX, y: scrollY };
    this.render();
    this.pages.inert = true;
    this.root.hidden = false;
    document.documentElement.classList.add("title-page-shown");
    this.trigger.setAttribute("aria-pressed", "true");
    this.root.scrollTo(0, 0);
    this.focus();
  }

  close(): boolean {
    if (this.root.hidden) return false;
    this.pages.inert = false;
    this.root.hidden = true;
    document.documentElement.classList.remove("title-page-shown");
    this.trigger.setAttribute("aria-pressed", "false");
    scrollTo(this.scriptScroll.x, this.scriptScroll.y);
    return true;
  }

  focus(): boolean {
    if (this.root.hidden) return false;
    this.title.focus({ preventScroll: true });
    return true;
  }

  setEditable(on: boolean): void {
    this.form.inert = !on;
    this.trigger.disabled = !on;
    if (on) this.focus();
  }
}
