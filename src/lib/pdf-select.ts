import type { TextRect } from "./types";
import { sentenceAroundText } from "./selection";

export type PdfGlyph = {
  i: number;
  ch: string;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  line: number;
  column: number;
};

export type PdfTextIndex = {
  glyphs: PdfGlyph[];
  pageText: string;
  width: number;
  height: number;
};

type RawGlyph = Omit<PdfGlyph, "i" | "line" | "column">;

function isSpace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\u00a0";
}

function isWordChar(ch: string): boolean {
  return /\p{L}|\p{N}|['’ʼ-]/u.test(ch);
}

/** Measure each character of the rendered pdf.js text layer. */
function collectRaw(layer: HTMLElement): RawGlyph[] {
  const layerRect = layer.getBoundingClientRect();
  const out: RawGlyph[] = [];
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let node = walker.nextNode();
  while (node) {
    const text = node.nodeValue ?? "";
    const len = text.length;
    for (let i = 0; i < len; i++) {
      const ch = text[i];
      if (ch === "\0" || ch === "\u200b") continue;
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      if (r.width < 0.15 && r.height < 0.15) continue;
      if (r.width < 0.15 && isSpace(ch)) continue;
      const x = r.left - layerRect.left;
      const y = r.top - layerRect.top;
      out.push({
        ch,
        x,
        y,
        w: r.width,
        h: r.height,
        cx: x + r.width / 2,
        cy: y + r.height / 2,
      });
    }
    node = walker.nextNode();
  }
  return out;
}

/** Drop invisible duplicate runs that sit on the same glyphs. */
function dedupe(raw: RawGlyph[]): RawGlyph[] {
  const kept: RawGlyph[] = [];
  for (const g of raw) {
    const twin = kept.find(
      (k) =>
        k.ch === g.ch &&
        Math.abs(k.cx - g.cx) < 1.4 &&
        Math.abs(k.cy - g.cy) < 1.4,
    );
    if (!twin) kept.push(g);
  }
  return kept;
}

function clusterLines(raw: RawGlyph[]): number[] {
  const order = raw
    .map((g, i) => i)
    .sort((a, b) => raw[a].cy - raw[b].cy || raw[a].x - raw[b].x);
  const lineOf = new Array<number>(raw.length).fill(-1);
  const lines: { cy: number; h: number }[] = [];
  for (const i of order) {
    const g = raw[i];
    let found = -1;
    for (let li = lines.length - 1; li >= 0; li--) {
      const line = lines[li];
      if (Math.abs(g.cy - line.cy) <= Math.max(g.h, line.h) * 0.48) {
        found = li;
        break;
      }
      if (line.cy < g.cy - Math.max(g.h, line.h) * 1.2) break;
    }
    if (found < 0) {
      found = lines.length;
      lines.push({ cy: g.cy, h: g.h });
    } else {
      const line = lines[found];
      line.cy = (line.cy * 3 + g.cy) / 4;
      line.h = Math.max(line.h, g.h);
    }
    lineOf[i] = found;
  }
  return lineOf;
}

/**
 * Split a page into columns by finding vertical gutters in the glyph
 * occupancy. One column (no split) is the usual novel page.
 */
function columnOfGlyphs(raw: RawGlyph[], width: number): number[] {
  const n = raw.length;
  const col = new Array<number>(n).fill(0);
  if (n < 24 || width < 40) return col;

  const bins = 56;
  const occ = new Float32Array(bins);
  for (const g of raw) {
    const a = Math.max(0, Math.floor((g.x / width) * bins));
    const b = Math.min(bins - 1, Math.floor(((g.x + g.w) / width) * bins));
    for (let i = a; i <= b; i++) occ[i] += 1;
  }
  const thresh = Math.max(3, n * 0.01);
  const splits: number[] = [];
  let i = Math.floor(bins * 0.12);
  const last = Math.ceil(bins * 0.88);
  while (i < last) {
    if (occ[i] > thresh) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < last && occ[j] <= thresh) j += 1;
    if (j - i >= 2) {
      splits.push(((i + j) / 2 / bins) * width);
    }
    i = j;
  }
  if (!splits.length) return col;
  for (let gi = 0; gi < n; gi++) {
    let c = 0;
    for (const x of splits) {
      if (raw[gi].cx > x) c += 1;
    }
    col[gi] = c;
  }
  return col;
}

function joinPageText(glyphs: PdfGlyph[]): string {
  let out = "";
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    const prev = glyphs[i - 1];
    if (!prev) {
      out += g.ch;
      continue;
    }
    if (g.line !== prev.line || g.column !== prev.column) {
      if (prev.ch === "-" || prev.ch === "‐" || prev.ch === "–") {
        /* hyphenated line break — glue */
      } else if (!isSpace(prev.ch) && !isSpace(g.ch)) {
        out += " ";
      }
    } else if (!isSpace(prev.ch) && !isSpace(g.ch)) {
      const gap = g.x - (prev.x + prev.w);
      if (gap > Math.max(1.2, prev.h * 0.28)) out += " ";
    }
    out += g.ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

export function indexPdfTextLayer(layer: HTMLElement): PdfTextIndex {
  const width = layer.clientWidth || layer.getBoundingClientRect().width || 1;
  const height = layer.clientHeight || layer.getBoundingClientRect().height || 1;
  const raw = dedupe(collectRaw(layer));
  if (!raw.length) {
    return { glyphs: [], pageText: "", width, height };
  }
  const lineOf = clusterLines(raw);
  const colOf = columnOfGlyphs(raw, width);
  // Reading order comes from pdf.js: TextLayer renders one span per text item
  // in content-stream order, so walking the DOM already yields the right
  // sequence. Re-sorting by geometry used to guess columns from whitespace
  // gaps, which shredded contents pages, bullet lists and tables into
  // "all titles, then all dot leaders, then all page numbers".
  //
  // line/column are still computed, but only for geometry: word and line
  // expansion, and merging highlight rectangles.
  const glyphs: PdfGlyph[] = raw.map((g, i) => ({
    ...g,
    i,
    line: lineOf[i],
    column: colOf[i],
  }));
  return { glyphs, pageText: joinPageText(glyphs), width, height };
}

type CachedIndex = { revision: string; index: PdfTextIndex };
const indexCache = new WeakMap<HTMLElement, CachedIndex>();

/**
 * Indexing measures every glyph on the page, so the selection layer and the
 * vocabulary layer share one result per rendered page instead of each paying
 * for its own.
 */
export function getPdfTextIndex(
  layer: HTMLElement,
  revision: string,
): PdfTextIndex {
  const hit = indexCache.get(layer);
  if (hit && hit.revision === revision) return hit.index;
  const index = indexPdfTextLayer(layer);
  indexCache.set(layer, { revision, index });
  return index;
}

export function hitGlyph(
  index: PdfTextIndex,
  x: number,
  y: number,
): PdfGlyph | null {
  const { glyphs } = index;
  if (!glyphs.length) return null;
  let inside: PdfGlyph | null = null;
  let insideArea = Infinity;
  for (const g of glyphs) {
    if (x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h) {
      const area = g.w * g.h;
      if (area < insideArea) {
        inside = g;
        insideArea = area;
      }
    }
  }
  if (inside) return inside;

  let best: PdfGlyph | null = null;
  let bestDist = Infinity;
  for (const g of glyphs) {
    const padY = g.h * 0.45;
    if (y < g.y - padY || y > g.y + g.h + padY) continue;
    const dx = x < g.x ? g.x - x : x > g.x + g.w ? x - (g.x + g.w) : 0;
    const dy = y < g.y ? g.y - y : y > g.y + g.h ? y - (g.y + g.h) : 0;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      best = g;
      bestDist = d;
    }
  }
  if (best && bestDist <= (best.h * 0.9) ** 2) return best;
  return null;
}

export function flowGlyphs(
  index: PdfTextIndex,
  start: PdfGlyph,
  end: PdfGlyph,
): PdfGlyph[] {
  // Indices now follow reading order, so the span between two hits is simply
  // the range. The old column filter dropped glyphs whenever the guessed
  // columns were wrong, which is what made a short drag select far too much.
  const lo = Math.min(start.i, end.i);
  const hi = Math.max(start.i, end.i);
  return index.glyphs.slice(lo, hi + 1);
}

export function expandWord(index: PdfTextIndex, hit: PdfGlyph): PdfGlyph[] {
  const { glyphs } = index;
  if (!isWordChar(hit.ch)) return [hit];
  let a = hit.i;
  let b = hit.i;
  while (
    a > 0 &&
    glyphs[a - 1].column === hit.column &&
    glyphs[a - 1].line === hit.line &&
    isWordChar(glyphs[a - 1].ch)
  ) {
    a -= 1;
  }
  while (
    b + 1 < glyphs.length &&
    glyphs[b + 1].column === hit.column &&
    glyphs[b + 1].line === hit.line &&
    isWordChar(glyphs[b + 1].ch)
  ) {
    b += 1;
  }
  return glyphs.slice(a, b + 1);
}

export function expandLine(index: PdfTextIndex, hit: PdfGlyph): PdfGlyph[] {
  return index.glyphs.filter(
    (g) => g.column === hit.column && g.line === hit.line,
  );
}

export type PdfWordRun = { text: string; glyphs: PdfGlyph[] };

/**
 * Every word on the page, as a run of word characters that stays on one line.
 * Used to underline words the reader already has in their vocabulary.
 */
export function wordRuns(index: PdfTextIndex): PdfWordRun[] {
  const out: PdfWordRun[] = [];
  let run: PdfGlyph[] = [];
  const flush = () => {
    if (run.length) {
      out.push({ text: run.map((g) => g.ch).join(""), glyphs: run });
      run = [];
    }
  };
  for (const g of index.glyphs) {
    const prev = run[run.length - 1];
    const breaks =
      prev && (prev.line !== g.line || prev.column !== g.column);
    if (!isWordChar(g.ch) || breaks) {
      flush();
      if (!isWordChar(g.ch)) continue;
    }
    run.push(g);
  }
  flush();
  return out;
}

export function mergeGlyphRects(
  glyphs: PdfGlyph[],
  width: number,
  height: number,
): TextRect[] {
  if (!glyphs.length) return [];
  const w = width || 1;
  const h = height || 1;
  const lines = new Map<string, PdfGlyph[]>();
  for (const g of glyphs) {
    const key = `${g.column}:${g.line}`;
    const row = lines.get(key);
    if (row) row.push(g);
    else lines.set(key, [g]);
  }
  const rects: TextRect[] = [];
  for (const row of lines.values()) {
    row.sort((a, b) => a.x - b.x);
    let run = [row[0]];
    const flush = () => {
      const first = run[0];
      const last = run[run.length - 1];
      const x0 = first.x;
      const x1 = last.x + last.w;
      const y0 = Math.min(...run.map((g) => g.y));
      const y1 = Math.max(...run.map((g) => g.y + g.h));
      rects.push({
        x: x0 / w,
        y: y0 / h,
        width: Math.max(0.002, (x1 - x0) / w),
        height: Math.max(0.002, (y1 - y0) / h),
      });
    };
    for (let i = 1; i < row.length; i++) {
      const prev = run[run.length - 1];
      const g = row[i];
      const gap = g.x - (prev.x + prev.w);
      if (gap > Math.max(8, prev.h * 0.9)) {
        flush();
        run = [g];
      } else {
        run.push(g);
      }
    }
    flush();
  }
  return rects;
}

export function textFromGlyphs(glyphs: PdfGlyph[]): string {
  return joinPageText(glyphs);
}

export function pickFromGlyphs(
  glyphs: PdfGlyph[],
  index: PdfTextIndex,
  layer: HTMLElement,
): {
  text: string;
  rects: TextRect[];
  screen: { x: number; y: number };
  sentence?: string;
} | null {
  const text = textFromGlyphs(glyphs).trim();
  if (!text) return null;
  const rects = mergeGlyphRects(glyphs, index.width, index.height);
  if (!rects.length) return null;
  const layerRect = layer.getBoundingClientRect();
  const first = glyphs[0];
  const last = glyphs[glyphs.length - 1];
  const sentence = sentenceAroundText(index.pageText, text);
  return {
    text,
    rects,
    screen: {
      x: layerRect.left + first.x + Math.min(last.x + last.w - first.x, first.w + 48) / 2,
      y: layerRect.top + first.y,
    },
    sentence:
      sentence && sentence.toLowerCase() !== text.toLowerCase()
        ? sentence
        : sentence || text,
  };
}
