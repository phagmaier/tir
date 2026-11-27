import { devScript } from "./dev-fixtures.ts";
import { mountEditor } from "./editor.ts";
import { elementToolbar } from "./toolbar.ts";

const byId = (id: string) => document.getElementById(id) as HTMLElement;

// Until a draft can be opened (task 1.9), Tir shows a fixture script:
// `?fixture=NAME` picks one (architecture, "Measuring the editor").
const script = devScript(new URLSearchParams(location.search).get("fixture"));
byId("title").textContent = script.titlePage.title || "Untitled";
const view = mountEditor(byId("pages"), script.elements, {
  plugins: [elementToolbar(byId("elements"))],
  covered: { top: byId("topbar").offsetHeight, left: byId("sidebar").offsetWidth },
});
if (import.meta.env.DEV) Object.assign(globalThis, { tirView: view });
