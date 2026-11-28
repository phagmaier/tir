/**
 * Spell check's dictionary, SCOWL's US English for Hunspell (findings,
 * "Spell check"), fetched from the page's own origin, with the words a
 * screenplay uses that it lacks. Neither file is inlined as a `data:` URL,
 * as Vite inlines small files, since the content security policy lets the
 * page fetch only from its origin (`connect-src` in `tauri.conf.json`).
 */
import { Dictionary, SCREENPLAY_WORDS } from "../core/spelling.ts";
import aff from "./dictionary/en_US.aff?url&no-inline";
import dic from "./dictionary/en_US.dic?url&no-inline";

export async function loadDictionary(): Promise<Dictionary> {
  const [affText, dicText] = await Promise.all(
    [aff, dic].map(async (file) => {
      const response = await fetch(file);
      if (!response.ok) throw new Error(`The dictionary could not be loaded (${response.status}).`);
      return response.text();
    }),
  );
  const dictionary = Dictionary.parse(affText as string, dicText as string);
  for (const word of SCREENPLAY_WORDS) dictionary.add(word);
  return dictionary;
}
