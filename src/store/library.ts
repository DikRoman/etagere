import { create } from "zustand";
import type { BookMeta, Collection, LibraryFilter, ReadingStatus } from "../lib/types";
import * as local from "../lib/storage/local";
import { coverFromStoredFile, isUsableCover } from "../lib/book-cover";
import {
  connectDrive,
  driveFileToBookFile,
  importDriveFileById,
  isDriveConnected,
  parseDriveFileId,
  pickDriveBook,
} from "../lib/storage/drive";
import { extractCoverDataUrl, loadPdf, titleFromFilename } from "../lib/pdf";
import {
  EPUB_BUNDLE_VERSION,
  parseEpub,
  reparseEpubFromBlob,
} from "../lib/epub";
import { sha256Hex } from "../lib/content-hash";
import type { CloudProvider } from "../lib/cloud/session";
import {
  deleteCloudBook,
  scheduleSync,
} from "../lib/sync/library-sync";
import { backupBookFile } from "../lib/sync/book-file";

type DiskRef = { provider: CloudProvider; fileId: string };

function withDiskIds(
  book: BookMeta,
  driveFileId?: string,
  disk?: DiskRef,
): BookMeta {
  const cloudProvider =
    disk?.provider ||
    book.cloudProvider ||
    (driveFileId ? "gdrive" : undefined);
  const cloudFileId = disk?.fileId || book.cloudFileId || driveFileId;
  const nextDrive =
    driveFileId ||
    (cloudProvider === "gdrive" ? cloudFileId : undefined) ||
    book.driveFileId;
  return {
    ...book,
    driveFileId: nextDrive,
    cloudProvider,
    cloudFileId,
    hasCloudFile: Boolean(cloudFileId || nextDrive),
  };
}

function findAttachTarget(
  books: BookMeta[],
  opts: {
    attachToBookId?: string;
    contentHash: string;
    driveFileId?: string;
    cloudFileId?: string;
    title: string;
    format: BookMeta["format"];
  },
): BookMeta | undefined {
  return (
    books.find((b) => opts.attachToBookId && b.id === opts.attachToBookId) ||
    books.find((b) => b.contentHash === opts.contentHash) ||
    books.find(
      (b) => opts.driveFileId && b.driveFileId === opts.driveFileId,
    ) ||
    books.find(
      (b) => opts.cloudFileId && b.cloudFileId === opts.cloudFileId,
    ) ||
    books.find(
      (b) =>
        b.missingLocalFile &&
        b.format === opts.format &&
        b.title.toLowerCase() === opts.title.toLowerCase(),
    )
  );
}

interface LibraryStore {
  books: BookMeta[];
  collections: Collection[];
  loading: boolean;
  driveConnected: boolean;
  libraryFilter: LibraryFilter;
  draggingBookId: string | null;
  dropTargetCollectionId: string | null;
  selectMode: boolean;
  selectedBookIds: string[];
  hydrate: () => Promise<void>;
  addPdf: (
    file: File,
    driveFileId?: string,
    attachToBookId?: string,
    disk?: DiskRef,
  ) => Promise<BookMeta>;
  addEpub: (
    file: File,
    driveFileId?: string,
    attachToBookId?: string,
    disk?: DiskRef,
  ) => Promise<BookMeta>;
  addBookFile: (
    file: File,
    driveFileId?: string,
    attachToBookId?: string,
    disk?: DiskRef,
  ) => Promise<BookMeta>;
  refreshEpub: (bookId: string) => Promise<local.EpubBundle | null>;
  importFromDrive: () => Promise<BookMeta | null>;
  importFromDriveLink: (urlOrId: string) => Promise<BookMeta | null>;
  removeBook: (id: string) => Promise<void>;
  removeSelectedBooks: () => Promise<void>;
  enterSelectMode: (bookId: string) => void;
  exitSelectMode: () => void;
  toggleBookSelected: (bookId: string) => void;
  setLibraryFilter: (filter: LibraryFilter) => void;
  createCollection: (name: string) => Promise<Collection | null>;
  deleteCollection: (id: string) => Promise<void>;
  toggleBookCollection: (bookId: string, collectionId: string) => Promise<void>;
  addBookToCollection: (bookId: string, collectionId: string) => Promise<void>;
  addBooksToCollection: (
    bookIds: string[],
    collectionId: string,
  ) => Promise<void>;
  removeBooksFromCollection: (
    bookIds: string[],
    collectionId: string,
  ) => Promise<void>;
  removeSelectedFromCollection: (collectionId: string) => Promise<void>;
  setDraggingBookId: (id: string | null) => void;
  setDropTargetCollectionId: (id: string | null) => void;
  setReadingStatus: (bookId: string, status: ReadingStatus) => Promise<void>;
  restoreCover: (bookId: string) => Promise<void>;
  connectDrive: () => Promise<string>;
  refreshDriveFlag: () => void;
}

function applyActiveCollection(
  book: BookMeta,
  filter: LibraryFilter,
): BookMeta {
  if (filter.kind === "collection" && !book.collectionIds.includes(filter.id)) {
    return { ...book, collectionIds: [...book.collectionIds, filter.id] };
  }
  return book;
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  books: [],
  collections: [],
  loading: true,
  driveConnected: false,
  libraryFilter: { kind: "all" },
  draggingBookId: null,
  dropTargetCollectionId: null,
  selectMode: false,
  selectedBookIds: [],

  refreshDriveFlag: () => {
    set({ driveConnected: isDriveConnected() });
  },

  hydrate: async () => {
    const keep = get().books.length > 0;
    if (!keep) set({ loading: true });
    try {
      const [books, collections] = await Promise.all([
        local.listBooks(),
        local.listCollections(),
      ]);
      set({
        books,
        collections,
        loading: false,
        driveConnected: isDriveConnected(),
      });
      void (async () => {
        for (const book of get().books) {
          if (isUsableCover(book.coverDataUrl) || book.missingLocalFile) {
            continue;
          }
          await get().restoreCover(book.id);
        }
      })();
    } catch (e) {
      console.error("[etagere] library hydrate", e);
      set({ loading: false });
    }
  },

  setLibraryFilter: (libraryFilter) => set({ libraryFilter }),

  addBookFile: async (file, driveFileId, attachToBookId, disk) => {
    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();
    if (name.endsWith(".epub") || type.includes("epub")) {
      return get().addEpub(file, driveFileId, attachToBookId, disk);
    }
    if (name.endsWith(".pdf") || type.includes("pdf")) {
      return get().addPdf(file, driveFileId, attachToBookId, disk);
    }
    throw new Error("Нужен файл PDF или EPUB.");
  },

  addPdf: async (
    file: File,
    driveFileId?: string,
    attachToBookId?: string,
    disk?: DiskRef,
  ) => {
    const id = crypto.randomUUID();
    const buffer = await file.arrayBuffer();
    const contentHash = await sha256Hex(buffer.slice(0));
    const pdf = await loadPdf(buffer.slice(0));
    const pageCount = pdf.numPages;
    const coverDataUrl = await extractCoverDataUrl(pdf);
    await pdf.cleanup();

    const existing = findAttachTarget(get().books, {
      attachToBookId,
      contentHash,
      driveFileId: driveFileId || (disk?.provider === "gdrive" ? disk.fileId : undefined),
      cloudFileId: disk?.fileId,
      title: titleFromFilename(file.name),
      format: "pdf",
    });
    const bookId = existing?.id ?? id;

    const now = new Date().toISOString();
    let book: BookMeta = {
      id: bookId,
      title: existing?.title || titleFromFilename(file.name),
      format: "pdf",
      pageCount,
      coverDataUrl,
      localFileKey: bookId,
      lastPage: existing?.lastPage || 1,
      addedAt: existing?.addedAt || now,
      updatedAt: now,
      sizeBytes: file.size,
      tags: driveFileId || disk
        ? Array.from(new Set([...(existing?.tags || []), "drive"]))
        : existing?.tags || [],
      collectionIds: existing?.collectionIds || [],
      readingStatus: existing?.readingStatus || "none",
      driveFileId: driveFileId || existing?.driveFileId,
      cloudProvider: existing?.cloudProvider,
      cloudFileId: existing?.cloudFileId,
      contentHash,
      cloudId: existing?.cloudId,
      missingLocalFile: false,
    };
    book = withDiskIds(
      applyActiveCollection(book, get().libraryFilter),
      driveFileId,
      disk,
    );

    await local.savePdfBlob(bookId, file);
    await local.saveBook(book);

    set({ books: [book, ...get().books.filter((b) => b.id !== bookId)] });
    scheduleSync(bookId);
    void backupBookFile(book).then((next) => {
      set({
        books: get().books.map((b) => (b.id === next.id ? next : b)),
      });
      if (next.cloudFileId || next.driveFileId) scheduleSync(next.id);
    });
    return book;
  },

  addEpub: async (
    file: File,
    driveFileId?: string,
    attachToBookId?: string,
    disk?: DiskRef,
  ) => {
    const id = crypto.randomUUID();
    const contentHash = await sha256Hex(file);
    const parsed = await parseEpub(file);
    const existing = findAttachTarget(get().books, {
      attachToBookId,
      contentHash,
      driveFileId: driveFileId || (disk?.provider === "gdrive" ? disk.fileId : undefined),
      cloudFileId: disk?.fileId,
      title: parsed.title,
      format: "epub",
    });
    const bookId = existing?.id ?? id;
    const now = new Date().toISOString();
    let book: BookMeta = {
      id: bookId,
      title: existing?.title || parsed.title,
      author: parsed.author || existing?.author,
      format: "epub",
      pageCount: Math.max(1, parsed.chapters.length),
      coverDataUrl: parsed.coverDataUrl,
      localFileKey: bookId,
      lastPage: existing?.lastPage || 1,
      addedAt: existing?.addedAt || now,
      updatedAt: now,
      sizeBytes: file.size,
      tags: driveFileId || disk
        ? Array.from(new Set([...(existing?.tags || []), "drive", "epub"]))
        : Array.from(new Set([...(existing?.tags || []), "epub"])),
      collectionIds: existing?.collectionIds || [],
      readingStatus: existing?.readingStatus || "none",
      driveFileId: driveFileId || existing?.driveFileId,
      cloudProvider: existing?.cloudProvider,
      cloudFileId: existing?.cloudFileId,
      contentHash,
      cloudId: existing?.cloudId,
      missingLocalFile: false,
    };
    book = withDiskIds(
      applyActiveCollection(book, get().libraryFilter),
      driveFileId,
      disk,
    );

    await local.savePdfBlob(bookId, file);
    await local.saveEpubChapters(
      bookId,
      parsed.chapters,
      parsed.toc,
      EPUB_BUNDLE_VERSION,
    );
    await local.saveTocCache(bookId, parsed.toc, "outline");
    await local.saveBook(book);

    set({ books: [book, ...get().books.filter((b) => b.id !== bookId)] });
    scheduleSync(bookId);
    void backupBookFile(book).then((next) => {
      set({
        books: get().books.map((b) => (b.id === next.id ? next : b)),
      });
      if (next.cloudFileId || next.driveFileId) scheduleSync(next.id);
    });
    return book;
  },

  /** Re-read a stored EPUB so books imported by older builds gain pictures and a cover. */
  refreshEpub: async (bookId: string) => {
    const blob = await local.getPdfBlob(bookId);
    if (!blob) return null;
    const parsed = await reparseEpubFromBlob(blob);
    if (!parsed.chapters.length) return null;

    await local.saveEpubChapters(
      bookId,
      parsed.chapters,
      parsed.toc,
      EPUB_BUNDLE_VERSION,
    );
    await local.saveTocCache(bookId, parsed.toc, "outline");

    const stored = get().books.find((b) => b.id === bookId);
    const book = stored ?? (await local.getBook(bookId));
    if (book) {
      const updated: BookMeta = {
        ...book,
        pageCount: Math.max(1, parsed.chapters.length),
        coverDataUrl: parsed.coverDataUrl ?? book.coverDataUrl,
      };
      await local.saveBook(updated);
      set({ books: get().books.map((b) => (b.id === bookId ? updated : b)) });
    }

    return {
      chapters: parsed.chapters,
      toc: parsed.toc,
      version: EPUB_BUNDLE_VERSION,
    };
  },

  importFromDrive: async () => {
    const picked = await pickDriveBook();
    if (!picked) return null;

    const file = await driveFileToBookFile(picked);
    const book = await get().addBookFile(file, picked.id);
    set({ driveConnected: isDriveConnected() });
    return book;
  },

  importFromDriveLink: async (urlOrId) => {
    const fileId = parseDriveFileId(urlOrId);
    if (!fileId) {
      throw new Error("Неверная ссылка Google Drive.");
    }

    const picked = await importDriveFileById(fileId);
    const file = await driveFileToBookFile(picked);
    const book = await get().addBookFile(file, picked.id);
    set({ driveConnected: isDriveConnected() });
    return book;
  },

  removeBook: async (id: string) => {
    const book = get().books.find((b) => b.id === id);
    await local.deleteBook(id);
    set({
      books: get().books.filter((b) => b.id !== id),
      selectedBookIds: get().selectedBookIds.filter((x) => x !== id),
    });
    if (book) void deleteCloudBook(book);
  },

  removeSelectedBooks: async () => {
    const ids = [...get().selectedBookIds];
    for (const id of ids) {
      await get().removeBook(id);
    }
    get().exitSelectMode();
  },

  enterSelectMode: (bookId) => {
    const selected = get().selectMode
      ? get().selectedBookIds.includes(bookId)
        ? get().selectedBookIds
        : [...get().selectedBookIds, bookId]
      : [bookId];
    set({ selectMode: true, selectedBookIds: selected });
  },

  exitSelectMode: () => set({ selectMode: false, selectedBookIds: [] }),

  toggleBookSelected: (bookId) => {
    if (!get().selectMode) {
      set({ selectMode: true, selectedBookIds: [bookId] });
      return;
    }
    const on = get().selectedBookIds.includes(bookId);
    set({
      selectedBookIds: on
        ? get().selectedBookIds.filter((id) => id !== bookId)
        : [...get().selectedBookIds, bookId],
    });
  },

  createCollection: async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const exists = get().collections.some(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exists) return null;

    const collection: Collection = {
      id: crypto.randomUUID(),
      name: trimmed,
      createdAt: new Date().toISOString(),
    };
    await local.saveCollection(collection);
    const collections = [...get().collections, collection].sort((a, b) =>
      a.name.localeCompare(b.name, "ru"),
    );
    set({ collections });
    scheduleSync();
    return collection;
  },

  deleteCollection: async (id: string) => {
    await local.deleteCollection(id);
    const books = await local.listBooks();
    const filter = get().libraryFilter;
    set({
      books,
      collections: get().collections.filter((c) => c.id !== id),
      libraryFilter:
        filter.kind === "collection" && filter.id === id
          ? { kind: "all" }
          : filter,
    });
    scheduleSync();
  },

  setDraggingBookId: (id) => set({ draggingBookId: id }),
  setDropTargetCollectionId: (id) => set({ dropTargetCollectionId: id }),

  toggleBookCollection: async (bookId, collectionId) => {
    const updated = await local.toggleBookCollection(bookId, collectionId);
    if (!updated) return;
    set({
      books: get().books.map((b) => (b.id === bookId ? updated : b)),
    });
    scheduleSync(bookId);
  },

  addBookToCollection: async (bookId, collectionId) => {
    const book = get().books.find((b) => b.id === bookId);
    if (!book || book.collectionIds.includes(collectionId)) return;
    const updated = await local.toggleBookCollection(bookId, collectionId);
    if (!updated) return;
    set({
      books: get().books.map((b) => (b.id === bookId ? updated : b)),
    });
    scheduleSync(bookId);
  },

  addBooksToCollection: async (bookIds, collectionId) => {
    const unique = [...new Set(bookIds)];
    for (const id of unique) {
      await get().addBookToCollection(id, collectionId);
    }
  },

  removeBooksFromCollection: async (bookIds, collectionId) => {
    const unique = [...new Set(bookIds)];
    for (const id of unique) {
      const book = get().books.find((b) => b.id === id);
      if (!book?.collectionIds.includes(collectionId)) continue;
      await get().toggleBookCollection(id, collectionId);
    }
  },

  removeSelectedFromCollection: async (collectionId) => {
    const ids = get().selectedBookIds;
    await get().removeBooksFromCollection(ids, collectionId);
    get().exitSelectMode();
  },

  setReadingStatus: async (bookId, readingStatus) => {
    const updated = await local.setReadingStatus(bookId, readingStatus);
    if (!updated) return;
    set({
      books: get().books.map((b) => (b.id === bookId ? updated : b)),
    });
    scheduleSync(bookId);
  },

  restoreCover: async (bookId) => {
    const book = get().books.find((b) => b.id === bookId);
    if (!book || book.missingLocalFile) return;
    const coverDataUrl = await coverFromStoredFile(book);
    if (!coverDataUrl) return;
    const next = { ...book, coverDataUrl };
    await local.saveBook(next);
    set({
      books: get().books.map((b) => (b.id === bookId ? next : b)),
    });
  },

  connectDrive: async () => {
    const result = await connectDrive();
    set({ driveConnected: isDriveConnected() });
    return result.message;
  },
}));
