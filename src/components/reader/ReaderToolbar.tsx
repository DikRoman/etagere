"use client";

import { useSettingsStore } from "@/store/settings";
import { useReaderStore } from "@/store/reader";
import { useLibraryStore } from "@/store/library";
import { t } from "@/lib/i18n";
import {
  HIGHLIGHT_COLORS,
  PEN_COLORS,
  type HighlightColor,
  type ReaderTool,
} from "@/lib/types";
import { stubSummarize, stubTranslate } from "@/lib/ai";
import { annotationsToMarkdown, downloadMarkdown } from "@/lib/export";
import { getAnnotations, getBook } from "@/lib/storage/local";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { BookSearchPanel } from "./BookSearchPanel";

interface Props {
  title: string;
  pageCount: number;
  bookId: string;
  pdf: PDFDocumentProxy | null;
}

export function ReaderToolbar({ title, pageCount, bookId, pdf }: Props) {
  const locale = useSettingsStore((s) => s.locale);
  const spread = useSettingsStore((s) => s.spread);
  const setSpread = useSettingsStore((s) => s.setSpread);
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  const page = useReaderStore((s) => s.page);
  const scale = useReaderStore((s) => s.scale);
  const goToPage = useReaderStore((s) => s.goToPage);
  const setScale = useReaderStore((s) => s.setScale);
  const toggleBookmark = useReaderStore((s) => s.toggleBookmark);
  const isPageBookmarked = useReaderStore((s) => s.isPageBookmarked);
  const activeColor = useReaderStore((s) => s.activeColor);
  const setActiveColor = useReaderStore((s) => s.setActiveColor);
  const tool = useReaderStore((s) => s.tool);
  const setTool = useReaderStore((s) => s.setTool);
  const penColor = useReaderStore((s) => s.penColor);
  const setPenColor = useReaderStore((s) => s.setPenColor);
  const penWidth = useReaderStore((s) => s.penWidth);
  const setPenWidth = useReaderStore((s) => s.setPenWidth);
  const stylusOnly = useReaderStore((s) => s.stylusOnly);
  const setStylusOnly = useReaderStore((s) => s.setStylusOnly);
  const pressureEnabled = useReaderStore((s) => s.pressureEnabled);
  const setPressureEnabled = useReaderStore((s) => s.setPressureEnabled);
  const sidebarOpen = useReaderStore((s) => s.sidebarOpen);
  const sidebarTab = useReaderStore((s) => s.sidebarTab);
  const setSidebarOpen = useReaderStore((s) => s.setSidebarOpen);
  const setSidebarTab = useReaderStore((s) => s.setSidebarTab);
  const clearPageInk = useReaderStore((s) => s.clearPageInk);
  const setAiOpen = useReaderStore((s) => s.setAiOpen);
  const setAiResult = useReaderStore((s) => s.setAiResult);
  const selection = useReaderStore((s) => s.selection);
  const toc = useReaderStore((s) => s.toc);
  const syncBook = useLibraryStore((s) => s.syncBook);
  const pullBookAnnotations = useLibraryStore((s) => s.pullBookAnnotations);

  const bookmarked = isPageBookmarked(page);

  async function runSummarizePage() {
    const text =
      selection?.text ||
      (locale === "ru"
        ? `Страница ${page} книги «${title}».`
        : `Page ${page} of “${title}”.`);
    setAiOpen(true);
    setAiResult({
      title: t("aiSummaryTitle", locale),
      body: locale === "ru" ? "Думаю…" : "Thinking…",
    });
    const result = await stubSummarize(text, locale);
    setAiResult({ title: t("aiSummaryTitle", locale), body: result });
  }

  async function runChapterSummary() {
    const chapter =
      [...toc].reverse().find((c) => c.page <= page) ??
      toc.find((c) => c.page >= page);
    const label = chapter?.title ?? `p. ${page}`;
    setAiOpen(true);
    setAiResult({
      title: t("chapterSummary", locale),
      body: locale === "ru" ? "Думаю…" : "Thinking…",
    });
    const result = await stubSummarize(
      locale === "ru"
        ? `Глава «${label}» книги «${title}» (около стр. ${page}). Кратко перескажи.`
        : `Chapter “${label}” of “${title}” (around p. ${page}). Summarize briefly.`,
      locale,
    );
    setAiResult({ title: t("chapterSummary", locale), body: result });
  }

  async function runTranslateSelection() {
    if (!selection?.text) return;
    setAiOpen(true);
    setAiResult({
      title:
        selection.text.split(/\s+/).length <= 2
          ? t("wordTranslate", locale)
          : t("aiTranslateTitle", locale),
      body: locale === "ru" ? "Перевожу…" : "Translating…",
    });
    const result = await stubTranslate(selection.text, locale);
    setAiResult({
      title:
        selection.text.split(/\s+/).length <= 2
          ? t("wordTranslate", locale)
          : t("aiTranslateTitle", locale),
      body: result,
    });
  }

  async function exportMd() {
    const book = await getBook(bookId);
    if (!book) return;
    const ann = await getAnnotations(bookId);
    const md = annotationsToMarkdown(book, ann, locale);
    downloadMarkdown(`${book.title}-notes.md`, md);
  }

  function toolBtn(id: ReaderTool, label: string) {
    return (
      <button
        type="button"
        className={`btn-ghost compact ${tool === id ? "is-on" : ""}`}
        onClick={() => setTool(id)}
        title={label}
      >
        {label}
      </button>
    );
  }

  return (
    <header className="reader-bar">
      <a href="/" className="back-link">
        ← {t("backToShelf", locale)}
      </a>
      <div className="reader-title" title={title}>
        {title}
      </div>
      <div className="reader-controls">
        <label className="page-input">
          <input
            type="number"
            min={1}
            max={pageCount}
            value={page}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (n >= 1 && n <= pageCount) void goToPage(n);
            }}
          />
          <span>
            {t("pageOf", locale)} {pageCount}
          </span>
        </label>
        <button type="button" className="icon-btn" onClick={() => setScale(scale - 0.1)}>
          −
        </button>
        <button type="button" className="icon-btn" onClick={() => setScale(scale + 0.1)}>
          +
        </button>

        <button
          type="button"
          className={`btn-ghost compact ${spread ? "is-on" : ""}`}
          onClick={() => setSpread(!spread)}
        >
          {t("spread", locale)}
        </button>

        <div className="lang-switch theme-switch">
          {(["day", "paper", "night"] as const).map((th) => (
            <button
              key={th}
              type="button"
              className={theme === th ? "active" : ""}
              onClick={() => setTheme(th)}
            >
              {th === "day"
                ? t("themeDay", locale)
                : th === "paper"
                  ? t("themePaper", locale)
                  : t("themeNight", locale)}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`btn-ghost compact ${bookmarked ? "is-on" : ""}`}
          onClick={() => void toggleBookmark(page)}
        >
          {bookmarked ? `★` : `☆`} {t("addBookmark", locale)}
        </button>

        <button
          type="button"
          className={`btn-ghost compact ${sidebarOpen && sidebarTab === "toc" ? "is-on" : ""}`}
          onClick={() => setSidebarTab("toc")}
        >
          {t("toc", locale)}
        </button>
        <button
          type="button"
          className={`btn-ghost compact ${sidebarOpen && sidebarTab === "bookmarks" ? "is-on" : ""}`}
          onClick={() => setSidebarTab("bookmarks")}
        >
          {t("bookmarks", locale)}
        </button>
        <button
          type="button"
          className={`btn-ghost compact ${sidebarOpen && sidebarTab === "chat" ? "is-on" : ""}`}
          onClick={() => setSidebarTab("chat")}
        >
          {t("chat", locale)}
        </button>
        <button
          type="button"
          className={`btn-ghost compact ${sidebarOpen && sidebarTab === "cards" ? "is-on" : ""}`}
          onClick={() => setSidebarTab("cards")}
        >
          {t("cards", locale)}
        </button>

        <span className="tool-sep" />
        {toolBtn("select", t("selectTool", locale))}
        {toolBtn("pen", t("pencil", locale))}
        {toolBtn("eraser", t("eraser", locale))}

        {tool === "pen" && (
          <>
            <div className="color-row">
              {PEN_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`swatch ${penColor === c ? "on" : ""}`}
                  style={{ background: c }}
                  onClick={() => setPenColor(c)}
                />
              ))}
            </div>
            <label className="pen-size">
              <input
                type="range"
                min={0.8}
                max={6}
                step={0.1}
                value={penWidth}
                onChange={(e) => setPenWidth(Number(e.target.value))}
              />
            </label>
            <label className="check-pill">
              <input
                type="checkbox"
                checked={pressureEnabled}
                onChange={(e) => setPressureEnabled(e.target.checked)}
              />
              {t("pressure", locale)}
            </label>
            <label className="check-pill">
              <input
                type="checkbox"
                checked={stylusOnly}
                onChange={(e) => setStylusOnly(e.target.checked)}
              />
              {t("stylusOnly", locale)}
            </label>
          </>
        )}

        {tool !== "select" && (
          <button
            type="button"
            className="btn-ghost compact"
            onClick={() => void clearPageInk(page)}
          >
            {t("clearInk", locale)}
          </button>
        )}

        {tool === "select" && (
          <div className="color-row">
            {(Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch ${activeColor === c ? "on" : ""}`}
                style={{
                  background: HIGHLIGHT_COLORS[c].fill
                    .replace("0.4", "0.9")
                    .replace("0.45", "0.9"),
                }}
                onClick={() => setActiveColor(c)}
              />
            ))}
          </div>
        )}

        <button
          type="button"
          className="btn-ghost compact"
          disabled={!selection?.text}
          onClick={() => void runTranslateSelection()}
        >
          {t("translate", locale)}
        </button>
        <button
          type="button"
          className="btn-ghost compact"
          onClick={() => void runSummarizePage()}
        >
          {t("summarize", locale)}
        </button>
        <button
          type="button"
          className="btn-ghost compact"
          onClick={() => void runChapterSummary()}
        >
          {t("chapterSummary", locale)}
        </button>
        <button type="button" className="btn-ghost compact" onClick={() => void exportMd()}>
          {t("exportMd", locale)}
        </button>
        <button
          type="button"
          className="btn-ghost compact"
          onClick={() => void syncBook(bookId).then((m) => alert(m))}
        >
          ☁
        </button>
        <button
          type="button"
          className="btn-ghost compact"
          onClick={() => void pullBookAnnotations(bookId).then((m) => alert(m))}
        >
          {t("drivePull", locale)}
        </button>
        <button
          type="button"
          className={`btn-ghost compact ${sidebarOpen && sidebarTab === "notes" ? "is-on" : ""}`}
          onClick={() => {
            if (sidebarOpen && sidebarTab === "notes") setSidebarOpen(false);
            else setSidebarTab("notes");
          }}
        >
          {t("sidebar", locale)}
        </button>
      </div>
      <BookSearchPanel pdf={pdf} />
    </header>
  );
}
