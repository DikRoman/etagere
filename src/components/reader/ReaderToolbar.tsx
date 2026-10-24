"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSettingsStore } from "@/store/settings";
import { useReaderStore } from "@/store/reader";
import { t, type MessageKey } from "@/lib/i18n";
import {
  EPUB_FONT_STACKS,
  PEN_COLORS,
  type BookMeta,
  type EpubFontChoice,
  type ReaderTool,
} from "@/lib/types";
import { printedLabel } from "@/lib/toc";
import { EpubTypeSettings } from "./EpubTypePanel";
import { HighlightPalette } from "./HighlightPalette";
import { MarginSettings } from "./MarginPanel";
import { BookSearchPanel } from "./BookSearchPanel";
import { usePopover } from "./panel-kit";
import {
  IconBack,
  IconBookmark,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconMinus,
  IconMore,
  IconNotes,
  IconPencil,
  IconPlus,
  IconSearch,
  IconSparkles,
  IconToc,
  IconView,
} from "./ReaderIcons";

/*
 * The reader bar, laid out in the order a reader needs things:
 *   where am I (back, title, page) → find (contents, search) → zoom →
 *   mark (bookmark, draw, notes) → view → AI.
 * Every button has an icon and a label; below ~1180px the labels hide, and
 * on phones the less frequent ones move into "More".
 */

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

function BarButton({
  icon,
  label,
  on,
  onClick,
  className = "",
  buttonRef,
}: {
  icon: React.ReactNode;
  label: string;
  on?: boolean;
  onClick: () => void;
  className?: string;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`rb-btn ${on ? "is-on" : ""} ${className}`}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={on}
    >
      {icon}
      <span className="rb-btn-label">{label}</span>
    </button>
  );
}

/** "p. [9] of 822 · 1%": the page number is an input to jump with. */
function PageLine({
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
  const printed = printedLabel(pageLabels, page);
  const [draft, setDraft] = useState<string | null>(null);

  const paged = format === "epub" && spread;
  const sheet = epubSheet ?? { index: 0, count: 1 };
  const canPrev = paged ? sheet.index > 0 || page > 1 : page > 1;
  const canNext = paged ? sheet.index < sheet.count - 1 || page < pageCount : page < pageCount;
  const percent = pageCount ? Math.round((page / pageCount) * 100) : 0;

  function step(dir: -1 | 1) {
    if (format === "epub") requestEpubTurn(dir);
    else void goToPage(page + dir);
  }

  function commit() {
    if (draft === null) return;
    const n = Number(draft);
    setDraft(null);
    if (Number.isFinite(n) && n >= 1) void goToPage(Math.min(pageCount, Math.round(n)));
  }

  return (
    <div className="rb-page" role="navigation" aria-label={t("readingProgress", locale)}>
      <button
        type="button"
        className="rb-step"
        disabled={!canPrev}
        onClick={() => step(-1)}
        aria-label={locale === "ru" ? "Назад" : "Previous"}
      >
        <IconChevronLeft size={16} />
      </button>
      {format === "epub" ? (
        <span className="rb-page-text">
          {t("epubChapter", locale)} {page} {t("pageOf", locale)} {pageCount}
          {paged && sheet.count > 1 ? ` · ${sheet.index + 1}/${sheet.count}` : ""}
        </span>
      ) : (
        <span className="rb-page-text">
          {t("pageShort", locale)}{" "}
          <input
            className="rb-page-input"
            inputMode="numeric"
            aria-label={t("goToPageLabel", locale)}
            value={draft ?? String(page)}
            style={{ width: `${Math.max(2, String(pageCount).length) + 1}ch` }}
            onFocus={(e) => {
              setDraft(String(page));
              e.currentTarget.select();
            }}
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commit();
                e.currentTarget.blur();
              }
              if (e.key === "Escape") {
                setDraft(null);
                e.currentTarget.blur();
              }
            }}
          />{" "}
          {t("pageOf", locale)} {pageCount}
          {printed ? <span className="rb-page-printed"> · {printed}</span> : null}
        </span>
      )}
      <span className="rb-page-pct">· {percent}%</span>
      <button
        type="button"
        className="rb-step"
        disabled={!canNext}
        onClick={() => step(1)}
        aria-label={locale === "ru" ? "Вперёд" : "Next"}
      >
        <IconChevronRight size={16} />
      </button>
    </div>
  );
}

/**
 * Reading progress along the bar's bottom edge. For PDF it is also the
 * scrubber the old slider was: press or drag to jump.
 */
function ProgressStrip({ format, pageCount: metaCount }: { format: BookMeta["format"]; pageCount: number }) {
  const locale = useSettingsStore((s) => s.locale);
  const page = useReaderStore((s) => s.page);
  const liveCount = useReaderStore((s) => s.pageCount);
  const pageCount = Math.max(1, liveCount || metaCount);
  const goToPage = useReaderStore((s) => s.goToPage);
  const [preview, setPreview] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const scrub = format === "pdf";

  const pageAt = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return page;
    const share = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return Math.max(1, Math.min(pageCount, Math.round(share * (pageCount - 1)) + 1));
  };

  const shown = preview ?? page;
  return (
    <div
      ref={ref}
      className={`rb-progress ${scrub ? "is-scrub" : ""}`}
      role={scrub ? "slider" : "progressbar"}
      aria-label={t("readingProgress", locale)}
      aria-valuemin={1}
      aria-valuemax={pageCount}
      aria-valuenow={shown}
      onPointerDown={
        scrub
          ? (e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setPreview(pageAt(e.clientX));
            }
          : undefined
      }
      onPointerMove={scrub ? (e) => preview !== null && setPreview(pageAt(e.clientX)) : undefined}
      onPointerUp={
        scrub
          ? (e) => {
              const target = pageAt(e.clientX);
              setPreview(null);
              void goToPage(target);
            }
          : undefined
      }
    >
      <div style={{ width: `${(shown / pageCount) * 100}%` }} />
      {preview !== null && (
        <span className="rb-progress-tip" style={{ left: `${(shown / pageCount) * 100}%` }}>
          {shown}
        </span>
      )}
    </div>
  );
}

export function ReaderToolbar({ title, pageCount, bookId, format }: Props) {
  const locale = useSettingsStore((s) => s.locale);
  const spread = useSettingsStore((s) => s.spread);
  const setSpread = useSettingsStore((s) => s.setSpread);
  const vocabMarks = useSettingsStore((s) => s.vocabMarks);
  const setVocabMarks = useSettingsStore((s) => s.setVocabMarks);
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const filmstripOpen = useSettingsStore((s) => s.filmstripOpen);
  const setFilmstripOpen = useSettingsStore((s) => s.setFilmstripOpen);

  const page = useReaderStore((s) => s.page);
  const scale = useReaderStore((s) => s.scale);
  const setScale = useReaderStore((s) => s.setScale);
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
  const bookmarked = useReaderStore((s) =>
    s.annotations.bookmarks.some((b) => b.page === s.page),
  );
  const toggleBookmark = useReaderStore((s) => s.toggleBookmark);

  // Destructured so the compiler can tell the refs from the plain state.
  const {
    open: viewOpen,
    setOpen: setViewOpen,
    spot: viewSpot,
    buttonRef: viewBtn,
    panelRef: viewPanelRef,
  } = usePopover();
  const {
    open: searchOpen,
    setOpen: setSearchOpen,
    spot: searchSpot,
    buttonRef: searchBtn,
    panelRef: searchPanelRef,
  } = usePopover();
  const {
    open: moreOpen,
    setOpen: setMoreOpen,
    spot: moreSpot,
    buttonRef: moreBtn,
    panelRef: morePanelRef,
  } = usePopover();
  const [drawOpen, setDrawOpen] = useState(false);
  const drawing = drawOpen || tool !== "select";

  // Picking something from "More" should close it.
  const closeMore = () => setMoreOpen(false);

  function togglePanel(tab: "toc" | "notes" | "chat") {
    if (sidebarOpen && sidebarTab === tab) setSidebarOpen(false);
    else setSidebarTab(tab);
  }
  const panelOn = (tab: "toc" | "notes" | "chat") => sidebarOpen && sidebarTab === tab;

  function toolBtn(id: ReaderTool, label: string) {
    return (
      <button
        type="button"
        className={`btn-ghost compact ${tool === id ? "is-on" : ""}`}
        onClick={() => {
          setTool(id);
          if (id === "type") useSettingsStore.getState().setMarginNotes(true);
        }}
      >
        {label}
      </button>
    );
  }

  const zoomPct = Math.round(scale * 100);
  const zoom = (
    <div className="rb-zoom" role="group" aria-label={`${zoomPct}%`}>
      <button
        type="button"
        className="rb-step"
        onClick={() => setScale(scale - 0.1)}
        aria-label={t("zoomOut", locale)}
        title={t("zoomOut", locale)}
      >
        <IconMinus size={16} />
      </button>
      <button
        type="button"
        className="rb-zoom-pct"
        onClick={() => setScale(1)}
        title={locale === "ru" ? "Сбросить до 100%" : "Reset to 100%"}
      >
        {zoomPct}%
      </button>
      <button
        type="button"
        className="rb-step"
        onClick={() => setScale(scale + 0.1)}
        aria-label={t("zoomIn", locale)}
        title={t("zoomIn", locale)}
      >
        <IconPlus size={16} />
      </button>
    </div>
  );

  const viewPanel = (
    <div
      className="type-panel reader-view-panel"
      role="dialog"
      aria-label={t("barView", locale)}
      ref={viewPanelRef}
      style={{ top: viewSpot.top, left: viewSpot.left }}
    >
      <div className="view-section">
        <span className="type-row-label">{t("viewTheme", locale)}</span>
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
      <div className="view-toggles">
        {format === "pdf" && (
          <button
            type="button"
            className={`btn-ghost compact ${filmstripOpen ? "is-on" : ""}`}
            aria-pressed={filmstripOpen}
            onClick={() => setFilmstripOpen(!filmstripOpen)}
          >
            {t("pagesPanel", locale)}
          </button>
        )}
        {format === "pdf" && (
          <button
            type="button"
            className={`btn-ghost compact ${vocabMarks ? "is-on" : ""}`}
            aria-pressed={vocabMarks}
            onClick={() => setVocabMarks(!vocabMarks)}
            title={t("vocabMarksHint", locale)}
          >
            {t("vocabMarks", locale)}
          </button>
        )}
        {/* PDF scrolls in one column, so a spread is EPUB-only. */}
        {format === "epub" && (
          <button
            type="button"
            className={`btn-ghost compact ${spread ? "is-on" : ""}`}
            aria-pressed={spread}
            onClick={() => setSpread(!spread)}
          >
            {t("spread", locale)}
          </button>
        )}
      </div>
      {format === "pdf" ? (
        <>
          <span className="view-heading">{t("viewMargins", locale)}</span>
          <MarginSettings />
        </>
      ) : (
        <>
          <span className="view-heading">{t("typography", locale)}</span>
          <EpubTypeSettings />
        </>
      )}
    </div>
  );

  const searchPanel = (
    <div
      className="type-panel reader-search-panel"
      role="dialog"
      aria-label={t("search", locale)}
      ref={searchPanelRef}
      style={{ top: searchSpot.top, left: searchSpot.left }}
    >
      <BookSearchPanel key={bookId} bookId={bookId} format={format} />
    </div>
  );

  // Phones: the less frequent actions, with their labels.
  const moreMenu = (
    <div
      className="type-panel reader-more-menu"
      role="menu"
      ref={morePanelRef}
      style={{ top: moreSpot.top, left: moreSpot.left }}
    >
      <div className="rb-more-zoom">{zoom}</div>
      <button
        type="button"
        role="menuitem"
        className={`rb-more-item ${bookmarked ? "is-on" : ""}`}
        onClick={() => {
          void toggleBookmark(page);
          closeMore();
        }}
      >
        <IconBookmark filled={bookmarked} size={18} />
        {bookmarked ? t("removeBookmark", locale) : t("addBookmark", locale)}
      </button>
      <button
        type="button"
        role="menuitem"
        className="rb-more-item"
        onClick={() => {
          togglePanel("notes");
          closeMore();
        }}
      >
        <IconNotes size={18} />
        {t("sidebar", locale)}
      </button>
      <button
        type="button"
        role="menuitem"
        className="rb-more-item"
        onClick={() => {
          closeMore();
          setViewOpen(true);
        }}
      >
        <IconView size={18} />
        {t("barView", locale)}
      </button>
      <button
        type="button"
        role="menuitem"
        className="rb-more-item"
        onClick={() => {
          togglePanel("chat");
          closeMore();
        }}
      >
        <IconSparkles size={18} />
        {t("barAi", locale)}
      </button>
    </div>
  );

  const drawTray = (
    <div className="reader-markup-tray reader-bar-tools" role="toolbar" aria-label={t("barDrawing", locale)}>
      <span className="rb-tray-title">{t("barDrawing", locale)}</span>
      {toolBtn("select", t("selectTool", locale))}
      {toolBtn("pen", t("pencil", locale))}
      {format === "pdf" && toolBtn("type", t("typeTool", locale))}
      {toolBtn("eraser", t("eraser", locale))}

      {tool === "select" && (
        // Same three colours as the selection menu; a click opens the full
        // palette, so it works without hover on touch screens.
        <div className="color-row">
          <HighlightPalette gridOpenOn="click" dropDown />
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
                className={`font-chip font-${font.id} ${textFont === font.id ? "is-on" : ""}`}
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
        <button type="button" className="btn-ghost compact" onClick={() => void clearPageInk(page)}>
          {t("clearInk", locale)}
        </button>
      )}

      <button
        type="button"
        className="btn-primary compact rb-tray-done"
        onClick={() => {
          setTool("select");
          setDrawOpen(false);
        }}
      >
        <IconCheck size={16} /> {t("barDone", locale)}
      </button>
    </div>
  );

  return (
    <>
      <header className="reader-bar reader-chrome-top rb">
        <div className="rb-row">
          <Link href="/" className="rb-btn rb-back" title={t("backToShelf", locale)}>
            <IconBack />
            <span className="rb-btn-label">{t("barShelf", locale)}</span>
          </Link>

          <div className="rb-where">
            <div className="rb-title" title={title}>
              {title}
            </div>
            <PageLine format={format} pageCount={pageCount} />
          </div>

          <div className="rb-actions">
            <div className="rb-group">
              <BarButton
                icon={<IconToc />}
                label={t("toc", locale)}
                on={panelOn("toc")}
                onClick={() => togglePanel("toc")}
              />
              <BarButton
                icon={<IconSearch />}
                label={t("search", locale)}
                on={searchOpen}
                onClick={() => setSearchOpen((v) => !v)}
                buttonRef={searchBtn}
              />
            </div>

            <div className="rb-group rb-collapsible">{zoom}</div>

            <div className="rb-group">
              <BarButton
                className="rb-collapsible"
                icon={<IconBookmark filled={bookmarked} />}
                label={bookmarked ? t("removeBookmark", locale) : t("addBookmark", locale)}
                on={bookmarked}
                onClick={() => void toggleBookmark(page)}
              />
              <BarButton
                icon={<IconPencil />}
                label={t("barDraw", locale)}
                on={drawing}
                onClick={() => {
                  if (drawing) {
                    setTool("select");
                    setDrawOpen(false);
                  } else {
                    setDrawOpen(true);
                  }
                }}
              />
              <BarButton
                className="rb-collapsible"
                icon={<IconNotes />}
                label={t("sidebar", locale)}
                on={panelOn("notes")}
                onClick={() => togglePanel("notes")}
              />
            </div>

            <div className="rb-group">
              <BarButton
                className="rb-collapsible"
                icon={<IconView />}
                label={t("barView", locale)}
                on={viewOpen}
                onClick={() => setViewOpen((v) => !v)}
                buttonRef={viewBtn}
              />
              <BarButton
                className="rb-collapsible"
                icon={<IconSparkles />}
                label={t("barAi", locale)}
                on={panelOn("chat")}
                onClick={() => togglePanel("chat")}
              />
              <BarButton
                className="rb-more-btn"
                icon={<IconMore />}
                label={t("barMore", locale)}
                on={moreOpen}
                onClick={() => setMoreOpen((v) => !v)}
                buttonRef={moreBtn}
              />
            </div>
          </div>
        </div>
        <ProgressStrip format={format} pageCount={pageCount} />
        {drawing && drawTray}
      </header>
      {viewOpen && typeof document !== "undefined" && createPortal(viewPanel, document.body)}
      {searchOpen && typeof document !== "undefined" && createPortal(searchPanel, document.body)}
      {moreOpen && typeof document !== "undefined" && createPortal(moreMenu, document.body)}
    </>
  );
}
