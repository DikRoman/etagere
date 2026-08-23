/// <reference path="../pb_data/types.d.ts" />

/**
 * Library metadata sync: fingerprints + collections.
 * Book files stay on the client; PocketBase holds catalog/progress/notes.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const books = app.findCollectionByNameOrId("books");

    if (!books.fields.getByName("content_hash")) {
      books.fields.add(
        new TextField({ name: "content_hash", required: false, max: 128 }),
      );
    }
    if (!books.fields.getByName("drive_file_id")) {
      books.fields.add(
        new TextField({ name: "drive_file_id", required: false, max: 128 }),
      );
    }
    if (!books.fields.getByName("reading_status")) {
      books.fields.add(
        new SelectField({
          name: "reading_status",
          required: false,
          maxSelect: 1,
          values: ["none", "want", "finished"],
        }),
      );
    }
    if (!books.fields.getByName("collection_ids")) {
      books.fields.add(new JSONField({ name: "collection_ids", required: false }));
    }
    if (!books.fields.getByName("size_bytes")) {
      books.fields.add(new NumberField({ name: "size_bytes", required: false }));
    }
    if (!books.fields.getByName("added_at")) {
      books.fields.add(new TextField({ name: "added_at", required: false, max: 40 }));
    }
    if (!books.fields.getByName("meta_updated_at")) {
      books.fields.add(
        new TextField({ name: "meta_updated_at", required: false, max: 40 }),
      );
    }

    try {
      books.addIndex(
        "idx_books_user_hash",
        false,
        "user, content_hash",
        "",
      );
    } catch (_) {
      /* already exists */
    }
    app.save(books);

    try {
      app.findCollectionByNameOrId("library_collections");
    } catch (_) {
      const collections = new Collection({
        type: "base",
        name: "library_collections",
        listRule: "user = @request.auth.id",
        viewRule: "user = @request.auth.id",
        createRule: "user = @request.auth.id",
        updateRule: "user = @request.auth.id",
        deleteRule: "user = @request.auth.id",
        fields: [
          {
            type: "relation",
            name: "user",
            required: true,
            collectionId: users.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { type: "text", name: "local_id", required: true, max: 64 },
          { type: "text", name: "name", required: true, max: 200 },
          { type: "text", name: "created_at", required: false, max: 40 },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_lib_coll_user_local ON library_collections (user, local_id)",
        ],
      });
      app.save(collections);
    }
  },
  (app) => {
    try {
      const c = app.findCollectionByNameOrId("library_collections");
      app.delete(c);
    } catch (_) {
      /* ignore */
    }
    try {
      const books = app.findCollectionByNameOrId("books");
      for (const name of [
        "content_hash",
        "drive_file_id",
        "reading_status",
        "collection_ids",
        "size_bytes",
        "added_at",
        "meta_updated_at",
      ]) {
        const field = books.fields.getByName(name);
        if (field) books.fields.removeById(field.id);
      }
      app.save(books);
    } catch (_) {
      /* ignore */
    }
  },
);
