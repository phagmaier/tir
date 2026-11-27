/**
 * Names for the library's folders and files, made from the names the writer
 * gives projects and drafts (architecture, "Library on disk"). A name keeps
 * the writer's words readable, accents and all, since the library is read
 * on GitHub too, but it is one entry of a folder on any system the library
 * may be cloned to: no separators, no characters Windows or macOS refuse,
 * no hidden or reserved names, and short enough for every file system. Two
 * names differing only in capitals or in how an accent is encoded would be
 * one file on macOS and Windows, so they count as the same name.
 */

/**
 * The longest name, in UTF-8 bytes: a file system allows 255, and a draft's
 * file adds ".fountain" for its copy and a temporary file's suffix while
 * it is written (`files.rs`).
 */
const MAX_BYTES = 120;

/** Names Windows keeps for devices, alone or followed by an extension (findings, "Library on disk"). */
const RESERVED = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?=\.|$)/iu;

/** Characters a name drops: controls, and the bidirectional marks that can disguise one. */
const INVISIBLE = /[\p{Cc}\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** `title` made a safe name; "Untitled" when nothing of it is left. */
export function safeName(title: string): string {
  const name = title
    .normalize("NFC")
    // A lone surrogate cannot be written as UTF-8.
    .replace(/\p{Cs}/gu, "")
    .replace(INVISIBLE, " ")
    // "Salt Line: Redux" reads on as "Salt Line - Redux", "10:30" as "10-30".
    .replace(/:(?=\s)/g, " -")
    .replace(/[/\\|:]/g, "-")
    .replace(/"/g, "'")
    .replace(/[*?<>]/g, "")
    .replace(/\s+/gu, " ")
    // A leading dot hides a name, and "." and ".." are not names at all.
    .replace(/^[.\s]+/u, "");
  return finish(name, MAX_BYTES);
}

/**
 * A safe name for `title` that is not in `taken`, the names already in the
 * folder: the safe name, or it with " 2", " 3" and so on. With
 * `extensions`, the name is free only when it is free with each of them
 * added, as a draft's file and its Fountain copy must both be.
 */
export function uniqueName(
  title: string,
  taken: Iterable<string>,
  extensions: readonly string[] = [""],
): string {
  const keys = new Set(Array.from(taken, nameKey));
  const free = (name: string) =>
    extensions.every((extension) => !keys.has(nameKey(name + extension)));
  const base = safeName(title);
  if (free(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const name = finish(base, MAX_BYTES - suffix.length) + suffix;
    if (free(name)) return name;
  }
}

/**
 * Whether `name` is one entry of a folder that is not hidden, which is what
 * the Rust side accepts (`library.rs`): nothing named this way can reach
 * outside the folder it is in.
 */
export function isSafeName(name: string): boolean {
  return (
    name !== "" && !name.startsWith(".") && !/[/\\\0]|\p{Cs}/u.test(name) && utf8Length(name) <= 255
  );
}

/**
 * What two names are compared by: macOS and Windows ignore capitals and
 * accents' encoding. Through small letters, capitals and back, letters
 * with two small forms (Greek "σ" and "ς") meet, as do "ß", "ẞ" and "ss",
 * which errs towards a name taken.
 */
function nameKey(name: string): string {
  return name.normalize("NFC").toLowerCase().toUpperCase().toLowerCase().normalize("NFC");
}

/** `name` cut to `bytes`, without trailing dots or spaces, which Windows drops, and not reserved. */
function finish(name: string, bytes: number): string {
  let cut = "";
  let length = 0;
  for (const { segment } of segmenter.segment(name)) {
    length += utf8Length(segment);
    if (length > bytes) break;
    cut += segment;
  }
  cut = cut.replace(/[.\s]+$/u, "");
  return cut === "" ? "Untitled" : cut.replace(RESERVED, "$1_");
}

function utf8Length(text: string): number {
  let length = 0;
  for (const char of text) {
    const code = char.codePointAt(0) as number;
    length += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return length;
}
