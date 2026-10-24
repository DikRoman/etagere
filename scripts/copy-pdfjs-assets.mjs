// Copy the pdf.js runtime assets into public/ so the browser can fetch them.
//
// pdf.js keeps several decoders outside its main bundle and loads them on
// demand: WASM for JPEG 2000, JBIG2 and ICC colour profiles, plus CMaps for
// CJK text and the standard 14 fonts. Without them those images render as
// blank space — publisher textbooks were losing every illustration.
//
// Copied from the installed package on every dev and build run, so the
// assets always match the pdf.js version actually in use.

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "pdfjs-dist");
const to = join(root, "public", "pdfjs");

const dirs = ["wasm", "cmaps", "standard_fonts", "iccs"];

if (!existsSync(from)) {
  console.error("[pdfjs-assets] pdfjs-dist is not installed; run npm install");
  process.exit(1);
}

rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
for (const dir of dirs) {
  cpSync(join(from, dir), join(to, dir), { recursive: true });
}
console.log(`[pdfjs-assets] copied ${dirs.join(", ")} -> public/pdfjs`);
