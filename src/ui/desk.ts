/**
 * The window's settings (brief, "Scope": Zoom, Focus mode, Dark and light
 * themes; "Scene sidebar"): the paper switch and the zoom control in the
 * sidebar's footer (prototype piece 5), the sidebar's toggle at the top
 * bar's left end (piece 8, A), and the keys for zoom and focus mode. A
 * change shows at once and is saved.
 *
 * The keys are the window's, not the editor's, so they are caught on the
 * way down to the element with focus, before the editor sees them: the
 * editor takes every Esc (ProseMirror's `captureKeyDown` prevents its
 * default), so on the way back up an Esc that closed nothing looks like
 * one that closed the autocomplete popup. Esc yields instead to what has
 * an Esc of its own: the popup, and a field such as Go to page's.
 */
import { type Settings, type Theme, zoomIn, zoomOut } from "../core/settings.ts";
import { popupOf } from "./autocomplete.ts";
import type { Editor } from "./editor.ts";

export type DeskAction = "zoomIn" | "zoomOut" | "focus" | "leaveFocus";

type Keys = Pick<KeyboardEvent, "key" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey">;

/** What the window's keys depend on besides the key. */
export interface DeskKeyState {
  readonly focus: boolean;
  /** Something nearer the writer closes on Esc: the autocomplete popup, or a field. */
  readonly escTaken: boolean;
}

/**
 * What a key press does to the window, recorded in brief, "Elements and
 * keys": Ctrl+= (or Ctrl++) and Ctrl+− zoom, Ctrl+Shift+F turns focus mode
 * on and off, and Esc leaves it once nothing nearer takes it. Ctrl+0 is
 * General, so it resets nothing.
 */
export function deskKey(
  { key, ctrlKey, shiftKey, altKey, metaKey }: Keys,
  { focus, escTaken }: DeskKeyState,
): DeskAction | null {
  if (altKey || metaKey) return null;
  if (ctrlKey && (key === "=" || key === "+")) return "zoomIn";
  if (ctrlKey && !shiftKey && key === "-") return "zoomOut";
  if (ctrlKey && shiftKey && key.toLowerCase() === "f") return "focus";
  if (!ctrlKey && !shiftKey && key === "Escape" && focus && !escTaken) return "leaveFocus";
  return null;
}

/** The parts of the window the settings change. */
export interface DeskParts {
  readonly topbar: HTMLElement;
  readonly sidebar: HTMLElement;
  /** The sidebar's footer, for the paper switch and the zoom control. */
  readonly footer: HTMLElement;
  /** The top bar's left end, for the sidebar's toggle. */
  readonly barLeft: HTMLElement;
  /** The script's place in the document, which the bars' space moves. */
  readonly pages: HTMLElement;
  readonly toast: HTMLElement;
}

// Icons from prototype pieces 5 and 8, on a 16-unit grid.
const ICONS = {
  moon: '<path d="M13 9.6A5.4 5.4 0 0 1 6.4 3 5.4 5.4 0 1 0 13 9.6Z"/>',
  sun: '<circle cx="8" cy="8" r="2.8"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/>',
  minus: '<path d="M3.5 8h9"/>',
  plus: '<path d="M8 3.5v9M3.5 8h9"/>',
  sidebar: '<rect x="1.8" y="2.6" width="12.4" height="10.8" rx="2"/><path d="M6.2 2.6v10.8"/>',
};

const svg = (name: keyof typeof ICONS, size: number) =>
  `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const PAPER: Readonly<Record<Theme, { icon: keyof typeof ICONS; name: string }>> = {
  dark: { icon: "moon", name: "Dark paper" },
  light: { icon: "sun", name: "White paper" },
};

/**
 * A button that leaves focus, and the caret, in the editor when pressed. A
 * field with focus, such as Go to page's, gives it to the editor, so it
 * closes as a click elsewhere closes it.
 */
function button(editor: Editor, className: string, html: string, title: string): HTMLButtonElement {
  const dom = document.createElement("button");
  dom.type = "button";
  dom.className = className;
  dom.title = title;
  dom.innerHTML = html;
  dom.addEventListener("mousedown", (event) => {
    event.preventDefault();
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      editor.view.focus();
    }
  });
  return dom;
}

export class Desk {
  private shown: Settings;
  private readonly editor: Editor;
  private readonly save: (settings: Settings) => void;
  private readonly parts: DeskParts;
  private readonly paper: HTMLButtonElement;
  private readonly zoomShown = document.createTextNode("");
  private readonly toggle: HTMLButtonElement;
  private toastTimer = 0;

  constructor(
    editor: Editor,
    settings: Settings,
    save: (settings: Settings) => void,
    parts: DeskParts,
  ) {
    this.editor = editor;
    this.save = save;
    this.parts = parts;
    this.shown = settings;

    this.paper = button(editor, "paper", "", "Switch the page between dark and white paper");
    this.paper.addEventListener("click", () =>
      this.set({ theme: this.shown.theme === "dark" ? "light" : "dark" }),
    );
    const out = button(editor, "", svg("minus", 14), "Zoom out · Ctrl+−");
    out.setAttribute("aria-label", "Zoom out");
    out.setAttribute("aria-keyshortcuts", "Control+-");
    out.addEventListener("click", () => this.set({ zoom: zoomOut(this.shown.zoom) }));
    const into = button(editor, "", svg("plus", 14), "Zoom in · Ctrl+=");
    into.setAttribute("aria-label", "Zoom in");
    into.setAttribute("aria-keyshortcuts", "Control+=");
    into.addEventListener("click", () => this.set({ zoom: zoomIn(this.shown.zoom) }));
    const shown = document.createElement("span");
    shown.append(this.zoomShown);
    const zoom = document.createElement("span");
    zoom.className = "zoom";
    zoom.append(out, shown, into);
    parts.footer.append(this.paper, zoom);

    this.toggle = button(editor, "side-toggle", svg("sidebar", 16), "");
    this.toggle.setAttribute("aria-label", "Scene sidebar");
    this.toggle.addEventListener("click", () =>
      this.set({ sidebarCollapsed: !this.shown.sidebarCollapsed }),
    );
    parts.barLeft.prepend(this.toggle);

    // On the document, not the window, so a probe's capturing listener on
    // the window still sees each key first (tools/editor-timing).
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.isComposing) return;
        const escTaken =
          event.key === "Escape" &&
          (!!popupOf(editor.view.state) ||
            event.target instanceof HTMLInputElement ||
            event.target instanceof HTMLTextAreaElement);
        const action = deskKey(event, { focus: this.shown.focus, escTaken });
        if (!action) return;
        event.preventDefault();
        const { zoom, focus } = this.shown;
        if (action === "zoomIn") this.set({ zoom: zoomIn(zoom) });
        else if (action === "zoomOut") this.set({ zoom: zoomOut(zoom) });
        else this.set({ focus: action === "focus" && !focus });
      },
      true,
    );

    this.show(settings, null);
    // The bars fade only for changes made from now on, not into the state Tir opens in.
    requestAnimationFrame(() => document.body.classList.add("settled"));
  }

  get settings(): Settings {
    return this.shown;
  }

  /** Changes settings, shows them and saves them. The project shown is kept only. */
  set(change: Partial<Settings>): void {
    const next = { ...this.shown, ...change };
    const was = this.shown;
    if (
      next.zoom === was.zoom &&
      next.theme === was.theme &&
      next.focus === was.focus &&
      next.sidebarCollapsed === was.sidebarCollapsed &&
      next.project === was.project
    ) {
      return;
    }
    this.show(next, was);
    this.save(next);
  }

  /** Shows `next`, changing only what differs from `was` (everything at first). */
  private show(next: Settings, was: Settings | null): void {
    const { body } = document;
    const { topbar, sidebar, pages } = this.parts;
    this.shown = next;
    if (next.theme !== was?.theme) {
      body.dataset.theme = next.theme;
      const { icon, name } = PAPER[next.theme];
      this.paper.innerHTML = `${svg(icon, 14)}<span>${name}</span>`;
    }
    if (next.focus !== was?.focus || next.sidebarCollapsed !== was?.sidebarCollapsed) {
      // The bars' space comes and goes above the script and beside it. The
      // page centres in the space left, and the script stays where it was
      // in the window, as far as the document's top allows.
      const before = pages.getBoundingClientRect().top;
      body.classList.toggle("focus", next.focus);
      body.classList.toggle("sidebar-collapsed", next.sidebarCollapsed);
      if (was) scrollBy(0, pages.getBoundingClientRect().top - before);
      this.editor.setCovered({
        top: next.focus ? 0 : topbar.offsetHeight,
        left: next.focus || next.sidebarCollapsed ? 0 : sidebar.offsetWidth,
      });
      const open = !next.sidebarCollapsed;
      this.toggle.setAttribute("aria-pressed", String(open));
      this.toggle.title = `${open ? "Hide" : "Show"} the sidebar`;
      if (next.focus && !was?.focus) this.toast("Focus mode · Ctrl+Shift+F or Esc to leave");
    }
    if (next.zoom !== was?.zoom) {
      body.style.setProperty("--desk-zoom", String(next.zoom));
      this.editor.setZoom(next.zoom);
      this.zoomShown.data = `${Math.round(next.zoom * 100)}%`;
    }
  }

  /** Shows `text` at the top of the window for a moment (prototype piece 5's toast). */
  toast(text: string): void {
    const { toast } = this.parts;
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2200);
  }
}
