import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { type BackupStatus, type Checked, type Coverage, NOT_CONNECTED } from "./backup.ts";
import { BackupPanel } from "./backup-panel.ts";
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
import { statusIndicator } from "./status-indicator.ts";
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
// The saved state as last heard, for the Projects screen's top bar and the
// backup panel.
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
      lastSaved = { state, problem: why };
      showSaved(state, why);
      if (screen?.shown) screen.saved(state, why);
    },
    failed: (message) => void tell(`Tir could not save “${projectShown()}”`, message),
    placed: (place) => {
      const { project } = place;
      title.textContent = project.info.name;
      showDraft(place);
      desk?.set({ project: project.folder });
    },
  },
);
// A dialog of the draft menu's or the backup panel's keeps the window's
// keys, as a dialog does.
const dialogOpen = () => !!draftMenu?.dialogOpen || backupPanel.dialogOpen;
// Whether F7 and F8 may take the caret to a misspelling or finding.
const canNavigate = () => !draftAction && !closing && !screen?.shown && !dialogOpen();
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
// After the page position and formatting count, at the top bar's right end:
// the indicator opens the backup panel.
let backup: BackupStatus = NOT_CONNECTED;
const backupPanel = new BackupPanel({
  status: () => backup,
  saved: () => lastSaved.state,
  place: libraryPlace,
  backUpNow: async () =>
    (await saver.settle(true)) ? invoke<BackupStatus | null>("back_up_now") : null,
  resume: async () =>
    (await saver.settle(true)) ? invoke<BackupStatus | null>("resume_backup") : null,
  connect: (address) => invoke<Checked>("connect_repository", { address }),
  async library() {
    const { projects } = await listLibrary();
    const drafts = projects.reduce((count, project) => count + project.info.drafts.length, 0);
    return { projects: projects.length, drafts };
  },
  toast: (text) => desk?.toast(text),
});
// Not while Tir closes: closing has closed the panel.
const indicator = statusIndicator(byId("bar-right"), (anchor) => {
  if (!closing) backupPanel.toggle(anchor);
});
showSaved = (state, problem) => {
  indicator.saved(state, problem);
  backupPanel.update();
};
// Once backup has published, its first answer may be older than that.
let published = false;
const heardBackup = (status: BackupStatus) => {
  backup = status;
  indicator.backup(status);
  screen?.backup(status);
  backupPanel.update();
};
/** How much of the project `folder`, or its draft `file`, GitHub holds. */
const backupOf = (folder: string, file?: string): Promise<Coverage> =>
  invoke<Coverage>("backup_of", { folder, draft: file ?? null }).catch(() => "unknown" as const);
const settingsFile = settingsSaver();
/** Gives focus back to the title page when it shows, else to the script, where it scrolled. */
function focusScript(): void {
  if (titlePage.focus()) return;
  // WebKit scrolls to the old selection when focus returns to it.
  const scroll = scrollY;
  editor.view.focus();
  scrollTo(0, scroll);
}
desk = new Desk(
  editor,
  settings,
  settingsFile.save,
  {
    topbar: byId("topbar"),
    sidebar: byId("sidebar"),
    footer: byId("side-foot"),
    barLeft: byId("bar-left"),
    pages: byId("pages"),
    canvas: byId("canvas"),
    toast: byId("toast"),
  },
  focusScript,
);

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
      focusScript();
    });
}

draftMenu = new DraftMenu(draftTrigger, {
  // No draft dialog while another action, the Projects screen or closing has the window.
  place: () => (closing || draftAction || screen?.shown ? null : saver.where),
  list: listLibrary,
  run: runDraftAction,
  backupOf: async (folder, file) =>
    (await saver.settle(true)) ? backupOf(folder, file) : "unknown",
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
  backupOf: (folder) => backupOf(folder),
});
screen.backup(backup);
const showProjects = () => {
  if (draftAction || closing || dialogOpen()) return;
  draftMenu?.dismiss();
  backupPanel.close(false);
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
  else if (draftAction || closing || dialogOpen()) return;
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
    if (closing) {
      draftMenu?.dismiss();
      backupPanel.close(false);
    }
    editor.view.setProps({ editable: () => on });
    titlePage.setEditable(on);
    screen?.setEditable(on);
  },
  projectShown,
);
await listen<BackupStatus>("tir://backup", ({ payload }) => {
  published = true;
  heardBackup(payload);
});
void invoke<BackupStatus>("backup_status").then((status) => {
  if (!published) heardBackup(status);
}, console.error);
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
