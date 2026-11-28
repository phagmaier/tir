/**
 * Drives the running dev app through WebKitGTK's remote inspector and sends
 * it keys through Hyprland's dispatcher. The window helpers find, type into,
 * click, screenshot and close a trial's windows, native dialogs included.
 * Follow the isolated launch and single-window precautions in
 * docs/architecture.md#measuring-the-editor.
 */
import { execFile } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { promisify } from "node:util";

const INSPECTOR = "127.0.0.1:9339";
const APP = "http://localhost:1420/";
const exec = promisify(execFile);

export function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

// An agent's shell may lack Hyprland's instance variable; its folder names it.
const env = process.env.HYPRLAND_INSTANCE_SIGNATURE
  ? process.env
  : {
      ...process.env,
      HYPRLAND_INSTANCE_SIGNATURE: readdirSync(`${process.env.XDG_RUNTIME_DIR}/hypr`)[0],
    };

export async function dispatch(command: string): Promise<void> {
  await exec("hyprctl", ["dispatch", command], { env });
}

/** A real key press: `wtype` gives arrow keys the wrong code in WebKitGTK (findings, "Editor"). */
export function press(key: string, mods = ""): Promise<void> {
  return dispatch(`hl.dsp.send_shortcut({window="title:^Tir$",mods="${mods}",key="${key}"})`);
}

/** A window as `hyprctl clients -j` lists it. */
export interface Window {
  readonly address: string;
  readonly title: string;
  readonly pid: number;
  readonly at: readonly [number, number];
  readonly size: readonly [number, number];
}

/**
 * The windows of the Tir started with `TIR_CONFIG_DIR=trial`: its main
 * window and any native dialog it has open, which share its process.
 * Target them by address, never by the shared title "Tir".
 */
export async function trialWindows(trial: string): Promise<Window[]> {
  const { stdout } = await exec("hyprctl", ["clients", "-j"], { env });
  const ours = (pid: number) => {
    try {
      const environment = readFileSync(`/proc/${pid}/environ`, "utf8").split("\0");
      return environment.includes(`TIR_CONFIG_DIR=${trial}`);
    } catch {
      // Gone, or another user's process.
      return false;
    }
  };
  return (JSON.parse(stdout) as Window[]).filter((window) => ours(window.pid));
}

/**
 * Sends `key`, an XKB name such as "Return" or "BackSpace", to `window`,
 * focused or not. In a GTK file dialog `wtype`'s named keys did not arrive.
 */
export function sendKey(window: Window, key: string, mods = ""): Promise<void> {
  return dispatch(
    `hl.dsp.send_shortcut({ window = "address:${window.address}", mods = "${mods}", key = "${key}" })`,
  );
}

/** Focuses `window` and types `text`, such as a path into a file dialog's name field. */
export async function typeText(window: Window, text: string): Promise<void> {
  await dispatch(`hl.dsp.focus({ window = "address:${window.address}" })`);
  await sleep(200);
  await exec(await nixTool("wtype"), [text], { env });
}

/** A real left click at `x`, `y` in `window`, such as a page element's client position. */
export async function click(window: Window, x: number, y: number): Promise<void> {
  const { stdout } = await exec("hyprctl", ["cursorpos"], { env });
  const [fromX = 0, fromY = 0] = stdout.trim().split(", ").map(Number);
  const wlrctl = await nixTool("wlrctl");
  const dx = Math.round(window.at[0] + x - fromX);
  const dy = Math.round(window.at[1] + y - fromY);
  await exec(wlrctl, ["pointer", "move", String(dx), String(dy)], { env });
  await sleep(200);
  await exec(wlrctl, ["pointer", "click", "left"], { env });
}

/** Screenshots `window` to the PNG `file`. */
export async function screenshot(window: Window, file: string): Promise<void> {
  const [x, y] = window.at;
  const [width, height] = window.size;
  await exec(await nixTool("grim"), ["-g", `${x},${y} ${width}x${height}`, file], { env });
}

/** Asks `window` to close, as its close button does: Tir saves first, or asks. */
export function closeWindow(window: Window): Promise<void> {
  return dispatch(`hl.dsp.window.close({ window = "address:${window.address}" })`);
}

const built = new Map<string, Promise<string>>();

/** The program `name` from nixpkgs (grim, wtype, wlrctl), built at most once a run. */
function nixTool(name: string): Promise<string> {
  let path = built.get(name);
  if (!path) {
    path = exec("nix", ["build", "--no-link", "--print-out-paths", `nixpkgs#${name}`]).then(
      ({ stdout }) => `${stdout.trim().split("\n").at(-1)}/bin/${name}`,
    );
    built.set(name, path);
  }
  return path;
}

interface Message {
  id?: number;
  method?: string;
  params?: { message?: string; targetInfo?: { targetId: string } };
  result?: {
    result?: { value?: unknown; objectId?: string; className?: string };
    wasThrown?: boolean;
  };
  error?: unknown;
}

/**
 * The page in the WebKit inspector. WebKitGTK's remote inspector reaches the
 * page only through `Target.sendMessageToTarget`; replies come back as
 * `Target.dispatchMessageFromTarget` events.
 */
export class Page {
  private target = "";
  private next = 1;
  private readonly waiting = new Map<number, (message: Message) => void>();
  private readonly socket: WebSocket;

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.onmessage = ({ data }) => {
      const outer = JSON.parse(String(data)) as Message;
      if (outer.method === "Target.targetCreated") {
        this.target = outer.params?.targetInfo?.targetId ?? "";
      } else if (outer.method === "Target.dispatchMessageFromTarget") {
        const inner = JSON.parse(outer.params?.message ?? "{}") as Message;
        if (inner.id !== undefined) this.waiting.get(inner.id)?.(inner);
      }
    };
  }

  static async open(): Promise<Page> {
    const listing = await (await fetch(`http://${INSPECTOR}/`)).text();
    const path = listing.match(/socket\/\d+\/\d+\/WebPage/g)?.at(-1);
    if (!path) throw new Error("No page in the inspector yet.");
    const socket = new WebSocket(`ws://${INSPECTOR}/${path}`);
    const opened = Promise.withResolvers<void>();
    socket.onopen = () => opened.resolve();
    socket.onerror = () => opened.reject(new Error(`Cannot reach the inspector at ${INSPECTOR}.`));
    await opened.promise;
    const page = new Page(socket);
    for (let i = 0; i < 40 && !page.target; i++) await sleep(50);
    if (!page.target) {
      // An open socket keeps the next connection from being named the target.
      socket.close();
      throw new Error("The inspector named no target.");
    }
    return page;
  }

  close(): void {
    this.socket.close();
  }

  private call(method: string, params: object): Promise<Message> {
    const id = this.next++;
    const message = JSON.stringify({ id, method, params });
    const reply = Promise.withResolvers<Message>();
    this.waiting.set(id, reply.resolve);
    setTimeout(() => reply.reject(new Error(`${method} timed out`)), 15_000);
    this.socket.send(
      JSON.stringify({
        id,
        method: "Target.sendMessageToTarget",
        params: { targetId: this.target, message },
      }),
    );
    return reply.promise;
  }

  /**
   * Evaluates an expression in the page, waiting for it if it is a promise.
   * The value comes back as JSON. Runtime.evaluate returns a promise only as
   * a reference, so every result is wrapped in one and awaited.
   */
  async evaluate<T>(expression: string): Promise<T> {
    let reply = await this.call("Runtime.evaluate", {
      expression: `Promise.resolve((${expression}))`,
    });
    const promise = reply.result?.result;
    if (promise?.objectId && !reply.result?.wasThrown) {
      reply = await this.call("Runtime.awaitPromise", {
        promiseObjectId: promise.objectId,
        returnByValue: true,
      });
    }
    if (reply.error || reply.result?.wasThrown) {
      throw new Error(
        `${expression.slice(0, 60)}…: ${JSON.stringify(reply.error ?? reply.result)}`,
      );
    }
    return reply.result?.result?.value as T;
  }
}

/** Loads the app at `query` (such as `?fixture=feature`) and focuses its window. */
export async function load(query: string): Promise<Page> {
  const old = await Page.open();
  // The page navigates away before it can reply.
  old.evaluate(`location.href = ${JSON.stringify(APP + query)}`).catch(() => {});
  await sleep(500);
  old.close();
  for (let attempt = 0; attempt < 60; attempt++) {
    await sleep(500);
    let page: Page | undefined;
    try {
      page = await Page.open();
      const ready = `!!globalThis.tirView && location.search === ${JSON.stringify(query)}`;
      if (await page.evaluate<boolean>(ready)) {
        await dispatch(`hl.dsp.focus({ window = "title:^Tir$" })`);
        return page;
      }
    } catch {
      // The page is still loading.
    }
    // An open connection keeps the next one from being named the target.
    page?.close();
  }
  throw new Error(`The app did not load ${query} with tirView (is it the dev build?).`);
}
