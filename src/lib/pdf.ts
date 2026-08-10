import type { PDFDocumentProxy } from "pdfjs-dist";

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
