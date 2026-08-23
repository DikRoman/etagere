"use client";

import { useEffect } from "react";
import { useLibraryStore } from "@/store/library";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";

export function SelectionBar() {
  const locale = useSettingsStore((s) => s.locale);
  const selectMode = useLibraryStore((s) => s.selectMode);
  const selectedBookIds = useLibraryStore((s) => s.selectedBookIds);
  const libraryFilter = useLibraryStore((s) => s.libraryFilter);
  const exitSelectMode = useLibraryStore((s) => s.exitSelectMode);
  const removeSelectedBooks = useLibraryStore((s) => s.removeSelectedBooks);
  const removeSelectedFromCollection = useLibraryStore(
    (s) => s.removeSelectedFromCollection,
  );

  useEffect(() => {
    document.body.classList.toggle("is-selecting-books", selectMode);
    return () => document.body.classList.remove("is-selecting-books");
  }, [selectMode]);

  useEffect(() => {
    if (!selectMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitSelectMode();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectMode, exitSelectMode]);

  if (!selectMode) return null;

  const n = selectedBookIds.length;
  const ru = locale === "ru";
  const ruWord = (() => {
    const n10 = n % 10;
    const n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return "книга";
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return "книги";
    return "книг";
  })();
  const countLabel =
    n === 0
      ? ru
        ? "Выбери книги"
        : "Select books"
      : ru
        ? `${n} ${ruWord}`
        : `${n} selected`;

  return (
    <div className="shelf-select-bar" role="toolbar" aria-label={countLabel}>
      <p className="shelf-select-count">{countLabel}</p>
      <p className="shelf-select-hint">{t("selectBooksHint", locale)}</p>
      <div className="shelf-select-actions">
        {libraryFilter.kind === "collection" && (
          <button
            type="button"
            className="btn-ghost"
            disabled={n === 0}
            onClick={() => {
              if (libraryFilter.kind !== "collection") return;
              void removeSelectedFromCollection(libraryFilter.id);
            }}
          >
            {t("removeFromCollection", locale)}
          </button>
        )}
        <button
          type="button"
          className="btn-ghost"
          disabled={n === 0}
          onClick={() => {
            if (confirm(t("removeSelectedConfirm", locale))) {
              void removeSelectedBooks();
            }
          }}
        >
          {t("delete", locale)}
        </button>
        <button type="button" className="btn-primary" onClick={exitSelectMode}>
          {t("selectDone", locale)}
        </button>
      </div>
    </div>
  );
}
