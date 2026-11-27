import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { Spot } from "../core/script-map.ts";
import { PITCH_PX, type Projection, ROW_PX } from "./projection.ts";

/**
 * Puts the caret at `spot`, with focus in the editor, and scrolls the
 * document so that its line sits where page 1's first line sits when the
 * script opens: a scene's heading, or the top of a page with its number in
 * view. The engine's page and row, scaled by the page's zoom, give the
 * scroll, so nothing is measured.
 */
export function jumpTo(view: EditorView, projection: Projection, spot: Spot, zoom: number): void {
  const pos = (projection.positionOf(spot.element) ?? 0) + 1 + spot.offset;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
  view.focus();
  scrollTo(scrollX, zoom * ((spot.page - 1) * PITCH_PX + spot.row * ROW_PX));
}
