/// <reference path="../pb_data/types.d.ts" />

/**
 * Monthly per-user AI counters. Written only by the Next.js admin API.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const collection = new Collection({
      type: "base",
      name: "ai_usage",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
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
        { type: "text", name: "period", required: true, max: 7 },
        {
          type: "number",
          name: "explain_count",
          required: false,
          min: 0,
        },
        {
          type: "number",
          name: "summary_count",
          required: false,
          min: 0,
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_ai_usage_user_period ON ai_usage (user, period)",
      ],
    });
    app.save(collection);
  },
  (app) => {
    try {
      const c = app.findCollectionByNameOrId("ai_usage");
      app.delete(c);
    } catch (_) {
      /* ignore */
    }
  },
);
