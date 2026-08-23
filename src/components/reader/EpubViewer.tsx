"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Book, Contents, Location, Rendition } from "epubjs";
import { getPdfBlob, saveTocCache } from "@/lib/storage/local";
import { indexEpubBook } from "@/lib/book-search";
import {
  displayLocation,
  displayTarget,
  epubContentCss,
  footnoteFromDoc,
  footnoteHtml,
  isNoteRef,
  openEpubBook,
  renditionContents,
  spineLength,
  tocFromBook,
} from "@/lib/epub";
import {
  afterSelectionSettles,
  sentenceAroundSelection,
} from "@/lib/selection";
import type { TextRect } from "@/lib/types";
import { useReaderStore } from "@/store/reader";
import { useSettingsStore } from "@/store/settings";
import { applyReaderWheelZoom } from "@/lib/reader-zoom";

const TURN_MS = 360;

export function EpubViewer({ bookId }: { bookId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const cssRef = useRef("");
  const applying = useRef(false);
  const lastCfi = useRef<string | null>(null);
  const pressAt = useRef<{ x: number; y: number } | null>(null);
  const turnAt = useRef(0);
  const lastTurn = useRef(0);

  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState<{
    html: string;
    x: number;
    y: number;
  } | null>(null);

  const page = useReaderStore((s) => s.page);
  const pageCount = useReaderStore((s) => s.pageCount);
  const scale = useReaderStore((s) => s.scale);
  const goToPage = useReaderStore((s) => s.goToPage);
  const setPageFromScroll = useReaderStore((s) => s.setPageFromScroll);
  const scrollRequest = useReaderStore((s) => s.scrollRequest);
  const scrollAnchor = useReaderStore((s) => s.scrollAnchor);
  const clearScrollRequest = useReaderStore((s) => s.clearScrollRequest);
  const setToc = useReaderStore((s) => s.setToc);
  const setSelection = useReaderStore((s) => s.setSelection);
  const setEpubSheet = useReaderStore((s) => s.setEpubSheet);
  const epubTurn = useReaderStore((s) => s.epubTurn);
  const locale = useSettingsStore((s) => s.locale);
  const theme = useSettingsStore((s) => s.theme);
  const paged = useSettingsStore((s) => s.spread);
  const type = useSettingsStore((s) => s.epubType);

  const paintCss = useCallback(() => {
    cssRef.current = epubContentCss({ theme, type, scale, paged });
    const rendition = renditionRef.current;
    if (!rendition) return;
    for (const contents of renditionContents(rendition)) {
      void contents.addStylesheetCss(cssRef.current, "etagere");
    }
  }, [theme, type, scale, paged]);

  const captureFromContents = useCallback(
    (contents: Contents) => {
      const sel = contents.window.getSelection();
      const text = sel?.toString().replace(/\s+/g, " ").trim() ?? "";
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || text.length < 1) {
        return;
      }
      const range = sel.getRangeAt(0);
      const iframe = contents.document.defaultView?.frameElement as
        | HTMLIFrameElement
        | undefined;
      const frameRect = iframe?.getBoundingClientRect();
      const layerRect = frameRect ?? { left: 0, top: 0, width: 1, height: 1 };
      const rects: TextRect[] = [];
      for (const r of Array.from(range.getClientRects())) {
        if (r.width < 1 || r.height < 1) continue;
        rects.push({
          x: r.left / (layerRect.width || 1),
          y: r.top / (layerRect.height || 1),
          width: r.width / (layerRect.width || 1),
          height: r.height / (layerRect.height || 1),
        });
      }
      if (!rects.length) return;
      const last = range.getBoundingClientRect();
      const root =
        (contents.document.body as HTMLElement) ||
        (contents.document.documentElement as HTMLElement);
      const sentence = sentenceAroundSelection(root, text);
      setSelection({
        text,
        page: useReaderStore.getState().page,
        rects,
        screen: {
          x: (frameRect?.left ?? 0) + last.left + last.width / 2,
          y: (frameRect?.top ?? 0) + last.top,
        },
        sentence:
          sentence && sentence.toLowerCase() !== text.toLowerCase()
            ? sentence
            : sentence || text,
      });
    },
    [setSelection],
  );

  const showFootnote = useCallback(
    (html: string, event: MouseEvent, contents: Contents) => {
      const iframe = contents.document.defaultView?.frameElement as
        | HTMLIFrameElement
        | undefined;
      const frame = iframe?.getBoundingClientRect();
      setNote({
        html,
        x: (frame?.left ?? 0) + event.clientX,
        y: (frame?.top ?? 0) + event.clientY,
      });
    },
    [],
  );

  const turn = useCallback((dir: -1 | 1) => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    const now = performance.now();
    if (now < turnAt.current) return;
    turnAt.current = now + TURN_MS;
    if (dir > 0) void rendition.next();
    else void rendition.prev();
  }, []);

  useEffect(() => {
    paintCss();
  }, [paintCss]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const blob = await getPdfBlob(bookId);
      if (!blob || cancelled) {
        if (!cancelled) setFailed(true);
        return;
      }
      try {
        const book = await openEpubBook(await blob.arrayBuffer());
        if (cancelled) {
          book.destroy();
          return;
        }
        bookRef.current = book;
        const count = Math.max(1, spineLength(book));
        useReaderStore.setState({ pageCount: count });
        if (!useReaderStore.getState().toc.length) {
          const nav = await book.loaded.navigation;
          if (cancelled) return;
          const toc = tocFromBook(book, nav.toc ?? []);
          setToc(toc, nav.toc?.length ? "outline" : "text");
          void saveTocCache(bookId, toc, nav.toc?.length ? "outline" : "text");
        }
        void indexEpubBook(bookId, book);
        setReady(true);
      } catch (err) {
        console.error(err);
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      renditionRef.current?.destroy();
      renditionRef.current = null;
      bookRef.current?.destroy();
      bookRef.current = null;
      setEpubSheet(null);
    };
  }, [bookId, setToc, setEpubSheet]);

  useEffect(() => {
    const book = bookRef.current;
    const host = hostRef.current;
    if (!ready || !book || !host) return;

    const rendition = book.renderTo(host, {
      width: "100%",
      height: "100%",
      flow: paged ? "paginated" : "scrolled-doc",
      spread: paged ? "auto" : "none",
      minSpreadWidth: 720,
      allowScriptedContent: false,
    });
    renditionRef.current = rendition;
    cssRef.current = epubContentCss({ theme, type, scale, paged });

    const onRelocated = (location: Location) => {
      lastCfi.current = location.start.cfi;
      const displayed = location.start.displayed;
      setEpubSheet({
        index: Math.max(0, (displayed?.page ?? 1) - 1),
        count: Math.max(1, displayed?.total ?? 1),
      });
      const nextPage = location.start.index + 1;
      if (!applying.current && nextPage !== useReaderStore.getState().page) {
        setPageFromScroll(nextPage);
      }
    };

    rendition.hooks.content.register((contents: Contents) => {
      void contents.addStylesheetCss(cssRef.current, "etagere");
      const doc = contents.document;
      doc.addEventListener(
        "click",
        (event) => {
          const target = event.target as Element | null;
          const link = target?.closest?.("a[href]");
          if (!link) return;
          const href = link.getAttribute("href") ?? "";
          if (/^(https?:|mailto:|tel:)/i.test(href)) {
            event.preventDefault();
            event.stopPropagation();
            window.open(href, "_blank", "noopener,noreferrer");
            return;
          }
          const noteEl =
            isNoteRef(link) || href.includes("#")
              ? footnoteFromDoc(doc, href)
              : null;
          if (noteEl && (isNoteRef(link) || noteEl !== link)) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            showFootnote(footnoteHtml(noteEl), event, contents);
          }
        },
        true,
      );

      doc.addEventListener("keydown", (event) => {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        const el = event.target as HTMLElement | null;
        if (el?.closest("input, textarea, [contenteditable=true]")) return;
        if (event.key === "ArrowRight" || event.key === "PageDown") {
          event.preventDefault();
          turn(1);
        } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
          event.preventDefault();
          turn(-1);
        }
      });

      doc.addEventListener(
        "wheel",
        (event) => {
          if (applyReaderWheelZoom(event)) return;
          if (!paged) return;
          const amount =
            Math.abs(event.deltaX) > Math.abs(event.deltaY)
              ? event.deltaX
              : event.deltaY;
          if (Math.abs(amount) < 2) return;
          event.preventDefault();
          turn(amount > 0 ? 1 : -1);
        },
        { passive: false },
      );

      doc.addEventListener("pointerup", () => {
        afterSelectionSettles(() => captureFromContents(contents));
      });
    });

    rendition.on("relocated", onRelocated);
    rendition.on("selected", (_cfi: string, contents: Contents) => {
      afterSelectionSettles(() => captureFromContents(contents));
    });
    rendition.on("click", (event: MouseEvent, contents: Contents) => {
      const sel = contents.window.getSelection();
      if (sel && !sel.isCollapsed) return;
      const target = event.target as Element | null;
      if (target?.closest?.("a")) return;
      const iframe = contents.document.defaultView?.frameElement as
        | HTMLIFrameElement
        | undefined;
      const box = iframe?.getBoundingClientRect();
      if (!box) return;
      const x = box.left + event.clientX;
      const start = pressAt.current;
      if (start && Math.hypot(x - start.x, event.clientY - start.y) > 6) {
        return;
      }
      const edge = Math.min(64, Math.max(28, box.width * 0.06));
      if (event.clientX <= edge) turn(-1);
      else if (box.width - event.clientX <= edge) turn(1);
    });

    applying.current = true;
    const start = lastCfi.current || displayTarget(book, useReaderStore.getState().page);
    void displayLocation(rendition, start).finally(() => {
      applying.current = false;
    });

    const ro = new ResizeObserver(() => {
      if (host.clientWidth < 1 || host.clientHeight < 1) return;
      rendition.resize(host.clientWidth, host.clientHeight);
    });
    ro.observe(host);

    return () => {
      ro.disconnect();
      rendition.off("relocated", onRelocated);
      rendition.destroy();
      if (renditionRef.current === rendition) renditionRef.current = null;
      host.replaceChildren();
    };
    // Recreate the view when paged mode changes; type/theme/scale use paintCss.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ready,
    paged,
    bookId,
    captureFromContents,
    setEpubSheet,
    setPageFromScroll,
    showFootnote,
    turn,
  ]);

  useEffect(() => {
    if (!scrollRequest || !ready) return;
    const book = bookRef.current;
    const rendition = renditionRef.current;
    if (!book || !rendition) return;
    applying.current = true;
    const target = displayTarget(book, page, scrollAnchor);
    void displayLocation(rendition, target).finally(() => {
      applying.current = false;
      clearScrollRequest();
    });
  }, [scrollRequest, scrollAnchor, page, ready, clearScrollRequest]);

  useEffect(() => {
    if (!epubTurn || epubTurn.n === lastTurn.current) return;
    lastTurn.current = epubTurn.n;
    turn(epubTurn.dir);
  }, [epubTurn, turn]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, [contenteditable=true]")
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        setNote(null);
        return;
      }
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        turn(1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        turn(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [turn]);

  useEffect(() => () => setEpubSheet(null), [setEpubSheet]);

  if (failed) {
    return (
      <div className="reader-error">
        {locale === "ru"
          ? "Не удалось разобрать этот EPUB"
          : "Could not read this EPUB"}
      </div>
    );
  }

  if (!ready) {
    return <div className="pdf-loading">EPUB…</div>;
  }

  return (
    <div
      className={`epub-scroll theme-${theme} ${paged ? "is-paged" : "is-flow"}`}
      onPointerDown={(e) => {
        pressAt.current = { x: e.clientX, y: e.clientY };
      }}
      onClick={() => setNote(null)}
    >
      <div className="epub-host" ref={hostRef} />
      {!paged && (
        <div className="epub-foot">
          <button
            type="button"
            className="btn-ghost compact"
            disabled={page >= pageCount}
            onClick={() => void goToPage(page + 1)}
          >
            {locale === "ru" ? "Дальше ›" : "Next ›"}
          </button>
        </div>
      )}
      {note && (
        <aside
          className="epub-footnote"
          style={{
            left: Math.min(note.x, window.innerWidth - 320),
            top: Math.min(note.y + 12, window.innerHeight - 180),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="epub-footnote-body"
            dangerouslySetInnerHTML={{ __html: note.html }}
          />
        </aside>
      )}
    </div>
  );
}
