import { type MarkSpec, type Node, Schema } from "prosemirror-model";
import { ELEMENT_TYPES, type Element, normaliseSpans, STYLES, type Style } from "../core/model.ts";

const flags = ["centred", "dual", "pageBreakBefore"] as const;
const tags = { bold: "strong", italic: "em", underline: "u" } as const;

function styleMark(style: Style): MarkSpec {
  const tag = tags[style];
  return { parseDOM: [{ tag }], toDOM: () => [tag, 0] };
}

export const schema = new Schema({
  nodes: {
    doc: { content: "element+" },
    element: {
      content: "text*",
      attrs: {
        type: {
          default: "action",
          validate: (value) => {
            if (!ELEMENT_TYPES.includes(value)) throw new RangeError(`Unknown element: ${value}`);
          },
        },
        centred: { default: false, validate: "boolean" },
        dual: { default: false, validate: "boolean" },
        pageBreakBefore: { default: false, validate: "boolean" },
      },
      whitespace: "pre",
      parseDOM: [{ tag: "p" }],
      toDOM: () => ["p", 0],
    },
    text: {},
  },
  marks: {
    bold: styleMark("bold"),
    italic: styleMark("italic"),
    underline: styleMark("underline"),
  },
});

export function toNode(element: Element): Node {
  const boundaries = new Set([0, element.text.length]);
  for (const style of STYLES) {
    for (const [start, end] of element[style] ?? []) {
      boundaries.add(start);
      boundaries.add(end);
    }
  }
  const offsets = [...boundaries].sort((a, b) => a - b);
  const spans = [];
  for (let i = 1; i < offsets.length; i++) {
    const start = offsets[i - 1] as number;
    const end = offsets[i] as number;
    const active = STYLES.filter((style) =>
      element[style]?.some(([from, to]) => from <= start && end <= to),
    );
    spans.push(
      schema.text(
        element.text.slice(start, end),
        active.map((style) => schema.mark(style)),
      ),
    );
  }
  return schema.node(
    "element",
    {
      type: element.type,
      centred: !!element.centred,
      dual: !!element.dual,
      pageBreakBefore: !!element.pageBreakBefore,
    },
    spans,
  );
}

export function toDocument(elements: readonly Element[]): Node {
  return schema.node(
    "doc",
    null,
    elements.length ? elements.map(toNode) : [schema.node("element")],
  );
}

export function fromNode(node: Node): Element {
  const spans: Record<Style, [number, number][]> = { bold: [], italic: [], underline: [] };
  node.forEach((text, offset) => {
    for (const mark of text.marks) {
      spans[mark.type.name as Style].push([offset, offset + text.nodeSize]);
    }
  });
  return {
    type: node.attrs.type,
    text: node.textContent,
    ...Object.fromEntries(flags.filter((flag) => node.attrs[flag]).map((flag) => [flag, true])),
    ...Object.fromEntries(
      STYLES.filter((style) => spans[style].length).map((style) => [
        style,
        normaliseSpans(spans[style]),
      ]),
    ),
  };
}

// Immutable ProseMirror nodes permit reusing the model projection of untouched elements.
const modelElements = new WeakMap<Node, Element>();

export function fromDocument(doc: Node): Element[] {
  const elements: Element[] = [];
  doc.forEach((node) => {
    let element = modelElements.get(node);
    if (!element) {
      element = fromNode(node);
      modelElements.set(node, element);
    }
    elements.push(element);
  });
  return elements;
}
