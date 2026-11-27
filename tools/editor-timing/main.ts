/**
 * `mise run editor-timing [--pairs N] [--zoom Z] [--focus]`: times typing in
 * the running dev app, measuring layout, frame and busy time as findings
 * ("Editor") defines them, for each edit in its table, at the zoom given
 * (100% by default) and in focus mode with `--focus`; then the window's
 * keys that change no text, a zoom step and focus mode on and off, from that
 * zoom. Start the app first with
 * `TIR_CONFIG_DIR=$(mktemp -d) WEBKIT_INSPECTOR_HTTP_SERVER=127.0.0.1:9339 mise run dev`;
 * the tool puts back the window's settings it found. Keys go to the window
 * titled "Tir" through Hyprland's dispatcher, so this runs only on a
 * Hyprland desktop (architecture, "Measuring the editor").
 */
import { SAVE_DELAY_MS } from "../../src/ui/saving.ts";
import { load as loadApp, Page, press, sleep } from "../inspector.ts";

/**
 * Installed in the page: for each key, the time from the `keydown` listener
 * to a forced layout of the editor once the key's effect is in the page
 * (layout), to a zero-delay timer set in the next animation frame (frame),
 * and, when `__timing.busy` is set, the main thread's blocked time in the
 * next `busyMs`. Typing is in the page at ProseMirror's DOM update; a window
 * key, which changes no text, once the window's own listener, which catches
 * keys on the way down (`src/ui/desk.ts`), has acted on it. The forced
 * layout is the editor's own `getBoundingClientRect`, since
 * `document.body.offsetHeight` may skip a fixed-position subtree.
 */
const probe = (busyMs: number, windowKeys: boolean) => `(() => {
  const timing = (globalThis.__timing = { rows: [], busy: false });
  const editor = tirView.dom;
  let current = null;
  addEventListener("keydown", (event) => {
    const row = (current = { key: event.key, t0: performance.now() });
    if (!timing.busy) return;
    let last = row.t0;
    let busy = 0;
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      const now = performance.now();
      if (now - last > 1) busy += now - last;
      last = now;
      if (now - row.t0 < ${busyMs}) channel.port2.postMessage(0);
      else row.busy = busy;
    };
    channel.port2.postMessage(0);
  }, true);
  const done = () => {
    if (!current || current.t1) return;
    editor.getBoundingClientRect();
    const row = current;
    row.t1 = performance.now();
    requestAnimationFrame(() => setTimeout(() => {
      row.t3 = performance.now();
      timing.rows.push(row);
    }, 0));
  };
  if (${windowKeys}) addEventListener("keydown", done);
  else new MutationObserver(done).observe(editor, { childList: true, subtree: true, characterData: true, attributes: true });
  return true;
})()`;

/** Puts the caret in element `index` at `offset`. */
const caret = (index: number, offset: number) => `(() => {
  const v = tirView;
  let pos = 0;
  for (let i = 0; i < ${index}; i++) pos += v.state.doc.child(i).nodeSize;
  v.dispatch(v.state.tr.setSelection(v.state.selection.constructor.create(v.state.doc, pos + 1 + ${offset})));
  return true;
})()`;

/** Fills element `index`'s last line exactly, caret at its end: one more letter wraps. */
const fillLastLine = (index: number) => `(async () => {
  const { layoutElement } = await import("/src/core/layout.ts");
  const v = tirView;
  let pos = 0;
  for (let i = 0; i < ${index}; i++) pos += v.state.doc.child(i).nodeSize;
  const node = v.state.doc.child(${index});
  const lines = (text) => layoutElement({ type: node.attrs.type, text }).lines;
  let text = node.textContent.replace(/[.!?]$/, "");
  for (let i = 0; i < 200 && lines(text + "x").length === lines(text).length; i++) {
    const last = lines(text).at(-1);
    text += last.end - last.start < 59 ? " ab" : "b";
  }
  const tr = v.state.tr.insertText(text, pos + 1, pos + 1 + node.content.size);
  v.dispatch(tr.setSelection(v.state.selection.constructor.create(tr.doc, pos + 1 + text.length)));
  return true;
})()`;

/**
 * On the forced-break fixture, makes page 1's last action four full lines,
 * caret at its end: one more letter pushes the closing speech onto a page of
 * its own, and Backspace removes that page.
 */
const fillPageOne = `(() => {
  const v = tirView;
  let pos = 0;
  for (let i = 0; i < 16; i++) pos += v.state.doc.child(i).nodeSize;
  const line = "lamps lamps " + Array(10).fill("lamp").join(" ");
  const text = [line, line, line, line].join(" ");
  const tr = v.state.tr.insertText(text, pos + 1, pos + 1 + v.state.doc.child(16).content.size);
  v.dispatch(tr.setSelection(v.state.selection.constructor.create(tr.doc, pos + 1 + text.length)));
  return true;
})()`;

/**
 * Element `index`, a cue, holds only "M", caret at its end: typing `a` and
 * Backspace each redraw the open autocomplete popup and its ghost.
 */
const cueStart = (index: number) => `(() => {
  const v = tirView;
  let pos = 0;
  for (let i = 0; i < ${index}; i++) pos += v.state.doc.child(i).nodeSize;
  const tr = v.state.tr.insertText("M", pos + 1, pos + 1 + v.state.doc.child(${index}).content.size);
  v.dispatch(tr.setSelection(v.state.selection.constructor.create(tr.doc, pos + 2)));
  return true;
})()`;

/**
 * Counts, in `__saves`, the saves that end with the draft holding what is
 * on screen, by the top bar's saved state.
 */
const countSaves = `(() => {
  const saved = document.querySelector(".saved");
  globalThis.__saves = 0;
  new MutationObserver(() => {
    if (saved.dataset.state === "saved") globalThis.__saves++;
  }).observe(saved, { attributes: true, attributeFilter: ["data-state"] });
  return true;
})()`;

interface Scenario {
  readonly edit: string;
  readonly query: string;
  readonly setup: string;
  /** The key typed before each Backspace; `x` unless given. */
  readonly key?: string;
  /** True in the page when the edit was measured in the state it names. */
  readonly check?: string;
  /** The time between keys, in ms; 140 unless given. */
  readonly gap?: () => number;
  /** A note on the run, as text, read in the page after it. */
  readonly note?: string;
}

const SCENARIOS: readonly Scenario[] = [
  { edit: "Ordinary typing in an action", query: "?fixture=spike", setup: caret(1, 2) },
  { edit: "Typing that adds or removes a line", query: "?fixture=spike", setup: fillLastLine(1) },
  { edit: "Typing that adds a page", query: "?fixture=spike", setup: fillPageOne },
  { edit: "Line change, ?fixture=feature", query: "?fixture=feature", setup: fillLastLine(4) },
  {
    edit: "Typing in a cue, the autocomplete popup open",
    query: "?fixture=spike",
    setup: cueStart(17),
    key: "a",
    check: `!document.querySelector(".completion").hidden`,
  },
  {
    // Each key comes after the pause that starts a save, up to 1.2 s
    // later, so it lands as the save starts, while it runs, or after it.
    edit: "Typing as a save starts or runs",
    query: "?fixture=spike",
    setup: `(${caret(1, 2)}, ${countSaves})`,
    gap: () => SAVE_DELAY_MS + Math.random() * 1200,
    note: `__saves + " saves finished during it"`,
  },
];

interface Row {
  key: string;
  t0: number;
  t1: number;
  t3: number;
  busy?: number;
}

/** A key the dispatcher presses, with Hyprland's names for it and its modifiers. */
interface Key {
  readonly name: string;
  readonly key: string;
  readonly mods?: string;
}

/** The window's keys, timed in pairs, each from the state the other leaves. */
const WINDOW_KEYS: readonly (readonly [Key, Key])[] = [
  [
    { name: "Zoom in a step", key: "equal", mods: "CTRL" },
    { name: "Zoom out a step", key: "minus", mods: "CTRL" },
  ],
  [
    { name: "Focus mode on", key: "F", mods: "CTRL SHIFT" },
    { name: "Focus mode off", key: "F", mods: "CTRL SHIFT" },
  ],
];

/** Puts the caret at the start of the script's middle element, in view. */
const middle = `(() => {
  const v = tirView;
  let pos = 0;
  for (let i = 0; i < v.state.doc.childCount >> 1; i++) pos += v.state.doc.child(i).nodeSize;
  const selection = v.state.selection.constructor.create(v.state.doc, pos + 1);
  v.dispatch(v.state.tr.setSelection(selection).scrollIntoView());
  return true;
})()`;

/**
 * Loads the app at `query`, gives the window `settings`, installs the probe,
 * for typing or for the window's keys, and focuses the editor.
 */
async function load(query: string, settings: object, windowKeys: boolean): Promise<Page> {
  const page = await loadApp(query);
  try {
    await page.evaluate(`(tirDesk.set(${JSON.stringify(settings)}), true)`);
    await page.evaluate(windowKeys ? probe(150, true) : probe(70, false));
    await page.evaluate("tirView.focus(), true");
  } catch (error) {
    page.close();
    throw error;
  }
  return page;
}

/** Presses `keys` in turn `pairs` times, `gap` ms apart, returning one row per press. */
async function pressPairs(
  page: Page,
  pairs: number,
  busy: boolean,
  keys: readonly Key[],
  gap: () => number,
): Promise<Row[]> {
  await page.evaluate(`(__timing.rows.length = 0, __timing.busy = ${busy}, true)`);
  for (let i = 0; i < pairs; i++) {
    for (const { key, mods } of keys) {
      await press(key, mods);
      await sleep(gap());
    }
  }
  await sleep(400);
  return page.evaluate<Row[]>("__timing.rows");
}

function percentile(values: number[], share: number): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * share) - 1)] ?? Number.NaN;
}

function median(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** A table row: layout and frame as median (p95), and the median busy time. */
function tableRow(name: string, key: string, rows: Row[], busyRows: Row[]): string {
  const show = (values: number[]) =>
    `${median(values).toFixed(0)} (${percentile(values, 0.95).toFixed(0)})`;
  const busy = busyRows.filter((row) => row.busy !== undefined).map((row) => row.busy as number);
  return `| ${name} | ${key} | ${show(rows.map((r) => r.t1 - r.t0))} | ${show(rows.map((r) => r.t3 - r.t0))} | ${median(busy).toFixed(0)} |`;
}

async function main(args: string[]): Promise<number> {
  const option = (name: string) => {
    const at = args.indexOf(name);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const pairs = Number(option("--pairs") ?? 15);
  const zoom = Number(option("--zoom") ?? 1);
  const focus = args.includes("--focus");
  const open = await Page.open();
  let found: object;
  try {
    found = await open.evaluate<object>("tirDesk.settings");
  } finally {
    open.close();
  }

  try {
    const at = `${Math.round(zoom * 100)}%${focus ? " in focus mode" : ""}`;
    console.log(
      `At ${at}, ${pairs} pairs of a letter and Backspace per edit; times in ms, median (p95).\n`,
    );
    console.log("| Edit | Key | Layout | Frame | Busy median |");
    console.log("| --- | --- | --- | --- | --- |");
    const notes: string[] = [];
    for (const { edit, query, setup, key = "x", check, gap = () => 140, note } of SCENARIOS) {
      const page = await load(query, { zoom, focus }, false);
      const keys = [
        { name: key, key },
        { name: "Backspace", key: "BackSpace" },
      ];
      let rows: Row[];
      let busyRows: Row[];
      try {
        await page.evaluate(setup);
        const before = await page.evaluate<string>("tirView.state.doc.textContent");
        rows = await pressPairs(page, pairs, false, keys, gap);
        busyRows = await pressPairs(page, pairs, true, keys, gap);
        if ((await page.evaluate<string>("tirView.state.doc.textContent")) !== before) {
          console.error(`${edit}: the text changed, so a key was lost; the times are suspect.`);
        }
        if (check && !(await page.evaluate<boolean>(check))) {
          console.error(`${edit}: the page was not in the state measured; the times are suspect.`);
        }
        if (note) notes.push(`${edit}: ${await page.evaluate<string>(note)}.`);
      } finally {
        page.close();
      }
      for (const typed of [key, "Backspace"]) {
        const own = (list: Row[]) => list.filter((row) => row.key === typed);
        console.log(tableRow(edit, typed, own(rows), own(busyRows)));
      }
    }
    if (notes.length) console.log(`\n${notes.join("\n")}`);

    console.log(
      `\nThe window's keys from ${Math.round(zoom * 100)}%, ${pairs} pairs each, on ?fixture=spike with the caret in the middle; busy over 150 ms.\n`,
    );
    console.log("| Change | Key | Layout | Frame | Busy median |");
    console.log("| --- | --- | --- | --- | --- |");
    for (const keys of WINDOW_KEYS) {
      const page = await load("?fixture=spike", { zoom, focus: false }, true);
      let rows: Row[];
      let busyRows: Row[];
      try {
        await page.evaluate(middle);
        // Long enough apart for the bars' fade to end.
        rows = await pressPairs(page, pairs, false, keys, () => 700);
        busyRows = await pressPairs(page, pairs, true, keys, () => 700);
      } finally {
        page.close();
      }
      if (rows.length !== 2 * pairs || busyRows.length !== 2 * pairs) {
        console.error(`${keys[0].name}: a key was lost; the times are suspect.`);
      }
      keys.forEach(({ name, key, mods }, i) => {
        const own = (list: Row[]) => list.filter((_, n) => n % 2 === i);
        const combo = `${mods ? `${mods.replace(" ", "+")}+` : ""}${key}`;
        console.log(tableRow(name, combo, own(rows), own(busyRows)));
      });
    }
  } finally {
    // After a failure too, with every connection closed so this one is named the target.
    const restore = await Page.open();
    try {
      await restore.evaluate(`(tirDesk.set(${JSON.stringify(found)}), true)`);
    } finally {
      restore.close();
    }
  }
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
