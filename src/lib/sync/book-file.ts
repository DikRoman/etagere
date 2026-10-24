import type { BookMeta } from "@/lib/types";
import type { DownloadProgress } from "@/lib/fetch-progress";
import * as local from "@/lib/storage/local";
import {
  backupToCloudDisks,
  bookFileName,
  bookMime,
  downloadFromCloudDisks,
  listCloudBooks,
  type CloudPick,
} from "@/lib/cloud/disks";
import { connectedProviders, type CloudProvider } from "@/lib/cloud/session";
import { coverFromStoredFile, isUsableCover } from "@/lib/book-cover";
import { extractCoverDataUrl, loadPdf } from "@/lib/pdf";

/**
 * A book that arrived as metadata only — from another device, or listed off a
 * disk — may lack a cover and an accurate page count. Read both from the file
 * once it is here; the reader sizes the PDF by pageCount, so a stub's
 * placeholder of 1 would otherwise show a single page.
 */
async function metaFromFile(book: BookMeta): Promise<Partial<BookMeta>> {
  const patch: Partial<BookMeta> = {};
  const needCover = !isUsableCover(book.coverDataUrl);
  try {
    if (book.format === "pdf") {
      const blob = await local.getPdfBlob(book.id);
      if (!blob) return patch;
      const pdf = await loadPdf(await blob.arrayBuffer());
      try {
        if (pdf.numPages && pdf.numPages !== book.pageCount) {
          patch.pageCount = pdf.numPages;
        }
        if (needCover) {
          const cover = await extractCoverDataUrl(pdf);
          if (cover) patch.coverDataUrl = cover;
        }
      } finally {
        await pdf.cleanup();
      }
    } else if (needCover) {
      const cover = await coverFromStoredFile(book);
      if (cover) patch.coverDataUrl = cover;
    }
  } catch (e) {
    console.warn("[etagere] read meta from file", book.id, e);
  }
  return patch;
}

export async function ensureLocalBookFile(
  book: BookMeta,
  onProgress?: DownloadProgress,
): Promise<boolean> {
  if (await local.hasLocalBookFile(book.id)) {
    if (book.missingLocalFile) {
      await local.saveBook({ ...book, missingLocalFile: false });
    }
    return true;
  }

  const got = await downloadFromCloudDisks(book, onProgress);
  if (!got) return false;

  const file = new File([got.blob], bookFileName(book), {
    type: got.blob.type || bookMime(book),
  });
  await local.savePdfBlob(book.id, file);
  const saved: BookMeta = {
    ...book,
    missingLocalFile: false,
    hasCloudFile: true,
    cloudProvider: got.provider,
    cloudFileId: got.fileId,
    driveFileId:
      got.provider === "gdrive" ? got.fileId : book.driveFileId,
    sizeBytes: got.blob.size || book.sizeBytes,
  };
  await local.saveBook({ ...saved, ...(await metaFromFile(saved)) });
  return true;
}

export async function backupBookFile(book: BookMeta): Promise<BookMeta> {
  const blob = await local.getPdfBlob(book.id);
  if (!blob || blob.size < 1) return book;
  const ref = await backupToCloudDisks(book, blob);
  if (!ref) return book;
  const next: BookMeta = {
    ...book,
    ...ref,
    driveFileId: ref.driveFileId || book.driveFileId,
    updatedAt: new Date().toISOString(),
  };
  await local.saveBook(next);
  return next;
}

export type FileRestoreProgress = {
  done: number;
  total: number;
  title?: string;
};

export async function recoverBooksFromConnectedDisks(
  onProgress?: (p: FileRestoreProgress) => void,
  shouldStop?: () => boolean,
): Promise<number> {
  const providers = connectedProviders();
  const queue: { provider: CloudProvider; pick: CloudPick }[] = [];
  for (const provider of providers) {
    if (shouldStop?.()) break;
    try {
      const picks = await listCloudBooks(provider);
      const existing = await local.listBooks();
      const known = new Set(
        existing.flatMap((b) =>
          [b.cloudFileId, b.driveFileId].filter((x): x is string => Boolean(x)),
        ),
      );
      for (const pick of picks) {
        if (!known.has(pick.id)) queue.push({ provider, pick });
      }
    } catch (e) {
      console.warn("[etagere] recover disk", provider, e);
    }
  }

  const total = queue.length;
  onProgress?.({ done: 0, total });
  let n = 0;
  for (const { provider, pick } of queue) {
    if (shouldStop?.()) break;
    onProgress?.({ done: n, total, title: pick.name });
    try {
      // Only a card is created here; the file is fetched when the book is
      // opened. Downloading every file on a disk is what made an empty
      // library pull down the whole collection at once.
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const format = pick.name.toLowerCase().endsWith(".epub")
        ? "epub"
        : "pdf";
      const book: BookMeta = {
        id,
        title: pick.name.replace(/\.(pdf|epub)$/i, "") || "Book",
        format,
        pageCount: 1,
        localFileKey: id,
        lastPage: 1,
        addedAt: now,
        updatedAt: now,
        sizeBytes: 0,
        tags: [],
        collectionIds: [],
        readingStatus: "none",
        missingLocalFile: true,
        hasCloudFile: true,
        cloudProvider: provider,
        cloudFileId: pick.id,
        driveFileId: provider === "gdrive" ? pick.id : undefined,
      };
      await local.saveBook(book);
      n += 1;
      onProgress?.({ done: n, total, title: pick.name });
    } catch (e) {
      console.warn("[etagere] recover pick", provider, pick.id, e);
      onProgress?.({ done: n, total, title: pick.name });
    }
  }
  return n;
}
