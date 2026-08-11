import { create } from "zustand";
import type {
  BookAnnotations,
  HighlightColor,
  InkStroke,
  Locale,
  ReaderTool,
  SidebarTab,
  TextRect,
  TocItem,
} from "../lib/types";
import { PEN_COLORS } from "../lib/types";
import * as local from "../lib/storage/local";
import { stubChat, stubFlashcards } from "../lib/ai";

interface ReaderStore {
  bookId: string | null;
  pageCount: number;
  page: number;
  scale: number;
  annotations: BookAnnotations;
  toc: TocItem[];
  activeColor: HighlightColor;
  tool: ReaderTool;
  penColor: string;
  penWidth: number;
  stylusOnly: boolean;
  pressureEnabled: boolean;
  sidebarOpen: boolean;
  sidebarTab: SidebarTab;
  scrollRequest: number | null;
  aiOpen: boolean;
  aiResult: { title: string; body: string } | null;
  selection: {
    text: string;
    page: number;
    rects: TextRect[];
    screen: { x: number; y: number };
  } | null;
  setBook: (bookId: string, page: number, pageCount: number) => Promise<void>;
  setToc: (toc: TocItem[]) => void;
  setPageFromScroll: (page: number) => void;
  goToPage: (page: number) => Promise<void>;
  clearScrollRequest: () => void;
  setScale: (scale: number) => void;
  setActiveColor: (c: HighlightColor) => void;
  setTool: (tool: ReaderTool) => void;
  setPenColor: (c: string) => void;
  setPenWidth: (w: number) => void;
  setStylusOnly: (v: boolean) => void;
  setPressureEnabled: (v: boolean) => void;
  setSidebarOpen: (v: boolean) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  openBookmarks: () => void;
  setAiOpen: (v: boolean) => void;
  setAiResult: (v: { title: string; body: string } | null) => void;
  setSelection: (sel: ReaderStore["selection"]) => void;
  clearSelection: () => void;
  reloadAnnotations: () => Promise<void>;
  addHighlightFromSelection: () => Promise<void>;
  toggleBookmark: (page: number, label?: string) => Promise<void>;
  addQuoteFromSelection: (note?: string) => Promise<void>;
  addInkStroke: (
    stroke: Omit<InkStroke, "id" | "createdAt" | "bookId">,
  ) => Promise<void>;
  eraseInkNear: (page: number, x: number, y: number, radius?: number) => Promise<void>;
  clearPageInk: (page: number) => Promise<void>;
  removeHighlight: (id: string) => Promise<void>;
  removeBookmark: (id: string) => Promise<void>;
  removeQuote: (id: string) => Promise<void>;
  removeInkStroke: (id: string) => Promise<void>;
  isPageBookmarked: (page: number) => boolean;
  generateFlashcards: (locale: Locale) => Promise<void>;
  sendChat: (
    question: string,
    bookTitle: string,
    locale: Locale,
  ) => Promise<void>;
}

const emptyAnn = (): BookAnnotations => ({
  highlights: [],
  bookmarks: [],
  quotes: [],
  ink: [],
  flashcards: [],
  chat: [],
});

export const useReaderStore = create<ReaderStore>((set, get) => ({
  bookId: null,
  pageCount: 0,
  page: 1,
  scale: 1.1,
  annotations: emptyAnn(),
  toc: [],
  activeColor: "yellow",
  tool: "select",
  penColor: PEN_COLORS[0],
  penWidth: 2.2,
  stylusOnly: false,
  pressureEnabled: true,
  sidebarOpen: true,
  sidebarTab: "bookmarks",
  scrollRequest: null,
  aiOpen: false,
  aiResult: null,
  selection: null,

  setBook: async (bookId, page, pageCount) => {
    const annotations = await local.getAnnotations(bookId);
    set({
      bookId,
      page,
      pageCount,
      annotations,
      toc: [],
      selection: null,
      aiResult: null,
      scrollRequest: page,
      sidebarOpen: true,
      sidebarTab: "bookmarks",
      tool: "select",
    });
  },

  setToc: (toc) => set({ toc }),

  setPageFromScroll: (page) => {
    const { bookId, page: cur } = get();
    if (page === cur) return;
    set({ page });
    if (bookId) void local.updateLastPage(bookId, page);
  },

  goToPage: async (page) => {
    const { bookId, pageCount } = get();
    const next = Math.min(pageCount, Math.max(1, page));
    set({ page: next, selection: null, scrollRequest: next });
    if (bookId) await local.updateLastPage(bookId, next);
  },

  clearScrollRequest: () => set({ scrollRequest: null }),
  setScale: (scale) => set({ scale: Math.min(2.5, Math.max(0.55, scale)) }),
  setActiveColor: (activeColor) => set({ activeColor }),
  setTool: (tool) => set({ tool, selection: null }),
  setPenColor: (penColor) => set({ penColor }),
  setPenWidth: (penWidth) =>
    set({ penWidth: Math.min(8, Math.max(0.8, penWidth)) }),
  setStylusOnly: (stylusOnly) => set({ stylusOnly }),
  setPressureEnabled: (pressureEnabled) => set({ pressureEnabled }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab, sidebarOpen: true }),
  openBookmarks: () => set({ sidebarOpen: true, sidebarTab: "bookmarks" }),
  setAiOpen: (aiOpen) => set({ aiOpen }),
  setAiResult: (aiResult) => set({ aiResult }),
  setSelection: (selection) => set({ selection }),
  clearSelection: () => set({ selection: null }),

  isPageBookmarked: (page) =>
    get().annotations.bookmarks.some((b) => b.page === page),

  reloadAnnotations: async () => {
    const { bookId } = get();
    if (!bookId) return;
    set({ annotations: await local.getAnnotations(bookId) });
  },

  addHighlightFromSelection: async () => {
    const { bookId, selection, activeColor } = get();
    if (!bookId || !selection?.text) return;
    await local.addHighlight({
      id: crypto.randomUUID(),
      bookId,
      page: selection.page,
      color: activeColor,
      text: selection.text,
      rects: selection.rects,
      createdAt: new Date().toISOString(),
    });
    await get().reloadAnnotations();
    get().clearSelection();
  },

  toggleBookmark: async (page, label) => {
    const { bookId, annotations } = get();
    if (!bookId) return;
    const existing = annotations.bookmarks.find((b) => b.page === page);
    if (existing) await local.removeBookmark(bookId, existing.id);
    else {
      await local.addBookmark({
        id: crypto.randomUUID(),
        bookId,
        page,
        label,
        createdAt: new Date().toISOString(),
      });
    }
    await get().reloadAnnotations();
    set({ sidebarOpen: true, sidebarTab: "bookmarks" });
  },

  addQuoteFromSelection: async (note) => {
    const { bookId, selection } = get();
    if (!bookId || !selection?.text) return;
    await local.addQuote({
      id: crypto.randomUUID(),
      bookId,
      page: selection.page,
      text: selection.text,
      note,
      createdAt: new Date().toISOString(),
    });
    await get().reloadAnnotations();
    get().clearSelection();
  },

  addInkStroke: async (stroke) => {
    const { bookId } = get();
    if (!bookId) return;
    await local.addInkStroke({
      ...stroke,
      id: crypto.randomUUID(),
      bookId,
      createdAt: new Date().toISOString(),
    });
    await get().reloadAnnotations();
  },

  eraseInkNear: async (page, x, y, radius) => {
    const { bookId } = get();
    if (!bookId) return;
    await local.eraseInkNear(bookId, page, x, y, radius);
    await get().reloadAnnotations();
  },

  clearPageInk: async (page) => {
    const { bookId } = get();
    if (!bookId) return;
    await local.clearPageInk(bookId, page);
    await get().reloadAnnotations();
  },

  removeHighlight: async (id) => {
    const { bookId } = get();
    if (!bookId) return;
    await local.removeHighlight(bookId, id);
    await get().reloadAnnotations();
  },

  removeBookmark: async (id) => {
    const { bookId } = get();
    if (!bookId) return;
    await local.removeBookmark(bookId, id);
    await get().reloadAnnotations();
  },

  removeQuote: async (id) => {
    const { bookId } = get();
    if (!bookId) return;
    await local.removeQuote(bookId, id);
    await get().reloadAnnotations();
  },

  removeInkStroke: async (id) => {
    const { bookId } = get();
    if (!bookId) return;
    await local.removeInkStroke(bookId, id);
    await get().reloadAnnotations();
  },

  generateFlashcards: async (locale) => {
    const { bookId, annotations } = get();
    if (!bookId) return;
    const snippets = [
      ...annotations.quotes.map((q) => q.text),
      ...annotations.highlights.map((h) => h.text),
    ].slice(0, 12);
    if (!snippets.length) return;
    const raw = await stubFlashcards(snippets, locale);
    const cards = raw.map((c, i) => ({
      id: crypto.randomUUID(),
      bookId,
      front: c.front,
      back: c.back,
      sourcePage:
        annotations.quotes[i]?.page ?? annotations.highlights[i]?.page,
      createdAt: new Date().toISOString(),
    }));
    await local.setFlashcards(bookId, cards);
    await get().reloadAnnotations();
    set({ sidebarTab: "cards", sidebarOpen: true });
  },

  sendChat: async (question, bookTitle, locale) => {
    const { bookId, annotations, page } = get();
    if (!bookId || !question.trim()) return;
    const userMsg = {
      id: crypto.randomUUID(),
      role: "user" as const,
      content: question.trim(),
      createdAt: new Date().toISOString(),
    };
    await local.appendChat(bookId, [userMsg]);
    await get().reloadAnnotations();

    const context = [
      ...annotations.quotes.slice(-3).map((q) => q.text),
      ...annotations.highlights.slice(-3).map((h) => h.text),
    ].join("\n");
    const answer = await stubChat(
      question,
      bookTitle,
      `page ${page}\n${context}`,
      locale,
    );
    await local.appendChat(bookId, [
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: answer,
        createdAt: new Date().toISOString(),
      },
    ]);
    await get().reloadAnnotations();
  },
}));
