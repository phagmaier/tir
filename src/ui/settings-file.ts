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

/**
 * A function that saves the settings it is given. Writes go one at a time,
 * so the file ends with the last settings given, however fast they come.
 */
export function settingsSaver(): (settings: Settings) => void {
  let next: string | null = null;
  let writing = false;
  const flush = async () => {
    writing = true;
    while (next !== null) {
      const text = next;
      next = null;
      try {
        await invoke("write_settings", { text });
      } catch (error) {
        console.error("Tir could not save its settings file:", error);
      }
    }
    writing = false;
  };
  return (settings) => {
    next = writeSettings(settings);
    if (!writing) void flush();
  };
}
