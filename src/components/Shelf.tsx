"use client";

import { useEffect, useMemo, useState } from "react";
import { useLibraryStore } from "@/store/library";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";
import { BookCover } from "./BookCover";
import { UploadBookButton } from "./UploadBookButton";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function Shelf() {
  const locale = useSettingsStore((s) => s.locale);
  const { books, loading, hydrate, driveConnected, connectDrive } =
    useLibraryStore();
  const [query, setQuery] = useState("");
  const [driveMsg, setDriveMsg] = useState<string | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return books;
    return books.filter((b) => b.title.toLowerCase().includes(q));
  }, [books, query]);

  return (
    <div className="shelf-page">
      <header className="shelf-header">
        <div className="brand-block">
          <p className="brand">{t("appName", locale)}</p>
          <p className="tagline">{t("tagline", locale)}</p>
        </div>
        <div className="shelf-actions">
          <LanguageSwitcher />
          <button
            type="button"
            className={`btn-ghost ${driveConnected ? "is-on" : ""}`}
            onClick={async () => {
              const msg = await connectDrive();
              setDriveMsg(msg);
            }}
          >
            {driveConnected ? t("driveConnected", locale) : t("driveConnect", locale)}
          </button>
          <UploadBookButton />
        </div>
      </header>

      {(driveMsg || !driveConnected) && (
        <p className="drive-hint">
          {driveMsg ?? t("driveLocalMode", locale)}
        </p>
      )}

      <div className="shelf-toolbar">
        <h1>{t("myLibrary", locale)}</h1>
        <input
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder", locale)}
        />
      </div>

      {loading ? (
        <p className="empty-state">{locale === "ru" ? "Загрузка…" : "Loading…"}</p>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <p>{t("emptyShelf", locale)}</p>
          <UploadBookButton />
        </div>
      ) : (
        <div className="shelf-rows">
          {chunk(filtered, 5).map((row, rowIndex) => (
            <section key={rowIndex} className="shelf-row">
              <div className="shelf-books">
                {row.map((book, i) => (
                  <BookCover
                    key={book.id}
                    book={book}
                    index={rowIndex * 5 + i}
                  />
                ))}
              </div>
              <div className="shelf-plank" aria-hidden />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
