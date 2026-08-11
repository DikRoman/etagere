import { create } from "zustand";
import type { BookMeta } from "../lib/types";
import * as local from "../lib/storage/local";
import {
  connectDrive,
  isDriveConnected,
  syncBookToDrive,
  pullAnnotationsFromDrive,
} from "../lib/storage/drive";
import { extractCoverDataUrl, loadPdf, titleFromFilename } from "../lib/pdf";
import { parseEpub } from "../lib/epub";

interface LibraryStore {
  books: BookMeta[];
  loading: boolean;
  driveConnected: boolean;
  tagFilter: string | null;
  hydrate: () => Promise<void>;
  addPdf: (file: File) => Promise<BookMeta>;
  addEpub: (file: File) => Promise<BookMeta>;
  addBookFile: (file: File) => Promise<BookMeta>;
  removeBook: (id: string) => Promise<void>;
  setTags: (id: string, tags: string[]) => Promise<void>;
  setTagFilter: (tag: string | null) => void;
  connectDrive: () => Promise<string>;
  syncBook: (id: string) => Promise<string>;
  pullBookAnnotations: (id: string) => Promise<string>;
  refreshDriveFlag: () => void;
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  books: [],
  loading: true,
  driveConnected: false,
  tagFilter: null,

  refreshDriveFlag: () => {
    set({ driveConnected: isDriveConnected() });
  },

  hydrate: async () => {
    set({ loading: true });
    const books = await local.listBooks();
    set({ books, loading: false, driveConnected: isDriveConnected() });
  },

  setTagFilter: (tagFilter) => set({ tagFilter }),

  addBookFile: async (file) => {
    const name = file.name.toLowerCase();
    if (name.endsWith(".epub") || file.type.includes("epub")) {
      return get().addEpub(file);
    }
    return get().addPdf(file);
  },

  addPdf: async (file: File) => {
    const id = crypto.randomUUID();
    const buffer = await file.arrayBuffer();
    const pdf = await loadPdf(buffer.slice(0));
    const pageCount = pdf.numPages;
    const coverDataUrl = await extractCoverDataUrl(pdf);
    await pdf.cleanup();

    const now = new Date().toISOString();
    const book: BookMeta = {
      id,
      title: titleFromFilename(file.name),
      format: "pdf",
      pageCount,
      coverDataUrl,
      localFileKey: id,
      lastPage: 1,
      addedAt: now,
      updatedAt: now,
      sizeBytes: file.size,
      tags: [],
    };

    await local.savePdfBlob(id, file);
    await local.saveBook(book);

    const annotations = await local.getAnnotations(id);
    const sync = await syncBookToDrive(book, file, annotations);
    if (sync.driveFileId) {
      book.driveFileId = sync.driveFileId;
      book.driveAnnotationsId = sync.driveAnnotationsId;
      book.syncedAt = new Date().toISOString();
      await local.saveBook(book);
    }

    set({ books: [book, ...get().books.filter((b) => b.id !== id)] });
    return book;
  },

  addEpub: async (file: File) => {
    const id = crypto.randomUUID();
    const parsed = await parseEpub(file);
    const now = new Date().toISOString();
    const book: BookMeta = {
      id,
      title: parsed.title,
      author: parsed.author,
      format: "epub",
      pageCount: Math.max(1, parsed.chapters.length),
      coverDataUrl: parsed.coverDataUrl,
      localFileKey: id,
      lastPage: 1,
      addedAt: now,
      updatedAt: now,
      sizeBytes: file.size,
      tags: ["epub"],
    };

    await local.savePdfBlob(id, file);
    await local.saveEpubChapters(id, parsed.chapters);
    await local.saveBook(book);

    const annotations = await local.getAnnotations(id);
    const sync = await syncBookToDrive(book, file, annotations);
    if (sync.driveFileId) {
      book.driveFileId = sync.driveFileId;
      book.driveAnnotationsId = sync.driveAnnotationsId;
      book.syncedAt = new Date().toISOString();
      await local.saveBook(book);
    }

    set({ books: [book, ...get().books.filter((b) => b.id !== id)] });
    return book;
  },

  removeBook: async (id: string) => {
    await local.deleteBook(id);
    set({ books: get().books.filter((b) => b.id !== id) });
  },

  setTags: async (id, tags) => {
    const updated = await local.updateBookTags(id, tags);
    if (!updated) return;
    set({
      books: get().books.map((b) => (b.id === id ? updated : b)),
    });
  },

  connectDrive: async () => {
    const result = await connectDrive();
    set({ driveConnected: isDriveConnected() });
    return result.message;
  },

  syncBook: async (id) => {
    const book = await local.getBook(id);
    if (!book) return "Book not found";
    const blob = await local.getPdfBlob(id);
    if (!blob) return "File missing in offline cache";
    const annotations = await local.getAnnotations(id);
    const sync = await syncBookToDrive(book, blob, annotations);
    if (sync.driveFileId) {
      book.driveFileId = sync.driveFileId;
      book.driveAnnotationsId = sync.driveAnnotationsId;
      book.syncedAt = new Date().toISOString();
      await local.saveBook(book);
      set({
        books: get().books.map((b) => (b.id === id ? book : b)),
      });
    }
    return sync.message;
  },

  pullBookAnnotations: async (id) => {
    const book = await local.getBook(id);
    if (!book?.driveAnnotationsId) {
      return "Нет sidecar на Drive — сначала sync.";
    }
    const remote = await pullAnnotationsFromDrive(book.driveAnnotationsId);
    if (!remote) return "Не удалось скачать заметки (нужен токен).";
    await local.putAnnotations(id, {
      highlights: remote.highlights ?? [],
      bookmarks: remote.bookmarks ?? [],
      quotes: remote.quotes ?? [],
      ink: remote.ink ?? [],
      flashcards: remote.flashcards ?? [],
      chat: remote.chat ?? [],
    });
    return "Заметки подтянуты с Drive.";
  },
}));
