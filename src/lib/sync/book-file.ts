import type { BookMeta } from "@/lib/types";
import * as local from "@/lib/storage/local";
import {
  backupToCloudDisks,
  bookFileName,
  bookMime,
  downloadFromCloudDisks,
} from "@/lib/cloud/disks";

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
