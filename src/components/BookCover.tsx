"use client";

import Link from "next/link";
import type { BookMeta } from "@/lib/types";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";
import { useLibraryStore } from "@/store/library";

function CoverArt({ book }: { book: BookMeta }) {
  if (book.coverDataUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={book.coverDataUrl} alt="" className="cover-img" />
    );
  }
  const hue = (book.title.charCodeAt(0) * 37) % 360;
  return (
    <div
      className="cover-fallback"
      style={{
        background: `linear-gradient(155deg, hsl(${hue} 28% 28%), hsl(${(hue + 40) % 360} 35% 18%))`,
      }}
    >
      <span>{book.title.slice(0, 48)}</span>
    </div>
  );
}

export function BookCover({ book, index }: { book: BookMeta; index: number }) {
  const locale = useSettingsStore((s) => s.locale);
  const removeBook = useLibraryStore((s) => s.removeBook);

  return (
    <article
      className="book-item"
      style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}
    >
      <Link href={`/reader/${book.id}`} className="book-link">
        <div className="book-3d">
          <div className="book-spine" aria-hidden />
          <div className="book-face">
            <CoverArt book={book} />
          </div>
        </div>
        <h3 className="book-title">{book.title}</h3>
        <p className="book-meta">
          {book.pageCount} {t("pages", locale)}
          {book.lastPage > 1
            ? ` · ${t("continueReading", locale)} ${book.lastPage}`
            : ""}
        </p>
      </Link>
      <button
        type="button"
        className="book-delete"
        title={t("delete", locale)}
        onClick={(e) => {
          e.preventDefault();
          if (confirm(t("removeConfirm", locale))) {
            void removeBook(book.id);
          }
        }}
      >
        ×
      </button>
    </article>
  );
}
