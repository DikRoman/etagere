import { create } from "zustand";
import {
  DEFAULT_HIGHLIGHT_SLOTS,
  isHighlightColor,
} from "@/lib/highlight-color";
import { persist } from "zustand/middleware";
import {
  EPUB_TYPOGRAPHY_DEFAULTS,
  MARGIN_RATIO_DEFAULT,
  MARGIN_RATIO_MAX,
  MARGIN_RATIO_MIN,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  type EpubTypography,
  type Locale,
  type NotePaper,
  type ReaderTheme,
} from "../lib/types";

interface SettingsState {
  locale: Locale;
  theme: ReaderTheme;
  spread: boolean;
  showShelfNotes: boolean;
  epubType: EpubTypography;
  notePaper: NotePaper;
  sidebarWidth: number;
  marginNotes: boolean;
  vocabMarks: boolean;
  highlightSlots: string[];
  marginRatio: number;
  filmstripOpen: boolean;
  dailyGoal: number;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: ReaderTheme) => void;
  setSpread: (spread: boolean) => void;
  setShowShelfNotes: (show: boolean) => void;
  setEpubType: (patch: Partial<EpubTypography>) => void;
  resetEpubType: () => void;
  setNotePaper: (paper: NotePaper) => void;
  setSidebarWidth: (width: number) => void;
  setMarginNotes: (on: boolean) => void;
  setVocabMarks: (on: boolean) => void;
  setHighlightSlot: (index: number, color: string) => void;
  setMarginRatio: (ratio: number) => void;
  setFilmstripOpen: (open: boolean) => void;
  setDailyGoal: (n: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      locale: "ru",
      theme: "day",
      spread: false,
      showShelfNotes: true,
      epubType: EPUB_TYPOGRAPHY_DEFAULTS,
      notePaper: "plain",
      sidebarWidth: SIDEBAR_WIDTH_DEFAULT,
      marginNotes: true,
      vocabMarks: true,
      highlightSlots: [...DEFAULT_HIGHLIGHT_SLOTS],
      marginRatio: MARGIN_RATIO_DEFAULT,
      filmstripOpen: false,
      dailyGoal: 20,
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => set({ theme }),
      setSpread: (spread) => set({ spread }),
      setShowShelfNotes: (showShelfNotes) => set({ showShelfNotes }),
      setEpubType: (patch) =>
        set((state) => ({ epubType: { ...state.epubType, ...patch } })),
      resetEpubType: () => set({ epubType: EPUB_TYPOGRAPHY_DEFAULTS }),
      setNotePaper: (notePaper) => set({ notePaper }),
      setSidebarWidth: (width) =>
        set({
          sidebarWidth: Math.min(
            SIDEBAR_WIDTH_MAX,
            Math.max(SIDEBAR_WIDTH_MIN, Math.round(width)),
          ),
        }),
      setMarginNotes: (marginNotes) => set({ marginNotes }),
      setVocabMarks: (vocabMarks) => set({ vocabMarks }),
      setHighlightSlot: (index, color) =>
        set((state) => {
          const slots = [...state.highlightSlots];
          slots[index] = color;
          return { highlightSlots: slots };
        }),
      setFilmstripOpen: (filmstripOpen) => set({ filmstripOpen }),
      setDailyGoal: (n) =>
        set({
          dailyGoal: Math.min(500, Math.max(5, Math.round(Number(n) || 20))),
        }),
      setMarginRatio: (ratio) =>
        set({
          marginRatio: Math.min(
            MARGIN_RATIO_MAX,
            Math.max(MARGIN_RATIO_MIN, ratio),
          ),
        }),
    }),
    {
      name: "etagere-settings",
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          ...saved,
          // Settings saved by older builds have no typography block yet.
          epubType: { ...current.epubType, ...(saved.epubType ?? {}) },
          // A zero margin used to mean "off"; the toggle owns that now.
          marginNotes: saved.marginNotes ?? (saved.marginRatio ?? 1) > 0,
          vocabMarks: saved.vocabMarks ?? true,
          highlightSlots:
            Array.isArray(saved.highlightSlots) &&
            saved.highlightSlots.length === 3 &&
            saved.highlightSlots.every(isHighlightColor)
              ? saved.highlightSlots
              : [...DEFAULT_HIGHLIGHT_SLOTS],
          marginRatio: Math.min(
            MARGIN_RATIO_MAX,
            Math.max(
              MARGIN_RATIO_MIN,
              saved.marginRatio ?? current.marginRatio,
            ),
          ),
        };
      },
    },
  ),
);
