"use client";

import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

export function LanguageSwitcher() {
  const locale = useSettingsStore((s) => s.locale);
  const setLocale = useSettingsStore((s) => s.setLocale);

  return (
    <div className="lang-switch" role="group" aria-label={t("language", locale)}>
      {(["ru", "en"] as Locale[]).map((code) => (
        <button
          key={code}
          type="button"
          className={locale === code ? "active" : ""}
          onClick={() => setLocale(code)}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
