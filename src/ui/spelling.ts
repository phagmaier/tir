/**
 * Spell check (brief, "Spell check"). The dictionary is a worker's
 * (`spell-checker.ts`): after a pause in typing, `spellCheck` sends it the
 * elements it has not checked, each a node, which any change replaces, and
 * draws a squiggle under each misspelled word it finds, unless the script's
 * names and locations or the writer's dictionary know it. Between checks,
 * typing only maps the squiggles, so a keystroke never waits for the
 * dictionary (findings, "Spell check"). A word the caret ends is not marked
 * until the caret leaves it: it may still be being typed.
 *
 * A right click on a squiggle, or F7, which goes to the next, selects the
 * word and opens a menu of spellings, then "Add to dictionary". Its keys
 * are this plugin's, ahead of the screenplay's: the arrows choose, Enter or
 * Tab takes the highlighted row and Esc closes it. A spelling replaces the
 * word as an undo step of its own.
 *
 * The squiggles are decorations and the menu sits in the script's frame, so
 * neither reaches the document, the clipboard or an export.
 */
import type { Node } from "prosemirror-model";
import {
  type Command,
  type EditorState,
  Plugin,
  PluginKey,
  TextSelection,
  type Transaction,
} from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import { ELEMENT_FORMATS } from "../core/format.ts";
import { capitals } from "../core/layout.ts";
import type { ElementType } from "../core/model.ts";
import { accepts, fold, type Word, wordSet, wordToAdd } from "../core/spelling.ts";
import type { Tally } from "../core/suggestions.ts";
import { tallyOf } from "./autocomplete.ts";
import { schema } from "./editor-model.ts";
import { changedRange, ROW_PX } from "./projection.ts";
import type { Checker } from "./spell-checker.ts";
import { ownStep } from "./undo.ts";

/** The menu for a misspelled word: its spellings, then "Add to dictionary". */
export interface SpellingMenu {
  /** The word, which the selection covers while the menu is open. */
  readonly from: number;
  readonly to: number;
  readonly word: string;
  readonly options: readonly string[];
  /** The highlighted row: a spelling, or `options.length` for "Add to dictionary". */
  readonly chosen: number;
}

interface State {
  readonly squiggles: DecorationSet;
  readonly menu: SpellingMenu | null;
}

type Meta =
  | { readonly squiggles: DecorationSet }
  | { readonly menu: SpellingMenu | null }
  | { readonly choose: number };

const key = new PluginKey<State>("spelling");
const MISSPELLED = { class: "misspelled" };
/** The pause in typing after which the elements typed in are checked. */
export const SPELL_CHECK_DELAY_MS = 300;

/** What adds a word to the writer's dictionary, for each editor that can. */
const adders = new WeakMap<EditorView, (word: string) => void>();

/**
 * `squiggles` after `tr`: each moves with its word, and goes when its word
 * is no longer what it marked, as when a spelling replaces it or a letter
 * is typed or deleted in it, until the next check. Typing just before or
 * after a word keeps its squiggle. Only the squiggles where `tr` changed
 * the script are read, so a Replace all of many matches stays one pass.
 */
function follow(squiggles: DecorationSet, tr: Transaction): DecorationSet {
  const next = squiggles.map(tr.mapping, tr.doc);
  const changed = changedRange(tr);
  if (!changed) return next;
  const stale = next
    .find(changed.from, changed.to)
    // A word is never across a line break: one an element splits is stale too.
    .filter(({ from, to, spec }) => tr.doc.textBetween(from, to, "\n") !== spec.word);
  return stale.length ? next.remove(stale) : next;
}

export const spelling = new Plugin<State>({
  key,
  state: {
    init: () => ({ squiggles: DecorationSet.empty, menu: null }),
    apply(tr, value, _before, state) {
      const meta = tr.getMeta(key) as Meta | undefined;
      let { squiggles, menu } = value;
      if (meta && "squiggles" in meta) squiggles = meta.squiggles;
      else if (tr.docChanged) squiggles = follow(squiggles, tr);
      if (meta && "menu" in meta) {
        menu = meta.menu;
      } else if (meta && "choose" in meta) {
        menu = menu && { ...menu, chosen: meta.choose };
      } else if (menu) {
        const { from, to } = state.selection;
        // Any edit, or the selection leaving the word, closes the menu.
        if (tr.docChanged || from !== menu.from || to !== menu.to) menu = null;
      }
      return squiggles === value.squiggles && menu === value.menu ? value : { squiggles, menu };
    },
  },
  props: {
    decorations: (state) => key.getState(state)?.squiggles ?? null,
    handleKeyDown(view, event) {
      const menu = spellingMenu(view.state);
      if (!menu || event.ctrlKey || event.altKey || event.metaKey || view.composing) return false;
      const rows = menu.options.length + 1;
      const choose = (chosen: number) => {
        view.dispatch(view.state.tr.setMeta(key, { choose: chosen } satisfies Meta));
        return true;
      };
      switch (event.shiftKey ? "" : event.key) {
        case "ArrowDown":
          return choose((menu.chosen + 1) % rows);
        case "ArrowUp":
          return choose((menu.chosen + rows - 1) % rows);
        case "Enter":
        case "Tab":
          return applySpelling(menu.chosen, adders.get(view))(view.state, view.dispatch);
        case "Escape":
          return closeSpellingMenu(view.state, view.dispatch);
        default:
          return false;
      }
    },
    handleDOMEvents: {
      blur(view) {
        closeSpellingMenu(view.state, view.dispatch);
        return false;
      },
    },
  },
});

/** The open spelling menu, if any. */
export function spellingMenu(state: EditorState): SpellingMenu | null {
  return key.getState(state)?.menu ?? null;
}

/** The squiggles under the misspelled words. */
export function squigglesOf(state: EditorState): readonly Decoration[] {
  return (key.getState(state)?.squiggles ?? DecorationSet.empty).find();
}

/** Selects the word from `from` to `to` and opens the menu of its `options` and "Add to dictionary". */
export function openSpellingMenu(from: number, to: number, options: readonly string[]): Command {
  return (state, dispatch) => {
    if (dispatch) {
      const word = state.doc.textBetween(from, to);
      const menu: SpellingMenu = { from, to, word, options, chosen: 0 };
      const tr = state.tr.setSelection(TextSelection.create(state.doc, from, to));
      dispatch(tr.setMeta(key, { menu } satisfies Meta).scrollIntoView());
    }
    return true;
  };
}

export const closeSpellingMenu: Command = (state, dispatch) => {
  if (!spellingMenu(state)) return false;
  dispatch?.(state.tr.setMeta(key, { menu: null } satisfies Meta));
  return true;
};

/**
 * Takes the menu's row `index`: a spelling replaces the word, with the
 * formats of its first letter, as an undo step of its own, the caret after
 * it; the last row closes the menu and hands the word to `add`.
 */
export function applySpelling(index: number, add?: (word: string) => void): Command {
  return (state, dispatch) => {
    const menu = spellingMenu(state);
    if (!menu || index < 0 || index > menu.options.length) return false;
    if (!dispatch) return true;
    const option = menu.options[index];
    if (option === undefined) {
      add?.(menu.word);
      dispatch(state.tr.setMeta(key, { menu: null } satisfies Meta));
      return true;
    }
    const { from, to } = menu;
    const marks = state.doc.resolve(from).marksAcross(state.doc.resolve(to)) ?? [];
    // Named in `uiEvent`, as find's replacements are: not typing, so no autocomplete popup.
    const tr = state.tr.setMeta("uiEvent", "spelling");
    tr.replaceWith(from, to, schema.text(option, marks));
    tr.setSelection(TextSelection.create(tr.doc, from + option.length));
    dispatch(ownStep(tr.scrollIntoView()));
    return true;
  };
}

const learnedByTally = new WeakMap<Tally, Set<string>>();

/** Every word of the script's character names and locations, folded (`fold`). */
export function learnedWords(state: EditorState): ReadonlySet<string> {
  const tally = tallyOf(state);
  if (!tally) return new Set();
  let learned = learnedByTally.get(tally);
  if (!learned) {
    learned = wordSet([...tally.entries("character").keys(), ...tally.entries("location").keys()]);
    learnedByTally.set(tally, learned);
  }
  return learned;
}

/** A word's place in the script. */
export interface Place {
  readonly from: number;
  readonly to: number;
}

/**
 * Draws the squiggles for `state`: under each word `flagged` gives for an
 * element that `known` does not accept, but the word the caret ends, which
 * is `held`. An element not checked yet keeps the squiggles it has. The
 * transaction is null when the squiggles would be those already drawn.
 */
export function drawSquiggles(
  state: EditorState,
  flagged: (element: Node) => readonly Word[] | undefined,
  known: ReadonlySet<string>,
): { tr: Transaction | null; held: Place | null } {
  const { doc, selection } = state;
  const drawn = key.getState(state)?.squiggles ?? DecorationSet.empty;
  const caret = selection.empty ? selection.head : -1;
  const squiggles: Decoration[] = [];
  let held: Place | null = null;
  doc.forEach((node, pos) => {
    const words = flagged(node);
    if (!words) {
      squiggles.push(...drawn.find(pos, pos + node.nodeSize));
      return;
    }
    for (const word of words) {
      if (accepts(known, word.text)) continue;
      const from = pos + 1 + word.start;
      const to = pos + 1 + word.end;
      if (to === caret) held = { from, to };
      else squiggles.push(Decoration.inline(from, to, MISSPELLED, { word: word.text }));
    }
  });
  const before = drawn.find();
  const same =
    before.length === squiggles.length &&
    before
      .sort((a, b) => a.from - b.from)
      .every(({ from, to }, i) => from === squiggles[i]?.from && to === squiggles[i]?.to);
  if (same) return { tr: null, held };
  const meta: Meta = { squiggles: DecorationSet.create(doc, squiggles) };
  return { tr: state.tr.setMeta(key, meta), held };
}

/**
 * The misspelling F7 goes to: the word the caret ends, `held`, which has no
 * squiggle yet; else the squiggle the caret is in, or the first after the
 * selection; from the last, the first. Null when there is none.
 */
export function nextMisspelling(state: EditorState, held: Place | null): Place | null {
  if (held) return held;
  const { selection } = state;
  const squiggles = [...squigglesOf(state)].sort((a, b) => a.from - b.from);
  return (
    squiggles.find((squiggle) =>
      selection.empty ? squiggle.to >= selection.from : squiggle.from >= selection.to,
    ) ??
    squiggles[0] ??
    null
  );
}

/** The writer's own words, in the library, which spell check accepts beside the dictionary's. */
export interface WritersDictionary {
  readonly words: Promise<readonly string[]>;
  add(word: string): Promise<void>;
}

/** What the open editor's spell check does at another's asking: the menu's add, a redraw. */
interface Live {
  readonly view: EditorView;
  open(from: number, to: number): void;
  redraw(): void;
  /** Checks what is waiting for a pause now, and resolves once every check sent has answered. */
  checked(): Promise<unknown>;
}

/**
 * Checks the script after each pause in typing, draws the squiggles, and
 * opens the spelling menu on a right click or F7. `report` tells the writer
 * of a failure, `toast` of anything else.
 */
export function spellCheck(
  checker: Checker,
  dictionary: WritersDictionary,
  canNavigate: () => boolean,
  showScript: () => void,
  toast: (text: string) => void,
  report: (title: string, message: string) => void,
): Plugin {
  // Kept for every editor state the window shows: ProseMirror makes the
  // plugin's view again for each, and elements are nodes, never changed.
  const results = new WeakMap<Node, readonly Word[]>();
  const pending = new WeakSet<Node>();
  const writers: string[] = [];
  let off = false;
  let live: Live | null = null;
  let known: { learned: ReadonlySet<string>; words: number; all: Set<string> } | null = null;
  const knownIn = (state: EditorState) => {
    const learned = learnedWords(state);
    if (known?.learned !== learned || known.words !== writers.length) {
      const all = new Set(learned);
      for (const word of writers) all.add(fold(word));
      known = { learned, words: writers.length, all };
    }
    return known.all;
  };
  dictionary.words.then(
    (words) => {
      writers.push(...words);
      live?.redraw();
    },
    (error) => console.error("Tir could not read the writer's dictionary:", error),
  );
  const add = (word: string) => {
    const entry = wordToAdd(word);
    dictionary.add(entry).then(
      () => {
        writers.push(entry);
        live?.redraw();
      },
      (error) =>
        report(
          "Not added to the dictionary",
          `Tir could not add “${entry}” to the dictionary: ${error instanceof Error ? error.message : String(error)}`,
        ),
    );
  };
  const onKey = (event: KeyboardEvent) => {
    if (
      event.key !== "F7" ||
      event.defaultPrevented ||
      event.isComposing ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.shiftKey ||
      !live?.view.editable ||
      !canNavigate()
    ) {
      return;
    }
    event.preventDefault();
    const { view } = live;
    // The word just typed may wait for its check: F7 goes to it once checked.
    void live.checked().then(() => {
      if (live?.view !== view || !view.editable || !canNavigate()) return;
      const { held } = drawSquiggles(view.state, (node) => results.get(node), knownIn(view.state));
      const next = nextMisspelling(view.state, held);
      if (!next) {
        toast(off ? "Spell check is off" : "No misspellings");
        return;
      }
      showScript();
      view.focus();
      live.open(next.from, next.to);
    });
  };
  window.addEventListener("keydown", onKey);

  return new Plugin({
    props: {
      handleDOMEvents: {
        contextmenu(view, event) {
          // Only on a squiggle itself: off a line's end the nearest place may be in one.
          const onSquiggle = (event.target as Element | null)?.closest?.(".misspelled");
          const at = onSquiggle && view.posAtCoords({ left: event.clientX, top: event.clientY });
          const hit =
            at && squigglesOf(view.state).find(({ from, to }) => from <= at.pos && at.pos <= to);
          if (!hit || live?.view !== view || !view.editable) return false;
          event.preventDefault();
          live.open(hit.from, hit.to);
          return true;
        },
      },
    },
    view(view) {
      let waiting = 0;
      let held = false;
      let destroyed = false;
      // Settles once every check sent so far has answered.
      let answered: Promise<unknown> = Promise.resolve();
      const menu = new MenuView(
        view,
        (index) => view.editable && applySpelling(index, add)(view.state, view.dispatch),
      );
      const redraw = () => {
        if (destroyed) return;
        const drawn = drawSquiggles(view.state, (node) => results.get(node), knownIn(view.state));
        held = drawn.held !== null;
        if (drawn.tr) view.dispatch(drawn.tr);
      };
      const refresh = () => {
        clearTimeout(waiting);
        waiting = 0;
        const unchecked: Node[] = [];
        view.state.doc.forEach((node) => {
          if (results.has(node) || pending.has(node)) return;
          unchecked.push(node);
          pending.add(node);
        });
        if (unchecked.length && !off) {
          const elements = unchecked.map((node) => ({
            type: node.attrs.type as ElementType,
            text: node.textContent,
          }));
          const check = checker.check(elements).then(
            (words) => {
              unchecked.forEach((node, i) => {
                results.set(node, words[i] ?? []);
                pending.delete(node);
              });
              redraw();
            },
            (error) => {
              off = true;
              console.error("Tir's spell check failed:", error);
              toast("Spell check is off: it could not check the script");
            },
          );
          answered = Promise.all([answered, check]);
        }
        redraw();
      };
      const schedule = (ms: number) => {
        clearTimeout(waiting);
        waiting = window.setTimeout(refresh, ms);
      };
      const open = (from: number, to: number) => {
        const { doc } = view.state;
        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(doc, from, to)).scrollIntoView(),
        );
        checker.suggest(doc.textBetween(from, to), [...learnedWords(view.state), ...writers]).then(
          (options) => {
            const { selection } = view.state;
            // Opened only on the word as it was asked about, still selected.
            if (
              destroyed ||
              view.state.doc !== doc ||
              selection.from !== from ||
              selection.to !== to
            ) {
              return;
            }
            openSpellingMenu(from, to, options)(view.state, view.dispatch);
          },
          (error) => console.error("Tir found no spellings:", error),
        );
      };
      const checked = () => {
        if (waiting) refresh();
        return answered;
      };
      live = { view, open, redraw, checked };
      adders.set(view, add);
      // The script as it opens is checked at once.
      schedule(0);
      return {
        update(next, previous) {
          if (next.state.doc !== previous.doc) schedule(SPELL_CHECK_DELAY_MS);
          else if (held && !next.state.selection.eq(previous.selection)) schedule(0);
          menu.update(next);
        },
        destroy() {
          destroyed = true;
          clearTimeout(waiting);
          menu.destroy();
          adders.delete(view);
          if (live?.view === view) live = null;
        },
      };
    },
  });
}

/** Moves the open spelling menu to its word's place in the current layout, as after a zoom. */
export function placeSpellingMenu(view: EditorView): void {
  menus.get(view)?.place(view);
}

const menus = new WeakMap<EditorView, MenuView>();

/**
 * The menu, below the word's line, or above it when the window has no room
 * below, in the script's frame, which the zoom does not scale, as
 * autocomplete's popup is.
 */
class MenuView {
  private readonly list = document.createElement("div");
  private shown: SpellingMenu | null = null;

  constructor(view: EditorView, choose: (index: number) => void) {
    this.list.className = "completion spelling-menu";
    this.list.setAttribute("role", "listbox");
    this.list.setAttribute("aria-label", "Spelling");
    this.list.hidden = true;
    // Pressing a row would take focus, and the selection, from the editor.
    this.list.addEventListener("mousedown", (event) => event.preventDefault());
    this.list.addEventListener("click", (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>("[data-index]");
      if (row) choose(Number(row.dataset.index));
    });
    view.dom.parentElement?.parentElement?.append(this.list);
    menus.set(view, this);
  }

  update(view: EditorView): void {
    const menu = spellingMenu(view.state);
    if (menu === this.shown) return;
    // Only a menu for another word moves: choosing a row redraws it in place.
    const moved = menu?.from !== this.shown?.from || menu?.to !== this.shown?.to;
    this.shown = menu;
    if (!menu) {
      this.list.hidden = true;
      return;
    }
    const type = view.state.doc.resolve(menu.from).parent.attrs.type as ElementType;
    const shown = ELEMENT_FORMATS[type].capitals ? capitals : (text: string) => text;
    const row = (className: string, text: string, index?: number) => {
      const dom = document.createElement("div");
      dom.className = className;
      const span = document.createElement("span");
      span.textContent = text;
      dom.append(span);
      if (index !== undefined) {
        dom.dataset.index = String(index);
        dom.setAttribute("role", "option");
        dom.setAttribute("aria-selected", String(index === menu.chosen));
      }
      return dom;
    };
    this.list.replaceChildren(
      row("completion-title", "Spelling"),
      ...menu.options.map((option, index) => row("completion-option", shown(option), index)),
      ...(menu.options.length ? [] : [row("spelling-none", "No suggestions")]),
      row(
        "completion-option spelling-add",
        `Add “${shown(wordToAdd(menu.word))}” to dictionary`,
        menu.options.length,
      ),
      row("completion-keys", "Enter chooses · ↑↓ · Esc"),
    );
    this.list.hidden = false;
    if (moved) this.place(view);
  }

  /** Below the word's line from its first letter, or above it when only that fits in the window. */
  place(view: EditorView): void {
    const menu = this.shown;
    const frame = this.list.parentElement;
    const script = view.dom.parentElement;
    if (!menu || !frame || !script) return;
    const start = view.coordsAtPos(menu.from, 1);
    const box = frame.getBoundingClientRect();
    const zoom = script.getBoundingClientRect().width / script.offsetWidth || 1;
    const row = ROW_PX * zoom;
    const top = (start.top + start.bottom - row) / 2;
    const { offsetWidth: width, offsetHeight: height } = this.list;
    const below = top + row + 4;
    const above = top - 4 - height;
    const y = below + height > innerHeight && above >= 0 ? above : below;
    const x = Math.max(0, Math.min(start.left, document.documentElement.clientWidth - width - 4));
    this.list.style.top = `${y - box.top}px`;
    this.list.style.left = `${x - box.left}px`;
  }

  destroy(): void {
    this.list.remove();
  }
}
