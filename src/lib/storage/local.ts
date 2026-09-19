import type {
  BookAnnotations,
  BookMeta,
  Bookmark,
  Collection,
  EpubChapter,
  Flashcard,
  Highlight,
  InkStroke,
  MarginText,
  FragmentNote,
  Quote,
  ChatMessage,
  ReadingStatus,
  TocItem,
  TocSource,
} from "../types";

function normalizeAnnotations(
  row: (Partial<BookAnnotations> & { bookId?: string }) | undefined,
): BookAnnotations {
  return {
    highlights: row?.highlights ?? [],
    bookmarks: row?.bookmarks ?? [],
    quotes: row?.quotes ?? [],
    notes: row?.notes ?? [],
    ink: row?.ink ?? [],
    texts: row?.texts ?? [],
    flashcards: row?.flashcards ?? [],
    chat: row?.chat ?? [],
  };
}

function normalizeBook(b: BookMeta): BookMeta {
  return {
    ...b,
    format: b.format ?? "pdf",
    tags: b.tags ?? [],
    collectionIds: b.collectionIds ?? [],
    readingStatus: b.readingStatus ?? "none",
  };
}

const DB_NAME = "bookshelf-db";
const DB_VERSION = 4;
const BOOKS_STORE = "books";
const FILES_STORE = "files";
const ANNOTATIONS_STORE = "annotations";
const EPUB_STORE = "epubChapters";
const COLLECTIONS_STORE = "collections";
const TOC_STORE = "tocCache";
const TOC_CACHE_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function isDbOpen(db: IDBDatabase): boolean {
  try {
    db.transaction(db.objectStoreNames[0] || BOOKS_STORE, "readonly");
    return true;
  } catch {
    return false;
  }
}

function ensureStores(db: IDBDatabase) {
  if (!db.objectStoreNames.contains(BOOKS_STORE)) {
    db.createObjectStore(BOOKS_STORE, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(FILES_STORE)) {
    db.createObjectStore(FILES_STORE);
  }
  if (!db.objectStoreNames.contains(ANNOTATIONS_STORE)) {
    db.createObjectStore(ANNOTATIONS_STORE, { keyPath: "bookId" });
  }
  if (!db.objectStoreNames.contains(EPUB_STORE)) {
    db.createObjectStore(EPUB_STORE);
  }
  if (!db.objectStoreNames.contains(COLLECTIONS_STORE)) {
    db.createObjectStore(COLLECTIONS_STORE, { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains(TOC_STORE)) {
    db.createObjectStore(TOC_STORE);
  }
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise.then((db) => {
      if (isDbOpen(db)) return db;
      dbPromise = null;
      return openDb();
    });
  }

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      ensureStores(req.result);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
    req.onblocked = () => {
      console.warn(
        "[etagere] IndexedDB upgrade is waiting on another tab. Close extra windows of the app.",
      );
    };
  });

  return dbPromise;
}

function hasStore(db: IDBDatabase, name: string): boolean {
  return db.objectStoreNames.contains(name);
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function idbGetAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  if (!hasStore(db, store)) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

function idbKeys(db: IDBDatabase, store: string): Promise<string[]> {
  if (!hasStore(db, store)) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAllKeys();
    req.onsuccess = () =>
      resolve((req.result ?? []).map((key) => String(key)));
    req.onerror = () => reject(req.error);
  });
}

async function recoverOrphanFiles(existing: BookMeta[]): Promise<BookMeta[]> {
  const db = await openDb();
  const [fileKeys, epubKeys] = await Promise.all([
    idbKeys(db, FILES_STORE),
    idbKeys(db, EPUB_STORE),
  ]);
  const fileSet = new Set(fileKeys);
  const epubSet = new Set(epubKeys);
  const recovered: BookMeta[] = [];

  for (const book of existing) {
    const hasFile = fileSet.has(book.id) || epubSet.has(book.id);
    if (book.missingLocalFile && hasFile) {
      const fixed = { ...book, missingLocalFile: false };
      try {
        await saveBook(fixed);
        Object.assign(book, fixed);
      } catch (e) {
        console.error("[etagere] restore local file flag", book.id, e);
      }
    }
  }

  const have = new Set(existing.map((b) => b.id));
  for (const id of new Set([...fileKeys, ...epubKeys])) {
    if (have.has(id)) continue;
    const now = new Date().toISOString();
    const isEpub = epubSet.has(id);
    const book: BookMeta = {
      id,
      title: isEpub ? "EPUB" : "PDF",
      format: isEpub ? "epub" : "pdf",
      pageCount: 1,
      localFileKey: id,
      lastPage: 1,
      addedAt: now,
      updatedAt: now,
      sizeBytes: 0,
      tags: [],
      collectionIds: [],
      readingStatus: "none",
      missingLocalFile: false,
    };
    try {
      await saveBook(book);
      recovered.push(book);
    } catch (e) {
      console.error("[etagere] restore book from file", id, e);
    }
  }
  if (recovered.length) {
    console.warn(
      `[etagere] restored ${recovered.length} book(s) that still had files in IndexedDB`,
    );
  }
  return recovered;
}

export async function listBooks(): Promise<BookMeta[]> {
  const db = await openDb();
  const books = (await idbGetAll<BookMeta>(db, BOOKS_STORE)).map(normalizeBook);
  const recovered = await recoverOrphanFiles(books);
  return [...books, ...recovered].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export async function getBook(id: string): Promise<BookMeta | undefined> {
  const db = await openDb();
  if (!hasStore(db, BOOKS_STORE)) return undefined;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOOKS_STORE, "readonly");
    const req = tx.objectStore(BOOKS_STORE).get(id);
    req.onsuccess = () => {
      const b = req.result as BookMeta | undefined;
      resolve(b ? normalizeBook(b) : undefined);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveBook(book: BookMeta): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(BOOKS_STORE, "readwrite");
  tx.objectStore(BOOKS_STORE).put(normalizeBook(book));
  await txDone(tx);
}

export async function deleteBook(id: string): Promise<void> {
  const db = await openDb();
  const stores = [
    BOOKS_STORE,
    FILES_STORE,
    ANNOTATIONS_STORE,
    EPUB_STORE,
    TOC_STORE,
  ].filter((name) => hasStore(db, name));
  if (!stores.length) return;
  const tx = db.transaction(stores, "readwrite");
  for (const name of stores) tx.objectStore(name).delete(id);
  await txDone(tx);
}

export async function savePdfBlob(bookId: string, blob: Blob): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(FILES_STORE, "readwrite");
  tx.objectStore(FILES_STORE).put(blob, bookId);
  await txDone(tx);
}

export async function getPdfBlob(bookId: string): Promise<Blob | undefined> {
  const db = await openDb();
  if (!hasStore(db, FILES_STORE)) return undefined;
  const read = (key: string) =>
    new Promise<Blob | undefined>((resolve, reject) => {
      const tx = db.transaction(FILES_STORE, "readonly");
      const req = tx.objectStore(FILES_STORE).get(key);
      req.onsuccess = () => resolve(req.result as Blob | undefined);
      req.onerror = () => reject(req.error);
    });
  const direct = await read(bookId);
  if (direct && direct.size > 0) return direct;
  if (!hasStore(db, BOOKS_STORE)) return direct;
  const book = await getBook(bookId);
  if (book?.localFileKey && book.localFileKey !== bookId) {
    const alt = await read(book.localFileKey);
    if (alt && alt.size > 0) return alt;
  }
  return direct;
}

export async function hasLocalBookFile(bookId: string): Promise<boolean> {
  try {
    const blob = await getPdfBlob(bookId);
    return Boolean(blob && blob.size > 0);
  } catch {
    return false;
  }
}

export function hasCloudBookCopy(book: BookMeta): boolean {
  return Boolean(book.hasCloudFile || book.driveFileId || book.cloudFileId);
}

/**
 * Local files are evicted only under real storage pressure, never on a timer.
 * A timer-based TTL used to delete books after five days, which looked like
 * the library losing them at random.
 */
const EVICT_START_RATIO = 0.85;
const EVICT_TARGET_RATIO = 0.7;

async function storageUsage(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === "undefined") return null;
  const estimate = navigator.storage?.estimate;
  if (!estimate) return null;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    if (!usage || !quota) return null;
    return { usage, quota };
  } catch {
    return null;
  }
}

export async function deleteLocalBookFile(book: BookMeta): Promise<void> {
  const db = await openDb();
  const stores = [FILES_STORE, EPUB_STORE, TOC_STORE].filter((name) =>
    hasStore(db, name),
  );
  if (!stores.length) return;
  const keys = [...new Set([book.id, book.localFileKey].filter(Boolean))];
  const tx = db.transaction(stores, "readwrite");
  for (const name of stores) {
    const store = tx.objectStore(name);
    for (const key of keys) store.delete(key);
  }
  await txDone(tx);
}

export async function touchBookOpened(
  bookId: string,
  at = new Date(),
): Promise<void> {
  const book = await getBook(bookId);
  if (!book) return;
  const iso = at.toISOString();
  if (book.openedAt && Date.parse(iso) - Date.parse(book.openedAt) < 60 * 60 * 1000) {
    return;
  }
  await saveBook({ ...book, openedAt: iso });
}

/**
 * Keep the missing-file flags honest, and free space only when the browser is
 * actually close to its quota — least recently opened first, and only for
 * books that still have a copy on a connected disk.
 */
export async function evictStaleBookFiles(at = new Date()): Promise<number> {
  const db = await openDb();
  if (!hasStore(db, BOOKS_STORE)) return 0;
  const books = (await idbGetAll<BookMeta>(db, BOOKS_STORE)).map(normalizeBook);

  const onDisk: BookMeta[] = [];
  for (const book of books) {
    const hasFile = await hasLocalBookFile(book.id);
    if (!hasFile) {
      if (!book.missingLocalFile && hasCloudBookCopy(book)) {
        await saveBook({ ...book, missingLocalFile: true });
      }
      continue;
    }
    let current = book;
    if (book.missingLocalFile) {
      current = { ...current, missingLocalFile: false };
      await saveBook(current);
    }
    if (!current.openedAt) {
      current = { ...current, openedAt: at.toISOString() };
      await saveBook(current);
    }
    if (hasCloudBookCopy(current)) onDisk.push(current);
  }

  const storage = await storageUsage();
  if (!storage) return 0;
  if (storage.usage <= storage.quota * EVICT_START_RATIO) return 0;

  const target = storage.quota * EVICT_TARGET_RATIO;
  const oldestFirst = [...onDisk].sort(
    (a, b) => Date.parse(a.openedAt ?? "") - Date.parse(b.openedAt ?? ""),
  );
  let freed = 0;
  let n = 0;
  for (const book of oldestFirst) {
    if (storage.usage - freed <= target) break;
    await deleteLocalBookFile(book);
    await saveBook({ ...book, missingLocalFile: true });
    freed += book.sizeBytes || 0;
    n += 1;
  }
  return n;
}

export interface EpubBundle {
  chapters: EpubChapter[];
  toc?: TocItem[];
  /** Which parser produced this bundle; older ones get re-read on open. */
  version?: number;
}

export async function saveEpubChapters(
  bookId: string,
  chapters: EpubChapter[],
  toc?: TocItem[],
  version?: number,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(EPUB_STORE, "readwrite");
  const bundle: EpubBundle = { chapters, version };
  if (toc?.length) bundle.toc = toc;
  tx.objectStore(EPUB_STORE).put(bundle, bookId);
  await txDone(tx);
}

export async function getEpubBundle(
  bookId: string,
): Promise<EpubBundle | undefined> {
  const db = await openDb();
  if (!hasStore(db, EPUB_STORE)) return undefined;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(EPUB_STORE, "readonly");
    const req = tx.objectStore(EPUB_STORE).get(bookId);
    req.onsuccess = () => {
      const row = req.result as EpubChapter[] | EpubBundle | undefined;
      if (!row) {
        resolve(undefined);
        return;
      }
      if (Array.isArray(row)) {
        resolve({ chapters: row });
        return;
      }
      resolve({
        chapters: row.chapters ?? [],
        toc: row.toc,
        version: row.version,
      });
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getEpubChapters(
  bookId: string,
): Promise<EpubChapter[] | undefined> {
  return (await getEpubBundle(bookId))?.chapters;
}

export async function saveTocCache(
  bookId: string,
  items: TocItem[],
  source: TocSource,
): Promise<void> {
  if (!items.length) return;
  try {
    const db = await openDb();
    if (!hasStore(db, TOC_STORE)) return;
    const tx = db.transaction(TOC_STORE, "readwrite");
    tx.objectStore(TOC_STORE).put(
      { items, source, v: TOC_CACHE_VERSION },
      bookId,
    );
    await txDone(tx);
  } catch (e) {
    console.warn("[etagere] toc cache write skipped", e);
  }
}

export async function getTocCache(
  bookId: string,
): Promise<{ items: TocItem[]; source: TocSource } | undefined> {
  try {
    const db = await openDb();
    if (!hasStore(db, TOC_STORE)) return undefined;
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(TOC_STORE, "readonly");
      const req = tx.objectStore(TOC_STORE).get(bookId);
      req.onsuccess = () => {
        const row = req.result as
          | { items?: TocItem[]; source?: TocSource; v?: number }
          | undefined;
        if (!row?.items?.length || row.v !== TOC_CACHE_VERSION) {
          resolve(undefined);
          return;
        }
        resolve({ items: row.items, source: row.source ?? "outline" });
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("[etagere] toc cache read skipped", e);
    return undefined;
  }
}

export async function getAnnotations(
  bookId: string,
): Promise<BookAnnotations> {
  const db = await openDb();
  if (!hasStore(db, ANNOTATIONS_STORE)) return normalizeAnnotations(undefined);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ANNOTATIONS_STORE, "readonly");
    const req = tx.objectStore(ANNOTATIONS_STORE).get(bookId);
    req.onsuccess = () => {
      resolve(
        normalizeAnnotations(
          req.result as
            | (Partial<BookAnnotations> & { bookId: string })
            | undefined,
        ),
      );
    };
    req.onerror = () => reject(req.error);
  });
}

export async function listAllAnnotations(): Promise<
  Record<string, BookAnnotations>
> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ANNOTATIONS_STORE, "readonly");
    const req = tx.objectStore(ANNOTATIONS_STORE).getAll();
    req.onsuccess = () => {
      const out: Record<string, BookAnnotations> = {};
      for (const row of req.result as Array<
        Partial<BookAnnotations> & { bookId: string }
      >) {
        if (row?.bookId) out[row.bookId] = normalizeAnnotations(row);
      }
      resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function putAnnotations(
  bookId: string,
  data: BookAnnotations,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(ANNOTATIONS_STORE, "readwrite");
  tx.objectStore(ANNOTATIONS_STORE).put({ bookId, ...data });
  await txDone(tx);
  // Lazy import avoids circular deps with sync <-> local
  void import("../sync/library-sync").then((m) => m.scheduleSync(bookId));
}

export async function addHighlight(h: Highlight): Promise<BookAnnotations> {
  const data = await getAnnotations(h.bookId);
  data.highlights.push(h);
  await putAnnotations(h.bookId, data);
  return data;
}

export async function removeHighlight(
  bookId: string,
  id: string,
): Promise<BookAnnotations> {
  const data = await getAnnotations(bookId);
  data.highlights = data.highlights.filter((x) => x.id !== id);
  await putAnnotations(bookId, data);
  return data;
}

export async function addBookmark(b: Bookmark): Promise<BookAnnotations> {
  const data = await getAnnotations(b.bookId);
  data.bookmarks.push(b);
  await putAnnotations(b.bookId, data);
  return data;
}

export async function removeBookmark(
  bookId: string,
  id: string,
): Promise<BookAnnotations> {
  const data = await getAnnotations(bookId);
  data.bookmarks = data.bookmarks.filter((x) => x.id !== id);
  await putAnnotations(bookId, data);
  return data;
}

export async function addQuote(q: Quote): Promise<BookAnnotations> {
  const data = await getAnnotations(q.bookId);
  data.quotes.push({ ...q, rects: q.rects ?? [] });
  await putAnnotations(q.bookId, data);
  return data;
}

export async function removeQuote(
  bookId: string,
  id: string,
): Promise<BookAnnotations> {
  const data = await getAnnotations(bookId);
  data.quotes = data.quotes.filter((x) => x.id !== id);
  await putAnnotations(bookId, data);
  return data;
}

export async function addFragmentNote(n: FragmentNote): Promise<BookAnnotations> {
  const data = await getAnnotations(n.bookId);
  data.notes.push(n);
  await putAnnotations(n.bookId, data);
  return data;
}

export async function removeFragmentNote(
  bookId: string,
  id: string,
): Promise<BookAnnotations> {
  const data = await getAnnotations(bookId);
  data.notes = data.notes.filter((x) => x.id !== id);
  await putAnnotations(bookId, data);
  return data;
}

export async function addInkStroke(stroke: InkStroke): Promise<BookAnnotations> {
  const data = await getAnnotations(stroke.bookId);
  data.ink.push(stroke);
  await putAnnotations(stroke.bookId, data);
  return data;
}

export async function removeInkStroke(
  bookId: string,
  id: string,
): Promise<BookAnnotations> {
  const data = await getAnnotations(bookId);
  data.ink = data.ink.filter((x) => x.id !== id);
  await putAnnotations(bookId, data);
  return data;
}

export async function updateInkStroke(
  bookId: string,
  id: string,
  patch: Partial<Omit<InkStroke, "id" | "bookId" | "createdAt">>,
): Promise<BookAnnotations> {
  const data = await getAnnotations(bookId);
  data.ink = data.ink.map((row) =>
    row.id === id ? { ...row, ...patch } : row,
  );
  await putAnnotations(bookId, data);
  return data;
}

export async function clearPageInk(
  bookId: string,
  page: number,
): Promise<BookAnnotations> {
  const data = await getAnnotations(bookId);
  data.ink = data.ink.filter((x) => x.page !== page);
  data.texts = (data.texts ?? []).filter((x) => x.page !== page);
  await putAnnotations(bookId, data);
  return data;
}

export async function addMarginText(note: MarginText): Promise<BookAnnotations> {
  const data = await getAnnotations(note.bookId);
  data.texts = [...(data.texts ?? []), note];
  await putAnnotations(note.bookId, data);
  return data;
}

export async function updateMarginText(
  bookId: string,
  id: string,
  patch: Partial<Omit<MarginText, "id" | "bookId" | "createdAt">>,
): Promise<BookAnnotations> {
  const data = await getAnnotations(bookId);
  data.texts = (data.texts ?? []).map((row) =>
    row.id === id
      ? { ...row, ...patch, updatedAt: new Date().toISOString() }
      : row,
  );
  await putAnnotations(bookId, data);
  return data;
}

export async function removeMarginText(
  bookId: string,
  id: string,
): Promise<BookAnnotations> {
  const data = await getAnnotations(bookId);
  data.texts = (data.texts ?? []).filter((x) => x.id !== id);
  await putAnnotations(bookId, data);
  return data;
}

export async function eraseInkNear(
  bookId: string,
  page: number,
  x: number,
  y: number,
  radius = 0.03,
): Promise<BookAnnotations> {
  const data = await getAnnotations(bookId);
  const pageInk = data.ink.filter((s) => s.page === page);
  let hitId: string | null = null;
  for (let i = pageInk.length - 1; i >= 0; i--) {
    const s = pageInk[i];
    if (s.points.some((p) => Math.hypot(p.x - x, p.y - y) <= radius)) {
      hitId = s.id;
      break;
    }
  }
  if (hitId) {
    data.ink = data.ink.filter((x) => x.id !== hitId);
    await putAnnotations(bookId, data);
  }
  return data;
}

export async function setFlashcards(
  bookId: string,
  cards: Flashcard[],
): Promise<BookAnnotations> {
  const data = await getAnnotations(bookId);
  data.flashcards = cards;
  await putAnnotations(bookId, data);
  return data;
}

export async function appendChat(
  bookId: string,
  messages: ChatMessage[],
): Promise<BookAnnotations> {
  const data = await getAnnotations(bookId);
  data.chat.push(...messages);
  await putAnnotations(bookId, data);
  return data;
}

export async function updateLastPage(
  bookId: string,
  page: number,
): Promise<void> {
  const book = await getBook(bookId);
  if (!book) return;
  book.lastPage = page;
  book.updatedAt = new Date().toISOString();
  book.openedAt = new Date().toISOString();
  await saveBook(book);
  void import("../sync/library-sync").then((m) => m.scheduleSync(bookId));
}

export async function updateBookTags(
  bookId: string,
  tags: string[],
): Promise<BookMeta | undefined> {
  const book = await getBook(bookId);
  if (!book) return undefined;
  book.tags = tags;
  book.updatedAt = new Date().toISOString();
  await saveBook(book);
  return book;
}

export async function listCollections(): Promise<Collection[]> {
  const db = await openDb();
  if (!hasStore(db, COLLECTIONS_STORE)) return [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(COLLECTIONS_STORE, "readonly");
    const req = tx.objectStore(COLLECTIONS_STORE).getAll();
    req.onsuccess = () => {
      const rows = (req.result as Collection[]).sort((a, b) =>
        a.name.localeCompare(b.name, "ru"),
      );
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveCollection(collection: Collection): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(COLLECTIONS_STORE, "readwrite");
  tx.objectStore(COLLECTIONS_STORE).put(collection);
  await txDone(tx);
}

export async function deleteCollection(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([COLLECTIONS_STORE, BOOKS_STORE], "readwrite");
  tx.objectStore(COLLECTIONS_STORE).delete(id);
  const booksReq = tx.objectStore(BOOKS_STORE).getAll();
  booksReq.onsuccess = () => {
    for (const raw of booksReq.result as BookMeta[]) {
      const book = normalizeBook(raw);
      if (!book.collectionIds.includes(id)) continue;
      book.collectionIds = book.collectionIds.filter((x) => x !== id);
      book.updatedAt = new Date().toISOString();
      tx.objectStore(BOOKS_STORE).put(book);
    }
  };
  await txDone(tx);
}

export async function setBookCollections(
  bookId: string,
  collectionIds: string[],
): Promise<BookMeta | undefined> {
  const book = await getBook(bookId);
  if (!book) return undefined;
  book.collectionIds = collectionIds;
  book.updatedAt = new Date().toISOString();
  await saveBook(book);
  return book;
}

export async function toggleBookCollection(
  bookId: string,
  collectionId: string,
): Promise<BookMeta | undefined> {
  const book = await getBook(bookId);
  if (!book) return undefined;
  const has = book.collectionIds.includes(collectionId);
  book.collectionIds = has
    ? book.collectionIds.filter((x) => x !== collectionId)
    : [...book.collectionIds, collectionId];
  book.updatedAt = new Date().toISOString();
  await saveBook(book);
  return book;
}

export async function setReadingStatus(
  bookId: string,
  readingStatus: ReadingStatus,
): Promise<BookMeta | undefined> {
  const book = await getBook(bookId);
  if (!book) return undefined;
  book.readingStatus = readingStatus;
  book.updatedAt = new Date().toISOString();
  await saveBook(book);
  return book;
}
