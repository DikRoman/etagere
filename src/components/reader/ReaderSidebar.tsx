"use client";

import { useMemo, useState } from "react";
import { useSettingsStore } from "@/store/settings";
import { useReaderStore } from "@/store/reader";
import { t } from "@/lib/i18n";
import { HIGHLIGHT_COLORS, type TocItem } from "@/lib/types";

function TocTree({
  items,
  depth = 0,
}: {
  items: TocItem[];
  depth?: number;
}) {
  const goToPage = useReaderStore((s) => s.goToPage);
  return (
    <ul className={depth ? "toc-nested" : undefined}>
      {items.map((it, i) => (
        <li key={`${it.title}-${it.page}-${i}`}>
          <button
            type="button"
            className="ann-link"
            style={{ paddingLeft: `${0.65 + depth * 0.6}rem` }}
            onClick={() => void goToPage(it.page)}
          >
            <span className="ann-text">{it.title}</span>
            <span className="ann-page">p. {it.page}</span>
          </button>
          {it.children?.length ? (
            <TocTree items={it.children} depth={depth + 1} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function ReaderSidebar({ bookTitle }: { bookTitle: string }) {
  const locale = useSettingsStore((s) => s.locale);
  const open = useReaderStore((s) => s.sidebarOpen);
  const tab = useReaderStore((s) => s.sidebarTab);
  const annotations = useReaderStore((s) => s.annotations);
  const toc = useReaderStore((s) => s.toc);
  const page = useReaderStore((s) => s.page);
  const goToPage = useReaderStore((s) => s.goToPage);
  const removeHighlight = useReaderStore((s) => s.removeHighlight);
  const removeBookmark = useReaderStore((s) => s.removeBookmark);
  const removeQuote = useReaderStore((s) => s.removeQuote);
  const removeInkStroke = useReaderStore((s) => s.removeInkStroke);
  const setSidebarOpen = useReaderStore((s) => s.setSidebarOpen);
  const setSidebarTab = useReaderStore((s) => s.setSidebarTab);
  const toggleBookmark = useReaderStore((s) => s.toggleBookmark);
  const generateFlashcards = useReaderStore((s) => s.generateFlashcards);
  const sendChat = useReaderStore((s) => s.sendChat);

  const [chatInput, setChatInput] = useState("");
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);

  const cards = annotations.flashcards;
  const currentCard = cards[cardIndex % Math.max(cards.length, 1)];

  const tabs = useMemo(
    () =>
      [
        ["bookmarks", t("bookmarks", locale)],
        ["toc", t("toc", locale)],
        ["notes", t("notes", locale)],
        ["chat", t("chat", locale)],
        ["cards", t("cards", locale)],
      ] as const,
    [locale],
  );

  if (!open) return null;

  return (
    <aside className="reader-sidebar">
      <div className="sidebar-head">
        <div className="sidebar-tabs wrap">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? "on" : ""}
              onClick={() => setSidebarTab(id)}
            >
              {label}
              {id === "bookmarks" && (
                <span className="tab-count">{annotations.bookmarks.length}</span>
              )}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setSidebarOpen(false)}
        >
          ×
        </button>
      </div>

      {tab === "bookmarks" && (
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
      )}

      {tab === "toc" && (
        <section>
          {toc.length === 0 ? (
            <p className="muted">{t("noToc", locale)}</p>
          ) : (
            <TocTree items={toc} />
          )}
        </section>
      )}

      {tab === "notes" && (
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
                        <span className="dot" style={{ background: s.color }} />
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

      {tab === "chat" && (
        <section className="chat-panel">
          <div className="chat-log">
            {annotations.chat.length === 0 ? (
              <p className="muted">{t("aiStub", locale)}</p>
            ) : (
              annotations.chat.map((m) => (
                <div key={m.id} className={`chat-bubble ${m.role}`}>
                  {m.content}
                </div>
              ))
            )}
          </div>
          <form
            className="chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              const q = chatInput.trim();
              if (!q || busy) return;
              setBusy(true);
              setChatInput("");
              void sendChat(q, bookTitle, locale).finally(() => setBusy(false));
            }}
          >
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={t("chatPlaceholder", locale)}
            />
            <button type="submit" className="btn-primary compact" disabled={busy}>
              {t("send", locale)}
            </button>
          </form>
        </section>
      )}

      {tab === "cards" && (
        <section className="cards-panel">
          <button
            type="button"
            className="btn-ghost"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void generateFlashcards(locale).finally(() => {
                setBusy(false);
                setCardIndex(0);
                setFlipped(false);
              });
            }}
          >
            {t("makeCards", locale)}
          </button>
          {cards.length === 0 ? (
            <p className="muted">{t("noCards", locale)}</p>
          ) : (
            <>
              <button
                type="button"
                className={`flashcard ${flipped ? "flipped" : ""}`}
                onClick={() => setFlipped((f) => !f)}
              >
                {flipped ? currentCard.back : currentCard.front}
              </button>
              <div className="card-nav">
                <button
                  type="button"
                  className="btn-ghost compact"
                  onClick={() => setFlipped((f) => !f)}
                >
                  {t("flip", locale)}
                </button>
                <button
                  type="button"
                  className="btn-ghost compact"
                  onClick={() => {
                    setCardIndex((i) => (i + 1) % cards.length);
                    setFlipped(false);
                  }}
                >
                  {t("nextCard", locale)}
                </button>
              </div>
              <p className="muted">
                {cardIndex + 1} / {cards.length}
              </p>
            </>
          )}
        </section>
      )}
    </aside>
  );
}
