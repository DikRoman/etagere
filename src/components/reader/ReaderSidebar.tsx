"use client";

import { useSettingsStore } from "@/store/settings";
import { useReaderStore } from "@/store/reader";
import { t } from "@/lib/i18n";
import { HIGHLIGHT_COLORS } from "@/lib/types";

export function ReaderSidebar() {
  const locale = useSettingsStore((s) => s.locale);
  const open = useReaderStore((s) => s.sidebarOpen);
  const tab = useReaderStore((s) => s.sidebarTab);
  const annotations = useReaderStore((s) => s.annotations);
  const page = useReaderStore((s) => s.page);
  const goToPage = useReaderStore((s) => s.goToPage);
  const removeHighlight = useReaderStore((s) => s.removeHighlight);
  const removeBookmark = useReaderStore((s) => s.removeBookmark);
  const removeQuote = useReaderStore((s) => s.removeQuote);
  const removeInkStroke = useReaderStore((s) => s.removeInkStroke);
  const setSidebarOpen = useReaderStore((s) => s.setSidebarOpen);
  const setSidebarTab = useReaderStore((s) => s.setSidebarTab);
  const toggleBookmark = useReaderStore((s) => s.toggleBookmark);

  if (!open) return null;

  return (
    <aside className="reader-sidebar">
      <div className="sidebar-head">
        <div className="sidebar-tabs">
          <button
            type="button"
            className={tab === "bookmarks" ? "on" : ""}
            onClick={() => setSidebarTab("bookmarks")}
          >
            {t("bookmarks", locale)}
            <span className="tab-count">{annotations.bookmarks.length}</span>
          </button>
          <button
            type="button"
            className={tab === "notes" ? "on" : ""}
            onClick={() => setSidebarTab("notes")}
          >
            {t("notes", locale)}
          </button>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setSidebarOpen(false)}
        >
          ×
        </button>
      </div>

      {tab === "bookmarks" ? (
        <section className="bookmark-panel">
          <button
            type="button"
            className="btn-primary sidebar-add"
            onClick={() => void toggleBookmark(page)}
          >
            {annotations.bookmarks.some((b) => b.page === page)
              ? t("removeBookmark", locale)
              : `${t("addBookmark", locale)} · ${page}`}
          </button>

          {annotations.bookmarks.length === 0 ? (
            <p className="muted">{t("noAnnotations", locale)}</p>
          ) : (
            <ul className="bookmark-list">
              {annotations.bookmarks
                .slice()
                .sort((a, b) => a.page - b.page)
                .map((b) => (
                  <li key={b.id} className={b.page === page ? "current" : ""}>
                    <button
                      type="button"
                      className="ann-link bookmark-item"
                      onClick={() => void goToPage(b.page)}
                    >
                      <span className="bm-star">★</span>
                      <span>
                        {t("goToPage", locale)} {b.page}
                      </span>
                      {b.label ? <span className="ann-page">{b.label}</span> : null}
                    </button>
                    <button
                      type="button"
                      className="ann-del"
                      onClick={() => void removeBookmark(b.id)}
                    >
                      ×
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          <section>
            <h3>{t("highlights", locale)}</h3>
            {annotations.highlights.length === 0 ? (
              <p className="muted">{t("noAnnotations", locale)}</p>
            ) : (
              <ul>
                {annotations.highlights.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      className="ann-link"
                      onClick={() => void goToPage(h.page)}
                    >
                      <span
                        className="dot"
                        style={{ background: HIGHLIGHT_COLORS[h.color].fill }}
                      />
                      <span className="ann-text">{h.text.slice(0, 120)}</span>
                      <span className="ann-page">p. {h.page}</span>
                    </button>
                    <button
                      type="button"
                      className="ann-del"
                      onClick={() => void removeHighlight(h.id)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3>{t("quotes", locale)}</h3>
            {annotations.quotes.length === 0 ? (
              <p className="muted">{t("noAnnotations", locale)}</p>
            ) : (
              <ul>
                {annotations.quotes.map((q) => (
                  <li key={q.id}>
                    <blockquote>
                      <button
                        type="button"
                        className="ann-link"
                        onClick={() => void goToPage(q.page)}
                      >
                        “{q.text.slice(0, 160)}”
                      </button>
                      {q.note ? <p className="note">{q.note}</p> : null}
                    </blockquote>
                    <button
                      type="button"
                      className="ann-del"
                      onClick={() => void removeQuote(q.id)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3>{t("inkNotes", locale)}</h3>
            {annotations.ink.length === 0 ? (
              <p className="muted">{t("noAnnotations", locale)}</p>
            ) : (
              <ul>
                {Object.entries(
                  annotations.ink.reduce<Record<number, number>>((acc, s) => {
                    acc[s.page] = (acc[s.page] ?? 0) + 1;
                    return acc;
                  }, {}),
                )
                  .map(([p, count]) => ({ page: Number(p), count }))
                  .sort((a, b) => a.page - b.page)
                  .map(({ page: p, count }) => (
                    <li key={p}>
                      <button
                        type="button"
                        className="ann-link"
                        onClick={() => void goToPage(p)}
                      >
                        {t("goToPage", locale)} {p}
                        <span className="ann-page">
                          {count} {locale === "ru" ? "штрих." : "strokes"}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
            {annotations.ink.length > 0 && (
              <ul className="ink-stroke-list">
                {annotations.ink
                  .slice()
                  .reverse()
                  .slice(0, 12)
                  .map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="ann-link"
                        onClick={() => void goToPage(s.page)}
                      >
                        <span
                          className="dot"
                          style={{ background: s.color }}
                        />
                        p. {s.page}
                      </button>
                      <button
                        type="button"
                        className="ann-del"
                        onClick={() => void removeInkStroke(s.id)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </>
      )}
    </aside>
  );
}
