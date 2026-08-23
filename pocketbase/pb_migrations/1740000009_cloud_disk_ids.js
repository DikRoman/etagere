/// <reference path="../pb_data/types.d.ts" />

/** Where the user's PDF/EPUB lives on Google Drive / Yandex / Dropbox / OneDrive. */
migrate(
  (app) => {
    const books = app.findCollectionByNameOrId("books");
    if (!books.fields.getByName("cloud_provider")) {
      books.fields.add(
        new TextField({ name: "cloud_provider", required: false, max: 24 }),
      );
    }
    if (!books.fields.getByName("cloud_file_id")) {
      books.fields.add(
        new TextField({ name: "cloud_file_id", required: false, max: 256 }),
      );
    }
    app.save(books);
  },
  (app) => {
    const books = app.findCollectionByNameOrId("books");
    for (const name of ["cloud_provider", "cloud_file_id"]) {
      const field = books.fields.getByName(name);
      if (field) books.fields.removeById(field.id);
    }
    app.save(books);
  },
);
