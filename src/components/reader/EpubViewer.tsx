"use client";

import { useEffect, useState } from "react";
import { getEpubChapters } from "@/lib/storage/local";
import type { EpubChapter } from "@/lib/types";
import { useReaderStore } from "@/store/reader";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";

export function EpubViewer({ bookId }: { bookId: string }) {
  const [chapters, setChapters] = useState<EpubChapter[]>([]);
  const page = useReaderStore((s) => s.page);
  const setPageFromScroll = useReaderStore((s) => s.setPageFromScroll);
  const goToPage = useReaderStore((s) => s.goToPage);
  const scrollRequest = useReaderStore((s) => s.scrollRequest);
  const clearScrollRequest = useReaderStore((s) => s.clearScrollRequest);
  const setToc = useReaderStore((s) => s.setToc);
  const locale = useSettingsStore((s) => s.locale);
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    void getEpubChapters(bookId).then((chs) => {
      const list = chs ?? [];
      setChapters(list);
      setToc(list.map((c, i) => ({ title: c.title, page: i + 1 })));
    });
  }, [bookId, setToc]);

  useEffect(() => {
    if (!scrollRequest) return;
    const el = document.querySelector(`[data-epub-chapter="${scrollRequest}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    clearScrollRequest();
  }, [scrollRequest, clearScrollRequest, chapters]);

  if (!chapters.length) {
    return <div className="pdf-loading">EPUB…</div>;
  }

  const ch = chapters[Math.min(chapters.length, Math.max(1, page)) - 1];

  return (
    <div className={`epub-scroll theme-${theme}`}>
      <div className="epub-nav">
        <button
          type="button"
          className="btn-ghost compact"
          disabled={page <= 1}
          onClick={() => void goToPage(page - 1)}
        >
          ‹
        </button>
        <span>
          {t("epubChapter", locale)} {page} / {chapters.length}
        </span>
        <button
          type="button"
          className="btn-ghost compact"
          disabled={page >= chapters.length}
          onClick={() => void goToPage(page + 1)}
        >
          ›
        </button>
      </div>
      {chapters.map((c, i) => (
        <article
          key={c.id}
          data-epub-chapter={i + 1}
          data-page={i + 1}
          className={`epub-chapter ${i + 1 === page ? "current" : "hidden-ch"}`}
          onClick={() => setPageFromScroll(i + 1)}
        >
          {(i + 1 === page || Math.abs(i + 1 - page) <= 1) && (
            <>
              <h2>{c.title}</h2>
              <div
                className="epub-body"
                dangerouslySetInnerHTML={{ __html: i + 1 === page ? ch.html : c.html }}
              />
            </>
          )}
        </article>
      ))}
    </div>
  );
}
