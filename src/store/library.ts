import { create } from "zustand";
import type { BookMeta } from "../lib/types";
import * as local from "../lib/storage/local";
import {
  connectDrive,
  isDriveConnected,
  syncBookToDrive,
} from "../lib/storage/drive";
import { extractCoverDataUrl, loadPdf, titleFromFilename } from "../lib/pdf";

interface LibraryStore {
  books: BookMeta[];
  loading: boolean;
  driveConnected: boolean;
  hydrate: () => Promise<void>;
  addPdf: (file: File) => Promise<BookMeta>;
  removeBook: (id: string) => Promise<void>;
  connectDrive: () => Promise<string>;
  refreshDriveFlag: () => void;
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  books: [],
  loading: true,
  driveConnected: false,

  refreshDriveFlag: () => {
    set({ driveConnected: isDriveConnected() });
  },

  hydrate: async () => {
    set({ loading: true });
    const books = await local.listBooks();
    set({ books, loading: false, driveConnected: isDriveConnected() });
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
      pageCount,
      coverDataUrl,
      localFileKey: id,
      lastPage: 1,
      addedAt: now,
      updatedAt: now,
      sizeBytes: file.size,
    };

    await local.savePdfBlob(id, file);
    await local.saveBook(book);

    const annotations = await local.getAnnotations(id);
    const sync = await syncBookToDrive(book, file, annotations);
    if (sync.driveFileId) {
      book.driveFileId = sync.driveFileId;
      book.driveAnnotationsId = sync.driveAnnotationsId;
      await local.saveBook(book);
    }

    set({ books: [book, ...get().books.filter((b) => b.id !== id)] });
    return book;
  },

  removeBook: async (id: string) => {
    await local.deleteBook(id);
    set({ books: get().books.filter((b) => b.id !== id) });
  },

  connectDrive: async () => {
    const result = await connectDrive();
    set({ driveConnected: isDriveConnected() });
    return result.message;
  },
}));
