import { create } from "zustand";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type {
  BookAnnotations,
  ChatMessage,
  EpubFontChoice,
  HighlightColor,
  InkStroke,
  Locale,
  MarginText,
  ReaderTool,
  SidebarTab,
  TextRect,
  TocItem,
  TocSource,
} from "../lib/types";
import { PEN_COLORS } from "../lib/types";
import * as local from "../lib/storage/local";
import { recordPageVisit } from "../lib/reading-log";
import { stubChat, AiRequestError } from "../lib/ai";
import type { AiPanelResult } from "../lib/word-lookup";

export type ChatFocus = {
  text: string;
  sentence?: string;
  page: number;
};

function packChatContext(
  messages: ChatMessage[],
  extra: { page: number; focus: string; quotes: string[] },
): string {
  const parts: string[] = [];
  for (const m of messages.slice(-16)) {
    if (m.kind === "passage") {
      parts.push(
        `Фрагмент${m.page ? ` (с. ${m.page})` : ""}:\n${m.content.slice(0, 1200)}`,
      );
    } else if (m.role === "user") {
      parts.push(`Читатель: ${m.content.slice(0, 500)}`);
    } else {
      parts.push(`Помощник: ${m.content.slice(0, 700)}`);
    }
  }
  const already = messages.some(
    (m) =>
      m.kind === "passage" &&
      extra.focus &&
      m.content.slice(0, 80) === extra.focus.slice(0, 80),
  );
  if (extra.focus && !already) {
    parts.push(
      `Фрагмент (с. ${extra.page}):\n${extra.focus.slice(0, 2000)}`,
    );
  }
  for (const q of extra.quotes) {
    if (q.trim()) parts.push(q.slice(0, 400));
  }
  return parts.join("\n\n").slice(0, 4500);
}

interface ReaderStore {
  bookId: string | null;
  pageCount: number;
  pdfDoc: PDFDocumentProxy | null;
  page: number;
  scale: number;
  annotations: BookAnnotations;
  toc: TocItem[];
  tocLoading: boolean;
  tocSource: TocSource;
  pageLabels: string[] | null;
  activeColor: HighlightColor;
  tool: ReaderTool;
  penColor: string;
  penWidth: number;
  textFont: EpubFontChoice;
  textSize: number;
  stylusOnly: boolean;
  pressureEnabled: boolean;
  sidebarOpen: boolean;
  sidebarTab: SidebarTab;
  scrollRequest: number | null;
  /** EPUB paged mode: which sheet of the current chapter is on screen. */
  epubSheet: { index: number; count: number } | null;
  epubTurn: { dir: -1 | 1; n: number } | null;
  /** EPUB only: element id to reveal once the chapter is on screen. */
  scrollAnchor: string | null;
  aiOpen: boolean;
  aiResult: AiPanelResult | null;
  chatFocus: ChatFocus | null;
  selection: {
    text: string;
    page: number;
    rects: TextRect[];
    screen: { x: number; y: number };
    sentence?: string;
  } | null;
  setBook: (bookId: string, page: number, pageCount: number) => Promise<void>;
  setPdfDoc: (pdf: PDFDocumentProxy | null) => void;
  setToc: (toc: TocItem[], source?: TocSource) => void;
  setTocLoading: (loading: boolean) => void;
  setPageLabels: (labels: string[] | null) => void;
  setEpubSheet: (sheet: { index: number; count: number } | null) => void;
  requestEpubTurn: (dir: -1 | 1) => void;
  setPageFromScroll: (page: number) => void;
  goToPage: (page: number, anchor?: string) => Promise<void>;
  clearScrollRequest: () => void;
  setScale: (scale: number) => void;
  setActiveColor: (c: HighlightColor) => void;
  setTool: (tool: ReaderTool) => void;
  setPenColor: (c: string) => void;
  setPenWidth: (w: number) => void;
  setTextFont: (font: EpubFontChoice) => void;
  setTextSize: (size: number) => void;
  setStylusOnly: (v: boolean) => void;
  setPressureEnabled: (v: boolean) => void;
  setSidebarOpen: (v: boolean) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  openBookmarks: () => void;
  setAiOpen: (v: boolean) => void;
  setAiResult: (v: AiPanelResult | null) => void;
  setChatFocus: (focus: ChatFocus | null) => void;
  askAiAbout: (focus: ChatFocus) => Promise<void>;
  setSelection: (sel: ReaderStore["selection"]) => void;
  clearSelection: () => void;
  reloadAnnotations: () => Promise<void>;
  addHighlightFromSelection: () => Promise<void>;
  toggleBookmark: (page: number, label?: string) => Promise<void>;
  addQuoteFromSelection: () => Promise<void>;
  addNoteFromSelection: (body: string) => Promise<void>;
  addInkStroke: (
    stroke: Omit<InkStroke, "id" | "createdAt" | "bookId">,
  ) => Promise<void>;
  addMarginText: (
    note: Omit<MarginText, "id" | "bookId" | "createdAt" | "updatedAt">,
  ) => Promise<string | null>;
  updateMarginText: (
    id: string,
    patch: Partial<Omit<MarginText, "id" | "bookId" | "createdAt">>,
  ) => Promise<void>;
  removeMarginText: (id: string) => Promise<void>;
  eraseInkNear: (page: number, x: number, y: number, radius?: number) => Promise<void>;
  updateInkStroke: (
    id: string,
    patch: Partial<Omit<InkStroke, "id" | "bookId" | "createdAt">>,
  ) => Promise<void>;
  clearPageInk: (page: number) => Promise<void>;
  removeHighlight: (id: string) => Promise<void>;
  removeBookmark: (id: string) => Promise<void>;
  removeQuote: (id: string) => Promise<void>;
  removeNote: (id: string) => Promise<void>;
  removeInkStroke: (id: string) => Promise<void>;
  isPageBookmarked: (page: number) => boolean;
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
  notes: [],
  ink: [],
  texts: [],
  flashcards: [],
  chat: [],
});

export const useReaderStore = create<ReaderStore>((set, get) => ({
  bookId: null,
  pageCount: 0,
  pdfDoc: null,
  page: 1,
  scale: 1.1,
  annotations: emptyAnn(),
  toc: [],
  tocLoading: false,
  tocSource: "none",
  pageLabels: null,
  activeColor: "yellow",
  tool: "select",
  penColor: PEN_COLORS[0],
  penWidth: 2.2,
  textFont: "literary",
  textSize: 0.024,
  stylusOnly: false,
  pressureEnabled: true,
  sidebarOpen: false,
  sidebarTab: "bookmarks",
  scrollRequest: null,
  epubSheet: null,
  epubTurn: null,
  scrollAnchor: null,
  aiOpen: false,
  aiResult: null,
  chatFocus: null,
  selection: null,

  setBook: async (bookId, page, pageCount) => {
    recordPageVisit(bookId, page);
    const [annotations, cached, epub] = await Promise.all([
      local.getAnnotations(bookId),
      local.getTocCache(bookId).catch(() => undefined),
      local.getEpubBundle(bookId).catch(() => undefined),
    ]);
    const toc =
      cached?.items?.length
        ? cached
        : epub?.toc?.length
          ? { items: epub.toc, source: "outline" as const }
          : null;
    set({
      bookId,
      page,
      pageCount,
      pdfDoc: null,
      annotations,
      toc: toc?.items ?? [],
      tocLoading: !toc,
      tocSource: toc?.source ?? "none",
      pageLabels: null,
      selection: null,
      aiResult: null,
      chatFocus: null,
      scrollRequest: page,
      epubSheet: null,
      epubTurn: null,
      scrollAnchor: null,
      tool: "select",
        });
  },

  setPdfDoc: (pdfDoc) => set({ pdfDoc }),

  setToc: (toc, source = toc.length ? "outline" : "none") =>
    set({ toc, tocSource: source, tocLoading: false }),
  setTocLoading: (tocLoading) => set({ tocLoading }),
  setPageLabels: (pageLabels) => set({ pageLabels }),
  setEpubSheet: (epubSheet) => set({ epubSheet }),
  requestEpubTurn: (dir) =>
    set((state) => ({
      epubTurn: { dir, n: (state.epubTurn?.n ?? 0) + 1 },
    })),

  setPageFromScroll: (page) => {
    const { bookId, page: cur } = get();
    if (page === cur) return;
    set({ page });
    if (bookId) {
      recordPageVisit(bookId, page);
      void local.updateLastPage(bookId, page);
    }
  },

  goToPage: async (page, anchor) => {
    const { bookId, pageCount } = get();
    const next = Math.min(pageCount, Math.max(1, page));
    set({
      page: next,
      selection: null,
      scrollRequest: next,
      scrollAnchor: anchor ?? null,
    });
    if (bookId) {
      recordPageVisit(bookId, next);
      await local.updateLastPage(bookId, next);
    }
  },

  clearScrollRequest: () => set({ scrollRequest: null, scrollAnchor: null }),
  setScale: (scale) => set({ scale: Math.min(2.5, Math.max(0.55, scale)) }),
  setActiveColor: (activeColor) => set({ activeColor }),
  setTool: (tool) => set({ tool, selection: null }),
  setPenColor: (penColor) => set({ penColor }),
  setPenWidth: (penWidth) =>
    set({ penWidth: Math.min(8, Math.max(0.8, penWidth)) }),
  setTextFont: (textFont) => set({ textFont }),
  setTextSize: (textSize) =>
    set({ textSize: Math.min(0.045, Math.max(0.014, textSize)) }),
  setStylusOnly: (stylusOnly) => set({ stylusOnly }),
  setPressureEnabled: (pressureEnabled) => set({ pressureEnabled }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab, sidebarOpen: true }),
  openBookmarks: () => set({ sidebarOpen: true, sidebarTab: "bookmarks" }),
  setAiOpen: (aiOpen) => set({ aiOpen }),
  setAiResult: (aiResult) => set({ aiResult }),
  setChatFocus: (chatFocus) => set({ chatFocus }),
  askAiAbout: async (focus) => {
    const text = (focus.sentence || focus.text).trim();
    set({
      chatFocus: focus,
      sidebarTab: "chat",
      sidebarOpen: true,
      aiOpen: false,
      aiResult: null,
      selection: null,
    });
    const { bookId, annotations } = get();
    if (!bookId || !text) return;
    const last = annotations.chat.at(-1);
    if (last?.kind === "passage" && last.content === text) return;
    await local.appendChat(bookId, [
      {
        id: crypto.randomUUID(),
        role: "user",
        kind: "passage",
        page: focus.page,
        content: text,
        createdAt: new Date().toISOString(),
      },
    ]);
    await get().reloadAnnotations();
  },
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
  },

  addQuoteFromSelection: async () => {
    const { bookId, selection } = get();
    if (!bookId || !selection?.text) return;
    await local.addQuote({
      id: crypto.randomUUID(),
      bookId,
      page: selection.page,
      text: selection.text,
      rects: selection.rects,
      createdAt: new Date().toISOString(),
    });
    await get().reloadAnnotations();
    set({ sidebarOpen: true, sidebarTab: "notes" });
    get().clearSelection();
  },

  addNoteFromSelection: async (body) => {
    const { bookId, selection } = get();
    if (!bookId || !selection?.text || !body.trim()) return;
    await local.addFragmentNote({
      id: crypto.randomUUID(),
      bookId,
      page: selection.page,
      excerpt: selection.text,
      body: body.trim(),
      rects: selection.rects,
      createdAt: new Date().toISOString(),
    });
    await get().reloadAnnotations();
    set({ sidebarOpen: true, sidebarTab: "notes" });
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

  addMarginText: async (note) => {
    const { bookId } = get();
    if (!bookId) return null;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await local.addMarginText({
      ...note,
      id,
      bookId,
      createdAt: now,
      updatedAt: now,
    });
    await get().reloadAnnotations();
    return id;
  },

  updateMarginText: async (id, patch) => {
    const { bookId } = get();
    if (!bookId) return;
    await local.updateMarginText(bookId, id, patch);
    await get().reloadAnnotations();
  },

  removeMarginText: async (id) => {
    const { bookId } = get();
    if (!bookId) return;
    await local.removeMarginText(bookId, id);
    await get().reloadAnnotations();
  },

  eraseInkNear: async (page, x, y, radius) => {
    const { bookId } = get();
    if (!bookId) return;
    await local.eraseInkNear(bookId, page, x, y, radius);
    await get().reloadAnnotations();
  },

  updateInkStroke: async (id, patch) => {
    const { bookId } = get();
    if (!bookId) return;
    await local.updateInkStroke(bookId, id, patch);
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

  removeNote: async (id) => {
    const { bookId } = get();
    if (!bookId) return;
    await local.removeFragmentNote(bookId, id);
    await get().reloadAnnotations();
  },

  removeInkStroke: async (id) => {
    const { bookId } = get();
    if (!bookId) return;
    await local.removeInkStroke(bookId, id);
    await get().reloadAnnotations();
  },

  sendChat: async (question, bookTitle, locale) => {
    const { bookId, annotations, page, selection, chatFocus } = get();
    if (!bookId || !question.trim()) return;
    const userMsg = {
      id: crypto.randomUUID(),
      role: "user" as const,
      content: question.trim(),
      createdAt: new Date().toISOString(),
    };
    await local.appendChat(bookId, [userMsg]);
    await get().reloadAnnotations();

    const prior = get().annotations.chat.filter((m) => m.id !== userMsg.id);
    const lastPassage = [...prior].reverse().find((m) => m.kind === "passage");
    const focusText = chatFocus
      ? [chatFocus.text, chatFocus.sentence]
          .filter((x, i, arr) => x && arr.indexOf(x) === i)
          .join("\n\n")
      : lastPassage?.content || selection?.sentence || selection?.text || "";
    const contextPage = chatFocus?.page ?? lastPassage?.page ?? page;
    const context = packChatContext(prior, {
      page: contextPage,
      focus: focusText,
      quotes: !chatFocus && !lastPassage && !selection
        ? [
            ...annotations.quotes.slice(-2).map((q) => q.text),
            ...annotations.highlights.slice(-2).map((h) => h.text),
          ]
        : [],
    });

    let answer: string;
    try {
      answer = await stubChat(question, bookTitle, context, locale);
    } catch (e) {
      if (e instanceof AiRequestError && e.code === "LOGIN_REQUIRED") {
        answer =
          locale === "ru"
            ? "Чтобы писать в чат, войди в аккаунт."
            : "Sign in to use the reading chat.";
      } else if (e instanceof AiRequestError && e.code === "QUOTA_EXCEEDED") {
        answer =
          locale === "ru"
            ? "Месячный лимит сообщений в чате исчерпан. Он обновится в следующем месяце; Pro даёт больше."
            : "Monthly chat limit reached. It resets next month; Pro includes more messages.";
      } else {
        answer = e instanceof Error ? e.message : "Error";
      }
    }
    await local.appendChat(bookId, [
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: answer,
        createdAt: new Date().toISOString(),
      },
    ]);
    await get().reloadAnnotations();
    set({ chatFocus: null });
  },
}));
