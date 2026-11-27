import { baseKeymap } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import type { Node, NodeType } from "prosemirror-model";
import { EditorState, type Plugin } from "prosemirror-state";
import { EditorView, type NodeView, type ViewMutationRecord } from "prosemirror-view";
import { DUAL_FORMATS, ELEMENT_FORMATS, FONT_SIZE_PT, PAGE } from "../core/format.ts";
import type { Element, ElementType } from "../core/model.ts";
import { autocomplete } from "./autocomplete.ts";
import { clipboard } from "./clipboard.ts";
import { screenplayKeys } from "./commands.ts";
import { schema, toDocument } from "./editor-model.ts";
import { type Block, Projection, ROW_PX, SHEET_PX } from "./projection.ts";
import { SheetLayer } from "./sheets.ts";
import { undoHistory, undoKeys } from "./undo.ts";

/**
 * Where dual dialogue's columns divide the page: halfway across the gutter
 * between them. Each column's paragraphs stay on their side, so a click in
 * one column never lands in the other's paragraph.
 */
const DUAL_SPLIT_IN = (DUAL_FORMATS.left.dialogue.right + DUAL_FORMATS.right.dialogue.left) / 2;

const written = new WeakMap<HTMLElement, string>();

/**
 * Places an element's paragraph: the space above and below it, its first
 * line's indent, and its column in dual dialogue.
 */
function setBlock(dom: HTMLElement, { gap, x, column, below }: Block): void {
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
  if (written.get(dom) === css) return;
  written.set(dom, css);
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

export interface EditorOptions {
  /**
   * View plugins for interface parts that follow the editor, such as the
   * element toolbar and the scene sidebar, given the projection, which is
   * up to date whenever they update.
   */
  readonly plugins?: (projection: Projection) => readonly Plugin[];
  /**
   * Pixels at the window's top and left that fixed bars cover over the
   * scrolling document; scrolling the caret into view keeps clear of them.
   */
  readonly covered?: { readonly top: number; readonly left: number };
}

/** Mounts the editor, over its sheets of paper, at the end of `place`. */
export function mountEditor(
  place: HTMLElement,
  elements: readonly Element[],
  { plugins = () => [], covered = { top: 0, left: 0 } }: EditorOptions = {},
): EditorView {
  const state = EditorState.create({
    schema,
    doc: toDocument(elements),
    plugins: [
      ...undoHistory,
      // Before the screenplay's keys: the popup's Enter, Tab and arrows win while it is open.
      autocomplete,
      keymap(screenplayKeys),
      keymap(undoKeys),
      keymap(baseKeymap),
      clipboard,
    ],
  });
  const projection = new Projection(state.doc);
  const script = document.createElement("div");
  script.className = "script";
  script.style.cssText = `--paper-width: ${PAGE.widthIn}in; --paper-height: ${SHEET_PX}px; --row-height: ${ROW_PX}px; --font-size: ${FONT_SIZE_PT}pt`;
  const sheets = new SheetLayer();
  sheets.update(projection.sheets);
  const root = editableRoot();
  // The sheets come first: prosemirror.css positions the editor, so its text
  // paints over them.
  script.append(sheets.dom, root);
  place.append(script);
  return new EditorView(
    { mount: root },
    {
      state,
      plugins: plugins(projection),
      attributes: () => ({
        class: "script-editor",
        "aria-label": "Script",
        role: "textbox",
        "aria-multiline": "true",
        style: `min-height: ${projection.height}px`,
      }),
      scrollThreshold: { top: covered.top, left: covered.left, right: 0, bottom: 0 },
      scrollMargin: { top: covered.top + 5, left: covered.left + 5, right: 5, bottom: 5 },
      decorations: () => projection.decorations,
      nodeViews: {
        element: (node, _view, getPos) =>
          new ElementView(node, () => projection.block(projection.indexAt(getPos() ?? 0))),
      },
      handleDOMEvents: { beforeinput: directInput },
      dispatchTransaction(this: EditorView, transaction) {
        const { state: next, transactions } = this.state.applyTransaction(transaction);
        const changes = transactions.filter((tr) => tr.docChanged);
        const restyles = changes.flatMap((tr) => projection.apply(tr));
        if (changes.length) sheets.update(projection.sheets);
        // Restyle the paragraphs of unchanged nodes before ProseMirror redraws,
        // so WebKit lays the script out once: each layout that moves the rest
        // of the script costs time for every paragraph it moves (findings,
        // "Editor"). With several transactions, indices may have shifted.
        let later: number[] = [];
        if (changes.length > 1) {
          later = Array.from({ length: next.doc.childCount }, (_, i) => i);
        } else {
          for (const { index, before } of restyles) {
            const dom = before === undefined ? null : this.nodeDOM(before);
            const block = projection.block(index);
            if (dom instanceof HTMLElement && block) setBlock(dom, block);
            else later.push(index);
          }
        }
        this.updateState(next);
        // Node views style the paragraphs ProseMirror redrew; this catches
        // changed elements whose paragraphs it kept.
        for (const index of later) {
          const dom = this.nodeDOM(projection.positionOf(index) ?? -1);
          const block = projection.block(index);
          if (dom instanceof HTMLElement && block) setBlock(dom, block);
        }
      },
    },
  );
}
