import { type EditorState, Plugin } from "prosemirror-state";
import { ELEMENT_TYPES, type ElementType } from "../core/model.ts";
import { setElementType } from "./commands.ts";

/**
 * How the top bar names each element: in full, and shorter where the bar is
 * narrow (prototype piece 5).
 */
const NAMES: Readonly<Record<ElementType, readonly [full: string, short: string]>> = {
  sceneHeading: ["Scene Heading", "Scene"],
  action: ["Action", "Action"],
  character: ["Character", "Character"],
  parenthetical: ["Parenthetical", "Paren"],
  dialogue: ["Dialogue", "Dialogue"],
  transition: ["Transition", "Transition"],
  shot: ["Shot", "Shot"],
  general: ["General", "General"],
};

/** The type of the element the selection starts in; none when it starts outside one (select all). */
function currentType(state: EditorState): ElementType | undefined {
  return state.selection.$from.parent.attrs.type;
}

/**
 * The top bar's element buttons in `dom`, one for each element type, with the
 * current element's pressed; a click changes the elements the selection
 * touches to its type. A view plugin, so it follows every selection.
 */
export function elementToolbar(dom: HTMLElement): Plugin {
  const buttons = new Map<ElementType, HTMLButtonElement>();
  for (const type of ELEMENT_TYPES) {
    const [full, short] = NAMES[type];
    const button = document.createElement("button");
    button.type = "button";
    button.title = full;
    button.setAttribute("aria-pressed", "false");
    const long = document.createElement("span");
    long.className = "full";
    long.textContent = full;
    const narrow = document.createElement("span");
    narrow.className = "short";
    narrow.textContent = short;
    button.append(long, narrow);
    buttons.set(type, button);
    dom.append(button);
  }
  let shown: ElementType | undefined;
  const show = (state: EditorState) => {
    const type = currentType(state);
    if (type === shown) return;
    if (shown) buttons.get(shown)?.setAttribute("aria-pressed", "false");
    if (type) buttons.get(type)?.setAttribute("aria-pressed", "true");
    shown = type;
  };
  return new Plugin({
    view(view) {
      for (const [type, button] of buttons) {
        // Pressing a button would take focus, and the caret, from the editor.
        button.addEventListener("mousedown", (event) => event.preventDefault());
        button.addEventListener("click", () => {
          setElementType(type)(view.state, view.dispatch);
          view.focus();
        });
      }
      show(view.state);
      return { update: (view) => show(view.state) };
    },
  });
}
