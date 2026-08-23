"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLibraryStore } from "@/store/library";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";
import { filterBooks } from "@/lib/library-filters";
import { BookCover } from "./BookCover";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  const n = Math.max(1, size);
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function booksThatFit(el: HTMLElement): number {
  const styles = getComputedStyle(el);
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const len = (value: string, fallback: number) => {
    const raw = value.trim();
    if (!raw) return fallback;
    if (raw.endsWith("rem")) return parseFloat(raw) * rem;
    if (raw.endsWith("px")) return parseFloat(raw);
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  const cover = len(styles.getPropertyValue("--shelf-cover-w"), 7.25 * rem);
  const gap = len(styles.getPropertyValue("--shelf-gap-x"), rem);
  const pad = len(styles.getPropertyValue("--shelf-pad-x"), 0.5 * rem);
  const inner = el.clientWidth - pad * 2;
  return Math.max(1, Math.floor((inner + gap) / (cover + gap)));
}

export function LibraryBooksGrid({
  query = "",
  emptyHint,
}: {
  query?: string;
  emptyHint?: string;
}) {
  const locale = useSettingsStore((s) => s.locale);
  const books = useLibraryStore((s) => s.books);
  const loading = useLibraryStore((s) => s.loading);
  const libraryFilter = useLibraryStore((s) => s.libraryFilter);
  const rootRef = useRef<HTMLDivElement>(null);
  const [perRow, setPerRow] = useState(8);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      // An unlaid-out shelf measures as zero; keep the last usable count.
      if (el.clientWidth < 1) return;
      setPerRow(booksThatFit(el));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return filterBooks(books, libraryFilter).filter((b) => {
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        (b.author ?? "").toLowerCase().includes(q)
      );
    });
  }, [books, libraryFilter, query]);

  const rows = chunk(filtered, perRow);

  // The shelf container stays mounted through loading and empty states, so the
  // width it was measured at survives filter switches.
  return (
    <div className="shelf-rows" ref={rootRef}>
      {loading && (
        <p className="empty-state">
          {locale === "ru" ? "Загрузка…" : "Loading…"}
        </p>
      )}
      {!loading && filtered.length === 0 && (
        <p className="empty-state">{emptyHint ?? t("emptyShelf", locale)}</p>
      )}
      {!loading &&
        rows.map((row, rowIndex) => (
          <section key={rowIndex} className="shelf-row">
            <div className="shelf-stage">
              <div className="shelf-books">
                {row.map((book, i) => (
                  <BookCover
                    key={book.id}
                    book={book}
                    index={rowIndex * perRow + i}
                    part="cover"
                  />
                ))}
              </div>
              <div className="shelf-plank" aria-hidden />
            </div>
            <div className="shelf-captions">
              {row.map((book, i) => (
                <BookCover
                  key={book.id}
                  book={book}
                  index={rowIndex * perRow + i}
                  part="details"
                />
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
