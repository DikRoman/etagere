"use client";

import { useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { getPdfPageLabels, getPdfToc, loadPdf } from "@/lib/pdf";
import { getPdfBlob, getTocCache, saveTocCache } from "@/lib/storage/local";
import { t } from "@/lib/i18n";
import { indexPdfBook } from "@/lib/book-search";
import { useReaderStore } from "@/store/reader";
import { useSettingsStore } from "@/store/settings";
import { PdfPage } from "./PdfPage";
import { PageFilmstrip } from "./PageFilmstrip";

interface Props {
  bookId: string;
  pageCount: number;
}

export function PdfViewer({ bookId, pageCount }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<{
    w: number;
    h: number;
    margin: number;
  } | null>(null);

  const scale = useReaderStore((s) => s.scale);
  const scrollRequest = useReaderStore((s) => s.scrollRequest);
  const clearScrollRequest = useReaderStore((s) => s.clearScrollRequest);
  const setPageFromScroll = useReaderStore((s) => s.setPageFromScroll);
  const setToc = useReaderStore((s) => s.setToc);
  const setPageLabels = useReaderStore((s) => s.setPageLabels);
  const setPdfDoc = useReaderStore((s) => s.setPdfDoc);
  const page = useReaderStore((s) => s.page);
  const tool = useReaderStore((s) => s.tool);
  const filmstripOpen = useSettingsStore((s) => s.filmstripOpen);
  const setFilmstripOpen = useSettingsStore((s) => s.setFilmstripOpen);
  const locale = useSettingsStore((s) => s.locale);
  const marginNotes = useSettingsStore((s) => s.marginNotes);
  const marginWidth = useSettingsStore((s) => s.marginRatio);
  const marginRatio = marginNotes ? marginWidth : 0;
  const zoomAnchor = useRef<{ page: number; ratio: number } | null>(null);
  const zoomReady = useRef(false);
  const suppressPageFromScroll = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const blob = await getPdfBlob(bookId);
        if (!blob) throw new Error("PDF not found in local storage");
        const buf = await blob.arrayBuffer();
        const doc = await loadPdf(buf);
        if (cancelled) {
          await doc.cleanup();
          return;
        }
        pdfRef.current = doc;
        setPdf(doc);
        setPdfDoc(doc);
        void indexPdfBook(bookId, doc);
        const labelsP = getPdfPageLabels(doc);
        let items = useReaderStore.getState().toc;
        let source = useReaderStore.getState().tocSource;
        if (!items.length) {
          const cached = await getTocCache(bookId);
          if (cached?.items.length) {
            items = cached.items;
            source = cached.source;
          } else {
            const built = await getPdfToc(doc);
            items = built.items;
            source = built.source;
            void saveTocCache(bookId, items, source);
          }
        }
        if (cancelled) return;
        setToc(items, source);
        const labels = await labelsP;
        if (!cancelled) setPageLabels(labels);
      } catch (e) {
        console.error(e);
        if (!cancelled) setToc([], "none");
        setError(e instanceof Error ? e.message : "Failed to load PDF");
      }
    })();
    return () => {
      cancelled = true;
      void pdfRef.current?.cleanup();
      pdfRef.current = null;
      setPdf(null);
      setPdfDoc(null);
    };
  }, [bookId, setPdfDoc, setToc, setPageLabels]);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(1);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      setEstimate({
        w: viewport.width,
        h: viewport.height,
        margin: viewport.width * marginRatio,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, scale, marginRatio]);

  useLayoutEffect(() => {
    if (!zoomReady.current) {
      zoomReady.current = true;
      return;
    }
    const root = scrollRef.current;
    const p = useReaderStore.getState().page;
    const el = root?.querySelector<HTMLElement>(`[data-page="${p}"]`);
    if (root && el) {
      const ratio =
        (root.scrollTop + root.clientHeight * 0.28 - el.offsetTop) /
        Math.max(1, el.offsetHeight);
      zoomAnchor.current = {
        page: p,
        ratio: Math.min(1.15, Math.max(-0.15, ratio)),
      };
    } else {
      zoomAnchor.current = { page: p, ratio: 0 };
    }
    suppressPageFromScroll.current = true;
    const t = window.setTimeout(() => {
      zoomAnchor.current = null;
      suppressPageFromScroll.current = false;
    }, 400);
    return () => window.clearTimeout(t);
  }, [scale]);

  useEffect(() => {
    const root = scrollRef.current;
    const col = root?.querySelector(".pdf-column");
    if (!root || !col) return;
    const ro = new ResizeObserver(() => {
      const anchor = zoomAnchor.current;
      if (!anchor) return;
      const el = root.querySelector<HTMLElement>(`[data-page="${anchor.page}"]`);
      if (!el) return;
      root.scrollTop = Math.max(
        0,
        el.offsetTop +
          anchor.ratio * el.offsetHeight -
          root.clientHeight * 0.28,
      );
    });
    ro.observe(col);
    return () => ro.disconnect();
  }, [pdf, estimate]);

  useEffect(() => {
    if (!scrollRequest || !scrollRef.current || !estimate) return;
    const el = scrollRef.current.querySelector(
      `[data-page="${scrollRequest}"]`,
    );
    if (el) el.scrollIntoView({ behavior: "auto", block: "start" });
    const t = window.setTimeout(() => clearScrollRequest(), 200);
    return () => window.clearTimeout(t);
  }, [scrollRequest, clearScrollRequest, estimate]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        if (suppressPageFromScroll.current) return;
        const sheets = root.querySelectorAll<HTMLElement>("[data-page]");
        const mid = root.scrollTop + root.clientHeight * 0.25;
        let best = 1;
        let bestDist = Infinity;
        sheets.forEach((sheet) => {
          const top = sheet.offsetTop;
          const dist = Math.abs(top - mid);
          const page = Number(sheet.dataset.page);
          if (page && dist < bestDist) {
            bestDist = dist;
            best = page;
          }
        });
        setPageFromScroll(best);
      });
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, [setPageFromScroll, pdf, estimate]);

  const pages = useMemo(
    () => Array.from({ length: pageCount }, (_, i) => i + 1),
    [pageCount],
  );

  if (error) return <div className="reader-error">{error}</div>;
  if (!pdf || !estimate) return <div className="pdf-loading">PDF…</div>;


  return (
    <div className="pdf-viewer-layout">
      {filmstripOpen ? (
        <PageFilmstrip pdf={pdf} pageCount={pageCount} />
      ) : (
        <button
          type="button"
          className="page-filmstrip-tab"
          onClick={() => setFilmstripOpen(true)}
          title={t("showPages", locale)}
          aria-label={t("showPages", locale)}
        >
          <span className="page-filmstrip-tab-mark" aria-hidden>
            ›
          </span>
          <span className="page-filmstrip-tab-label">
            {t("pagesPanel", locale)}
          </span>
          <span className="page-filmstrip-tab-num">{page}</span>
        </button>
      )}
      <div
        className={`pdf-scroll ${
          tool === "pen" || tool === "eraser" ? "tool-draw" : ""
        } ${tool === "type" ? "tool-type" : ""}`}
        ref={scrollRef}
      >
        <div className="pdf-column">
          {pages.map((n) => (
            <PdfPage
              key={n}
              pdf={pdf}
              pageNumber={n}
              scale={scale}
              estimate={estimate}
              marginRatio={marginRatio}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
