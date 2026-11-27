import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Desk } from "./desk.ts";
import { devScript } from "./dev-fixtures.ts";
import { mountEditor } from "./editor.ts";
import {
  createProject,
  deleteProject,
  libraryPlace,
  listLibrary,
  readDraftText,
  renameProject,
  saveDraft,
} from "./library.ts";
import {
  emptyScript,
  FIRST_DRAFT,
  listenForFileKeys,
  type Opening,
  openAtLaunch,
  projectName,
  UNTITLED,
  unplaced,
} from "./opening.ts";
import { pagePosition } from "./page-position.ts";
import { PageCounter, Projects } from "./projects.ts";
import { ProjectsScreen } from "./projects-screen.ts";
import { savedIndicator } from "./saved-indicator.ts";
import { closer, Saver, type SaveState, savingPlugin, textsInWorker } from "./saving.ts";
import { loadSettings, settingsSaver } from "./settings-file.ts";
import { sceneSidebar } from "./sidebar.ts";
import { elementToolbar } from "./toolbar.ts";

const byId = (id: string) => document.getElementById(id) as HTMLElement;
const tell = (title: string, message: string): Promise<void> =>
  invoke<void>("tell", { title, message }).catch(console.error);

// The settings come first, so the script opens at the zoom it was left at
// and Tir knows the project it showed last.
const settings = await loadSettings();
// `?fixture=NAME` opens a test script, not in the library until its first
// save (architecture, "Measuring the editor").
const fixture = new URLSearchParams(location.search).get("fixture");
const { opening, problem } = fixture
  ? { opening: unplaced(devScript(fixture)), problem: null }
  : await openAtLaunch(settings.project, { list: listLibrary, read: readDraftText });

const title = byId("title");
const projectShown = () => title.textContent ?? "";
const texts = textsInWorker();
let showSaved: (state: SaveState, problem: string | null) => void = () => {};
// The saved state as last heard, for the Projects screen's top bar.
let lastSaved: { state: SaveState; problem: string | null } = { state: "saved", problem: null };
let screen: ProjectsScreen | undefined;
let desk: Desk | undefined;
const saver = new Saver(
  {
    texts,
    write: (place, made) => saveDraft(place.project, place.file, made),
    async create(script, made) {
      const name = projectName(script.titlePage, UNTITLED);
      const project = await createProject(await listLibrary(), name, FIRST_DRAFT, made);
      return { project, file: project.info.activeDraft };
    },
  },
  {
    state: (state, why) => {
      showSaved(state, why);
      lastSaved = { state, problem: why };
      if (screen?.shown) screen.saved(state, why);
    },
    failed: (why) =>
      void tell(`Tir could not save “${projectShown()}”`, `${why} Tir tries again in a moment.`),
    placed: ({ project }) => {
      title.textContent = project.info.name;
      desk?.set({ project: project.folder });
    },
  },
);
// With nothing to open, the editor holds an empty script, unseen behind the
// Projects screen.
const editor = mountEditor(byId("pages"), (opening?.script ?? emptyScript()).elements, {
  zoom: settings.zoom,
  plugins: (projection, zoom) => [
    elementToolbar(byId("elements")),
    sceneSidebar(byId("sidebar"), projection, zoom),
    pagePosition(byId("bar-right"), projection, zoom),
    savingPlugin(saver),
  ],
});
// After the page position, at the top bar's right end.
showSaved = savedIndicator(byId("bar-right"));
const settingsFile = settingsSaver();
desk = new Desk(editor, settings, settingsFile.save, {
  topbar: byId("topbar"),
  sidebar: byId("sidebar"),
  footer: byId("side-foot"),
  barLeft: byId("bar-left"),
  pages: byId("pages"),
  toast: byId("toast"),
});

/** Shows what `opening` holds, as the editor now does. */
const shown = ({ script, place, name }: Opening) => {
  saver.show(place, script.titlePage, editor.view.state.doc);
  title.textContent = name;
  if (place) desk?.set({ project: place.project.folder });
};
/** Whether a script is open in the writing window, for the Projects screen to go back to. */
let scriptOpen = opening !== null;
if (opening) shown(opening);
else saver.show(null, emptyScript().titlePage, editor.view.state.doc);

const projects = new Projects(
  saver,
  {
    list: listLibrary,
    read: readDraftText,
    texts,
    create: createProject,
    rename: renameProject,
    remove: deleteProject,
    pick: () => invoke("open_script"),
    tell,
  },
  {
    show(next) {
      // The writing window shows first, so the script opens at its top
      // with the caret in it.
      screen?.hide();
      editor.open(next.script.elements);
      shown(next);
      scriptOpen = true;
    },
    moved(place) {
      title.textContent = place.project.info.name;
      desk?.set({ project: place.project.folder });
    },
    closed() {
      const empty = emptyScript();
      editor.open(empty.elements);
      saver.show(null, empty.titlePage, editor.view.state.doc);
      title.textContent = "";
      desk?.set({ project: null });
      scriptOpen = false;
    },
  },
  projectShown,
);
screen = new ProjectsScreen({
  projects,
  pages: new PageCounter(readDraftText),
  list: listLibrary,
  place: libraryPlace,
  // A failure here is told once, as a save after a pause is.
  settle: () => saver.settle(true),
  openFolder: () => saver.where?.project.folder ?? null,
  back() {
    if (!scriptOpen) return false;
    screen?.hide(() => editor.view.focus());
    return true;
  },
});
const showProjects = () => void screen?.show(lastSaved.state, lastSaved.problem);
title.addEventListener("click", showProjects);

if (problem) void tell(problem.title, problem.message);
// The writer can type at once, from the script's start; ProseMirror's
// focus leaves the scroll where it is.
if (opening) editor.view.focus();
else showProjects();

listenForFileKeys((action) => {
  if (action === "open") showProjects();
  else
    void saver.settle().then(async (saved) => {
      if (!saved) await tell(`Tir could not save “${projectShown()}”`, saver.failure ?? "");
    });
});

// Closing the window saves first (`src-tauri/src/closing.rs`), the
// settings too, which name the project to open next time, once the
// Projects screen's action under way has finished.
const close = closer(
  saver,
  {
    hold: () => invoke("hold_close"),
    close: async () => {
      await projects.idle();
      await settingsFile.written();
      await invoke("close_window");
    },
    ask: (heading, question, yes) => invoke("ask", { title: heading, question, yes }),
  },
  (on) => editor.view.setProps({ editable: () => on }),
  projectShown,
);
await listen("tir://close", () => void close());
await invoke("hold_close");

if (import.meta.env.DEV) {
  Object.assign(globalThis, {
    tirView: editor.view,
    tirDesk: desk,
    tirSaver: saver,
    tirScreen: screen,
  });
}
