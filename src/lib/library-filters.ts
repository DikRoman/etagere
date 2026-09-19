import type { BookMeta, Collection, LibraryFilter, Locale } from "./types";
import { t } from "./i18n";

export function bookProgress(book: BookMeta): number {
  return Math.min(
    100,
    Math.round(((book.lastPage || 1) / Math.max(1, book.pageCount)) * 100),
  );
}

export function isBookFinished(book: BookMeta): boolean {
  return book.readingStatus === "finished" || bookProgress(book) >= 100;
}

export function isBookInProgress(book: BookMeta): boolean {
  const p = bookProgress(book);
  return book.readingStatus !== "finished" && p > 1 && p < 100;
}

export function readingNowBooks(books: BookMeta[]): BookMeta[] {
  return [...books]
    .filter(isBookInProgress)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function libraryHeading(
  filter: LibraryFilter,
  collections: Collection[],
  locale: Locale,
): string {
  switch (filter.kind) {
    case "readingNow":
      return t("readingNow", locale);
    case "all":
      return t("filterAll", locale);
    case "want":
      return t("filterWant", locale);
    case "finished":
      return t("filterFinished", locale);
    case "epub":
      return t("filterBooks", locale);
    case "pdf":
      return t("filterPdf", locale);
    case "collection":
      return (
        collections.find((c) => c.id === filter.id)?.name ??
        t("myCollections", locale)
      );
    default:
      return t("myLibrary", locale);
  }
}

export function filterBooks(
  books: BookMeta[],
  filter: LibraryFilter,
): BookMeta[] {
  switch (filter.kind) {
    case "readingNow":
      return readingNowBooks(books);
    case "all":
      return books;
    case "want":
      return books.filter((b) => b.readingStatus === "want");
    case "finished":
      return books.filter(isBookFinished);
    case "epub":
      return books.filter((b) => b.format === "epub");
    case "pdf":
      return books.filter((b) => b.format === "pdf");
    case "collection":
      return books.filter((b) => b.collectionIds.includes(filter.id));
    default:
      return books;
  }
}

export function collectionBookCount(
  books: BookMeta[],
  collectionId: string,
): number {
  return books.filter((b) => b.collectionIds.includes(collectionId)).length;
}
