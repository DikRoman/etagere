import type {
  BookAnnotations,
  BookMeta,
  Bookmark,
  Highlight,
  InkStroke,
  Quote,
} from "../types";

function normalizeAnnotations(
  row: (Partial<BookAnnotations> & { bookId?: string }) | undefined,
): BookAnnotations {
  return {
    highlights: row?.highlights ?? [],
    bookmarks: row?.bookmarks ?? [],
    quotes: row?.quotes ?? [],
    ink: row?.ink ?? [],
  };
}

const DB_NAME = "bookshelf-db";
const DB_VERSION = 1;
const BOOKS_STORE = "books";
const FILES_STORE = "files";
const ANNOTATIONS_STORE = "annotations";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BOOKS_STORE)) {
        db.createObjectStore(BOOKS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        db.createObjectStore(FILES_STORE);
      }
      if (!db.objectStoreNames.contains(ANNOTATIONS_STORE)) {
        db.createObjectStore(ANNOTATIONS_STORE, { keyPath: "bookId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function listBooks(): Promise<BookMeta[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOOKS_STORE, "readonly");
    const req = tx.objectStore(BOOKS_STORE).getAll();
    req.onsuccess = () => {
      const books = (req.result as BookMeta[]).sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      resolve(books);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getBook(id: string): Promise<BookMeta | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BOOKS_STORE, "readonly");
    const req = tx.objectStore(BOOKS_STORE).get(id);
    req.onsuccess = () => resolve(req.result as BookMeta | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function saveBook(book: BookMeta): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(BOOKS_STORE, "readwrite");
  tx.objectStore(BOOKS_STORE).put(book);
  await txDone(tx);
}

export async function deleteBook(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(
    [BOOKS_STORE, FILES_STORE, ANNOTATIONS_STORE],
    "readwrite",
  );
  tx.objectStore(BOOKS_STORE).delete(id);
  tx.objectStore(FILES_STORE).delete(id);
  tx.objectStore(ANNOTATIONS_STORE).delete(id);
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
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILES_STORE, "readonly");
    const req = tx.objectStore(FILES_STORE).get(bookId);
    req.onsuccess = () => resolve(req.result as Blob | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function getAnnotations(
  bookId: string,
): Promise<BookAnnotations> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ANNOTATIONS_STORE, "readonly");
    const req = tx.objectStore(ANNOTATIONS_STORE).get(bookId);
    req.onsuccess = () => {
      resolve(
        normalizeAnnotations(
          req.result as (Partial<BookAnnotations> & { bookId: string }) | undefined,
        ),
      );
    };
    req.onerror = () => reject(req.error);
  });
}

async function putAnnotations(
  bookId: string,
  data: BookAnnotations,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(ANNOTATIONS_STORE, "readwrite");
  tx.objectStore(ANNOTATIONS_STORE).put({ bookId, ...data });
  await txDone(tx);
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
  data.quotes.push(q);
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

export async function clearPageInk(
  bookId: string,
  page: number,
): Promise<BookAnnotations> {
  const data = await getAnnotations(bookId);
  data.ink = data.ink.filter((x) => x.page !== page);
  await putAnnotations(bookId, data);
  return data;
}

/** Remove the last stroke that intersects near a point (eraser). */
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
    if (
      s.points.some(
        (p) => Math.hypot(p.x - x, p.y - y) <= radius,
      )
    ) {
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

export async function updateLastPage(
  bookId: string,
  page: number,
): Promise<void> {
  const book = await getBook(bookId);
  if (!book) return;
  book.lastPage = page;
  book.updatedAt = new Date().toISOString();
  await saveBook(book);
}
