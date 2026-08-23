import type { BookMeta } from "./types";
import { extractEpubCoverFromBuffer } from "./epub";
import { extractCoverDataUrl, loadPdf } from "./pdf";
import { getPdfBlob } from "./storage/local";

export function isUsableCover(url?: string): boolean {
  return Boolean(url && url.startsWith("data:image/") && url.length > 80);
}

export async function coverFromStoredFile(
  book: BookMeta,
): Promise<string | undefined> {
  const blob = await getPdfBlob(book.id);
  if (!blob) return undefined;
  const asEpub =
    book.format === "epub" ||
    blob.type.includes("epub") ||
    /\.epub$/i.test(book.title);
  try {
    if (asEpub) {
      return await extractEpubCoverFromBuffer(await blob.arrayBuffer());
    }
    const pdf = await loadPdf(await blob.arrayBuffer());
    try {
      return await extractCoverDataUrl(pdf);
    } finally {
      await pdf.cleanup();
    }
  } catch {
    return undefined;
  }
}
