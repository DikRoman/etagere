/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const collection = new Collection({
      type: "base",
      name: "email_tokens",
      listRule: "",
      viewRule: "",
      createRule: "",
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
          type: "email",
          name: "email",
          required: true,
        },
        {
          type: "text",
          name: "token",
          required: true,
        },
        {
          type: "select",
          name: "type",
          required: true,
          maxSelect: 1,
          values: ["verification", "password_reset"],
        },
        {
          type: "date",
          name: "expires_at",
          required: true,
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_email_tokens_token ON email_tokens (token)",
        "CREATE INDEX idx_email_tokens_email ON email_tokens (email)",
      ],
    });
    app.save(collection);
  },
  (app) => {
    try {
      const c = app.findCollectionByNameOrId("email_tokens");
      app.delete(c);
    } catch (_) {
      /* ignore */
    }
  },
);
