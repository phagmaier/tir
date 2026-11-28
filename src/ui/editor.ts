import { baseKeymap } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import type { Node, NodeType } from "prosemirror-model";
import { EditorState, type Plugin, TextSelection } from "prosemirror-state";
import { EditorView, type NodeView, type ViewMutationRecord } from "prosemirror-view";
import { DUAL_FORMATS, ELEMENT_FORMATS, FONT_SIZE_PT, PAGE } from "../core/format.ts";
import type { Element, ElementType } from "../core/model.ts";
import { autocomplete, placePopup, popupOf } from "./autocomplete.ts";
import { clipboard } from "./clipboard.ts";
import { screenplayKeys } from "./commands.ts";
import { schema, toDocument } from "./editor-model.ts";
import { find } from "./find.ts";
import { type Block, Projection, ROW_PX, SHEET_PX, sameBlock } from "./projection.ts";
import { SheetLayer } from "./sheets.ts";
import { placeSpellingMenu, spelling } from "./spelling.ts";
import { undoHistory, undoKeys } from "./undo.ts";

/**
 * Where dual dialogue's columns divide the page: halfway across the gutter
 * between them. Each column's paragraphs stay on their side, so a click in
 * one column never lands in the other's paragraph.
 */
const DUAL_SPLIT_IN = (DUAL_FORMATS.left.dialogue.right + DUAL_FORMATS.right.dialogue.left) / 2;

/** The block each paragraph was last set to. */
const written = new WeakMap<HTMLElement, Block>();

/**
 * Places an element's paragraph: the space above and below it, its first
 * line's indent, and its column in dual dialogue.
 */
function setBlock(dom: HTMLElement, block: Block): void {
  const was = written.get(dom);
  if (was && sameBlock(was, block)) return;
  written.set(dom, block);
  const { gap, x, column, below } = block;
  // A negative gap sets a column beside the one before it (dual dialogue).
  let css = `${gap < 0 ? "margin" : "padding"}-top: ${gap}px; `;
  if (column === "left") {
    css += `padding-left: ${x}in; width: ${DUAL_SPLIT_IN}in`;
  } else if (column === "right") {
    const inset = Math.round((x - DUAL_SPLIT_IN) * 1e6) / 1e6;
    css += `margin-left: ${DUAL_SPLIT_IN}in; padding-left: ${inset}in`;
  } else {
    css += `padding-left: ${x}in`;
  }
  if (below) css += `; padding-bottom: ${below}px`;
  dom.style.cssText = css;
}

/**
 * An element's paragraph, styled from the projection as ProseMirror draws it.
 * Where the element calls for capitals, CSS shows them (`caps`): the text
 * stays as typed, and the projection marks the characters CSS must leave
 * alone, whose capitals are longer.
 */
class ElementView implements NodeView {
  readonly dom: HTMLElement;
  readonly contentDOM: HTMLElement;
  private readonly type: NodeType;
  private readonly block: () => Block | undefined;
  private caps = false;

  constructor(node: Node, block: () => Block | undefined) {
    this.type = node.type;
    this.block = block;
    this.dom = this.contentDOM = document.createElement("p");
    this.style(node);
  }

  update(node: Node): boolean {
    if (node.type !== this.type) return false;
    this.style(node);
    return true;
  }

  // The editor sets the paragraph's style and class itself.
  ignoreMutation(mutation: ViewMutationRecord): boolean {
    return mutation.type === "attributes" && mutation.target === this.dom;
  }

  private style(node: Node): void {
    const caps = ELEMENT_FORMATS[node.attrs.type as ElementType].capitals;
    if (caps !== this.caps) {
      this.caps = caps;
      this.dom.className = caps ? "caps" : "";
    }
    const block = this.block();
    if (block) setBlock(this.dom, block);
  }
}

/**
 * The element ProseMirror makes editable, refusing touch listeners. WebKitGTK
 * maintains touch-event regions for every layer of a page that has touch
 * listeners, walking the whole script after each keystroke to do so
 * (findings, "Editor"). ProseMirror's touch handlers only adjust touch-screen
 * selection.
 */
function editableRoot(): HTMLElement {
  const dom = document.createElement("div");
  const listen = dom.addEventListener.bind(dom);
  dom.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => {
    if (type !== "touchstart" && type !== "touchmove") listen(type, listener, options);
  }) as typeof dom.addEventListener;
  return dom;
}

/**
 * Applies plain typing and deleting to the document directly, so WebKit
 * neither edits the DOM itself, laying the script out to do so, nor works out
 * its editing state for that edit (findings, "Editor"). The browser still
 * decides what a deletion removes. Composed input (dead keys, the Compose
 * key), edits across elements and other kinds of input stay native.
 */
function directInput(view: EditorView, event: InputEvent): boolean {
  const typing = event.inputType === "insertText";
  const deleting = event.inputType.startsWith("delete") && event.inputType !== "deleteByCut";
  if (event.isComposing || (!typing && !deleting)) return false;
  let { from, to } = view.state.selection;
  const [range] = event.getTargetRanges();
  if (range) {
    from = view.posAtDOM(range.startContainer, range.startOffset);
    to = view.posAtDOM(range.endContainer, range.endOffset);
  } else if (deleting) {
    return false;
  }
  const { doc } = view.state;
  const $from = doc.resolve(from);
  const text = typing ? (event.data ?? "") : "";
  if (from > to || (typing ? !text : from === to) || !$from.parent.isTextblock) return false;
  if (!$from.sameParent(doc.resolve(to))) return false;
  event.preventDefault();
  if (!typing) {
    view.dispatch(view.state.tr.delete(from, to).scrollIntoView());
    return true;
  }
  const insert = () => view.state.tr.insertText(text, from, to);
  if (!view.someProp("handleTextInput", (f) => f(view, from, to, text, insert))) {
    view.dispatch(insert().scrollIntoView());
  }
  return true;
}

/**
 * Up and Down across a page gap inside an element, which WebKit gets wrong:
 * the gap is a block inside the paragraph, so Down lands at the start of the
 * next page's line and Up skips the line above the gap (findings, "Editor").
 * They go to the engine's line beyond the gap at the caret's place across,
 * extending the selection with Shift, as everywhere else.
 */
function crossPageGap(view: EditorView, event: KeyboardEvent, projection: Projection): boolean {
  const down = event.key === "ArrowDown";
  if (!down && event.key !== "ArrowUp") return false;
  if (event.ctrlKey || event.altKey || event.metaKey || view.composing) return false;
  // The autocomplete popup's arrows choose a suggestion.
  if (popupOf(view.state)) return false;
  const { selection } = view.state;
  if (!(selection instanceof TextSelection) || selection.$head.depth !== 1) return false;
  const { $head } = selection;
  const line = projection.lineAcrossGap($head.index(0), $head.parentOffset, down);
  if (!line) return false;
  const start = $head.start();
  const x = view.coordsAtPos($head.pos, $head.parentOffset === line.from ? 1 : -1).left;
  const target = view.coordsAtPos(start + line.start, 1);
  const found = view.posAtCoords({ left: x, top: (target.top + target.bottom) / 2 });
  const pos = Math.min(Math.max(found?.pos ?? 0, start + line.start), start + line.end);
  const anchor = event.shiftKey ? selection.anchor : pos;
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, anchor, pos)).scrollIntoView(),
  );
  return true;
}

/** Pixels at the window's top and left that fixed bars cover over the scrolling document. */
export interface Covered {
  readonly top: number;
  readonly left: number;
}

export interface EditorOptions {
  /**
   * View plugins for interface parts that follow the editor, such as the
   * element toolbar and the scene sidebar, given the projection, which is
   * up to date whenever they update, the page's zoom, and the scaled script
   * container for layers outside the editable root.
   */
  readonly plugins?: (
    projection: Projection,
    zoom: () => number,
    script: HTMLElement,
  ) => readonly Plugin[];
  /** The page's scale at first; 1 by default. */
  readonly zoom?: number;
}

/** The editor, with what the window's settings change in it. */
export interface Editor {
  readonly view: EditorView;
  /**
   * Shows `elements` in place of the script, with the caret at its start
   * and an undo history and autocomplete of its own: undo never reaches
   * the script it replaced.
   */
  open(elements: readonly Element[]): void;
  /**
   * Shows the page at `zoom`, keeping the caret's line where it is in the
   * window, or the window's middle when the caret is out of sight.
   */
  setZoom(zoom: number): void;
  /** What fixed bars cover: scrolling the caret into view keeps clear of it. */
  setCovered(covered: Covered): void;
}

const statePlugins = [
  ...undoHistory,
  // Before the screenplay's keys: the popup's Enter, Tab and arrows win while it is open,
  // as the spelling menu's do.
  autocomplete,
  spelling,
  keymap(screenplayKeys),
  keymap(undoKeys),
  keymap(baseKeymap),
  clipboard,
  find,
];

/**
 * The editor's state for `elements`: a document with its own undo history
 * and autocomplete tally, and the caret at its start.
 */
export function scriptState(elements: readonly Element[]): EditorState {
  return EditorState.create({ schema, doc: toDocument(elements), plugins: statePlugins });
}

const scrollThreshold = ({ top, left }: Covered) => ({ top, left, right: 0, bottom: 0 });
const scrollMargin = ({ top, left }: Covered) => ({
  top: top + 5,
  left: left + 5,
  right: 5,
  bottom: 5,
});

/**
 * Mounts the editor, over its sheets of paper, at the end of `place`.
 *
 * The zoom scales the script, sheets included, with a transform from its top
 * left corner, so WebKit lays it out as at 100% and every line stays where
 * the engine puts it at any zoom; CSS `zoom` drifts from the engine at
 * scales whose rows are not whole pixels (findings, "Editor"). A transform
 * leaves the script's own box unscaled, so the frame around it takes the
 * scaled size, keeping the page centred and the document's height right.
 */
export function mountEditor(
  place: HTMLElement,
  elements: readonly Element[],
  { plugins = () => [], zoom: initialZoom = 1 }: EditorOptions = {},
): Editor {
  const state = scriptState(elements);
  const projection = new Projection(state.doc);
  let zoom = initialZoom;
  let covered: Covered = { top: 0, left: 0 };
  const script = document.createElement("div");
  script.className = "script";
  script.style.cssText = `--paper-width: ${PAGE.widthIn}in; --paper-height: ${SHEET_PX}px; --row-height: ${ROW_PX}px; --font-size: ${FONT_SIZE_PT}pt; --dual-divider: ${DUAL_SPLIT_IN}in`;
  const sheets = new SheetLayer();
  sheets.update(projection.sheets);
  const root = editableRoot();
  // The sheets come first: prosemirror.css positions the editor, so its text
  // paints over them.
  script.append(sheets.dom, root);
  const frame = document.createElement("div");
  frame.className = "script-frame";
  frame.append(script);
  place.append(frame);
  let framed = "";
  // The frame's size follows the zoom and the page count.
  const sizeFrame = () => {
    const css = `width: ${PAGE.widthIn * 96 * zoom}px; height: ${projection.height * zoom}px`;
    if (css !== framed) frame.style.cssText = framed = css;
  };
  // No transform at 100%: a transformed element is a layer of its own.
  const scale = () => {
    script.style.transform = zoom === 1 ? "" : `scale(${zoom})`;
    sizeFrame();
  };
  scale();
  // Sets each paragraph to its element's block where it holds another.
  // ProseMirror may draw an element in the paragraph that showed an equal
  // element elsewhere, without its node view knowing (findings, "Editor"),
  // so every paragraph is checked once ProseMirror has drawn; most are as
  // they were.
  const restyleAll = (view: EditorView) => {
    let index = 0;
    for (let dom = view.dom.firstElementChild; dom; dom = dom.nextElementSibling) {
      const block = projection.block(index++);
      if (dom instanceof HTMLElement && block) setBlock(dom, block);
    }
  };
  const view = new EditorView(
    { mount: root },
    {
      state,
      plugins: plugins(projection, () => zoom, script),
      attributes: () => ({
        class: "script-editor",
        "aria-label": "Script",
        role: "textbox",
        "aria-multiline": "true",
        style: `min-height: ${projection.height}px`,
      }),
      scrollThreshold: scrollThreshold(covered),
      scrollMargin: scrollMargin(covered),
      decorations: () => projection.decorations,
      nodeViews: {
        element: (node, _view, getPos) =>
          new ElementView(node, () => projection.block(projection.indexAt(getPos() ?? 0))),
      },
      handleDOMEvents: { beforeinput: directInput },
      handleKeyDown: (view, event) => crossPageGap(view, event, projection),
      dispatchTransaction(this: EditorView, transaction) {
        const { state: next, transactions } = this.state.applyTransaction(transaction);
        const changes = transactions.filter((tr) => tr.docChanged);
        const restyles = changes.flatMap((tr) => projection.apply(tr));
        if (changes.length) {
          sheets.update(projection.sheets);
          sizeFrame();
        }
        // Restyle the paragraphs of unchanged nodes before ProseMirror redraws,
        // so WebKit lays the script out once: each layout that moves the rest
        // of the script costs time for every paragraph it moves (findings,
        // "Editor"). With several transactions, indices may have shifted.
        if (changes.length === 1) {
          for (const { index, before } of restyles) {
            const dom = before === undefined ? null : this.nodeDOM(before);
            const block = projection.block(index);
            if (dom instanceof HTMLElement && block) setBlock(dom, block);
          }
        }
        this.updateState(next);
        if (changes.length) restyleAll(this);
      },
    },
  );
  return {
    view,
    open(elements) {
      // Focus first: taking focus, WebKit may put back the selection the
      // editor had before focus left it, and scroll to it, as after a click
      // on a button; the new state's selection then replaces it, and the
      // scroll goes to the top last.
      view.focus();
      const next = scriptState(elements);
      // The projection follows transactions, and a new state comes with
      // none, so it is built afresh before the view, and the plugins'
      // views reading it, show the new document. A new state also makes
      // ProseMirror make those views again.
      projection.rebuild(next.doc);
      sheets.update(projection.sheets);
      sizeFrame();
      view.updateState(next);
      restyleAll(view);
      scrollTo(0, 0);
    },
    setZoom(next) {
      if (next === zoom) return;
      const top = frame.getBoundingClientRect().top;
      const caret = view.coordsAtPos(view.state.selection.head);
      const seen = caret.top >= covered.top && caret.bottom <= innerHeight;
      const anchor = seen ? caret.top : (covered.top + innerHeight) / 2;
      const was = zoom;
      zoom = next;
      scale();
      // Nothing above the frame scales, so its top stays where it was.
      scrollBy(0, (anchor - top) * (next / was - 1));
      // The popup and the spelling menu keep the interface's size, so they follow the caret.
      placePopup(view);
      placeSpellingMenu(view);
    },
    setCovered(next) {
      covered = next;
      view.setProps({ scrollThreshold: scrollThreshold(next), scrollMargin: scrollMargin(next) });
    },
  };
}
