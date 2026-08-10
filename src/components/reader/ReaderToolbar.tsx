"use client";

import { useSettingsStore } from "@/store/settings";
import { useReaderStore } from "@/store/reader";
import { t } from "@/lib/i18n";
import {
  HIGHLIGHT_COLORS,
  PEN_COLORS,
  type HighlightColor,
  type ReaderTool,
} from "@/lib/types";
import { stubSummarize, stubTranslate } from "@/lib/ai";

interface Props {
  title: string;
  pageCount: number;
}

export function ReaderToolbar({ title, pageCount }: Props) {
  const locale = useSettingsStore((s) => s.locale);
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

  const bookmarked = isPageBookmarked(page);

  async function runSummarizePage() {
    const text =
      selection?.text ||
      (locale === "ru"
        ? `Страница ${page} книги «${title}». Выдели фрагмент для точного саммари.`
        : `Page ${page} of “${title}”. Select text for a more accurate summary.`);
    setAiOpen(true);
    setAiResult({
      title: t("aiSummaryTitle", locale),
      body: locale === "ru" ? "Думаю…" : "Thinking…",
    });
    const result = await stubSummarize(text, locale);
    setAiResult({ title: t("aiSummaryTitle", locale), body: result });
  }

  async function runTranslateSelection() {
    if (!selection?.text) return;
    setAiOpen(true);
    setAiResult({
      title: t("aiTranslateTitle", locale),
      body: locale === "ru" ? "Перевожу…" : "Translating…",
    });
    const result = await stubTranslate(selection.text, locale);
    setAiResult({ title: t("aiTranslateTitle", locale), body: result });
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
        <button
          type="button"
          className="icon-btn"
          onClick={() => setScale(scale - 0.1)}
          title={t("zoomOut", locale)}
        >
          −
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setScale(scale + 0.1)}
          title={t("zoomIn", locale)}
        >
          +
        </button>

        <button
          type="button"
          className={`btn-ghost compact ${bookmarked ? "is-on" : ""}`}
          onClick={() => void toggleBookmark(page)}
        >
          {bookmarked ? `★ ${t("bookmarked", locale)}` : `☆ ${t("addBookmark", locale)}`}
        </button>

        <button
          type="button"
          className={`btn-ghost compact ${sidebarOpen && sidebarTab === "bookmarks" ? "is-on" : ""}`}
          onClick={() => {
            if (sidebarOpen && sidebarTab === "bookmarks") {
              setSidebarOpen(false);
            } else {
              setSidebarTab("bookmarks");
            }
          }}
        >
          {t("bookmarks", locale)}
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
            <label className="pen-size" title={t("penSize", locale)}>
              <span>{t("penSize", locale)}</span>
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

        {tool === "pen" && (
          <p className="stylus-hint">{t("stylusHint", locale)}</p>
        )}

        {tool === "select" && (
          <div className="color-row" title={t("highlight", locale)}>
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
                aria-label={HIGHLIGHT_COLORS[c].label[locale]}
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
          className={`btn-ghost compact ${sidebarOpen && sidebarTab === "notes" ? "is-on" : ""}`}
          onClick={() => {
            if (sidebarOpen && sidebarTab === "notes") setSidebarOpen(false);
            else setSidebarTab("notes");
          }}
        >
          {t("sidebar", locale)}
        </button>
      </div>
    </header>
  );
}
