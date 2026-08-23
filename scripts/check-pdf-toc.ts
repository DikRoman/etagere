/**
 * Manual check: print the table of contents étagère would build for a PDF.
 * Usage: npx tsx scripts/check-pdf-toc.ts <file-or-url>
 */
import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { tocFromLinkAnnotations } from "../src/lib/pdf-links";
import { tocFromPrintedContents } from "../src/lib/pdf-toc";
import type { TocItem } from "../src/lib/types";

async function bytes(source: string): Promise<Uint8Array> {
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  return new Uint8Array(await readFile(source));
}

function print(items: TocItem[], depth = 0) {
  for (const it of items.slice(0, 40)) {
    console.log(`${"  ".repeat(depth)}${it.title}  →  ${it.page}`);
    if (it.children?.length) print(it.children, depth + 1);
  }
}

async function main() {
  const source = process.argv[2];
  if (!source) throw new Error("pass a PDF path or URL");
  const pdf = await getDocument({ data: await bytes(source) }).promise;
  console.log(`pages: ${pdf.numPages}`);

  const outline = await pdf.getOutline();
  console.log(`outline bookmarks: ${outline?.length ?? 0}`);

  const labels = await pdf.getPageLabels();
  console.log(
    `page labels: ${labels ? labels.slice(0, 12).join(",") : "none"}`,
  );

  console.time("links");
  const linked = await tocFromLinkAnnotations(pdf);
  console.timeEnd("links");
  console.log(`\n--- from link annotations (${linked.length} top-level) ---`);
  print(linked);

  console.time("text");
  const printed = await tocFromPrintedContents(pdf);
  console.timeEnd("text");
  console.log(`\n--- from printed text (${printed.length} top-level) ---`);
  print(printed);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
