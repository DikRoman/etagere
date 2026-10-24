/// <reference path="../pb_data/types.d.ts" />

/**
 * Vocabulary on the server. The word list used to live only in one browser's
 * IndexedDB, so another device, another browser or cleared site data showed
 * an empty dictionary.
 *
 * Each card is stored whole in `data` (a VocabEntry, SRS state included) so
 * the client can evolve the card shape without a migration. `deleted` is a
 * tombstone: without it a card removed on one device would come back from
 * another device's copy on the next sync.
 */
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId("vocab_entries");
      return; // already there
    } catch (_) {
      /* create below */
    }
    const users = app.findCollectionByNameOrId("users");
    const vocab = new Collection({
      type: "base",
      name: "vocab_entries",
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
        { type: "text", name: "word", required: false, max: 200 },
        { type: "json", name: "data", required: false },
        { type: "text", name: "updated_at", required: false, max: 40 },
        { type: "bool", name: "deleted", required: false },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_vocab_user_local ON vocab_entries (user, local_id)",
      ],
    });
    app.save(vocab);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("vocab_entries"));
    } catch (_) {
      /* ignore */
    }
  },
);
