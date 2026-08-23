/**
 * Manual check: what étagère extracts from an EPUB (spine, cover, TOC).
 * Usage: npx tsx scripts/check-epub.ts <file.epub>
 */
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
const g = globalThis as Record<string, unknown>;
g.DOMParser = dom.window.DOMParser;
g.Node = dom.window.Node;
g.document = dom.window.document;
g.FileReader = dom.window.FileReader;
g.window = dom.window;
g.global = globalThis;
g.Image = dom.window.Image;
g.URL = URL;
g.Blob = Blob;

async function main() {
  const { parseEpub } = await import("../src/lib/epub");
  const { flattenToc } = await import("../src/lib/toc");

  const path = process.argv[2];
  if (!path) throw new Error("pass an .epub path");
  const buffer = await readFile(path);
  const file = new File([new Uint8Array(buffer)], path.split("/").pop()!, {
    type: "application/epub+zip",
  });

  const book = await parseEpub(file);
  console.log(`title:   ${book.title}`);
  console.log(`author:  ${book.author ?? "—"}`);
  console.log(`cover:   ${book.coverDataUrl?.slice(0, 40) ?? "NONE"}`);
  console.log(`chapters: ${book.chapters.length}`);
  console.log(`toc entries: ${flattenToc(book.toc).length}`);
  console.log(
    `paths:    ${book.chapters.filter((c) => c.path).length}/${book.chapters.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
