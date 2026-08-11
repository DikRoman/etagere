import type { Locale, TocItem } from "./types";
import type { PDFDocumentProxy } from "pdfjs-dist";

export async function stubTranslate(
  text: string,
  targetLocale: Locale,
): Promise<string> {
  const res = await fetch("/api/ai/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, targetLocale }),
  });
  const data = (await res.json()) as { result: string };
  return data.result;
}

export async function stubSummarize(
  text: string,
  locale: Locale,
): Promise<string> {
  const res = await fetch("/api/ai/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, locale }),
  });
  const data = (await res.json()) as { result: string };
  return data.result;
}

export async function stubChat(
  question: string,
  bookTitle: string,
  context: string,
  locale: Locale,
): Promise<string> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, bookTitle, context, locale }),
  });
  const data = (await res.json()) as { result: string };
  return data.result;
}

export async function stubFlashcards(
  snippets: string[],
  locale: Locale,
): Promise<{ front: string; back: string }[]> {
  const res = await fetch("/api/ai/flashcards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ snippets, locale }),
  });
  const data = (await res.json()) as { cards: { front: string; back: string }[] };
  return data.cards;
}

export async function getPdfOutline(
  pdf: PDFDocumentProxy,
): Promise<TocItem[]> {
  const outline = await pdf.getOutline();
  if (!outline?.length) return [];

  async function destToPage(dest: unknown): Promise<number> {
    try {
      let d = dest;
      if (typeof d === "string") {
        d = await pdf.getDestination(d);
      }
      if (!Array.isArray(d) || !d[0]) return 1;
      const idx = await pdf.getPageIndex(d[0] as Parameters<PDFDocumentProxy["getPageIndex"]>[0]);
      return idx + 1;
    } catch {
      return 1;
    }
  }

  async function mapItems(
    items: { title: string; dest: unknown; items?: unknown[] }[],
  ): Promise<TocItem[]> {
    const out: TocItem[] = [];
    for (const it of items) {
      const page = await destToPage(it.dest);
      const children = it.items?.length
        ? await mapItems(it.items as { title: string; dest: unknown; items?: unknown[] }[])
        : undefined;
      out.push({ title: it.title, page, children });
    }
    return out;
  }

  return mapItems(outline as { title: string; dest: unknown; items?: unknown[] }[]);
}

export async function searchPdf(
  pdf: PDFDocumentProxy,
  query: string,
  maxPages = 200,
): Promise<{ page: number; snippet: string }[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: { page: number; snippet: string }[] = [];
  const n = Math.min(pdf.numPages, maxPages);
  for (let p = 1; p <= n; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const text = content.items
      .map((it) => ("str" in it ? it.str : ""))
      .join(" ");
    const lower = text.toLowerCase();
    const idx = lower.indexOf(q);
    if (idx >= 0) {
      const start = Math.max(0, idx - 40);
      const end = Math.min(text.length, idx + q.length + 60);
      results.push({
        page: p,
        snippet: `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`,
      });
      if (results.length >= 40) break;
    }
  }
  return results;
}
