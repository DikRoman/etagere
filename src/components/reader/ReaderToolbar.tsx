"use client";

import Link from "next/link";
import { useSettingsStore } from "@/store/settings";
import { useReaderStore } from "@/store/reader";
import { t, type MessageKey } from "@/lib/i18n";
import {
  EPUB_FONT_STACKS,
  HIGHLIGHT_COLORS,
  PEN_COLORS,
  type BookMeta,
  type EpubFontChoice,
  type HighlightColor,
  type ReaderTool,
} from "@/lib/types";
import { EpubTypePanel } from "./EpubTypePanel";
import { MarginPanel } from "./MarginPanel";
import { lookupSelection } from "@/lib/ai";
import { isLookupSelection } from "@/lib/word-lookup";
import { printedLabel } from "@/lib/toc";
import { BookSearchPanel } from "./BookSearchPanel";

const TEXT_FONTS: { id: EpubFontChoice; key: MessageKey }[] = [
  { id: "literary", key: "fontLiterary" },
  { id: "grotesque", key: "fontGrotesque" },
  { id: "georgia", key: "fontGeorgia" },
  { id: "verdana", key: "fontVerdana" },
];

interface Props {
  title: string;
  pageCount: number;
  bookId: string;
  format: BookMeta["format"];
}

function ReaderPager({
  format,
  pageCount: metaCount,
}: {
  format: BookMeta["format"];
  pageCount: number;
}) {
  const locale = useSettingsStore((s) => s.locale);
  const spread = useSettingsStore((s) => s.spread);
  const page = useReaderStore((s) => s.page);
  const liveCount = useReaderStore((s) => s.pageCount);
  const pageCount = liveCount || metaCount;
  const goToPage = useReaderStore((s) => s.goToPage);
  const epubSheet = useReaderStore((s) => s.epubSheet);
  const requestEpubTurn = useReaderStore((s) => s.requestEpubTurn);
  const pageLabels = useReaderStore((s) => s.pageLabels);
  const label = printedLabel(pageLabels, page);
  const paged = format === "epub" && spread;
  const sheet = epubSheet ?? { index: 0, count: 1 };
  const canPrev = paged ? sheet.index > 0 || page > 1 : page > 1;
  const canNext = paged
    ? sheet.index < sheet.count - 1 || page < pageCount
    : page < pageCount;

  function step(dir: -1 | 1) {
    if (format === "epub") {
      requestEpubTurn(dir);
      return;
    }
    void goToPage(page + dir);
  }

  return (
    <div className="reader-pager" role="navigation" aria-label={t("pageOf", locale)}>
      <button
        type="button"
        className="icon-btn"
        disabled={!canPrev}
        onClick={() => step(-1)}
        aria-label={locale === "ru" ? "Назад" : "Previous"}
      >
        ‹
      </button>
      {format === "epub" ? (
        <span className="reader-pager-label">
          {t("epubChapter", locale)} {page} / {pageCount}
          {paged && sheet.count > 1 && (
            <span className="epub-sheet-count">
              {`\u00A0· ${sheet.index + 1}/${sheet.count}`}
            </span>
          )}
        </span>
      ) : (
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
          {label && <span className="page-printed">· {label}</span>}
        </label>
      )}
      <button
        type="button"
        className="icon-btn"
        disabled={!canNext}
        onClick={() => step(1)}
        aria-label={locale === "ru" ? "Вперёд" : "Next"}
      >
        ›
      </button>
    </div>
  );
}

export function ReaderToolbar({ title, pageCount, bookId, format }: Props) {
  const locale = useSettingsStore((s) => s.locale);
  const spread = useSettingsStore((s) => s.spread);
  const setSpread = useSettingsStore((s) => s.setSpread);
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const filmstripOpen = useSettingsStore((s) => s.filmstripOpen);
  const setFilmstripOpen = useSettingsStore((s) => s.setFilmstripOpen);

  const page = useReaderStore((s) => s.page);
  const scale = useReaderStore((s) => s.scale);
  const setScale = useReaderStore((s) => s.setScale);
  const activeColor = useReaderStore((s) => s.activeColor);
  const setActiveColor = useReaderStore((s) => s.setActiveColor);
  const tool = useReaderStore((s) => s.tool);
  const setTool = useReaderStore((s) => s.setTool);
  const penColor = useReaderStore((s) => s.penColor);
  const setPenColor = useReaderStore((s) => s.setPenColor);
  const penWidth = useReaderStore((s) => s.penWidth);
  const setPenWidth = useReaderStore((s) => s.setPenWidth);
  const textFont = useReaderStore((s) => s.textFont);
  const setTextFont = useReaderStore((s) => s.setTextFont);
  const textSize = useReaderStore((s) => s.textSize);
  const setTextSize = useReaderStore((s) => s.setTextSize);
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

  async function runTranslateSelection() {
    if (!selection?.text) return;
    const text = selection.text;
    const sentence = selection.sentence || text;
    const lookupTitle = isLookupSelection(text)
      ? t("wordLookup", locale)
      : t("aiTranslateTitle", locale);
    setAiOpen(true);
    setAiResult({
      kind: "lookup",
      title: lookupTitle,
      data: null,
      loading: true,
    });
    try {
      const data = await lookupSelection(text, locale, sentence);
      setAiResult({ kind: "lookup", title: lookupTitle, data });
    } catch (e) {
      setAiResult({
        kind: "plain",
        title: lookupTitle,
        body: e instanceof Error ? e.message : "Error",
      });
    }
  }

  function toolBtn(id: ReaderTool, label: string) {
    return (
      <button
        type="button"
        className={`btn-ghost compact ${tool === id ? "is-on" : ""}`}
        onClick={() => {
          setTool(id);
          if (id === "type") {
            useSettingsStore.getState().setMarginNotes(true);
          }
        }}
        title={label}
      >
        {label}
      </button>
    );
  }

  function panelBtn(
    tab: "toc" | "bookmarks" | "notes" | "chat",
    label: string,
  ) {
    const on = sidebarOpen && sidebarTab === tab;
    return (
      <button
        type="button"
        className={`btn-ghost compact ${on ? "is-on" : ""}`}
        onClick={() => {
          if (on) setSidebarOpen(false);
          else setSidebarTab(tab);
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <header className="reader-bar">
      <div className="reader-bar-nav">
        <div className="reader-bar-start">
          <Link href="/" className="back-link">
            ← {t("backToShelf", locale)}
          </Link>
          <div className="reader-title" title={title}>
            {title}
          </div>
        </div>

        <ReaderPager format={format} pageCount={pageCount} />

        <div className="reader-bar-search">
          <BookSearchPanel key={bookId} bookId={bookId} format={format} />
        </div>
      </div>

      <div className="reader-bar-tools">
        <div className="reader-cluster" role="group" aria-label={t("spread", locale)}>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setScale(scale - 0.1)}
            aria-label="−"
          >
            −
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setScale(scale + 0.1)}
            aria-label="+"
          >
            +
          </button>
          <button
            type="button"
            className={`btn-ghost compact ${spread ? "is-on" : ""}`}
            onClick={() => setSpread(!spread)}
          >
            {t("spread", locale)}
          </button>
          {format === "epub" && <EpubTypePanel />}
          {format === "pdf" && <MarginPanel />}
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
        </div>

        <div className="reader-cluster" role="group" aria-label={t("selectTool", locale)}>
          {toolBtn("select", t("selectTool", locale))}
          {toolBtn("pen", t("pencil", locale))}
          {format === "pdf" && toolBtn("type", t("typeTool", locale))}
          {toolBtn("eraser", t("eraser", locale))}

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

          {tool === "type" && format === "pdf" && (
            <>
              <div className="margin-font-row" role="group" aria-label={t("fontLabel", locale)}>
                {TEXT_FONTS.map((font) => (
                  <button
                    key={font.id}
                    type="button"
                    className={`font-chip font-${font.id} ${
                      textFont === font.id ? "is-on" : ""
                    }`}
                    style={{ fontFamily: EPUB_FONT_STACKS[font.id] }}
                    onClick={() => setTextFont(font.id)}
                    title={t(font.key, locale)}
                  >
                    {t(font.key, locale)}
                  </button>
                ))}
              </div>
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
                {t("textSize", locale)}
                <input
                  type="range"
                  min={0.014}
                  max={0.045}
                  step={0.001}
                  value={textSize}
                  onChange={(e) => setTextSize(Number(e.target.value))}
                />
              </label>
              <span className="margin-text-hint">{t("marginTextHint", locale)}</span>
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

          <button
            type="button"
            className="btn-ghost compact"
            disabled={!selection?.text}
            onClick={() => void runTranslateSelection()}
          >
            {t("translate", locale)}
          </button>
        </div>

        <div className="reader-cluster" role="group" aria-label={t("sidebar", locale)}>
          {panelBtn("toc", t("toc", locale))}
          {panelBtn("bookmarks", t("bookmarks", locale))}
          {panelBtn("notes", t("sidebar", locale))}
          {panelBtn("chat", t("chat", locale))}
          {format === "pdf" && (
            <button
              type="button"
              className={`btn-ghost compact ${filmstripOpen ? "is-on" : ""}`}
              aria-pressed={filmstripOpen}
              onClick={() => setFilmstripOpen(!filmstripOpen)}
              title={t(filmstripOpen ? "hidePages" : "showPages", locale)}
            >
              {t("pagesPanel", locale)}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
