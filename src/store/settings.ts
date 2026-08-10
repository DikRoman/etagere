import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale } from "../lib/types";

interface SettingsState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      locale: "ru",
      setLocale: (locale) => set({ locale }),
    }),
    { name: "bookshelf-settings" },
  ),
);
