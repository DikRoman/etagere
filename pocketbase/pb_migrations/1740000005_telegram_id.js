/// <reference path="../pb_data/types.d.ts" />

/**
 * Telegram Login link on auth users.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    if (!users.fields.getByName("telegramId")) {
      users.fields.add(
        new TextField({
          name: "telegramId",
          required: false,
          max: 64,
        }),
      );
    }
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    try {
      const field = users.fields.getByName("telegramId");
      if (field) users.fields.removeById(field.id);
    } catch (_) {
      /* ignore */
    }
    app.save(users);
  },
);
