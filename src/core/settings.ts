/**
 * How the writing window shows the script, as the writer last left it: the
 * page's zoom, the paper (brief, "Look"), focus mode and whether the scene
 * sidebar is collapsed; the project last shown, which Tir opens at launch;
 * and where the library is, when the writer moved it. Tir keeps them in a
 * settings file of its own on each machine, outside the library
 * (architecture, "Settings"); this module reads and writes that file's
 * text. Reading never fails: a missing or damaged file, or a value it does
 * not know, gives the default for what it cannot read, since a lost
 * setting costs the writer a click.
 */

/** The theme, which sets only the paper: Night in the dark theme, white in the light. */
export type Theme = "dark" | "light";

export interface Settings {
  /** The page's scale, one of `ZOOM_STEPS`. */
  readonly zoom: number;
  readonly theme: Theme;
  /** Focus mode: the sidebar and the top bar hidden. */
  readonly focus: boolean;
  readonly sidebarCollapsed: boolean;
  /** The folder of the project last shown on this machine; null before any. */
  readonly project: string | null;
  /**
   * The library's folder as the writer set it in the file; null for the
   * default. The Rust side reads it at start (`settings.rs`) and refuses a
   * save that changes it; the page only keeps it, so that saving the other
   * settings never drops it.
   */
  readonly library: string | null;
}

/**
 * The zooms the keys and the sidebar's control step through. Any scale
 * keeps every line where the engine puts it (findings, "Editor"), so the
 * steps are those writers know from browsers: tens of percent below 100%,
 * wider steps above it.
 */
export const ZOOM_STEPS: readonly number[] = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

export const DEFAULT_SETTINGS: Settings = {
  zoom: 1,
  theme: "dark",
  focus: false,
  sidebarCollapsed: false,
  project: null,
  library: null,
};

export const SETTINGS_FORMAT = "tir-settings";
/**
 * Raise this when a field changes meaning; a reader takes the fields it
 * knows from any version, and a file without a field gives its default.
 */
export const SETTINGS_VERSION = 1;

/** The next zoom step in from `zoom`; the largest stays. */
export function zoomIn(zoom: number): number {
  return ZOOM_STEPS.find((step) => step > zoom) ?? (ZOOM_STEPS.at(-1) as number);
}

/** The next zoom step out from `zoom`; the smallest stays. */
export function zoomOut(zoom: number): number {
  return ZOOM_STEPS.findLast((step) => step < zoom) ?? (ZOOM_STEPS[0] as number);
}

/** The zoom step nearest `zoom`, so a file from a Tir with other steps keeps about its zoom. */
function nearestStep(zoom: number): number {
  let best = ZOOM_STEPS[0] as number;
  for (const step of ZOOM_STEPS) if (Math.abs(step - zoom) < Math.abs(best - zoom)) best = step;
  return best;
}

/** The settings in a settings file's text; `null` when there is no file. */
export function readSettings(text: string | null): Settings {
  let data: unknown = null;
  try {
    data = text === null ? null : JSON.parse(text);
  } catch {
    // A damaged file reads as no file.
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return DEFAULT_SETTINGS;
  const { format, zoom, theme, focus, sidebar, project, library } = data as Record<string, unknown>;
  if (format !== SETTINGS_FORMAT) return DEFAULT_SETTINGS;
  return {
    zoom:
      typeof zoom === "number" && Number.isFinite(zoom) ? nearestStep(zoom) : DEFAULT_SETTINGS.zoom,
    theme: theme === "dark" || theme === "light" ? theme : DEFAULT_SETTINGS.theme,
    focus: typeof focus === "boolean" ? focus : DEFAULT_SETTINGS.focus,
    sidebarCollapsed:
      sidebar === "collapsed" || sidebar === "open"
        ? sidebar === "collapsed"
        : DEFAULT_SETTINGS.sidebarCollapsed,
    project: typeof project === "string" ? project : DEFAULT_SETTINGS.project,
    library: typeof library === "string" ? library : DEFAULT_SETTINGS.library,
  };
}

/** A settings file's text, one setting per line; the project and the library only when set. */
export function writeSettings(settings: Settings): string {
  const file = {
    format: SETTINGS_FORMAT,
    version: SETTINGS_VERSION,
    zoom: settings.zoom,
    theme: settings.theme,
    focus: settings.focus,
    sidebar: settings.sidebarCollapsed ? "collapsed" : "open",
    ...(settings.project === null ? {} : { project: settings.project }),
    ...(settings.library === null ? {} : { library: settings.library }),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}
