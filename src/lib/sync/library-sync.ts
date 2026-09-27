import type { RecordModel } from "pocketbase";
import { getPb } from "@/lib/pb";
import type {
  BookAnnotations,
  BookMeta,
  Collection,
  ReadingStatus,
} from "@/lib/types";
import * as local from "@/lib/storage/local";
import {
  recoverBooksFromConnectedDisks,
  restoreMissingBookFiles,
} from "@/lib/sync/book-file";

export type SyncStatus = "idle" | "syncing" | "ok" | "error" | "offline";

export type SyncProgress = {
  phase: "catalog" | "files" | "recover";
  done: number;
  total: number;
  title?: string;
} | null;

type SyncListener = (
  status: SyncStatus,
  message?: string,
  progress?: SyncProgress,
) => void;

const listeners = new Set<SyncListener>();
let status: SyncStatus = "idle";
let lastError: string | undefined;
let progress: SyncProgress = null;
let syncInFlight: Promise<void> | null = null;
let cancelRequested = false;

/** Ask the running sync to stop at the next checkpoint. */
export function cancelSync(): void {
  if (!syncInFlight) return;
  cancelRequested = true;
}

function stopRequested(): boolean {
  return cancelRequested;
}

/** Thrown at a checkpoint to unwind the sync; handled as a clean stop. */
const CANCELLED = Symbol("sync-cancelled");

function checkpoint(): void {
  if (cancelRequested) throw CANCELLED;
}
let pushTimer: ReturnType<typeof setTimeout> | null = null;
const pendingBookIds = new Set<string | "*">();

export function getSyncStatus(): SyncStatus {
  return status;
}

export function getSyncError(): string | undefined {
  return lastError;
}

export function getSyncProgress(): SyncProgress {
  return progress;
}

export function subscribeSync(listener: SyncListener): () => void {
  listeners.add(listener);
  listener(status, lastError, progress);
  return () => listeners.delete(listener);
}

function emit() {
  for (const l of listeners) l(status, lastError, progress);
}

function setStatus(next: SyncStatus, message?: string) {
  status = next;
  lastError = message;
  if (next !== "syncing") progress = null;
  emit();
}

function setProgress(next: NonNullable<SyncProgress>) {
  status = "syncing";
  progress = next;
  emit();
}

function authedUserId(): string | null {
  const pb = getPb();
  if (!pb.authStore.isValid || !pb.authStore.record?.id) return null;
  return pb.authStore.record.id;
}

type CloudBook = RecordModel & {
  title?: string;
  author?: string;
  format?: string;
  page_count?: number;
  last_page?: number;
  tags?: string[] | null;
  local_id?: string;
  content_hash?: string;
  drive_file_id?: string;
  reading_status?: ReadingStatus;
  collection_ids?: string[] | null;
  size_bytes?: number;
  added_at?: string;
  meta_updated_at?: string;
  cloud_provider?: string;
  cloud_file_id?: string;
};

type CloudCollection = RecordModel & {
  local_id?: string;
  name?: string;
  created_at?: string;
};

type CloudAnnotation = RecordModel & {
  book?: string;
  data?: BookAnnotations;
};

function newer(a?: string, b?: string): boolean {
  const ta = a ? new Date(a).getTime() : 0;
  const tb = b ? new Date(b).getTime() : 0;
  return ta >= tb;
}

function mergeIds(remote?: string[] | null, localIds?: string[]): string[] {
  const localList = localIds ?? [];
  if (!Array.isArray(remote) || remote.length === 0) return localList;
  return [...new Set([...remote, ...localList])];
}

function cloudBookToLocal(
  row: CloudBook,
  existing?: BookMeta,
): BookMeta {
  const localId = existing?.id || row.local_id || crypto.randomUUID();
  const now = new Date().toISOString();
  return {
    id: localId,
    title: row.title || existing?.title || "Book",
    author: row.author || existing?.author,
    format: (row.format as BookMeta["format"]) || existing?.format || "pdf",
    pageCount: row.page_count || existing?.pageCount || 1,
    coverDataUrl: existing?.coverDataUrl,
    localFileKey: localId,
    lastPage: row.last_page || existing?.lastPage || 1,
    addedAt: row.added_at || existing?.addedAt || now,
    updatedAt: row.meta_updated_at || existing?.updatedAt || now,
    sizeBytes: row.size_bytes || existing?.sizeBytes || 0,
    tags: mergeIds(row.tags, existing?.tags),
    collectionIds: mergeIds(row.collection_ids, existing?.collectionIds),
    readingStatus:
      (row.reading_status as ReadingStatus) ||
      existing?.readingStatus ||
      "none",
    contentHash: row.content_hash || existing?.contentHash,
    cloudId: row.id,
    driveFileId: row.drive_file_id || existing?.driveFileId,
    cloudProvider:
      (row.cloud_provider as BookMeta["cloudProvider"]) ||
      existing?.cloudProvider,
    cloudFileId: row.cloud_file_id || existing?.cloudFileId,
    hasCloudFile: Boolean(
      row.drive_file_id ||
        row.cloud_file_id ||
        existing?.driveFileId ||
        existing?.cloudFileId,
    ),
    missingLocalFile: existing ? Boolean(existing.missingLocalFile) : true,
    openedAt: existing?.openedAt,
    syncedAt: now,
  };
}

function localToCloudPayload(book: BookMeta, userId: string) {
  return {
    user: userId,
    title: book.title,
    author: book.author || "",
    format: book.format,
    page_count: book.pageCount,
    last_page: book.lastPage,
    tags: book.tags,
    local_id: book.id,
    content_hash: book.contentHash || "",
    drive_file_id: book.driveFileId || "",
    cloud_provider: book.cloudProvider || "",
    cloud_file_id: book.cloudFileId || "",
    reading_status: book.readingStatus || "none",
    collection_ids: book.collectionIds,
    size_bytes: book.sizeBytes,
    added_at: book.addedAt,
    meta_updated_at: book.updatedAt,
  };
}

async function findCloudBook(
  userId: string,
  book: BookMeta,
): Promise<CloudBook | null> {
  const pb = getPb();
  if (book.cloudId) {
    try {
      return (await pb.collection("books").getOne(book.cloudId)) as CloudBook;
    } catch {
      /* fall through */
    }
  }
  if (book.contentHash) {
    try {
      return (await pb
        .collection("books")
        .getFirstListItem(
          `user = "${userId}" && content_hash = "${book.contentHash}"`,
        )) as CloudBook;
    } catch {
      /* fall through */
    }
  }
  if (book.driveFileId) {
    try {
      return (await pb
        .collection("books")
        .getFirstListItem(
          `user = "${userId}" && drive_file_id = "${book.driveFileId}"`,
        )) as CloudBook;
    } catch {
      /* fall through */
    }
  }
  try {
    return (await pb
      .collection("books")
      .getFirstListItem(`user = "${userId}" && local_id = "${book.id}"`)) as CloudBook;
  } catch {
    return null;
  }
}

export async function pushBook(bookId: string): Promise<void> {
  const userId = authedUserId();
  if (!userId) return;
  const book = await local.getBook(bookId);
  if (!book) return;

  const pb = getPb();
  const existing = await findCloudBook(userId, book);
  const payload = localToCloudPayload(book, userId);

  let cloud: CloudBook;
  if (existing) {
    if (
      existing.meta_updated_at &&
      !newer(book.updatedAt, existing.meta_updated_at)
    ) {
      const diskPatch = {
        drive_file_id: book.driveFileId || existing.drive_file_id || "",
        cloud_provider: book.cloudProvider || existing.cloud_provider || "",
        cloud_file_id: book.cloudFileId || existing.cloud_file_id || "",
      };
      if (
        diskPatch.drive_file_id !== (existing.drive_file_id || "") ||
        diskPatch.cloud_file_id !== (existing.cloud_file_id || "")
      ) {
        await pb.collection("books").update(existing.id, diskPatch);
      }
      if (!book.cloudId) {
        await local.saveBook({ ...book, cloudId: existing.id });
      }
      const ann = await local.getAnnotations(bookId);
      await pushAnnotationsForCloudBook(
        userId,
        existing.id,
        ann,
        book.updatedAt,
      );
      return;
    }
    cloud = (await pb.collection("books").update(existing.id, payload)) as CloudBook;
  } else {
    cloud = (await pb.collection("books").create(payload)) as CloudBook;
  }

  const latest = (await local.getBook(bookId)) ?? book;
  await local.saveBook({
    ...latest,
    cloudId: cloud.id,
    syncedAt: new Date().toISOString(),
    driveFileId: latest.driveFileId || book.driveFileId,
    cloudProvider: latest.cloudProvider || book.cloudProvider,
    cloudFileId: latest.cloudFileId || book.cloudFileId,
    hasCloudFile: Boolean(
      latest.hasCloudFile ||
        book.hasCloudFile ||
        latest.cloudFileId ||
        latest.driveFileId,
    ),
  });

  const ann = await local.getAnnotations(bookId);
  await pushAnnotationsForCloudBook(userId, cloud.id, ann, book.updatedAt);
}

async function pushAnnotationsForCloudBook(
  userId: string,
  cloudBookId: string,
  data: BookAnnotations,
  localUpdatedAt: string,
): Promise<void> {
  const pb = getPb();
  let row: CloudAnnotation | null = null;
  try {
    row = (await pb
      .collection("annotations")
      .getFirstListItem(`book = "${cloudBookId}"`)) as CloudAnnotation;
  } catch {
    row = null;
  }

  if (row) {
    const cloudUpdated = (row.updated as string) || "";
    if (cloudUpdated && !newer(localUpdatedAt, cloudUpdated)) return;
    await pb.collection("annotations").update(row.id, { data });
  } else {
    await pb.collection("annotations").create({
      user: userId,
      book: cloudBookId,
      data,
    });
  }
}

export async function pushAnnotations(bookId: string): Promise<void> {
  const userId = authedUserId();
  if (!userId) return;
  const book = await local.getBook(bookId);
  if (!book?.cloudId) {
    await pushBook(bookId);
    return;
  }
  const ann = await local.getAnnotations(bookId);
  await pushAnnotationsForCloudBook(
    userId,
    book.cloudId,
    ann,
    book.updatedAt,
  );
}

export async function pushCollections(): Promise<void> {
  const userId = authedUserId();
  if (!userId) return;
  const pb = getPb();
  const localCols = await local.listCollections();
  const cloudList = await pb.collection("library_collections").getFullList<CloudCollection>({
    filter: `user = "${userId}"`,
  });
  const byLocal = new Map(cloudList.map((c) => [c.local_id, c]));

  for (const col of localCols) {
    const existing = byLocal.get(col.id);
    const payload = {
      user: userId,
      local_id: col.id,
      name: col.name,
      created_at: col.createdAt,
    };
    if (existing) {
      if (existing.name !== col.name) {
        await pb.collection("library_collections").update(existing.id, payload);
      }
      byLocal.delete(col.id);
    } else {
      await pb.collection("library_collections").create(payload);
    }
  }

  // Soft: do not delete cloud collections that vanished locally in MVP
  // (avoids wipe from a fresh empty device).
}

export async function deleteCloudBook(book: BookMeta): Promise<void> {
  const userId = authedUserId();
  if (!userId) return;
  const pb = getPb();
  const cloud = await findCloudBook(userId, book);
  if (!cloud) return;
  try {
    await pb.collection("books").delete(cloud.id);
  } catch {
    /* ignore */
  }
}

/** Full pull + merge, then push local-only changes. */
export async function pullAndMerge(): Promise<void> {
  const userId = authedUserId();
  if (!userId) {
    setStatus("offline");
    return;
  }
  if (syncInFlight) return syncInFlight;

  cancelRequested = false;
  syncInFlight = (async () => {
    setStatus("syncing");
    setProgress({ phase: "catalog", done: 0, total: 0 });
    try {
      const pb = getPb();
      const [cloudBooks, cloudCols, localBooks, localCols] = await Promise.all([
        pb.collection("books").getFullList<CloudBook>({
          filter: `user = "${userId}"`,
        }),
        pb.collection("library_collections").getFullList<CloudCollection>({
          filter: `user = "${userId}"`,
        }),
        local.listBooks(),
        local.listCollections(),
      ]);

      // Collections: merge by local_id
      const localColById = new Map(localCols.map((c) => [c.id, c]));
      for (const row of cloudCols) {
        const id = row.local_id || row.id;
        if (!localColById.has(id)) {
          const col: Collection = {
            id,
            name: row.name || "Collection",
            createdAt: row.created_at || new Date().toISOString(),
          };
          await local.saveCollection(col);
          localColById.set(id, col);
        }
      }

      const byHash = new Map(
        localBooks.filter((b) => b.contentHash).map((b) => [b.contentHash!, b]),
      );
      const byDrive = new Map(
        localBooks.filter((b) => b.driveFileId).map((b) => [b.driveFileId!, b]),
      );
      const byLocalId = new Map(localBooks.map((b) => [b.id, b]));
      const byCloudId = new Map(
        localBooks.filter((b) => b.cloudId).map((b) => [b.cloudId!, b]),
      );

      for (const row of cloudBooks) {
        let match =
          (row.id && byCloudId.get(row.id)) ||
          (row.content_hash && byHash.get(row.content_hash)) ||
          (row.drive_file_id && byDrive.get(row.drive_file_id)) ||
          (row.local_id && byLocalId.get(row.local_id)) ||
          undefined;

        const cloudNewer =
          !match || newer(row.meta_updated_at, match.updatedAt);
        const bookId = match?.id || row.local_id || crypto.randomUUID();
        const fileMissing = !(await local.hasLocalBookFile(bookId));

        if (!match) {
          const stub = cloudBookToLocal(row);
          stub.id = bookId;
          stub.localFileKey = bookId;
          stub.missingLocalFile = fileMissing;
          const latest = await local.getBook(bookId);
          stub.coverDataUrl = latest?.coverDataUrl || stub.coverDataUrl;
          await local.saveBook(stub);
          match = stub;
        } else if (cloudNewer) {
          const merged = cloudBookToLocal(row, match);
          merged.missingLocalFile = fileMissing;
          const latest = await local.getBook(match.id);
          merged.coverDataUrl =
            latest?.coverDataUrl || match.coverDataUrl || merged.coverDataUrl;
          await local.saveBook(merged);
          match = merged;
        } else {
          const patch = {
            ...match,
            cloudId: match.cloudId || row.id,
            missingLocalFile: fileMissing,
            hasCloudFile: Boolean(
              row.drive_file_id ||
                row.cloud_file_id ||
                match.driveFileId ||
                match.cloudFileId,
            ),
            cloudProvider:
              (row.cloud_provider as BookMeta["cloudProvider"]) ||
              match.cloudProvider,
            cloudFileId: row.cloud_file_id || match.cloudFileId,
          };
          if (
            patch.cloudId !== match.cloudId ||
            patch.missingLocalFile !== match.missingLocalFile ||
            patch.hasCloudFile !== match.hasCloudFile
          ) {
            await local.saveBook(patch);
          }
          match = patch;
        }

        // Annotations
        try {
          const annRow = (await pb
            .collection("annotations")
            .getFirstListItem(`book = "${row.id}"`)) as CloudAnnotation;
          const remote = annRow.data;
          if (remote && typeof remote === "object") {
            const localAnn = await local.getAnnotations(match.id);
            const remoteUpdated = (annRow.updated as string) || row.meta_updated_at || "";
            const localHas =
              localAnn.highlights.length +
                localAnn.bookmarks.length +
                localAnn.notes.length +
                localAnn.quotes.length +
                localAnn.ink.length +
                (localAnn.texts?.length ?? 0) >
              0;
            if (!localHas || newer(remoteUpdated, match.updatedAt)) {
              await local.putAnnotations(match.id, {
                highlights: remote.highlights ?? [],
                bookmarks: remote.bookmarks ?? [],
                quotes: remote.quotes ?? [],
                notes: remote.notes ?? [],
                ink: remote.ink ?? [],
                texts: remote.texts ?? [],
                flashcards: remote.flashcards ?? [],
                chat: remote.chat ?? [],
              });
            }
          }
        } catch {
          /* no annotations */
        }
      }

      checkpoint();
      await pushCollections();
      const refreshed = await local.listBooks();
      for (const book of refreshed) {
        checkpoint();
        await pushBook(book.id);
      }
      checkpoint();
      setProgress({ phase: "files", done: 0, total: 0 });
      await local.evictStaleBookFiles();
      await restoreMissingBookFiles((p) => {
        setProgress({ phase: "files", ...p });
      }, stopRequested);
      checkpoint();
      const afterRestore = await local.listBooks();
      if (afterRestore.length === 0 && cloudBooks.length === 0) {
        setProgress({ phase: "recover", done: 0, total: 0 });
        await recoverBooksFromConnectedDisks((p) => {
          setProgress({ phase: "recover", ...p });
        }, stopRequested);
      }

      setStatus("ok");
    } catch (e) {
      if (e === CANCELLED || isAbortLike(e)) {
        progress = null;
        setStatus("idle");
        return;
      }
      console.error("[library-sync]", e);
      setStatus(
        "error",
        e instanceof Error ? e.message : "Sync failed",
      );
    } finally {
      syncInFlight = null;
      cancelRequested = false;
    }
  })();

  return syncInFlight;
}

function isAbortLike(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const msg = e.message.toLowerCase();
  return (
    e.name === "AbortError" ||
    msg.includes("autocancelled") ||
    msg.includes("aborted")
  );
}

/** Debounced push after local edits. */
export function scheduleSync(bookId?: string): void {
  if (!authedUserId()) return;
  pendingBookIds.add(bookId || "*");
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void flushPendingPush();
  }, 1500);
}

async function flushPendingPush(): Promise<void> {
  const userId = authedUserId();
  if (!userId) return;
  // Wait out a full pull so we don't race and abort PB requests.
  if (syncInFlight) {
    try {
      await syncInFlight;
    } catch {
      /* pull error already recorded */
    }
  }
  const ids = [...pendingBookIds];
  pendingBookIds.clear();
  if (!ids.length) return;
  setStatus("syncing");
  try {
    if (ids.includes("*")) {
      await pushCollections();
      const books = await local.listBooks();
      for (const b of books) {
        await pushBook(b.id);
      }
    } else {
      await pushCollections();
      for (const id of ids) {
        if (id !== "*") await pushBook(id);
      }
    }
    setStatus("ok");
  } catch (e) {
    if (isAbortLike(e)) {
      // Benign race — retry once shortly.
      for (const id of ids) pendingBookIds.add(id);
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = setTimeout(() => {
        void flushPendingPush();
      }, 800);
      return;
    }
    console.error("[library-sync] push", e);
    setStatus("error", e instanceof Error ? e.message : "Sync failed");
  }
}

export async function runFullSync(): Promise<void> {
  await pullAndMerge();
}
