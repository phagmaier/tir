/**
 * `mise run editor-timing [--pairs N]`: times typing in the running dev app,
 * measuring layout, frame and busy time as findings ("Editor") defines them,
 * for each edit in its table. Start the app first with
 * `WEBKIT_INSPECTOR_HTTP_SERVER=127.0.0.1:9339 mise run dev`. Keys go to the
 * window titled "Tir" through Hyprland's dispatcher, so this runs only on a
 * Hyprland desktop (architecture, "Measuring the editor").
 */
import { load as loadApp, type Page, press, sleep } from "../inspector.ts";

/**
 * Installed in the page: for each key, the time from the `keydown` listener
 * to ProseMirror's DOM update plus a forced layout of the editor (layout), to
 * a zero-delay timer set in the next animation frame (frame), and, when
 * `__timing.busy` is set, the main thread's blocked time in the next 70 ms.
 * The forced layout is the editor's own `getBoundingClientRect`, since
 * `document.body.offsetHeight` may skip a fixed-position subtree.
 */
const PROBE = `(() => {
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
      if (now - row.t0 < 70) channel.port2.postMessage(0);
      else row.busy = busy;
    };
    channel.port2.postMessage(0);
  }, true);
  new MutationObserver(() => {
    if (!current || current.t1) return;
    editor.getBoundingClientRect();
    const row = current;
    row.t1 = performance.now();
    requestAnimationFrame(() => setTimeout(() => {
      row.t3 = performance.now();
      timing.rows.push(row);
    }, 0));
  }).observe(editor, { childList: true, subtree: true, characterData: true, attributes: true });
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

interface Scenario {
  readonly edit: string;
  readonly query: string;
  readonly setup: string;
  /** The key typed before each Backspace; `x` unless given. */
  readonly key?: string;
  /** True in the page when the edit was measured in the state it names. */
  readonly check?: string;
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
];

interface Row {
  key: string;
  t0: number;
  t1: number;
  t3: number;
  busy?: number;
}

/** Loads the app at `query`, installs the probe and focuses the editor. */
async function load(query: string): Promise<Page> {
  const page = await loadApp(query);
  await page.evaluate(PROBE);
  await page.evaluate("tirView.focus(), true");
  return page;
}

/** Types `key` then Backspace `pairs` times, returning one row per key. */
async function typePairs(page: Page, pairs: number, busy: boolean, key: string): Promise<Row[]> {
  await page.evaluate(`(__timing.rows.length = 0, __timing.busy = ${busy}, true)`);
  for (let i = 0; i < pairs; i++) {
    for (const typed of [key, "BackSpace"]) {
      await press(typed);
      await sleep(140);
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

async function main(args: string[]): Promise<number> {
  const at = args.indexOf("--pairs");
  const pairs = at >= 0 ? Number(args[at + 1]) : 15;
  console.log(`${pairs} pairs of a letter and Backspace per edit; times in ms, median (p95).\n`);
  console.log("| Edit | Key | Layout | Frame | Busy median |");
  console.log("| --- | --- | --- | --- | --- |");
  for (const { edit, query, setup, key = "x", check } of SCENARIOS) {
    const page = await load(query);
    await page.evaluate(setup);
    const before = await page.evaluate<string>("tirView.state.doc.textContent");
    const rows = await typePairs(page, pairs, false, key);
    const busyRows = await typePairs(page, pairs, true, key);
    if ((await page.evaluate<string>("tirView.state.doc.textContent")) !== before) {
      console.error(`${edit}: the text changed, so a key was lost; the times are suspect.`);
    }
    if (check && !(await page.evaluate<boolean>(check))) {
      console.error(`${edit}: the page was not in the state measured; the times are suspect.`);
    }
    page.close();
    for (const typed of [key, "Backspace"]) {
      const own = rows.filter((row) => row.key === typed);
      const busy = busyRows.filter((row) => row.key === typed && row.busy !== undefined);
      const show = (values: number[]) =>
        `${median(values).toFixed(0)} (${percentile(values, 0.95).toFixed(0)})`;
      console.log(
        `| ${edit} | ${typed} | ${show(own.map((r) => r.t1 - r.t0))} | ${show(own.map((r) => r.t3 - r.t0))} | ${median(busy.map((r) => r.busy as number)).toFixed(0)} |`,
      );
    }
  }
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
