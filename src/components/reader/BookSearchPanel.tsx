"use client";

import { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "@/store/settings";
import { useReaderStore } from "@/store/reader";
import { t } from "@/lib/i18n";
import type { BookFormat } from "@/lib/types";
import {
  bookIndexStatus,
  ensureBookIndex,
  searchBook,
  subscribeBookIndex,
  type BookHit,
} from "@/lib/book-search";

export function BookSearchPanel({
  bookId,
  format,
}: {
  bookId: string;
  format: BookFormat;
}) {
  const locale = useSettingsStore((s) => s.locale);
  const goToPage = useReaderStore((s) => s.goToPage);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(() => bookIndexStatus(bookId));
  const [results, setResults] = useState<BookHit[]>([]);
  const timer = useRef<number | null>(null);
  const qRef = useRef("");

  useEffect(() => {
    return subscribeBookIndex(bookId, () => {
      const next = bookIndexStatus(bookId);
      setStatus(next);
      if (next === "ready" && qRef.current.trim().length >= 2) {
        setResults(searchBook(bookId, qRef.current));
      }
    });
  }, [bookId]);

  async function run(query: string) {
    const needle = query.trim();
    if (needle.length < 2) {
      setResults([]);
      return;
    }
    setBusy(true);
    try {
      await ensureBookIndex(bookId);
      setResults(searchBook(bookId, needle));
    } finally {
      setBusy(false);
    }
  }

  function onChange(value: string) {
    setQ(value);
    qRef.current = value;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void run(value);
    }, 160);
  }

  const indexing = status === "indexing";
  const chapterHits = results.length > 0;

  return (
    <div className="book-search">
      <div className="book-search-row">
        <input
          value={q}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void run(q);
          }}
          placeholder={t("searchInBook", locale)}
          aria-label={t("searchInBook", locale)}
        />
        <button
          type="button"
          className="btn-ghost compact"
          disabled={busy || indexing}
          onClick={() => void run(q)}
        >
          {indexing || busy ? t("searching", locale) : t("search", locale)}
        </button>
      </div>
      {(indexing && q.length >= 2) ||
      chapterHits ||
      (!busy && !indexing && q.length >= 2 && results.length === 0) ? (
        <div className="book-search-menu">
          {indexing && q.length >= 2 && (
            <span className="muted tiny">{t("indexingBook", locale)}</span>
          )}
          {chapterHits && (
            <ul className="search-hits">
              {results.map((r, i) => (
                <li key={`${r.page}-${i}`}>
                  <button type="button" onClick={() => void goToPage(r.page)}>
                    <strong>
                      {format === "epub"
                        ? `${t("epubChapter", locale)} ${r.page}`
                        : `p. ${r.page}`}
                    </strong>{" "}
                    {r.snippet}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!busy && !indexing && q.length >= 2 && results.length === 0 && (
            <span className="muted tiny">{t("noResults", locale)}</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
