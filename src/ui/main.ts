import { Desk } from "./desk.ts";
import { devScript } from "./dev-fixtures.ts";
import { mountEditor } from "./editor.ts";
import { pagePosition } from "./page-position.ts";
import { loadSettings, settingsSaver } from "./settings-file.ts";
import { sceneSidebar } from "./sidebar.ts";
import { elementToolbar } from "./toolbar.ts";

const byId = (id: string) => document.getElementById(id) as HTMLElement;

// Until a draft can be opened (task 1.9), Tir shows a fixture script:
// `?fixture=NAME` picks one (architecture, "Measuring the editor").
const script = devScript(new URLSearchParams(location.search).get("fixture"));
byId("title").textContent = script.titlePage.title || "Untitled";
// The settings come first, so the script opens at the zoom it was left at.
const settings = await loadSettings();
const editor = mountEditor(byId("pages"), script.elements, {
  zoom: settings.zoom,
  plugins: (projection, zoom) => [
    elementToolbar(byId("elements")),
    sceneSidebar(byId("sidebar"), projection, zoom),
    pagePosition(byId("bar-right"), projection, zoom),
  ],
});
const desk = new Desk(editor, settings, settingsSaver(), {
  topbar: byId("topbar"),
  sidebar: byId("sidebar"),
  footer: byId("side-foot"),
  barLeft: byId("bar-left"),
  pages: byId("pages"),
  toast: byId("toast"),
});
if (import.meta.env.DEV) Object.assign(globalThis, { tirView: editor.view, tirDesk: desk });
