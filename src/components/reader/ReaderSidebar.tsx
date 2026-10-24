"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { highlightFill } from "@/lib/highlight-color";
import { useSettingsStore } from "@/store/settings";
import { useReaderStore } from "@/store/reader";
import { useAuthStore } from "@/store/auth";
import { t } from "@/lib/i18n";
import { fetchAiQuota } from "@/lib/ai";
import type { QuotaSnapshot } from "@/lib/ai-quota";
import {
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
} from "@/lib/types";
import { TocPanel } from "./TocPanel";
import { ChatMessageBody } from "./ChatMessageBody";

const clampWidth = (width: number) =>
  Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(width)));

export function ReaderSidebar({ bookTitle }: { bookTitle: string }) {
  const locale = useSettingsStore((s) => s.locale);
  const width = useSettingsStore((s) => s.sidebarWidth);
  const setWidth = useSettingsStore((s) => s.setSidebarWidth);
  const open = useReaderStore((s) => s.sidebarOpen);
  const tab = useReaderStore((s) => s.sidebarTab);
  const annotations = useReaderStore((s) => s.annotations);
  const page = useReaderStore((s) => s.page);
  const goToPage = useReaderStore((s) => s.goToPage);
  const removeHighlight = useReaderStore((s) => s.removeHighlight);
  const removeBookmark = useReaderStore((s) => s.removeBookmark);
  const removeQuote = useReaderStore((s) => s.removeQuote);
  const removeNote = useReaderStore((s) => s.removeNote);
  const removeInkStroke = useReaderStore((s) => s.removeInkStroke);
  const removeMarginText = useReaderStore((s) => s.removeMarginText);
  const setSidebarOpen = useReaderStore((s) => s.setSidebarOpen);
  const setSidebarTab = useReaderStore((s) => s.setSidebarTab);
  const toggleBookmark = useReaderStore((s) => s.toggleBookmark);
  const sendChat = useReaderStore((s) => s.sendChat);
  const chatFocus = useReaderStore((s) => s.chatFocus);

  const asideRef = useRef<HTMLElement>(null);
  const chatLogRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);

  const [chatInput, setChatInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  const user = useAuthStore((s) => s.user);
  const chatInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tab !== "chat" || !chatFocus) return;
    chatInputRef.current?.focus();
  }, [tab, chatFocus]);

  useEffect(() => {
    const log = chatLogRef.current;
    if (!log || tab !== "chat") return;
    log.scrollTop = log.scrollHeight;
  }, [tab, annotations.chat.length]);

  useEffect(() => {
    if (tab !== "chat" || !user) return;
    void fetchAiQuota().then(setQuota);
  }, [tab, user, busy]);

  const tabs = useMemo(
    () =>
      [
        ["bookmarks", t("bookmarks", locale)],
        ["toc", t("toc", locale)],
        ["notes", t("notes", locale)],
        ["chat", t("chat", locale)],
      ] as const,
    [locale],
  );

  if (!open) {
    const current = tabs.find(([id]) => id === tab)?.[1] ?? t("sidebar", locale);
    return (
      <button
        type="button"
        className="reader-sidebar-tab"
        onClick={() => setSidebarOpen(true)}
        title={t("showSidebar", locale)}
        aria-label={t("showSidebar", locale)}
      >
        <span className="reader-sidebar-tab-mark" aria-hidden>
          ‹
        </span>
        <span className="reader-sidebar-tab-label">{current}</span>
      </button>
    );
  }

  /** Live width while dragging is written straight to the node, then committed. */
  const grip = (
    <div
      className="sidebar-grip"
      role="separator"
      aria-orientation="vertical"
      aria-label={t("panelWidth", locale)}
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_WIDTH_MIN}
      aria-valuemax={SIDEBAR_WIDTH_MAX}
      tabIndex={0}
      onPointerDown={(e) => {
        const el = asideRef.current;
        if (!el || e.button !== 0) return;
        drag.current = { x: e.clientX, width: el.offsetWidth };
        el.classList.add("is-resizing");
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const start = drag.current;
        const el = asideRef.current;
        if (!start || !el) return;
        el.style.width = `${clampWidth(start.width + (start.x - e.clientX))}px`;
      }}
      onPointerUp={(e) => {
        const el = asideRef.current;
        if (!drag.current || !el) return;
        drag.current = null;
        el.classList.remove("is-resizing");
        e.currentTarget.releasePointerCapture(e.pointerId);
        setWidth(el.offsetWidth);
      }}
      onDoubleClick={() => setWidth(SIDEBAR_WIDTH_DEFAULT)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") setWidth(width + 24);
        else if (e.key === "ArrowRight") setWidth(width - 24);
        else return;
        e.preventDefault();
      }}
    />
  );

  return (
    <aside
      ref={asideRef}
      className="reader-sidebar"
      style={{ width: `${width}px` }}
    >
      {grip}
      <div className="sidebar-inner">
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
                  <span className="tab-count">
                    {annotations.bookmarks.length}
                  </span>
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
            {!annotations.bookmarks.some((b) => b.page === page) && (
              <button
                type="button"
                className="btn-primary sidebar-add"
                onClick={() => void toggleBookmark(page)}
              >
                {t("addBookmark", locale)} · {page}
              </button>
            )}
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

        {tab === "toc" && <TocPanel />}

        {tab === "notes" && (
          <div className="notes-panel">
            <section>
              <h3>{t("highlights", locale)}</h3>
              {annotations.highlights.length === 0 ? (
                <p className="muted tiny">{t("noAnnotations", locale)}</p>
              ) : (
                <ul>
                  {annotations.highlights.map((h) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        className="ann-link ann-link--compact"
                        onClick={() => void goToPage(h.page)}
                      >
                        <span
                          className="dot"
                          style={{ background: highlightFill(h.color) }}
                        />
                        <span className="ann-text">{h.text}</span>
                        <span className="ann-page">p.{h.page}</span>
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
                <p className="muted tiny">{t("noAnnotations", locale)}</p>
              ) : (
                <ul>
                  {annotations.quotes.map((q) => (
                    <li key={q.id} className="ann-item-quote">
                      <button
                        type="button"
                        className="ann-link ann-link--quote"
                        onClick={() => void goToPage(q.page)}
                      >
                        <span className="ann-quote-mark">“</span>
                        <span className="ann-text">{q.text}</span>
                        <span className="ann-page">p.{q.page}</span>
                      </button>
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
              <h3>{t("userNotes", locale)}</h3>
              {annotations.notes.length === 0 ? (
                <p className="muted tiny">{t("noAnnotations", locale)}</p>
              ) : (
                <ul>
                  {annotations.notes.map((n) => (
                    <li key={n.id} className="ann-item-note">
                      <button
                        type="button"
                        className="ann-link ann-link--note"
                        onClick={() => void goToPage(n.page)}
                      >
                        <span className="ann-note-body">{n.body}</span>
                        {n.excerpt && (
                          <span className="ann-note-excerpt">
                            <span className="ann-note-excerpt-label">
                              {t("noteExcerpt", locale)}:
                            </span>{" "}
                            {n.excerpt}
                          </span>
                        )}
                        <span className="ann-page">p.{n.page}</span>
                      </button>
                      <button
                        type="button"
                        className="ann-del"
                        onClick={() => void removeNote(n.id)}
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
                <p className="muted tiny">{t("noAnnotations", locale)}</p>
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
                          className="ann-link ann-link--compact"
                          onClick={() => void goToPage(s.page)}
                        >
                          <span
                            className="dot"
                            style={{ background: s.color }}
                          />
                          <span className="ann-text">p.{s.page}</span>
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

            <section>
              <h3>{t("marginTexts", locale)}</h3>
              {(annotations.texts ?? []).length === 0 ? (
                <p className="muted tiny">{t("noAnnotations", locale)}</p>
              ) : (
                <ul>
                  {(annotations.texts ?? [])
                    .slice()
                    .reverse()
                    .map((note) => (
                      <li key={note.id}>
                        <button
                          type="button"
                          className="ann-link ann-link--compact"
                          onClick={() => void goToPage(note.page)}
                        >
                          <span
                            className="dot"
                            style={{ background: note.color }}
                          />
                          <span className="ann-text">
                            {note.body.trim() || "…"}
                          </span>
                          <span className="ann-page">p.{note.page}</span>
                        </button>
                        <button
                          type="button"
                          className="ann-del"
                          onClick={() => void removeMarginText(note.id)}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {tab === "chat" && (
          <section className="chat-panel">
            <div className="chat-log" ref={chatLogRef}>
              {annotations.chat.length === 0 ? (
                <p className="muted chat-empty">{t("chatHint", locale)}</p>
              ) : (
                annotations.chat.map((m) =>
                  m.kind === "passage" ? (
                    <button
                      key={m.id}
                      type="button"
                      className="chat-row passage"
                      onClick={() => m.page && void goToPage(m.page)}
                    >
                      <div className="chat-bubble passage">
                        <span className="chat-passage-label">
                          {t("chatFocusLabel", locale)}
                          {m.page ? ` · p.${m.page}` : ""}
                        </span>
                        {m.content}
                      </div>
                    </button>
                  ) : (
                    <div key={m.id} className={`chat-row ${m.role}`}>
                      {m.role === "assistant" && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          className="chat-avatar"
                          src="/brand/mark.svg"
                          alt=""
                          width={28}
                          height={28}
                        />
                      )}
                      <div className={`chat-bubble ${m.role}`}>
                        {m.role === "assistant" ? (
                          <ChatMessageBody text={m.content} />
                        ) : (
                          m.content
                        )}
                      </div>
                    </div>
                  ),
                )
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
                void sendChat(q, bookTitle, locale).finally(() =>
                  setBusy(false),
                );
              }}
            >
              <input
                ref={chatInputRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={
                  chatFocus || annotations.chat.at(-1)?.kind === "passage"
                    ? t("chatPlaceholderFocus", locale)
                    : t("chatPlaceholder", locale)
                }
              />
              <button
                type="submit"
                className="btn-primary compact"
                disabled={busy}
              >
                {t("send", locale)}
              </button>
            </form>
            {quota ? (
              <p className="muted tiny" style={{ margin: "0.35rem 0 0" }}>
                {t("aiQuotaChat", locale)}: {quota.chat.used} / {quota.chat.limit}
              </p>
            ) : null}
          </section>
        )}
      </div>
    </aside>
  );
}
