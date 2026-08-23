/// <reference path="../pb_data/types.d.ts" />

/**
 * Newsletter subscribers + require verified users for auth.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.onlyVerified = true;
    app.save(users);

    const collection = new Collection({
      type: "base",
      name: "newsletter_subscribers",
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
      fields: [
        {
          type: "email",
          name: "email",
          required: true,
          unique: true,
        },
        {
          type: "select",
          name: "status",
          required: true,
          maxSelect: 1,
          values: ["pending", "active", "unsubscribed"],
        },
        {
          type: "text",
          name: "token",
          required: true,
        },
        {
          type: "text",
          name: "locale",
          required: false,
        },
        {
          type: "date",
          name: "confirmed_at",
          required: false,
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_newsletter_email ON newsletter_subscribers (email)",
        "CREATE INDEX idx_newsletter_token ON newsletter_subscribers (token)",
      ],
    });
    app.save(collection);
  },
  (app) => {
    try {
      const c = app.findCollectionByNameOrId("newsletter_subscribers");
      app.delete(c);
    } catch (_) {
      /* ignore */
    }
    try {
      const users = app.findCollectionByNameOrId("users");
      users.onlyVerified = false;
      app.save(users);
    } catch (_) {
      /* ignore */
    }
  },
);
