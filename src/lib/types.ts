export type Locale = "ru" | "en";
export type ReaderTheme = "day" | "paper" | "night";
export type HighlightColor = "yellow" | "green" | "blue" | "coral";
export type ReaderTool = "select" | "pen" | "eraser" | "type";
export type SidebarTab =
  "bookmarks" | "notes" | "toc" | "search" | "chat";
export type BookFormat = "pdf" | "epub";

export interface TextRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Highlight {
  id: string;
  bookId: string;
  page: number;
  color: HighlightColor;
  text: string;
  rects: TextRect[];
  createdAt: string;
}

export interface Bookmark {
  id: string;
  bookId: string;
  page: number;
  label?: string;
  createdAt: string;
}

export interface Quote {
  id: string;
  bookId: string;
  page: number;
  text: string;
  rects: TextRect[];
  createdAt: string;
  /** @deprecated migrated to FragmentNote */
  note?: string;
}

/** User's own thoughts tied to a text fragment. */
export interface FragmentNote {
  id: string;
  bookId: string;
  page: number;
  excerpt: string;
  body: string;
  rects: TextRect[];
  createdAt: string;
}

export interface InkPoint {
  x: number;
  y: number;
  p?: number;
}

export interface InkStroke {
  id: string;
  bookId: string;
  page: number;
  color: string;
  width: number;
  points: InkPoint[];
  /**
   * Where the stroke lives. `margin` stays in the writing strip and is
   * hidden with it. Absent = legacy coords against page+margin overlay.
   */
  space?: "page" | "margin";
  createdAt: string;
}

/** Typed note sitting in the writing margin beside a PDF page. */
export interface MarginText {
  id: string;
  bookId: string;
  page: number;
  /**
   * Normalized box. `space: "margin"` means the writing strip only.
   * Absent = legacy coords against the full overlay (page + margin).
   */
  space?: "margin";
  x: number;
  y: number;
  w: number;
  h: number;
  body: string;
  font: EpubFontChoice;
  /** Fraction of overlay height. */
  fontSize: number;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface Flashcard {
  id: string;
  bookId: string;
  front: string;
  back: string;
  sourcePage?: number;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  /** Quoted book passage attached to the dialogue. */
  kind?: "passage";
  page?: number;
}

export interface BookAnnotations {
  highlights: Highlight[];
  bookmarks: Bookmark[];
  quotes: Quote[];
  notes: FragmentNote[];
  ink: InkStroke[];
  texts: MarginText[];
  flashcards: Flashcard[];
  chat: ChatMessage[];
}

export const QUOTE_MARKER = {
  fill: "rgba(147, 112, 219, 0.28)",
  border: "rgba(108, 76, 180, 0.85)",
};

export const NOTE_MARKER = {
  fill: "rgba(36, 91, 219, 0.18)",
  border: "rgba(36, 91, 219, 0.75)",
};

/** Ruling of the margin panel where notes live. */
export type NotePaper = "plain" | "lines" | "grid" | "gridWide";

export const NOTE_PAPERS: NotePaper[] = ["plain", "lines", "grid", "gridWide"];

/** Writing margin beside a page, as a share of the page width. */
export const MARGIN_RATIO_DEFAULT = 0.3;
export const MARGIN_RATIO_MIN = 0.1;
/** 1 = a full companion sheet the same width as the book page. */
export const MARGIN_RATIO_MAX = 1;

export const SIDEBAR_WIDTH_DEFAULT = 300;
export const SIDEBAR_WIDTH_MIN = 220;
export const SIDEBAR_WIDTH_MAX = 720;

export type EpubFontChoice = "literary" | "grotesque" | "georgia" | "verdana";

/** Reading comfort settings for EPUB text, mirroring what e-readers expose. */
export interface EpubTypography {
  font: EpubFontChoice;
  /** Multiplier of the font size. */
  lineHeight: number;
  /** Gap between paragraphs, in em. */
  paragraphGap: number;
  /** Extra space between words, in em. */
  wordSpacing: number;
  /** Extra space between letters, in em. */
  letterSpacing: number;
  /** Side padding of the text column, in rem. */
  margin: number;
  /** Maximum line length, in em — the classic "measure". */
  measure: number;
  justify: boolean;
}

export const EPUB_FONT_STACKS: Record<EpubFontChoice, string> = {
  literary: "var(--font-cyr-display), Georgia, serif",
  grotesque: "var(--font-sans), system-ui, sans-serif",
  georgia: 'Georgia, "Times New Roman", serif',
  verdana: "Verdana, Tahoma, sans-serif",
};

export const EPUB_TYPOGRAPHY_DEFAULTS: EpubTypography = {
  font: "literary",
  lineHeight: 1.65,
  paragraphGap: 0.9,
  wordSpacing: 0,
  letterSpacing: 0,
  margin: 1.25,
  measure: 34,
  justify: false,
};

export interface TocItem {
  title: string;
  page: number;
  /** EPUB only: element id to scroll to inside the chapter. */
  anchor?: string;
  /** EPUB only: spine href, optionally with a fragment. */
  href?: string;
  children?: TocItem[];
}

/** Where a table of contents came from, weakest source last. */
export type TocSource = "outline" | "links" | "text" | "none";

export interface EpubChapter {
  id: string;
  title: string;
  html?: string;
  /** Path of the chapter document inside the EPUB archive. */
  path?: string;
}

export type ReadingStatus = "none" | "want" | "finished";

export type LibraryFilter =
  | { kind: "all" }
  | { kind: "want" }
  | { kind: "finished" }
  | { kind: "epub" }
  | { kind: "pdf" }
  | { kind: "collection"; id: string };

export interface Collection {
  id: string;
  name: string;
  createdAt: string;
}

export interface BookMeta {
  id: string;
  title: string;
  author?: string;
  format: BookFormat;
  pageCount: number;
  coverDataUrl?: string;
  localFileKey: string;
  driveFileId?: string;
  driveAnnotationsId?: string;
  lastPage: number;
  addedAt: string;
  updatedAt: string;
  sizeBytes: number;
  tags: string[];
  collectionIds: string[];
  readingStatus: ReadingStatus;
  /** For EPUB: chapter count mirrors pageCount; chapters stored separately */
  syncedAt?: string;
  /** SHA-256 of the original file bytes — used to match the same book across devices. */
  contentHash?: string;
  /** PocketBase books record id when synced. */
  cloudId?: string;
  /** User's Google Drive / Disk / Dropbox / OneDrive file. */
  cloudProvider?: "gdrive" | "yandex" | "dropbox" | "onedrive";
  cloudFileId?: string;
  /** True when a copy lives on the user's connected disk. */
  hasCloudFile?: boolean;
  /**
   * No copy in this browser yet. The connected disk may still have it.
   */
  missingLocalFile?: boolean;
}

export const HIGHLIGHT_COLORS: Record<
  HighlightColor,
  { fill: string; label: { ru: string; en: string } }
> = {
  yellow: {
    fill: "rgba(255, 214, 10, 0.45)",
    label: { ru: "Жёлтый", en: "Yellow" },
  },
  green: {
    fill: "rgba(52, 199, 89, 0.4)",
    label: { ru: "Зелёный", en: "Green" },
  },
  blue: { fill: "rgba(50, 173, 230, 0.4)", label: { ru: "Синий", en: "Blue" } },
  coral: {
    fill: "rgba(255, 105, 97, 0.4)",
    label: { ru: "Коралловый", en: "Coral" },
  },
};

export const PEN_COLORS = ["#1c2430", "#245bdb", "#c0392b", "#1e8449"] as const;
