import type { RecordModel } from "pocketbase";
import { getPb } from "@/lib/pb";
import type {
  BookAnnotations,
  BookMeta,
  Collection,
  ReadingStatus,
} from "@/lib/types";
import * as local from "@/lib/storage/local";
import { isUsableCover } from "@/lib/book-cover";
import { recoverBooksFromConnectedDisks } from "@/lib/sync/book-file";

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
let pushInFlight: Promise<void> | null = null;

/**
 * Cancelling bumps the generation. A job remembers the generation it started
 * in; once that is stale its status updates are dropped and its next
 * checkpoint unwinds it. Requests in flight are aborted outright, so the
 * button takes effect at once rather than at the next unit of work.
 */
let generation = 0;
let controller = new AbortController();

function isStale(gen: number): boolean {
  return gen !== generation;
}

/** Signal for sync requests; aborted the moment the reader cancels. */
function currentSignal(): AbortSignal {
  return controller.signal;
}

/** Stop the running sync or push now. */
export function cancelSync(): void {
  if (!syncInFlight && !pushInFlight && status !== "syncing") return;
  generation += 1;
  controller.abort();
  controller = new AbortController();
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  // The work unwinds in the background; the line stops saying "syncing" now.
  progress = null;
  status = "idle";
  lastError = undefined;
  emit();
}

/** Thrown at a checkpoint to unwind a cancelled job; a clean stop. */
const CANCELLED = Symbol("sync-cancelled");

function checkpoint(gen: number): void {
  if (isStale(gen)) throw CANCELLED;
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

function setStatus(next: SyncStatus, message?: string, gen?: number) {
  if (gen !== undefined && isStale(gen)) return;
  status = next;
  lastError = message;
  if (next !== "syncing") progress = null;
  emit();
}

function setProgress(next: NonNullable<SyncProgress>, gen?: number) {
  if (gen !== undefined && isStale(gen)) return;
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
  /** Filename of the small cover image stored with the record. */
  cover?: string;
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
      return (await pb.collection("books").getOne(book.cloudId, { signal: currentSignal() })) as CloudBook;
    } catch (e) {
      if (isAbortLike(e)) throw e;
    }
  }
  if (book.contentHash) {
    try {
      return (await pb
        .collection("books")
        .getFirstListItem(
          `user = "${userId}" && content_hash = "${book.contentHash}"`,
          { signal: currentSignal() },
        )) as CloudBook;
    } catch (e) {
      if (isAbortLike(e)) throw e;
    }
  }
  if (book.driveFileId) {
    try {
      return (await pb
        .collection("books")
        .getFirstListItem(
          `user = "${userId}" && drive_file_id = "${book.driveFileId}"`,
          { signal: currentSignal() },
        )) as CloudBook;
    } catch (e) {
      if (isAbortLike(e)) throw e;
    }
  }
  try {
    return (await pb
      .collection("books")
      .getFirstListItem(`user = "${userId}" && local_id = "${book.id}"`, {
        signal: currentSignal(),
      })) as CloudBook;
  } catch (e) {
    if (isAbortLike(e)) throw e;
    return null;
  }
}

/**
 * Covers travel with the record, so another device can show the shelf
 * without downloading any book file. Uploaded once; replaced only when the
 * cover was regenerated on this device.
 */
async function pushCover(cloud: CloudBook, book: BookMeta): Promise<void> {
  if (!isUsableCover(book.coverDataUrl)) return;
  if (cloud.cover && !book.coverPending) return;
  try {
    const blob = await (await fetch(book.coverDataUrl!)).blob();
    const ext = blob.type.includes("png") ? "png" : "jpg";
    const form = new FormData();
    form.append(
      "cover",
      new File([blob], `cover.${ext}`, { type: blob.type || "image/jpeg" }),
    );
    await getPb()
      .collection("books")
      .update(cloud.id, form, { signal: currentSignal() });
    if (book.coverPending) {
      const latest = (await local.getBook(book.id)) ?? book;
      await local.saveBook({ ...latest, coverPending: false });
    }
  } catch (e) {
    console.warn("[library-sync] cover upload", book.id, e);
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

let fileToken: Promise<string> | null = null;

/** Fetch the server cover for a book that has none on this device. */
async function pullCover(row: CloudBook, book: BookMeta): Promise<BookMeta> {
  if (!row.cover || isUsableCover(book.coverDataUrl)) return book;
  try {
    const pb = getPb();
    // A file token keeps this working if the field is ever made protected.
    fileToken ??= pb.files.getToken().catch(() => "");
    const token = await fileToken;
    const url = pb.files.getURL(row, row.cover, token ? { token } : {});
    const res = await fetch(url, { signal: currentSignal() });
    if (!res.ok) return book;
    const coverDataUrl = await blobToDataUrl(await res.blob());
    if (!isUsableCover(coverDataUrl)) return book;
    const next = { ...book, coverDataUrl };
    await local.saveBook(next);
    return next;
  } catch (e) {
    console.warn("[library-sync] cover download", book.id, e);
    return book;
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
        await pb
          .collection("books")
          .update(existing.id, diskPatch, { signal: currentSignal() });
      }
      if (!book.cloudId) {
        await local.saveBook({ ...book, cloudId: existing.id });
      }
      await pushCover(existing, book);
      const ann = await local.getAnnotations(bookId);
      await pushAnnotationsForCloudBook(
        userId,
        existing.id,
        ann,
        book.updatedAt,
      );
      return;
    }
    cloud = (await pb
      .collection("books")
      .update(existing.id, payload, { signal: currentSignal() })) as CloudBook;
  } else {
    cloud = (await pb
      .collection("books")
      .create(payload, { signal: currentSignal() })) as CloudBook;
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

  await pushCover(cloud, (await local.getBook(bookId)) ?? book);
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
      .getFirstListItem(`book = "${cloudBookId}"`, {
        signal: currentSignal(),
      })) as CloudAnnotation;
  } catch (e) {
    if (isAbortLike(e)) throw e;
    row = null;
  }

  if (row) {
    const cloudUpdated = (row.updated as string) || "";
    if (cloudUpdated && !newer(localUpdatedAt, cloudUpdated)) return;
    await pb
      .collection("annotations")
      .update(row.id, { data }, { signal: currentSignal() });
  } else {
    await pb.collection("annotations").create(
      {
        user: userId,
        book: cloudBookId,
        data,
      },
      { signal: currentSignal() },
    );
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
    signal: currentSignal(),
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
        await pb
          .collection("library_collections")
          .update(existing.id, payload, { signal: currentSignal() });
      }
      byLocal.delete(col.id);
    } else {
      await pb
        .collection("library_collections")
        .create(payload, { signal: currentSignal() });
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

  fileToken = null;
  const gen = generation;
  syncInFlight = (async () => {
    setStatus("syncing", undefined, gen);
    setProgress({ phase: "catalog", done: 0, total: 0 }, gen);
    try {
      const pb = getPb();
      const [cloudBooks, cloudCols, localBooks, localCols] = await Promise.all([
        pb.collection("books").getFullList<CloudBook>({
          filter: `user = "${userId}"`,
          signal: currentSignal(),
        }),
        pb.collection("library_collections").getFullList<CloudCollection>({
          filter: `user = "${userId}"`,
          signal: currentSignal(),
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
        checkpoint(gen);
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

        match = await pullCover(row, match);

        // Annotations
        try {
          const annRow = (await pb
            .collection("annotations")
            .getFirstListItem(`book = "${row.id}"`, {
              signal: currentSignal(),
            })) as CloudAnnotation;
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

      checkpoint(gen);
      await pushCollections();
      const refreshed = await local.listBooks();
      for (const book of refreshed) {
        checkpoint(gen);
        await pushBook(book.id);
      }
      checkpoint(gen);
      // Book files are not downloaded here any more. The shelf needs only
      // metadata and covers; a file comes down when the book is opened, or
      // from "Download from cloud" in the cover menu.
      await local.evictStaleBookFiles();
      checkpoint(gen);
      const afterRestore = await local.listBooks();
      if (afterRestore.length === 0 && cloudBooks.length === 0) {
        setProgress({ phase: "recover", done: 0, total: 0 }, gen);
        await recoverBooksFromConnectedDisks((p) => {
          setProgress({ phase: "recover", ...p }, gen);
        }, () => isStale(gen));
      }

      setStatus("ok", undefined, gen);
    } catch (e) {
      if (isStale(gen)) return; // cancelled: cancelSync already set the line
      if (isAbortLike(e)) {
        setStatus("idle", undefined, gen);
        return;
      }
      console.error("[library-sync]", e);
      setStatus(
        "error",
        e instanceof Error ? e.message : "Sync failed",
        gen,
      );
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

function isAbortLike(e: unknown): boolean {
  if (e === CANCELLED) return true;
  if ((e as { isAbort?: boolean } | null)?.isAbort === true) return true;
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
  const gen = generation;
  setStatus("syncing", undefined, gen);
  const run = (async () => {
    try {
      checkpoint(gen);
      await pushCollections();
      const targets = ids.includes("*")
        ? (await local.listBooks()).map((b) => b.id)
        : ids.filter((id): id is string => id !== "*");
      for (const id of targets) {
        checkpoint(gen);
        await pushBook(id);
      }
      setStatus("ok", undefined, gen);
    } catch (e) {
      // Cancelled by the reader: stop here. Retrying would undo the cancel;
      // the edits are pushed again by the next full sync.
      if (isStale(gen)) return;
      if (isAbortLike(e)) {
        // Benign race with another request — retry once shortly.
        for (const id of ids) pendingBookIds.add(id);
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = setTimeout(() => {
          void flushPendingPush();
        }, 800);
        return;
      }
      console.error("[library-sync] push", e);
      setStatus(
        "error",
        e instanceof Error ? e.message : "Sync failed",
        gen,
      );
    } finally {
      pushInFlight = null;
    }
  })();
  pushInFlight = run;
  await run;
}

export async function runFullSync(): Promise<void> {
  await pullAndMerge();
}
