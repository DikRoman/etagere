import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { TocItem } from "./types";
import { linkTargetPage } from "./pdf-dest";

/** A link annotation that points somewhere inside the same document. */
export interface PdfLink {
  /** PDF-space rectangle: [xMin, yMin, xMax, yMax]. */
  rect: [number, number, number, number];
  dest?: unknown;
  url?: string | null;
  unsafeUrl?: string | null;
}

type RawAnnotation = {
  subtype?: string;
  annotationType?: number;
  rect?: number[];
  dest?: unknown;
  url?: string | null;
  unsafeUrl?: string | null;
};

type Piece = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const LINK_FIND_WITHIN = 12;
const MIN_ENTRIES_PER_PAGE = 3;

function normalizeRect(rect: number[]): [number, number, number, number] {
  const [a = 0, b = 0, c = 0, d = 0] = rect;
  return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)];
}

/** Link annotations of a page that stay inside the document. */
export async function getInternalLinks(page: PDFPageProxy): Promise<PdfLink[]> {
  let annotations: RawAnnotation[] = [];
  try {
    annotations = (await page.getAnnotations()) as RawAnnotation[];
  } catch {
    return [];
  }
  const links: PdfLink[] = [];
  for (const a of annotations) {
    const isLink = a.subtype === "Link" || a.annotationType === 2;
    if (!isLink || !Array.isArray(a.rect)) continue;
    const external =
      typeof a.url === "string" && /^(https?|mailto|tel):/i.test(a.url);
    if (external) continue;
    if (a.dest == null && !a.url && !a.unsafeUrl) continue;
    links.push({
      rect: normalizeRect(a.rect),
      dest: a.dest,
      url: a.url ?? null,
      unsafeUrl: a.unsafeUrl ?? null,
    });
  }
  return links;
}

async function pagePieces(page: PDFPageProxy): Promise<Piece[]> {
  const content = await page.getTextContent();
  const pieces: Piece[] = [];
  for (const item of content.items) {
    if (!("str" in item) || !item.str.trim()) continue;
    // Rotated text (margin watermarks, running heads) has no place in a title.
    const [, b = 0, c = 0] = item.transform;
    if (Math.abs(b) > 0.1 || Math.abs(c) > 0.1) continue;
    pieces.push({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      width: "width" in item && typeof item.width === "number" ? item.width : 0,
      height:
        "height" in item && typeof item.height === "number" ? item.height : 10,
    });
  }
  return pieces;
}

function joinPieces(pieces: Piece[]): string {
  const sorted = [...pieces].sort((a, b) => a.x - b.x);
  let text = "";
  let lastEnd = Number.NEGATIVE_INFINITY;
  for (const piece of sorted) {
    if (text && piece.x - lastEnd > 1.2) text += " ";
    text += piece.str;
    lastEnd = piece.x + piece.width;
  }
  return text.replace(/\s+/g, " ").trim();
}

/** Text covered by the link rectangle, falling back to the whole printed line. */
function textForLink(
  link: PdfLink,
  pieces: Piece[],
): { title: string; x: number; y: number } | null {
  const [x1, y1, x2, y2] = link.rect;
  const inRect = pieces.filter((p) => {
    const cy = p.y + p.height * 0.35;
    const cx = p.x + p.width / 2;
    return cy >= y1 - 2 && cy <= y2 + 2 && cx >= x1 - 2 && cx <= x2 + 2;
  });

  const covered = joinPieces(inRect);
  const onlyNumber = /^[\divxlcdm.\s—–-]+$/i.test(covered);
  if (covered && !onlyNumber) {
    const first = [...inRect].sort((a, b) => a.x - b.x)[0];
    return {
      title: cleanTitle(covered),
      x: first?.x ?? x1,
      y: first?.y ?? y2,
    };
  }

  // Some books hyperlink only the page number; take the printed line instead.
  const line = pieces
    .filter((p) => {
      const cy = p.y + p.height * 0.35;
      return cy >= y1 - 3 && cy <= y2 + 3;
    })
    .sort((a, b) => a.x - b.x);
  const run = runNearest(line, x1, x2);
  if (!run.length) return null;
  const lineText = cleanTitle(joinPieces(run));
  if (!lineText) return null;
  return { title: lineText, x: run[0]!.x, y: run[0]!.y };
}

/**
 * Split a printed line into runs separated by wide gaps and pick the one next
 * to the link, so running heads and margin watermarks stay out of the title.
 */
function runNearest(line: Piece[], x1: number, x2: number): Piece[] {
  const GAP = 24;
  const runs: Piece[][] = [];
  for (const piece of line) {
    const current = runs[runs.length - 1];
    const last = current?.[current.length - 1];
    if (!current || !last || piece.x - (last.x + last.width) > GAP) {
      runs.push([piece]);
    } else {
      current.push(piece);
    }
  }
  if (runs.length <= 1) return runs[0] ?? [];

  const endOf = (run: Piece[]) => {
    const last = run[run.length - 1]!;
    return last.x + last.width;
  };

  // The title sits to the left of a linked page number; take the closest run.
  const toTheLeft = runs.filter((run) => endOf(run) <= x1 + 2);
  if (toTheLeft.length) {
    return toTheLeft.reduce((a, b) => (endOf(a) >= endOf(b) ? a : b));
  }

  const overlapping = runs.filter((run) => run[0]!.x <= x2 + GAP);
  return overlapping[0] ?? runs[0] ?? [];
}

function cleanTitle(text: string): string {
  return text
    .replace(/\u0000/g, "")
    // dot leaders followed by an arabic or roman page number
    .replace(/[\s.·•…_]{2,}\s*(?:\d{1,4}|[ivxlcdm]{1,7})\s*$/i, "")
    .replace(/\s+\d{1,4}\s*$/, "")
    .replace(/[\s.·•…_—–-]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

type Entry = { title: string; page: number; x: number; y: number };

const MAX_DEPTH = 3;

/**
 * Indentation on a contents page comes in a few discrete steps; group the
 * entries' left edges into those steps and read each entry's depth from them.
 */
function indentLevels(entries: Entry[]): number[] {
  const xs = [...new Set(entries.map((e) => Math.round(e.x)))].sort(
    (a, b) => a - b,
  );
  const levels: number[] = [];
  for (const x of xs) {
    const last = levels[levels.length - 1];
    if (last == null || x - last > 10) levels.push(x);
  }
  return levels;
}

function nestByIndent(entries: Entry[]): TocItem[] {
  const levels = indentLevels(entries);
  const depthOf = (x: number) => {
    let index = 0;
    let best = Infinity;
    levels.forEach((lx, i) => {
      const d = Math.abs(lx - x);
      if (d < best) {
        best = d;
        index = i;
      }
    });
    return Math.min(index, MAX_DEPTH);
  };

  const root: TocItem[] = [];
  const stack: { depth: number; item: TocItem }[] = [];

  for (const entry of entries) {
    const item: TocItem = { title: entry.title, page: entry.page };
    const depth = depthOf(entry.x);
    while (stack.length && stack[stack.length - 1]!.depth >= depth) {
      stack.pop();
    }
    const parent = stack[stack.length - 1]?.item;
    if (parent) {
      parent.children = parent.children ?? [];
      parent.children.push(item);
    } else {
      root.push(item);
    }
    stack.push({ depth, item });
  }
  return root;
}

function countTextRows(pieces: Piece[]): number {
  const ys: number[] = [];
  for (const piece of pieces) {
    if (!ys.some((y) => Math.abs(y - piece.y) < 4)) ys.push(piece.y);
  }
  return ys.length;
}

/**
 * A Contents page is a list: one linked entry per line, and those entries make
 * up most of the page. Body pages full of citation links are prose, so their
 * links crowd into few lines and leave many lines untouched.
 */
function looksLikeContents(
  entries: Entry[],
  currentPage: number,
  textRows: number,
): boolean {
  if (entries.length < MIN_ENTRIES_PER_PAGE) return false;

  const forward = entries.filter((e) => e.page > currentPage).length;
  if (forward / entries.length < 0.6) return false;

  const targets = new Set(entries.map((e) => e.page));
  if (targets.size < Math.max(2, Math.ceil(entries.length * 0.5))) return false;

  const titled = entries.filter((e) => e.title.length >= 3).length;
  if (titled / entries.length < 0.7) return false;

  const lines: number[] = [];
  for (const entry of entries) {
    if (!lines.some((y) => Math.abs(y - entry.y) < 4)) lines.push(entry.y);
  }
  if (lines.length < entries.length * 0.8) return false;
  return textRows > 0 && lines.length >= textRows * 0.5;
}

/** Linked entries of one page, in printed order, plus why it was accepted. */
export async function scanPageForEntries(
  pdf: PDFDocumentProxy,
  pageNumber: number,
): Promise<{ entries: Entry[]; textRows: number; isContents: boolean }> {
  const page = await pdf.getPage(pageNumber);
  const links = await getInternalLinks(page);
  if (links.length < MIN_ENTRIES_PER_PAGE) {
    return { entries: [], textRows: 0, isContents: false };
  }

  const pieces = await pagePieces(page);
  const targets = await Promise.all(links.map((link) => linkTargetPage(pdf, link)));
  const entries: Entry[] = [];
  for (let i = 0; i < links.length; i++) {
    const target = targets[i];
    const link = links[i]!;
    if (!target) continue;
    const text = textForLink(link, pieces);
    if (!text?.title) continue;
    entries.push({ title: text.title, page: target, x: text.x, y: text.y });
  }
  entries.sort((a, b) => b.y - a.y || a.x - b.x);

  const perLine = oneEntryPerLine(entries);
  const textRows = countTextRows(pieces);
  return {
    entries: perLine,
    textRows,
    isContents: looksLikeContents(perLine, pageNumber, textRows),
  };
}

/**
 * A contents line often carries two links — one on the heading, one on the page
 * number. Keep the most informative one so the list matches what is printed.
 */
function oneEntryPerLine(entries: Entry[]): Entry[] {
  const kept: Entry[] = [];
  for (const entry of entries) {
    const sameLine = kept.findIndex((k) => Math.abs(k.y - entry.y) < 4);
    if (sameLine < 0) {
      kept.push(entry);
      continue;
    }
    const existing = kept[sameLine]!;
    if (entry.title.length > existing.title.length) {
      kept[sameLine] = { ...entry, page: existing.page || entry.page };
    }
  }
  return kept;
}

/**
 * Build a table of contents from the link annotations a publisher already put
 * on the printed Contents page — real destinations, no page-number guessing.
 */
export async function tocFromLinkAnnotations(
  pdf: PDFDocumentProxy,
): Promise<TocItem[]> {
  const hardCap = Math.min(pdf.numPages, 40);
  const findWithin = Math.min(pdf.numPages, LINK_FIND_WITHIN);
  const collected: Entry[] = [];
  let started = false;
  const batch = 3;

  for (let start = 1; start <= hardCap; start += batch) {
    if (!started && start > findWithin) break;
    const end = Math.min(
      start + batch - 1,
      started ? hardCap : findWithin,
    );
    const scans = await Promise.all(
      Array.from({ length: end - start + 1 }, (_, i) =>
        scanPageForEntries(pdf, start + i),
      ),
    );
    let stop = false;
    for (const scan of scans) {
      if (!scan.isContents) {
        if (started) {
          stop = true;
          break;
        }
        continue;
      }
      started = true;
      collected.push(...scan.entries);
    }
    if (stop) break;
  }

  const unique: Entry[] = [];
  const seen = new Set<string>();
  for (const entry of collected) {
    const key = `${entry.title.toLowerCase()}::${entry.page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }
  if (unique.length < MIN_ENTRIES_PER_PAGE) return [];
  return nestByIndent(unique);
}
