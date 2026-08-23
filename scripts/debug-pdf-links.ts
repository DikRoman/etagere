/**
 * Manual check: how each of the first pages is judged as a Contents page.
 * Usage: npx tsx scripts/debug-pdf-links.ts <file-or-url> [pages]
 */
import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { getInternalLinks, scanPageForEntries } from "../src/lib/pdf-links";

async function bytes(source: string): Promise<Uint8Array> {
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source);
    return new Uint8Array(await res.arrayBuffer());
  }
  return new Uint8Array(await readFile(source));
}

async function main() {
  const source = process.argv[2];
  const upto = Number(process.argv[3] ?? 8);
  const pdf = await getDocument({ data: await bytes(source) }).promise;

  for (let p = 1; p <= Math.min(upto, pdf.numPages); p++) {
    const page = await pdf.getPage(p);
    const links = await getInternalLinks(page);
    const scan = await scanPageForEntries(pdf, p);
    console.log(
      `page ${p}: links=${links.length} entries=${scan.entries.length} rows=${scan.textRows} contents=${scan.isContents}`,
    );
    for (const entry of scan.entries.slice(0, 6)) {
      console.log(
        `   x=${entry.x.toFixed(0)} → ${entry.page}  ${JSON.stringify(entry.title.slice(0, 60))}`,
      );
    }
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
