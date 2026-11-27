/** Helpers the JSON file formats share (the draft file, the project file). */

/**
 * `value` as JSON on one line. JSON leaves U+2028 and U+2029 unescaped, and
 * some viewers break lines at them; escaping keeps the value on one line.
 */
export function oneLineJson(value: unknown): string {
  return JSON.stringify(value).replace(
    /[\u2028\u2029]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16)}`,
  );
}

/** Whether parsed JSON is an object, whose fields a reader then checks one by one. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
