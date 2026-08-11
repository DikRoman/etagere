import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale, ReaderTheme } from "../lib/types";

interface SettingsState {
  locale: Locale;
  theme: ReaderTheme;
  spread: boolean;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: ReaderTheme) => void;
  setSpread: (spread: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      locale: "ru",
      theme: "day",
      spread: false,
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => set({ theme }),
      setSpread: (spread) => set({ spread }),
    }),
    { name: "etagere-settings" },
  ),
);
