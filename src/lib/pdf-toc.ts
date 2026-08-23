import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { TocItem } from "./types";

const CONTENTS_HEADING =
  /^(table\s+of\s+)?contents$|^оглавление$|^содержание$|^содержание\s+книги$|^index$/i;

const SKIP_TITLE =
  /^(contents|table of contents|оглавление|содержание|index|page|pages|стр\.?|isbn|www\.|http|oxford university press|\d+)$/i;

type Row = { text: string; x: number; y: number };
type Entry = { title: string; page: number; x: number };

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function pageRows(page: PDFPageProxy): Promise<Row[]> {
  const content = await page.getTextContent();
  type Piece = { x: number; y: number; str: string; width: number };
  const pieces: Piece[] = [];
  for (const item of content.items) {
    if (!("str" in item) || !item.str) continue;
    pieces.push({
      x: item.transform[4],
      y: item.transform[5],
      str: item.str,
      width: "width" in item && typeof item.width === "number" ? item.width : 0,
    });
  }
  if (!pieces.length) return [];

  const rows: { y: number; items: Piece[] }[] = [];
  const threshold = 4;
  pieces.sort((a, b) => b.y - a.y || a.x - b.x);
  for (const piece of pieces) {
    const row = rows.find((r) => Math.abs(r.y - piece.y) < threshold);
    if (row) {
      row.items.push(piece);
      row.y = (row.y * (row.items.length - 1) + piece.y) / row.items.length;
    } else {
      rows.push({ y: piece.y, items: [piece] });
    }
  }
  rows.sort((a, b) => b.y - a.y);
  return rows
    .map((row) => {
      row.items.sort((a, b) => a.x - b.x);
      let text = "";
      let lastEnd = Number.NEGATIVE_INFINITY;
      for (const item of row.items) {
        if (text && item.x - lastEnd > 1.2) text += " ";
        text += item.str;
        lastEnd = item.x + item.width;
      }
      return {
        y: row.y,
        x: row.items[0]?.x ?? 0,
        text: text.replace(/\s+/g, " ").trim(),
      };
    })
    .filter((row) => row.text);
}

function parseEntriesFromLine(text: string, x: number): Entry[] {
  const out: Entry[] = [];
  const re =
    /(.+?)(?:[\s.·•…─—–-]{2,}|\s{2,}|\s+)(\d{1,4})(?=\s{2,}\S|\s*$)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const title = match[1]
      .replace(/[\s.·•…─—–-]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const page = Number(match[2]);
    const entry = makeEntry(title, page, x);
    if (entry) out.push(entry);
  }
  if (out.length) return out;
  const flipped = text.match(/^(\d{1,4})\s+(.{3,})$/);
  if (flipped) {
    const entry = makeEntry(flipped[2]!, Number(flipped[1]), x);
    if (entry) out.push(entry);
  }
  return out;
}

function makeEntry(title: string, page: number, x: number): Entry | null {
  const clean = title.replace(/\s+/g, " ").trim();
  if (!clean || clean.length < 2 || SKIP_TITLE.test(clean)) return null;
  if (/^\d+$/.test(clean)) return null;
  if (page < 1 || page > 2000) return null;
  return { title: clean, page, x };
}

function isContentsHeading(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length > 48) return false;
  return CONTENTS_HEADING.test(trimmed) || /contents|оглавление|содержание/i.test(trimmed);
}

/** Printed contents run forward: page numbers grow as you read down the list. */
function readsLikeContents(entries: Entry[]): boolean {
  const numbered = entries.filter((e) => e.page > 0);
  if (numbered.length < 3) return false;
  let ordered = 0;
  for (let i = 1; i < numbered.length; i++) {
    if (numbered[i]!.page >= numbered[i - 1]!.page) ordered++;
  }
  return ordered / (numbered.length - 1) >= 0.8;
}

function nestByIndent(entries: Entry[]): TocItem[] {
  if (!entries.length) return [];
  const xs = entries.map((e) => e.x).sort((a, b) => a - b);
  const median = xs[Math.floor(xs.length / 2)] ?? 0;
  const step = 10;
  const root: TocItem[] = [];
  const stack: { x: number; item: TocItem }[] = [];

  for (const entry of entries) {
    const item: TocItem = { title: entry.title, page: entry.page };
    const x = entry.x;
    while (stack.length && x <= stack[stack.length - 1]!.x + step) {
      stack.pop();
    }
    if (stack.length && x > median + 6) {
      const parent = stack[stack.length - 1]!.item;
      parent.children = parent.children ?? [];
      parent.children.push(item);
    } else if (stack.length && x > stack[stack.length - 1]!.x + step) {
      const parent = stack[stack.length - 1]!.item;
      parent.children = parent.children ?? [];
      parent.children.push(item);
    } else {
      root.push(item);
      stack.length = 0;
    }
    stack.push({ x, item });
  }
  return root;
}

async function findTitlePdfPage(
  pdf: PDFDocumentProxy,
  title: string,
  fromPage: number,
  toPage: number,
  cache: Map<number, string>,
): Promise<number | null> {
  const needle = normalize(title);
  if (needle.length < 4) return null;
  const words = needle.split(" ").filter((w) => w.length > 1);
  const probe = words.slice(0, 6).join(" ");
  for (let p = fromPage; p <= toPage; p++) {
    let hay = cache.get(p);
    if (hay == null) {
      const page = await pdf.getPage(p);
      const rows = await pageRows(page);
      hay = normalize(rows.map((r) => r.text).join(" "));
      cache.set(p, hay);
    }
    if (hay.includes(needle) || (probe.length >= 6 && hay.includes(probe))) {
      return p;
    }
  }
  return null;
}

async function mapPrintedToPdf(
  pdf: PDFDocumentProxy,
  entries: Entry[],
  lastContentsPage: number,
  cache: Map<number, string>,
): Promise<Entry[]> {
  let labels: string[] | null = null;
  try {
    labels = await pdf.getPageLabels();
  } catch {
    labels = null;
  }
  const byLabel = new Map<string, number>();
  if (labels) {
    labels.forEach((label, i) => {
      const trimmed = label.replace(/^0+/, "") || label;
      if (!byLabel.has(label)) byLabel.set(label, i + 1);
      if (!byLabel.has(trimmed)) byLabel.set(trimmed, i + 1);
    });
  }

  const fromLabel = (printed: number): number | null =>
    byLabel.get(String(printed)) ?? null;

  let offset: number | null = null;
  const searchUntil = Math.min(pdf.numPages, lastContentsPage + 60);
  for (const entry of entries.slice(0, 10)) {
    if (entry.page > 0) {
      const labeled = fromLabel(entry.page);
      if (labeled) {
        offset = labeled - entry.page;
        break;
      }
    }
    const found = await findTitlePdfPage(
      pdf,
      entry.title,
      lastContentsPage + 1,
      searchUntil,
      cache,
    );
    if (found) {
      if (entry.page > 0) offset = found - entry.page;
      break;
    }
  }

  if (offset == null) {
    const numbered = entries.filter((e) => e.page > 0).map((e) => e.page);
    const minPrinted = numbered.length ? Math.min(...numbered) : 1;
    offset = Math.max(0, lastContentsPage + 1 - minPrinted);
  }

  const mapped: Entry[] = [];
  for (const entry of entries) {
    if (entry.page <= 0) {
      const found = await findTitlePdfPage(
        pdf,
        entry.title,
        lastContentsPage + 1,
        searchUntil,
        cache,
      );
      mapped.push({
        ...entry,
        page: found ?? Math.min(pdf.numPages, lastContentsPage + 1),
      });
      continue;
    }
    const labeled = fromLabel(entry.page);
    mapped.push({
      ...entry,
      page:
        labeled ??
        Math.min(pdf.numPages, Math.max(1, entry.page + offset)),
    });
  }
  return mapped;
}

function entriesFromRows(rows: Row[], heading: boolean): Entry[] {
  const entries: Entry[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (isContentsHeading(row.text)) continue;
    const parsed = parseEntriesFromLine(row.text, row.x);
    if (parsed.length) {
      entries.push(...parsed);
      continue;
    }
    const onlyNum = row.text.match(/^(\d{1,4})$/);
    const prev = i > 0 ? rows[i - 1] : null;
    if (onlyNum && prev && !isContentsHeading(prev.text)) {
      const already = parseEntriesFromLine(prev.text, prev.x);
      if (!already.length) {
        const entry = makeEntry(prev.text, Number(onlyNum[1]), prev.x);
        if (entry) entries.push(entry);
      }
    }
  }
  if (heading && entries.length < 3) {
    for (const row of rows) {
      if (isContentsHeading(row.text)) continue;
      if (row.text.length < 3 || SKIP_TITLE.test(row.text)) continue;
      if (/^\d+$/.test(row.text)) continue;
      if (parseEntriesFromLine(row.text, row.x).length) continue;
      entries.push({ title: row.text, page: 0, x: row.x });
    }
  }
  return entries;
}

/** Build a TOC from a printed Contents page when the PDF has no outline bookmarks. */
export async function tocFromPrintedContents(
  pdf: PDFDocumentProxy,
): Promise<TocItem[]> {
  const findWithin = Math.min(pdf.numPages, 12);
  const hardCap = Math.min(pdf.numPages, 20);
  const collected: Entry[] = [];
  let started = false;
  let contentsPages = 0;
  let lastContentsPage = 1;

  for (let p = 1; p <= hardCap; p++) {
    if (!started && p > findWithin) break;
    const page = await pdf.getPage(p);
    const rows = await pageRows(page);
    const heading = rows.slice(0, 8).some((r) => isContentsHeading(r.text));
    const entries = entriesFromRows(rows, heading);
    const isStart = heading && entries.length >= 3;
    const dense = entries.length >= 3 || heading;
    if (!started) {
      if (!isStart) continue;
      started = true;
    } else if (!dense) {
      break;
    }
    collected.push(...entries);
    contentsPages += 1;
    lastContentsPage = p;
    if (contentsPages >= 8) break;
  }

  const unique: Entry[] = [];
  const seen = new Set<string>();
  for (const entry of collected) {
    const key = `${normalize(entry.title)}::${entry.page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }
  if (unique.length < 3 || !readsLikeContents(unique)) return [];

  const mapped = await mapPrintedToPdf(
    pdf,
    unique,
    lastContentsPage,
    new Map<number, string>(),
  );
  return nestByIndent(mapped);
}
