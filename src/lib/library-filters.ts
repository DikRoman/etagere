import type { BookMeta, LibraryFilter } from "./types";

export function bookProgress(book: BookMeta): number {
  return Math.min(
    100,
    Math.round(((book.lastPage || 1) / Math.max(1, book.pageCount)) * 100),
  );
}

export function isBookFinished(book: BookMeta): boolean {
  return book.readingStatus === "finished" || bookProgress(book) >= 100;
}

export function filterBooks(
  books: BookMeta[],
  filter: LibraryFilter,
): BookMeta[] {
  switch (filter.kind) {
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
