import { Desk } from "./desk.ts";
import { devScript } from "./dev-fixtures.ts";
import { mountEditor } from "./editor.ts";
import { listenForFileKeys, rustSide, ScriptFiles } from "./files.ts";
import { pagePosition } from "./page-position.ts";
import { loadSettings, settingsSaver } from "./settings-file.ts";
import { sceneSidebar } from "./sidebar.ts";
import { elementToolbar } from "./toolbar.ts";

const byId = (id: string) => document.getElementById(id) as HTMLElement;

// Tir starts on a fixture script, `?fixture=NAME` picking one (architecture,
// "Measuring the editor"), until Stage 2 opens the last project; Ctrl+O
// opens a file in its place.
const script = devScript(new URLSearchParams(location.search).get("fixture"));
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
// The writer can type at once, from the script's start; ProseMirror's
// focus leaves the scroll where it is.
editor.view.focus();
const title = byId("title");
const files = new ScriptFiles(
  {
    doc: () => editor.view.state.doc,
    open: (elements) => editor.open(elements),
    title: (text) => {
      title.textContent = text;
    },
    saved: (name) => desk.toast(`Saved · ${name}`),
  },
  rustSide,
  script.titlePage,
);
listenForFileKeys(files);
if (import.meta.env.DEV) Object.assign(globalThis, { tirView: editor.view, tirDesk: desk });
