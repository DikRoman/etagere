"use client";

import Link from "next/link";
import { useState } from "react";
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
  const setTags = useLibraryStore((s) => s.setTags);
  const syncBook = useLibraryStore((s) => s.syncBook);
  const [tagDraft, setTagDraft] = useState("");
  const progress = Math.min(
    100,
    Math.round(((book.lastPage || 1) / Math.max(1, book.pageCount)) * 100),
  );

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
            <div className="progress-track" title={`${progress}%`}>
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            {book.format === "epub" && <span className="format-badge">EPUB</span>}
          </div>
        </div>
        <h3 className="book-title">{book.title}</h3>
        <p className="book-meta">
          {book.pageCount} {t("pages", locale)}
          {book.lastPage > 1
            ? ` · ${t("continueReading", locale)} ${book.lastPage}`
            : ""}
          {` · ${progress}%`}
        </p>
      </Link>
      <div className="book-tags">
        {book.tags.map((tag) => (
          <button
            key={tag}
            type="button"
            className="tag-chip"
            onClick={() =>
              void setTags(
                book.id,
                book.tags.filter((x) => x !== tag),
              )
            }
          >
            {tag} ×
          </button>
        ))}
        <form
          className="tag-form"
          onSubmit={(e) => {
            e.preventDefault();
            const v = tagDraft.trim().toLowerCase();
            if (!v || book.tags.includes(v)) return;
            void setTags(book.id, [...book.tags, v]);
            setTagDraft("");
          }}
        >
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            placeholder={t("addTag", locale)}
          />
        </form>
      </div>
      <button
        type="button"
        className="book-sync"
        title="Sync Drive"
        onClick={() => void syncBook(book.id).then((m) => alert(m))}
      >
        ☁
      </button>
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
