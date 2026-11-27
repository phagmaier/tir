/**
 * Drives the running dev app through WebKitGTK's remote inspector and sends
 * it keys through Hyprland's dispatcher (architecture, "Measuring the
 * editor"). Start the app with
 * `WEBKIT_INSPECTOR_HTTP_SERVER=127.0.0.1:9339 mise run dev`.
 */
import { execFile } from "node:child_process";
import { readdirSync } from "node:fs";
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
