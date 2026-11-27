import { Plugin } from "prosemirror-state";
import type { Scene } from "../core/script-map.ts";
import { jumpTo } from "./jump.ts";
import type { Projection } from "./projection.ts";

/** A scene's row in the list, with the text nodes its heading and page number show. */
interface Row {
  readonly button: HTMLButtonElement;
  readonly heading: Text;
  readonly page: Text;
}

/**
 * The scene sidebar in `dom` (brief, "Scene sidebar"; prototype piece 5):
 * each scene's number, heading and the page it starts on, from the
 * projection; the scene holding the caret highlighted; a click on a scene
 * puts the caret at its heading and keeps focus in the editor. A view
 * plugin, so it follows every edit and selection, touching the page only
 * where the list or the current scene changed.
 *
 * An edit's changes reach the list just after the edit's frame is drawn.
 * When an edit moves pages, every later scene's page number can change, and
 * laying those rows out in the edit's frame made a page-adding keystroke
 * about 10 ms slower on 120 scenes (findings, "Editor").
 *
 * The heading and list go before what `dom` already holds, the sidebar's
 * footer.
 */
export function sceneSidebar(dom: HTMLElement, projection: Projection, zoom: () => number): Plugin {
  const head = document.createElement("div");
  head.className = "scenes-head";
  const title = document.createElement("span");
  title.textContent = "Scenes";
  const count = document.createElement("span");
  count.textContent = "0";
  head.append(title, count);
  const list = document.createElement("ol");
  list.className = "scenes";
  dom.prepend(head, list);

  const rows: Row[] = [];
  let shown: readonly Scene[] = [];
  let current = -1;

  const showList = (scenes: readonly Scene[]) => {
    if (scenes === shown) return;
    if (scenes.length !== shown.length) count.textContent = String(scenes.length);
    while (rows.length > scenes.length) rows.pop()?.button.parentElement?.remove();
    if (current >= scenes.length) current = -1;
    scenes.forEach((scene, i) => {
      // A new row has nothing shown yet. Setting a text node's data, rather
      // than an element's text, keeps its node.
      const was = shown[i];
      const row = rows[i] ?? addRow(list, rows);
      if (was?.heading !== scene.heading) {
        row.heading.data = scene.heading;
        row.button.title = scene.heading;
      }
      if (was?.page !== scene.page) row.page.data = String(scene.page);
    });
    shown = scenes;
  };

  // Keep the current scene in view in the list, which scrolls on its own.
  const keepInView = () => {
    const row = rows[current];
    if (!row) return;
    const top = (row.button.parentElement as HTMLElement).offsetTop;
    const bottom = top + row.button.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight)
      list.scrollTop = bottom - list.clientHeight;
  };
  // A collapsed sidebar measures nothing, so the list catches up when it
  // shows again, or when the window's height changes.
  new ResizeObserver(keepInView).observe(list);

  const showCurrent = (index: number) => {
    if (index === current) return;
    rows[current]?.button.removeAttribute("aria-current");
    current = index;
    const row = rows[index];
    if (!row) return;
    row.button.setAttribute("aria-current", "location");
    keepInView();
  };

  return new Plugin({
    view(view) {
      // Pressing a scene would take focus, and the caret, from the editor.
      list.addEventListener("mousedown", (event) => {
        if (event.target instanceof Element && event.target.closest("button")) {
          event.preventDefault();
        }
      });
      list.addEventListener("click", (event) => {
        const button = event.target instanceof Element ? event.target.closest("button") : null;
        // The scene as it is now, should the list still show the edit before.
        const scene = projection.map.scenes[rows.findIndex((row) => row.button === button)];
        if (scene) jumpTo(view, projection, scene, zoom());
      });
      let waiting = false;
      const show = () => {
        waiting = false;
        showList(projection.map.scenes);
        showCurrent(projection.sceneAt(view.state.selection.head));
      };
      show();
      return {
        update: () => {
          if (waiting) return;
          if (projection.map.scenes === shown) {
            showCurrent(projection.sceneAt(view.state.selection.head));
          } else {
            // After the next frame, before the one after it.
            waiting = true;
            requestAnimationFrame(() => setTimeout(show));
          }
        },
      };
    },
  });
}

/** Adds the next scene's row to the list, numbered; `showList` fills in its heading and page. */
function addRow(list: HTMLElement, rows: Row[]): Row {
  const item = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "scene";
  const number = document.createElement("span");
  number.className = "no";
  number.textContent = String(rows.length + 1);
  const heading = document.createElement("span");
  heading.className = "hd";
  const page = document.createElement("span");
  page.className = "pg";
  button.append(number, heading, page);
  item.append(button);
  list.append(item);
  const row = {
    button,
    heading: heading.appendChild(new Text()),
    page: page.appendChild(new Text()),
  };
  rows.push(row);
  return row;
}
