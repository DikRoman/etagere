import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TocItem, TocSource } from "./types";
import { tocFromPrintedContents } from "./pdf-toc";
import { tocFromLinkAnnotations } from "./pdf-links";
import { createPageResolver } from "./pdf-dest";

let workerReady = false;

async function pdfjs() {
  const mod = await import("pdfjs-dist");
  if (!workerReady && typeof window !== "undefined") {
    mod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    workerReady = true;
  }
  return mod;
}

export async function loadPdf(
  data: ArrayBuffer | Uint8Array,
): Promise<PDFDocumentProxy> {
  const { getDocument } = await pdfjs();
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return getDocument({ data: bytes }).promise;
}

export async function extractCoverDataUrl(
  pdf: PDFDocumentProxy,
  maxWidth = 280,
): Promise<string | undefined> {
  try {
    const page = await pdf.getPage(1);
    const unscaled = page.getViewport({ scale: 1 });
    const scale = maxWidth / unscaled.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return undefined;
  }
}

export function titleFromFilename(name: string): string {
  return name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim() || "Untitled";
}

type OutlineNode = {
  title: string;
  dest: string | unknown[] | null;
  url: string | null;
  unsafeUrl?: string;
  items: OutlineNode[];
};

function flattenOutline(items: OutlineNode[], out: OutlineNode[]) {
  for (const it of items) {
    out.push(it);
    if (it.items?.length) flattenOutline(it.items, out);
  }
}

function titleOf(it: OutlineNode): string {
  return (it.title || "")
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Table of contents from the document's own outline bookmarks. */
export async function tocFromOutline(
  pdf: PDFDocumentProxy,
): Promise<TocItem[]> {
  const outline = (await pdf.getOutline()) as OutlineNode[] | null;
  if (!outline?.length) return [];
  const pages = createPageResolver(pdf);
  const nodes: OutlineNode[] = [];
  flattenOutline(outline, nodes);
  const resolved = await Promise.all(
    nodes.map(async (it) => {
      const page =
        (await pages.destToPage(it.dest)) ??
        (await pages.urlToPage(it.url)) ??
        (await pages.urlToPage(it.unsafeUrl));
      return [it, page] as const;
    }),
  );
  const pageOf = new Map<OutlineNode, number>();
  for (const [it, page] of resolved) {
    if (page && page >= 1) pageOf.set(it, page);
  }

  function mapItems(items: OutlineNode[], inherited: number): TocItem[] {
    return items
      .map((it) => {
        let page = pageOf.get(it) ?? inherited;
        const children = it.items?.length
          ? mapItems(it.items, page || inherited)
          : undefined;
        if ((!page || page < 1) && children?.[0]) page = children[0].page;
        if (!page || page < 1) page = inherited || 1;
        return {
          title: titleOf(it),
          page,
          children,
        };
      })
      .filter((row) => row.title || row.children?.length)
      .map((row) => ({
        title: row.title || "…",
        page: row.page,
        children: row.children,
      }));
  }

  return mapItems(outline, 1);
}

/** Printed page numbers ("xii", "37") when the document defines them. */
export async function getPdfPageLabels(
  pdf: PDFDocumentProxy,
): Promise<string[] | null> {
  try {
    const labels = await pdf.getPageLabels();
    if (!labels?.length) return null;
    const meaningful = labels.some((label, i) => label !== String(i + 1));
    return meaningful ? labels : null;
  } catch {
    return null;
  }
}

/**
 * Build a table of contents the way established readers do: the document's own
 * bookmarks first, then the publisher's links on the printed Contents page, and
 * only as a last resort our own reading of that page's text.
 */
export async function getPdfToc(
  pdf: PDFDocumentProxy,
): Promise<{ items: TocItem[]; source: TocSource }> {
  try {
    const outline = await tocFromOutline(pdf);
    if (outline.length) return { items: outline, source: "outline" };
  } catch {
    /* damaged outline — fall through */
  }

  try {
    const linked = await tocFromLinkAnnotations(pdf);
    if (linked.length) return { items: linked, source: "links" };
  } catch {
    /* no link annotations */
  }

  try {
    const printed = await tocFromPrintedContents(pdf);
    if (printed.length) return { items: printed, source: "text" };
  } catch {
    /* scanned PDF or empty text layer */
  }

  return { items: [], source: "none" };
}

export function renderPdfTextLayer(
  page: import("pdfjs-dist").PDFPageProxy,
  container: HTMLElement,
  viewport: { width: number; height: number; scale: number },
): { cancel: () => void; done: Promise<void> } {
  let cancelled = false;
  let layer: { cancel: () => void; render: () => Promise<unknown> } | null =
    null;

  const done = (async () => {
    const { TextLayer } = await pdfjs();
    if (cancelled) return;
    const textContent = await page.getTextContent({
      includeMarkedContent: false,
    });
    if (cancelled) return;
    container.replaceChildren();
    container.style.width = `${viewport.width}px`;
    container.style.height = `${viewport.height}px`;
    container.style.setProperty("--scale-factor", String(viewport.scale));
    container.style.setProperty("--user-unit", "1");
    container.style.setProperty(
      "--total-scale-factor",
      String(viewport.scale),
    );
    layer = new TextLayer({
      textContentSource: textContent,
      container,
      viewport: viewport as never,
    });
    try {
      await layer.render();
    } catch {
      /* cancelled or empty page */
    }
  })();

  return {
    cancel: () => {
      cancelled = true;
      layer?.cancel();
    },
    done,
  };
}
