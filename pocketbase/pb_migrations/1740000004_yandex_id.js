/// <reference path="../pb_data/types.d.ts" />

/**
 * Yandex ID link on auth users.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    if (!users.fields.getByName("yandexId")) {
      users.fields.add(
        new TextField({
          name: "yandexId",
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
      const field = users.fields.getByName("yandexId");
      if (field) users.fields.removeById(field.id);
    } catch (_) {
      /* ignore */
    }
    app.save(users);
  },
);
