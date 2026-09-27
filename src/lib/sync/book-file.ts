import type { BookMeta } from "@/lib/types";
import * as local from "@/lib/storage/local";
import {
  backupToCloudDisks,
  bookFileName,
  bookMime,
  downloadCloudPick,
  downloadFromCloudDisks,
  listCloudBooks,
  type CloudPick,
} from "@/lib/cloud/disks";
import { connectedProviders, type CloudProvider } from "@/lib/cloud/session";
import { ensureDriveToken, isDriveConnected } from "@/lib/storage/drive";

export async function ensureLocalBookFile(book: BookMeta): Promise<boolean> {
  if (await local.hasLocalBookFile(book.id)) {
    if (book.missingLocalFile) {
      await local.saveBook({ ...book, missingLocalFile: false });
    }
    return true;
  }

  const got = await downloadFromCloudDisks(book);
  if (!got) return false;

  const file = new File([got.blob], bookFileName(book), {
    type: got.blob.type || bookMime(book),
  });
  await local.savePdfBlob(book.id, file);
  await local.saveBook({
    ...book,
    missingLocalFile: false,
    hasCloudFile: true,
    cloudProvider: got.provider,
    cloudFileId: got.fileId,
    driveFileId:
      got.provider === "gdrive" ? got.fileId : book.driveFileId,
    sizeBytes: got.blob.size || book.sizeBytes,
  });
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

async function pool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (!items.length) return;
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const item = items[i++];
        if (item !== undefined) await fn(item);
      }
    }),
  );
}

/** Files pulled back per sync; the rest restore lazily when opened. */
const RESTORE_BATCH = 25;

export type FileRestoreProgress = {
  done: number;
  total: number;
  title?: string;
};

export async function restoreMissingBookFiles(
  onProgress?: (p: FileRestoreProgress) => void,
  shouldStop?: () => boolean,
): Promise<number> {
  const books = await local.listBooks();
  const missing: BookMeta[] = [];
  for (const book of books) {
    if (await local.hasLocalBookFile(book.id)) continue;
    if (!local.hasCloudBookCopy(book)) continue;
    missing.push(book);
  }
  // Most recently opened first, so a big library restores what matters now.
  // The rest come back on open, which no longer needs a fresh sign-in.
  missing.sort(
    (a, b) => Date.parse(b.openedAt ?? "") - Date.parse(a.openedAt ?? ""),
  );
  missing.splice(RESTORE_BATCH);
  const total = missing.length;
  onProgress?.({ done: 0, total });
  if (!total) return 0;
  const needsDrive = missing.some(
    (b) => b.cloudProvider === "gdrive" || Boolean(b.driveFileId),
  );
  if (needsDrive && isDriveConnected()) {
    await ensureDriveToken().catch(() => undefined);
  }
  let n = 0;
  let completed = 0;
  await pool(missing, 2, async (book) => {
    if (shouldStop?.()) return;
    onProgress?.({ done: completed, total, title: book.title });
    try {
      if (await ensureLocalBookFile(book)) n += 1;
    } catch (e) {
      console.warn("[etagere] restore file", book.id, e);
    }
    completed += 1;
    onProgress?.({ done: completed, total, title: book.title });
  });
  return n;
}

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
      const file = await downloadCloudPick(provider, pick);
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
        sizeBytes: file.size,
        tags: [],
        collectionIds: [],
        readingStatus: "none",
        missingLocalFile: false,
        hasCloudFile: true,
        cloudProvider: provider,
        cloudFileId: pick.id,
        driveFileId: provider === "gdrive" ? pick.id : undefined,
        openedAt: now,
      };
      await local.savePdfBlob(id, file);
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
