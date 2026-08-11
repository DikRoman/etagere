"use client";

import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";
import type { ReaderTheme } from "@/lib/types";

export function ThemeSwitcher() {
  const locale = useSettingsStore((s) => s.locale);
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  const items: { id: ReaderTheme; label: string }[] = [
    { id: "day", label: t("themeDay", locale) },
    { id: "paper", label: t("themePaper", locale) },
    { id: "night", label: t("themeNight", locale) },
  ];

  return (
    <div className="lang-switch theme-switch" role="group">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={theme === it.id ? "active" : ""}
          onClick={() => setTheme(it.id)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
