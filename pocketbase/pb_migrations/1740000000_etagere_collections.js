/// <reference path="../pb_data/types.d.ts" />

/**
 * Creates app collections for étagère.
 * Applied automatically on PocketBase start.
 */
migrate(
  (app) => {
    // subscriptions
    {
      const users = app.findCollectionByNameOrId("users");
      const collection = new Collection({
        type: "base",
        name: "subscriptions",
        listRule: "user = @request.auth.id",
        viewRule: "user = @request.auth.id",
        createRule: "user = @request.auth.id && plan = 'free' && status = 'active'",
        updateRule: "",
        deleteRule: "",
        fields: [
          {
            type: "relation",
            name: "user",
            required: true,
            collectionId: users.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            type: "select",
            name: "plan",
            required: true,
            maxSelect: 1,
            values: ["free", "pro"],
          },
          {
            type: "select",
            name: "status",
            required: true,
            maxSelect: 1,
            values: ["active", "canceled", "past_due", "trialing"],
          },
          {
            type: "date",
            name: "expires_at",
            required: false,
          },
          {
            type: "text",
            name: "provider",
            required: false,
          },
          {
            type: "text",
            name: "provider_payment_id",
            required: false,
          },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_subscriptions_user ON subscriptions (user)",
        ],
      });
      app.save(collection);
    }

    // books (cloud metadata; file optional for later sync)
    {
      const users = app.findCollectionByNameOrId("users");
      const collection = new Collection({
        type: "base",
        name: "books",
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
          { type: "text", name: "title", required: true },
          { type: "text", name: "author", required: false },
          {
            type: "select",
            name: "format",
            required: true,
            maxSelect: 1,
            values: ["pdf", "epub"],
          },
          { type: "number", name: "page_count", required: true },
          { type: "number", name: "last_page", required: false },
          { type: "json", name: "tags", required: false },
          { type: "text", name: "local_id", required: false },
          { type: "file", name: "cover", required: false, maxSelect: 1 },
          { type: "file", name: "file", required: false, maxSelect: 1 },
        ],
      });
      app.save(collection);
    }

    // annotations JSON blob per book
    {
      const users = app.findCollectionByNameOrId("users");
      const books = app.findCollectionByNameOrId("books");
      const collection = new Collection({
        type: "base",
        name: "annotations",
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
          {
            type: "relation",
            name: "book",
            required: true,
            collectionId: books.id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          { type: "json", name: "data", required: true },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_annotations_book ON annotations (book)",
        ],
      });
      app.save(collection);
    }
  },
  (app) => {
    for (const name of ["annotations", "books", "subscriptions"]) {
      try {
        const c = app.findCollectionByNameOrId(name);
        app.delete(c);
      } catch (_) {
        /* ignore */
      }
    }
  },
);
