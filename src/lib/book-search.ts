import MiniSearch from "minisearch";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Book } from "epubjs";
import { spineSections } from "./epub";

export interface BookHit {
  page: number;
  snippet: string;
  title?: string;
}

interface PageDoc {
  id: number;
  page: number;
  title: string;
  text: string;
}

type Status = "idle" | "indexing" | "ready" | "error";

interface BookIndex {
  bookId: string;
  status: Status;
  mini: MiniSearch<PageDoc> | null;
  docs: PageDoc[];
  ready: Promise<void>;
}

const cache = new Map<string, BookIndex>();
const listeners = new Map<string, Set<() => void>>();

function notify(bookId: string): void {
  listeners.get(bookId)?.forEach((fn) => fn());
}

export function subscribeBookIndex(bookId: string, fn: () => void): () => void {
  const set = listeners.get(bookId) ?? new Set<() => void>();
  set.add(fn);
  listeners.set(bookId, set);
  return () => {
    set.delete(fn);
    if (!set.size) listeners.delete(bookId);
  };
}

export function bookIndexStatus(bookId: string): Status {
  return cache.get(bookId)?.status ?? "idle";
}

function makeMini(docs: PageDoc[]): MiniSearch<PageDoc> {
  const mini = new MiniSearch<PageDoc>({
    fields: ["text", "title"],
    storeFields: ["page", "title", "text"],
    searchOptions: {
      boost: { title: 2, text: 1 },
      prefix: true,
      fuzzy: 0.2,
      combineWith: "AND",
    },
  });
  mini.addAll(docs.filter((d) => d.text.length > 0));
  return mini;
}

function snippetAround(text: string, query: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  const lower = compact.toLowerCase();
  const needle = query.trim().toLowerCase();
  let idx = needle ? lower.indexOf(needle) : 0;
  if (idx < 0) {
    const first = needle.split(/\s+/)[0] ?? "";
    idx = first ? lower.indexOf(first) : 0;
  }
  if (idx < 0) idx = 0;
  const start = Math.max(0, idx - 42);
  const end = Math.min(compact.length, idx + Math.max(needle.length, 8) + 70);
  const slice = compact.slice(start, end).trim();
  return `${start > 0 ? "…" : ""}${slice}${end < compact.length ? "…" : ""}`;
}

function uniqueHits(hits: BookHit[]): BookHit[] {
  const seen = new Set<string>();
  const out: BookHit[] = [];
  for (const hit of hits) {
    const key = `${hit.page}:${hit.snippet}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
    if (out.length >= 40) break;
  }
  return out;
}

export function searchBook(bookId: string, query: string): BookHit[] {
  const entry = cache.get(bookId);
  const q = query.trim();
  if (!entry?.docs.length || q.length < 2) return [];

  const fromMini: BookHit[] = [];
  if (entry.mini) {
    for (const hit of entry.mini.search(q)) {
      const text = String(hit.text ?? "");
      fromMini.push({
        page: Number(hit.page) || 0,
        title: hit.title ? String(hit.title) : undefined,
        snippet: snippetAround(text, q),
      });
    }
  }

  const lower = q.toLowerCase();
  const fromScan: BookHit[] = [];
  for (const doc of entry.docs) {
    if (!doc.text.toLowerCase().includes(lower)) continue;
    fromScan.push({
      page: doc.page,
      title: doc.title || undefined,
      snippet: snippetAround(doc.text, q),
    });
  }

  return uniqueHits([...fromScan, ...fromMini]);
}

function put(bookId: string, partial: Partial<BookIndex> & { ready: Promise<void> }): BookIndex {
  const prev = cache.get(bookId);
  const next: BookIndex = {
    bookId,
    status: partial.status ?? prev?.status ?? "indexing",
    mini: partial.mini ?? prev?.mini ?? null,
    docs: partial.docs ?? prev?.docs ?? [],
    ready: partial.ready,
  };
  cache.set(bookId, next);
  if (cache.size > 4) {
    const oldest = cache.keys().next().value;
    if (oldest && oldest !== bookId) cache.delete(oldest);
  }
  notify(bookId);
  return next;
}

export function dropBookIndex(bookId: string): void {
  cache.delete(bookId);
  notify(bookId);
}

async function yieldSlice(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

export function indexPdfBook(
  bookId: string,
  pdf: PDFDocumentProxy,
): Promise<void> {
  const existing = cache.get(bookId);
  if (existing && (existing.status === "ready" || existing.status === "indexing")) {
    return existing.ready;
  }
  const job = { ready: Promise.resolve() };
  job.ready = (async () => {
    try {
      const docs: PageDoc[] = [];
      const n = pdf.numPages;
      for (let p = 1; p <= n; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        const text = content.items
          .map((it) => ("str" in it ? it.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        docs.push({ id: p, page: p, title: `p. ${p}`, text });
        if (p % 6 === 0) await yieldSlice();
      }
      put(bookId, {
        status: "ready",
        docs,
        mini: makeMini(docs),
        ready: job.ready,
      });
    } catch {
      put(bookId, { status: "error", docs: [], mini: null, ready: job.ready });
    }
  })();
  put(bookId, { status: "indexing", docs: [], mini: null, ready: job.ready });
  return job.ready;
}

export function indexEpubBook(bookId: string, book: Book): Promise<void> {
  const existing = cache.get(bookId);
  if (existing && (existing.status === "ready" || existing.status === "indexing")) {
    return existing.ready;
  }
  const job = { ready: Promise.resolve() };
  job.ready = (async () => {
    try {
      const docs: PageDoc[] = [];
      const sections = spineSections(book);
      for (const section of sections) {
        let text = "";
        try {
          const raw = await book.archive.getText(section.href);
          if (typeof raw === "string") {
            const doc = new DOMParser().parseFromString(raw, "text/html");
            text = (doc.body?.textContent ?? "").replace(/\s+/g, " ").trim();
          }
        } catch {
          try {
            const loaded = await section.load(book.load.bind(book));
            const doc = loaded as unknown as Document;
            text = (doc.body?.textContent ?? "").replace(/\s+/g, " ").trim();
            section.unload();
          } catch {
            text = "";
          }
        }
        const heading = text.slice(0, 80).replace(/\s+/g, " ").trim();
        docs.push({
          id: section.index + 1,
          page: section.index + 1,
          title: heading || String(section.index + 1),
          text,
        });
        if (section.index % 3 === 0) await yieldSlice();
      }
      put(bookId, {
        status: "ready",
        docs,
        mini: makeMini(docs),
        ready: job.ready,
      });
    } catch {
      put(bookId, { status: "error", docs: [], mini: null, ready: job.ready });
    }
  })();
  put(bookId, { status: "indexing", docs: [], mini: null, ready: job.ready });
  return job.ready;
}

export async function ensureBookIndex(bookId: string): Promise<void> {
  const entry = cache.get(bookId);
  if (entry) await entry.ready;
}
