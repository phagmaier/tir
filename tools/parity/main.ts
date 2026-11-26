/**
 * `mise run parity [files…] [--lines N] [--all] [--show PAGE]`: compares
 * Tir's page breaks with Final Draft PDFs. With no files it reads every PDF
 * in the ignored calibration/ folder (task 0.8). `--show` prints one script
 * page as Final Draft set it and as Tir sets it, row by row.
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compare, compareLocally, report, showPage } from "./compare.ts";
import { readPdfText } from "./pdf-text.ts";
import { rebuild } from "./rebuild.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));

async function main(args: string[]): Promise<number> {
  let linesPerPage: number | undefined;
  let all = false;
  let show: number | undefined;
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === "--lines") linesPerPage = Number(args[++i]);
    else if (arg === "--all") all = true;
    else if (arg === "--show") show = Number(args[++i]);
    else files.push(arg);
  }
  if (files.length === 0) {
    const folder = join(root, "calibration");
    try {
      for (const name of readdirSync(folder).sort()) {
        if (name.toLowerCase().endsWith(".pdf")) files.push(join(folder, name));
      }
    } catch {
      console.error(`No files given and no calibration folder at ${folder}.`);
      return 1;
    }
  }
  if (files.length === 0) {
    console.error("No PDFs to check.");
    return 1;
  }

  let pages = 0;
  let same = 0;
  let localPages = 0;
  let localSame = 0;
  for (const file of files) {
    const pdf = await readPdfText(new Uint8Array(readFileSync(file)));
    const rebuilt = rebuild(pdf, linesPerPage ? { linesPerPage } : {});
    const comparison = compare(rebuilt, linesPerPage);
    const local = compareLocally(rebuilt, linesPerPage);
    console.log(report(basename(file), pdf.producer, rebuilt, comparison, all, local));
    if (show !== undefined) console.log(showPage(rebuilt, show, linesPerPage));
    console.log("");
    pages += comparison.pages.length;
    same += comparison.pages.filter((result) => result.same).length;
    localPages += local.length;
    localSame += local.filter((result) => result.same).length;
  }
  console.log(
    `All files: ${same} of ${pages} pages start on the same line${linesPerPage ? ` (${linesPerPage} lines a page)` : ""}; page by page, ${localSame} of ${localPages} end where Final Draft's do.`,
  );
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
