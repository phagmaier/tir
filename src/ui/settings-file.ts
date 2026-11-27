/**
 * The settings file through the Rust side's `read_settings` and
 * `write_settings` (architecture, "Settings"): Tir's own file in its config
 * directory, never the library.
 */
import { invoke } from "@tauri-apps/api/core";
import { readSettings, type Settings, writeSettings } from "../core/settings.ts";

/** The settings as last saved; the defaults when there are none or they cannot be read. */
export async function loadSettings(): Promise<Settings> {
  try {
    return readSettings(await invoke<string | null>("read_settings"));
  } catch (error) {
    console.error("Tir could not read its settings file:", error);
    return readSettings(null);
  }
}

/** Saves the settings it is given, one write at a time, the last settings last. */
export interface SettingsSaver {
  save(settings: Settings): void;
  /** Resolves once every save asked for is written or has failed, so closing waits for it. */
  written(): Promise<void>;
}

export function settingsSaver(): SettingsSaver {
  let next: string | null = null;
  let writing: Promise<void> | null = null;
  const flush = async () => {
    while (next !== null) {
      const text = next;
      next = null;
      try {
        await invoke("write_settings", { text });
      } catch (error) {
        console.error("Tir could not save its settings file:", error);
      }
    }
    writing = null;
  };
  return {
    save(settings) {
      next = writeSettings(settings);
      writing ??= flush();
    },
    written: () => writing ?? Promise.resolve(),
  };
}
