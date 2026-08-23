"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { BookMeta } from "@/lib/types";
import { listAllAnnotations } from "@/lib/storage/local";
import { pagesLabel, weekBars } from "@/lib/reading-log";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";

function bookProgress(book: BookMeta): number {
  return Math.min(
    100,
    Math.round(((book.lastPage || 1) / Math.max(1, book.pageCount)) * 100),
  );
}

export function ShelfRecent({ books }: { books: BookMeta[] }) {
  const locale = useSettingsStore((s) => s.locale);
  const recent = useMemo(
    () =>
      [...books]
        .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
        .slice(0, 8),
    [books],
  );

  if (recent.length === 0) return null;

  return (
    <div className="stats-recent">
      <div className="stats-recent-head">
        <h2>{t("recentlyAdded", locale)}</h2>
      </div>
      <div className="stats-recent-rail">
        {recent.map((book) => (
          <Link
            key={book.id}
            href={`/reader/${book.id}`}
            className="stats-recent-item"
            title={book.title}
          >
            <div className="stats-recent-cover">
              {book.coverDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={book.coverDataUrl} alt="" />
              ) : (
                <div className="stats-recent-fallback">
                  {book.title.slice(0, 24)}
                </div>
              )}
            </div>
            <span className="stats-recent-title">{book.title}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function ShelfStats({ books }: { books: BookMeta[] }) {
  const locale = useSettingsStore((s) => s.locale);
  const showShelfNotes = useSettingsStore((s) => s.showShelfNotes);
  const setShowShelfNotes = useSettingsStore((s) => s.setShowShelfNotes);
  const dailyGoal = useSettingsStore((s) => s.dailyGoal);
  const setDailyGoal = useSettingsStore((s) => s.setDailyGoal);
  const [editingGoal, setEditingGoal] = useState(false);
  const [tick, setTick] = useState(0);
  const [counts, setCounts] = useState({
    bookmarks: 0,
    highlights: 0,
    quotes: 0,
  });

  useEffect(() => {
    const refresh = () => setTick((n) => n + 1);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  useEffect(() => {
    if (!showShelfNotes) return;
    let alive = true;
    void (async () => {
      const all = await listAllAnnotations();
      let bookmarks = 0;
      let highlights = 0;
      let quotes = 0;
      for (const book of books) {
        const a = all[book.id];
        if (!a) continue;
        bookmarks += a.bookmarks.length;
        highlights += a.highlights.length;
        quotes += a.quotes.length;
      }
      if (alive) setCounts({ bookmarks, highlights, quotes });
    })();
    return () => {
      alive = false;
    };
  }, [books, showShelfNotes]);

  const stats = useMemo(() => {
    const active = books.filter((b) => {
      const p = bookProgress(b);
      return p > 0 && p < 100;
    }).length;
    return { active };
  }, [books]);

  const bars = useMemo(() => weekBars(locale), [locale, tick]);
  const todayPages = bars.find((b) => b.isToday)?.pages ?? 0;
  const scale = Math.max(dailyGoal, ...bars.map((b) => b.pages), 1);
  const continueBook = useMemo(() => {
    return [...books]
      .filter((b) => b.lastPage > 1)
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )[0];
  }, [books]);

  if (books.length === 0) return null;

  return (
    <section className="shelf-stats" aria-label={t("statsTitle", locale)}>
      <div className="stats-toolbar">
        <h2 className="stats-toolbar-title">{t("statsTitle", locale)}</h2>
        <button
          type="button"
          className={`stats-notes-toggle ${showShelfNotes ? "is-on" : ""}`}
          aria-pressed={showShelfNotes}
          onClick={() => setShowShelfNotes(!showShelfNotes)}
        >
          {showShelfNotes
            ? t("hideShelfNotes", locale)
            : t("showShelfNotes", locale)}
        </button>
      </div>

      <div
        className={`stats-grid ${showShelfNotes ? "" : "stats-grid--solo"}`.trim()}
      >
        <article className="reading-stat">
          <div className="reading-stat-top">
            <div>
              <p className="reading-stat-kicker">
                {t("progressToday", locale)}
              </p>
              <p className="reading-stat-metric">
                <span className="reading-stat-value">
                  {todayPages} {pagesLabel(todayPages, locale)}
                </span>
                <button
                  type="button"
                  className="reading-stat-goal"
                  onClick={() => setEditingGoal((v) => !v)}
                  aria-expanded={editingGoal}
                  title={t("dailyGoal", locale)}
                >
                  /{dailyGoal}
                </button>
              </p>
            </div>
            {continueBook ? (
              <Link
                href={`/reader/${continueBook.id}`}
                className="reading-stat-go"
                aria-label={`${t("continueReading", locale)}: ${continueBook.title}`}
              >
                <Chevron />
              </Link>
            ) : (
              <button
                type="button"
                className="reading-stat-go"
                onClick={() => setEditingGoal((v) => !v)}
                aria-label={t("dailyGoal", locale)}
              >
                <Chevron />
              </button>
            )}
          </div>

          {editingGoal && (
            <div className="reading-stat-edit">
              <span>{t("dailyGoal", locale)}</span>
              <button
                type="button"
                onClick={() => setDailyGoal(dailyGoal - 5)}
                aria-label="−"
              >
                −
              </button>
              <input
                type="number"
                min={5}
                max={500}
                value={dailyGoal}
                onChange={(e) => setDailyGoal(Number(e.target.value))}
              />
              <button
                type="button"
                onClick={() => setDailyGoal(dailyGoal + 5)}
                aria-label="+"
              >
                +
              </button>
            </div>
          )}

          <ol className="reading-stat-week">
            {bars.map((bar) => {
              const ratio = bar.isFuture ? 0 : Math.min(1, bar.pages / scale);
              return (
                <li
                  key={bar.key}
                  className={bar.isToday ? "is-today" : undefined}
                >
                  <div className="reading-stat-track" title={`${bar.pages}`}>
                    <div
                      className={`reading-stat-fill${bar.isToday ? " is-today" : ""}`}
                      style={{
                        height: `${Math.round(ratio * 100)}%`,
                        minHeight: ratio > 0 ? 6 : 0,
                      }}
                    />
                  </div>
                  <span className="reading-stat-dow">{bar.label}</span>
                  {bar.isToday && (
                    <i className="reading-stat-dot" aria-hidden />
                  )}
                </li>
              );
            })}
          </ol>
        </article>

        {showShelfNotes && (
          <article className="stats-card stats-card--marks">
            <p className="stats-card-label">{t("readingNotes", locale)}</p>
            <ul className="stats-rows">
              <li>
                <span>{t("booksInProgress", locale)}</span>
                <strong>{stats.active}</strong>
              </li>
              <li>
                <span>{t("bookmarks", locale)}</span>
                <strong>{counts.bookmarks}</strong>
              </li>
              <li>
                <span>{t("highlights", locale)}</span>
                <strong>{counts.highlights}</strong>
              </li>
              <li>
                <span>{t("quotes", locale)}</span>
                <strong>{counts.quotes}</strong>
              </li>
            </ul>
          </article>
        )}
      </div>
    </section>
  );
}

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path
        d="M5 2.5 10 7 5 11.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
