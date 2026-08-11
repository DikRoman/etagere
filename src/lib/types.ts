export type Locale = "ru" | "en";
export type ReaderTheme = "day" | "paper" | "night";
export type HighlightColor = "yellow" | "green" | "blue" | "coral";
export type ReaderTool = "select" | "pen" | "eraser";
export type SidebarTab =
  | "bookmarks"
  | "notes"
  | "toc"
  | "search"
  | "chat"
  | "cards";
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
  note?: string;
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
  createdAt: string;
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
}

export interface BookAnnotations {
  highlights: Highlight[];
  bookmarks: Bookmark[];
  quotes: Quote[];
  ink: InkStroke[];
  flashcards: Flashcard[];
  chat: ChatMessage[];
}

export interface TocItem {
  title: string;
  page: number;
  children?: TocItem[];
}

export interface EpubChapter {
  id: string;
  title: string;
  html: string;
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
  /** For EPUB: chapter count mirrors pageCount; chapters stored separately */
  syncedAt?: string;
}

export const HIGHLIGHT_COLORS: Record<
  HighlightColor,
  { fill: string; label: { ru: string; en: string } }
> = {
  yellow: { fill: "rgba(255, 214, 10, 0.45)", label: { ru: "Жёлтый", en: "Yellow" } },
  green: { fill: "rgba(52, 199, 89, 0.4)", label: { ru: "Зелёный", en: "Green" } },
  blue: { fill: "rgba(50, 173, 230, 0.4)", label: { ru: "Синий", en: "Blue" } },
  coral: { fill: "rgba(255, 105, 97, 0.4)", label: { ru: "Коралловый", en: "Coral" } },
};

export const PEN_COLORS = ["#1c2430", "#245bdb", "#c0392b", "#1e8449"] as const;
