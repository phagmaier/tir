import { readDraft } from "../core/draft-file.ts";
import { writeFdx } from "../core/fdx/write.ts";
import { draftExportBase } from "../core/file-names.ts";
import { writeFountain } from "../core/fountain/write.ts";
import type { Script } from "../core/model.ts";
import type { PdfOptions } from "../core/pdf.ts";
import { withoutDraft } from "../core/project-file.ts";
import type { DraftTexts } from "./draft-texts.ts";
import type { Project } from "./library.ts";
import type { Opening } from "./opening.ts";
import type { Place, Saver } from "./saving.ts";

export type DraftAction =
  | { readonly kind: "switch"; readonly file: string }
  | { readonly kind: "fork" | "rename"; readonly name: string }
  | { readonly kind: "delete" }
  | { readonly kind: "exportFountain" }
  | { readonly kind: "exportFdx" }
  | ({ readonly kind: "exportPdf" } & PdfOptions);

interface DraftSide {
  texts(script: Script): Promise<DraftTexts>;
  read(project: Project, file: string): Promise<string>;
  create(project: Project, name: string, texts: DraftTexts, active: boolean): Promise<Project>;
  /** Renames the draft in `file`; the project as renamed, and the draft's new file. */
  rename(project: Project, file: string, name: string): Promise<Place>;
  remove(project: Project, file: string): Promise<Project>;
  activate(project: Project, file: string): Promise<Project>;
  exportFountain(name: string, text: string): Promise<void>;
  exportFdx(name: string, text: string): Promise<void>;
  /** Makes the PDF of `script` (`src/core/pdf.ts`). */
  pdf(script: Script, options: PdfOptions): Promise<Uint8Array>;
  exportPdf(name: string, bytes: Uint8Array): Promise<void>;
  tell(title: string, message: string): Promise<void>;
}

type DraftChange = { readonly opening: Opening } | { readonly moved: Place };

/** The writing window stays inert from before settling until the result is applied. */
export async function changeDraft(
  saver: Saver,
  side: DraftSide,
  action: DraftAction,
): Promise<DraftChange | null> {
  const place = saver.where;
  if (!place) return null;
  const { project, file } = place;
  const { info } = project;
  if (action.kind === "switch" && action.file === file) return null;
  if (action.kind === "delete" && info.drafts.length === 1) return null;

  const name = info.drafts.find((draft) => draft.file === file)?.name ?? file;
  if (
    action.kind === "exportFountain" ||
    action.kind === "exportFdx" ||
    action.kind === "exportPdf"
  ) {
    // Export the draft on screen even if the library cannot save it.
    const base = draftExportBase(info.name, name);
    const script = saver.snapshot();
    try {
      if (action.kind === "exportFountain") {
        await side.exportFountain(`${base}.fountain`, writeFountain(script));
      } else if (action.kind === "exportFdx") {
        await side.exportFdx(`${base}.fdx`, writeFdx(script));
      } else {
        const pdf = await side.pdf(script, { titlePage: action.titlePage });
        await side.exportPdf(`${base}.pdf`, pdf);
      }
    } catch (error) {
      await side.tell(
        `Tir could not export “${name}”`,
        error instanceof Error ? error.message : String(error),
      );
    }
    return null;
  }
  const operation = action.kind === "switch" ? "switch drafts" : `${action.kind} “${name}”`;
  if (!(await saver.settle())) {
    await side.tell(
      `Tir could not save “${name}”`,
      `${saver.failure ?? ""} The draft on screen stays; Tir did not ${operation}.`,
    );
    return null;
  }

  const show = (script: Script, next: Project): DraftChange => ({
    opening: { script, place: activePlace(next), name: info.name },
  });
  const load = async (target: string) => {
    const read = readDraft(await side.read(project, target));
    if (!read.ok) {
      const draft = info.drafts.find((entry) => entry.file === target)?.name ?? target;
      throw new Error(`“${draft}” could not be read. ${read.error}`);
    }
    return read.script;
  };
  try {
    switch (action.kind) {
      case "fork": {
        const script = saver.snapshot();
        const next = await side.create(project, action.name, await side.texts(script), true);
        return show(script, next);
      }
      case "switch": {
        const script = await load(action.file);
        return show(script, await side.activate(project, action.file));
      }
      case "rename":
        // The draft on screen keeps the screen, under its new file.
        return { moved: await side.rename(project, file, action.name) };
      case "delete": {
        // Read the replacement before deleting; a damaged one leaves both drafts alone.
        const replacement = withoutDraft(info, file).activeDraft;
        const script = await load(replacement);
        return show(script, await side.remove(project, file));
      }
    }
  } catch (error) {
    await side.tell(
      `Tir could not ${operation}`,
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

function activePlace(project: Project): Place {
  return { project, file: project.info.activeDraft };
}
