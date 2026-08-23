/// <reference path="../pb_data/types.d.ts" />

/**
 * YooKassa fields on subscriptions: saved card + cancel-at-period-end.
 */
migrate(
  (app) => {
    const subs = app.findCollectionByNameOrId("subscriptions");
    if (!subs.fields.getByName("provider_method_id")) {
      subs.fields.add(
        new TextField({
          name: "provider_method_id",
          required: false,
          max: 64,
        }),
      );
    }
    if (!subs.fields.getByName("cancel_at_period_end")) {
      subs.fields.add(
        new BoolField({
          name: "cancel_at_period_end",
        }),
      );
    }
    app.save(subs);
  },
  (app) => {
    const subs = app.findCollectionByNameOrId("subscriptions");
    try {
      const method = subs.fields.getByName("provider_method_id");
      if (method) subs.fields.removeById(method.id);
    } catch (_) {
      /* ignore */
    }
    try {
      const flag = subs.fields.getByName("cancel_at_period_end");
      if (flag) subs.fields.removeById(flag.id);
    } catch (_) {
      /* ignore */
    }
    app.save(subs);
  },
);
