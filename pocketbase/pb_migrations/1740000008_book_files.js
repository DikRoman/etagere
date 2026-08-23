/// <reference path="../pb_data/types.d.ts" />

/**
 * Book PDF/EPUB files live on the account (PocketBase), IndexedDB is a cache.
 */
migrate(
  (app) => {
    const books = app.findCollectionByNameOrId("books");
    const maxSize = 200 * 1024 * 1024;
    const mimeTypes = [
      "application/pdf",
      "application/epub+zip",
      "application/octet-stream",
    ];
    const existing = books.fields.getByName("file");
    if (existing) {
      existing.maxSize = maxSize;
      existing.mimeTypes = mimeTypes;
    } else {
      books.fields.add(
        new FileField({
          name: "file",
          maxSelect: 1,
          maxSize,
          mimeTypes,
        }),
      );
    }
    app.save(books);
  },
  (app) => {
    const books = app.findCollectionByNameOrId("books");
    const field = books.fields.getByName("file");
    if (field) {
      field.maxSize = 5 * 1024 * 1024;
      app.save(books);
    }
  },
);
