import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Desk } from "./desk.ts";
import { devScript } from "./dev-fixtures.ts";
import { DraftMenu } from "./draft-menu.ts";
import { changeDraft, type DraftAction } from "./drafts.ts";
import { mountEditor } from "./editor.ts";
import { findBar } from "./find-bar.ts";
import { formattingCheck } from "./formatting-check.ts";
import {
  addToDictionary,
  createDraft,
  createProject,
  deleteDraft,
  deleteProject,
  libraryPlace,
  listLibrary,
  readDictionary,
  readDraftText,
  readDraftToCount,
  renameDraft,
  renameProject,
  saveDraft,
  setActiveDraft,
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
import { makePdf } from "./pdf-export.ts";
import { PageCounter, Projects } from "./projects.ts";
import { ProjectsScreen } from "./projects-screen.ts";
import { savedIndicator } from "./saved-indicator.ts";
import {
  closer,
  type Place,
  Saver,
  type SaveState,
  savingPlugin,
  textsInWorker,
} from "./saving.ts";
import { loadSettings, settingsSaver } from "./settings-file.ts";
import { sceneSidebar } from "./sidebar.ts";
import { workerChecker } from "./spell-checker.ts";
import { spellCheck } from "./spelling.ts";
import { TitlePageView } from "./title-page.ts";
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
let draftMenu: DraftMenu | undefined;
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
    placed: (place) => {
      const { project } = place;
      title.textContent = project.info.name;
      showDraft(place);
      desk?.set({ project: project.folder });
    },
  },
);
// Whether F7 and F8 may take the caret to a misspelling or finding.
const canNavigate = () => !draftAction && !closing && !screen?.shown && !draftMenu?.dialogOpen;
// With nothing to open, the editor holds an empty script, unseen behind the
// Projects screen.
const editor = mountEditor(byId("pages"), (opening?.script ?? emptyScript()).elements, {
  zoom: settings.zoom,
  plugins: (projection, zoom, script) => [
    elementToolbar(byId("elements")),
    sceneSidebar(byId("sidebar"), projection, zoom, () => titlePage.close()),
    pagePosition(byId("bar-right"), projection, zoom, () => titlePage.close()),
    formattingCheck(
      byId("bar-right"),
      script,
      projection,
      zoom,
      () => titlePage.close(),
      canNavigate,
      (text) => desk?.toast(text),
    ),
    spellCheck(
      workerChecker(),
      { words: readDictionary(), add: addToDictionary },
      canNavigate,
      () => titlePage.close(),
      (text) => desk?.toast(text),
      (title, message) => void tell(title, message),
    ),
    findBar(byId("topbar"), (text) => desk?.toast(text)),
    savingPlugin(saver),
  ],
});
const titlePage = new TitlePageView(
  byId("title-page"),
  byId("pages"),
  (page) => saver.editTitlePage(page),
  () => editor.view.focus(),
);
// After the page position and formatting count, at the top bar's right end.
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

const draftTrigger = byId("draft") as HTMLButtonElement;
const writingWindow = [byId("topbar"), byId("sidebar"), byId("canvas")];
const draftSide = {
  texts,
  read: readDraftText,
  create: createDraft,
  rename: renameDraft,
  remove: deleteDraft,
  activate: setActiveDraft,
  exportFountain: (name: string, text: string) => invoke<void>("export_fountain", { name, text }),
  exportFdx: (name: string, text: string) => invoke<void>("export_fdx", { name, text }),
  pdf: makePdf,
  // The PDF goes as the request's body; a header carries its suggested name.
  exportPdf: (name: string, bytes: Uint8Array) =>
    invoke<void>("export_pdf", bytes, { headers: { "tir-name": encodeURIComponent(name) } }),
  tell,
};
let draftAction: Promise<void> | null = null;
let closing = false;
function runDraftAction(action: DraftAction): void {
  if (draftAction || closing || screen?.shown) return;
  for (const part of writingWindow) part.inert = true;
  draftAction = changeDraft(saver, draftSide, action)
    .catch((error: unknown) => {
      console.error(error);
      return null;
    })
    .then((result) => {
      for (const part of writingWindow) part.inert = false;
      draftAction = null;
      if (result && "opening" in result) {
        showOpening(result.opening);
        return;
      }
      if (result) {
        saver.move(result.moved);
        showDraft(result.moved);
      }
      if (titlePage.focus()) return;
      // WebKit scrolls to the old selection when focus returns to it.
      const scroll = scrollY;
      editor.view.focus();
      scrollTo(0, scroll);
    });
}

draftMenu = new DraftMenu(draftTrigger, {
  place: () => (closing ? null : saver.where),
  list: listLibrary,
  run: runDraftAction,
});

function showDraft(place: Place | null): void {
  draftMenu?.setPlace(place);
  const draft = place?.project.info.drafts.find(({ file }) => file === place.file);
  titlePage.nameDraft(draft?.name ?? FIRST_DRAFT);
}

/** Shows what `opening` holds, as the editor now does. */
const shown = ({ script, place, name }: Opening) => {
  saver.show(place, script.titlePage, editor.view.state.doc);
  titlePage.load(script.titlePage);
  title.textContent = name;
  showDraft(place);
  if (place) desk?.set({ project: place.project.folder });
};
/** Whether a script is open in the writing window, for the Projects screen to go back to. */
let scriptOpen = opening !== null;
if (opening) shown(opening);
else saver.show(null, emptyScript().titlePage, editor.view.state.doc);

function showOpening(next: Opening): void {
  // The writing window shows first, so the script opens at its top
  // with the caret in it.
  const keepTitle = titlePage.close();
  screen?.hide();
  editor.open(next.script.elements);
  shown(next);
  scriptOpen = true;
  if (keepTitle) titlePage.open();
}

const projects = new Projects(
  saver,
  {
    list: listLibrary,
    read: readDraftText,
    texts,
    create: createProject,
    createDraft,
    activate: setActiveDraft,
    rename: renameProject,
    remove: deleteProject,
    pick: () => invoke("open_script"),
    tell,
  },
  {
    show: showOpening,
    moved(place) {
      title.textContent = place.project.info.name;
      showDraft(place);
      desk?.set({ project: place.project.folder });
    },
    closed() {
      const empty = emptyScript();
      editor.open(empty.elements);
      saver.show(null, empty.titlePage, editor.view.state.doc);
      title.textContent = "";
      showDraft(null);
      desk?.set({ project: null });
      scriptOpen = false;
    },
  },
  projectShown,
);
screen = new ProjectsScreen({
  projects,
  pages: new PageCounter(readDraftToCount),
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
const showProjects = () => {
  if (draftAction || closing || draftMenu?.dialogOpen) return;
  draftMenu?.dismiss();
  titlePage.close();
  void screen?.show(lastSaved.state, lastSaved.problem);
};
title.addEventListener("click", showProjects);

if (problem) void tell(problem.title, problem.message);
// The writer can type at once, from the script's start; ProseMirror's
// focus leaves the scroll where it is.
if (opening) editor.view.focus();
else showProjects();

listenForFileKeys((action) => {
  if (action === "open") showProjects();
  else if (draftAction || closing || draftMenu?.dialogOpen) return;
  else
    void saver.settle().then(async (saved) => {
      if (!saved) await tell(`Tir could not save “${projectShown()}”`, saver.failure ?? "");
    });
});

// Closing the window saves first (`src-tauri/src/closing.rs`), the
// settings too, which name the project to open next time.
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
  (on) => {
    closing = !on;
    if (closing) draftMenu?.dismiss();
    editor.view.setProps({ editable: () => on });
    titlePage.setEditable(on);
    screen?.setEditable(on);
  },
  projectShown,
);
await listen("tir://close", () => {
  // A draft action can change the saver target; close settles that target,
  // even when showing the action's result failed.
  if (draftAction) void draftAction.then(close, close);
  else void close();
});
await invoke("hold_close");

if (import.meta.env.DEV) {
  Object.assign(globalThis, {
    tirView: editor.view,
    tirDesk: desk,
    tirSaver: saver,
    tirScreen: screen,
  });
}
