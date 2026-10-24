"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { BookMeta } from "@/lib/types";
import { readingNowBooks, bookProgress } from "@/lib/library-filters";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";

export function ReadingNow({ books }: { books: BookMeta[] }) {
  const locale = useSettingsStore((s) => s.locale);
  const current = useMemo(() => readingNowBooks(books), [books]);
  const hero = current[0];
  const rest = current.slice(1, 8);

  if (!hero) return null;

  const progress = bookProgress(hero);

  return (
    <section className="reading-now" aria-label={t("readingNow", locale)}>
      <Link href={`/reader/${hero.id}`} className="reading-now-hero">
        <div className="reading-now-cover">
          {hero.coverDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero.coverDataUrl} alt="" />
          ) : (
            <div className="reading-now-fallback">{hero.title.slice(0, 40)}</div>
          )}
        </div>
        <div className="reading-now-copy">
          <p className="reading-now-kicker">{t("currentlyReading", locale)}</p>
          <h2>{hero.title}</h2>
          {hero.author ? (
            <p className="reading-now-author">{hero.author}</p>
          ) : null}
          <div className="reading-now-progress">
            <span style={{ width: `${progress}%` }} />
          </div>
          <span className="reading-now-go">{t("continueReading", locale)}</span>
        </div>
      </Link>
      {rest.length > 0 && (
        <div className="reading-now-rail" aria-label={t("readingNow", locale)}>
          {rest.map((book) => (
            <Link
              key={book.id}
              href={`/reader/${book.id}`}
              className="reading-now-rail-item"
              title={book.title}
            >
              <div className="reading-now-rail-cover">
                {book.coverDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={book.coverDataUrl} alt="" />
                ) : (
                  <div className="reading-now-fallback">
                    {book.title.slice(0, 24)}
                  </div>
                )}
              </div>
              <span>{book.title}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
