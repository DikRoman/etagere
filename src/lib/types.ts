export type Locale = "ru" | "en";

export type HighlightColor = "yellow" | "green" | "blue" | "coral";

export type ReaderTool = "select" | "pen" | "eraser";

export type SidebarTab = "bookmarks" | "notes";

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

/** Handwritten stroke; coords are 0–1 relative to page+margin box */
export interface InkPoint {
  x: number;
  y: number;
  /** Pressure 0–1 (Apple Pencil / Force Touch when available) */
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

export interface BookAnnotations {
  highlights: Highlight[];
  bookmarks: Bookmark[];
  quotes: Quote[];
  ink: InkStroke[];
}

export interface BookMeta {
  id: string;
  title: string;
  author?: string;
  pageCount: number;
  coverDataUrl?: string;
  localFileKey: string;
  driveFileId?: string;
  driveAnnotationsId?: string;
  lastPage: number;
  addedAt: string;
  updatedAt: string;
  sizeBytes: number;
}

export interface LibraryState {
  books: BookMeta[];
  driveConnected: boolean;
  driveFolderId?: string;
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
