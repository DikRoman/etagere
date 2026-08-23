"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PageViewport } from "pdfjs-dist";
import { renderPdfTextLayer } from "@/lib/pdf";
import { useReaderStore } from "@/store/reader";
import { useSettingsStore } from "@/store/settings";
import { HIGHLIGHT_COLORS, QUOTE_MARKER, NOTE_MARKER } from "@/lib/types";
import { InkLayer } from "./InkLayer";
import { MarginTextLayer } from "./MarginTextLayer";
import { PdfLinkLayer } from "./PdfLinkLayer";
import { PdfSelectLayer } from "./PdfSelectLayer";

interface Props {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  /** Estimated page width/height at current scale (from page 1) */
  estimate: { w: number; h: number; margin: number };
  marginRatio?: number;
}

export function PdfPage({
  pdf,
  pageNumber,
  scale,
  estimate,
  marginRatio = 0.3,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [textLayerEl, setTextLayerEl] = useState<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(estimate);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [viewport, setViewport] = useState<PageViewport | null>(null);

  const annotations = useReaderStore((s) => s.annotations);
  const paper = useSettingsStore((s) => s.notePaper);
  const tool = useReaderStore((s) => s.tool);
  const isBookmarked = useReaderStore((s) =>
    s.annotations.bookmarks.some((b) => b.page === pageNumber),
  );
  const toggleBookmark = useReaderStore((s) => s.toggleBookmark);

  useEffect(() => {
    setSize(estimate);
    setRendered(false);
  }, [estimate]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { root: el.closest(".pdf-scroll"), rootMargin: "600px 0px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let cancelLayer: (() => void) | undefined;
    setRendered(false);
    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const margin = viewport.width * marginRatio;
      setSize({ w: viewport.width, h: viewport.height, margin });
      setViewport(viewport);

      const canvas = canvasRef.current;
      const textLayer = textLayerRef.current;
      if (!canvas || !textLayer) return;

      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const transform =
        outputScale !== 1
          ? ([outputScale, 0, 0, outputScale, 0, 0] as number[])
          : undefined;

      await page.render({
        canvas,
        canvasContext: ctx,
        viewport,
        transform,
      }).promise;
      if (cancelled) return;

      const job = renderPdfTextLayer(page, textLayer, viewport);
      cancelLayer = job.cancel;
      await job.done;
      if (cancelled) {
        job.cancel();
        return;
      }
      setRendered(true);
      setTextLayerEl(textLayer);
    })();
    return () => {
      cancelled = true;
      cancelLayer?.();
    };
  }, [pdf, pageNumber, scale, marginRatio, visible]);

  const pageHighlights = annotations.highlights.filter(
    (h) => h.page === pageNumber,
  );
  const pageQuotes = annotations.quotes.filter((q) => q.page === pageNumber);
  const pageNotes = annotations.notes.filter((n) => n.page === pageNumber);
  const pageInk = annotations.ink.filter((s) => s.page === pageNumber);
  const pageTexts = (annotations.texts ?? []).filter((s) => s.page === pageNumber);
  const totalW = size.w + size.margin;

  return (
    <article
      ref={rootRef}
      className={`pdf-sheet ${isBookmarked ? "is-bookmarked" : ""}`}
      data-page={pageNumber}
      style={{ width: totalW, minHeight: size.h + 28 }}
    >
      <div className="pdf-sheet-row" style={{ height: size.h }}>
        <div
          className="pdf-page"
          style={{ width: size.w, height: size.h }}
        >
          {visible ? (
            <>
              <canvas ref={canvasRef} className="pdf-canvas" />
              <div className="highlight-layer" aria-hidden>
                {pageHighlights.map((h) =>
                  h.rects.map((r, i) => (
                    <div
                      key={`${h.id}-${i}`}
                      className="hl-box hl-box--mark"
                      style={{
                        left: `${r.x * 100}%`,
                        top: `${r.y * 100}%`,
                        width: `${r.width * 100}%`,
                        height: `${r.height * 100}%`,
                        background: HIGHLIGHT_COLORS[h.color].fill,
                      }}
                    />
                  )),
                )}
                {pageQuotes.flatMap((q) =>
                  (q.rects ?? []).map((r, i) => (
                    <div
                      key={`${q.id}-${i}`}
                      className="hl-box hl-box--quote"
                      style={{
                        left: `${r.x * 100}%`,
                        top: `${r.y * 100}%`,
                        width: `${r.width * 100}%`,
                        height: `${r.height * 100}%`,
                        background: QUOTE_MARKER.fill,
                        boxShadow: `inset 3px 0 0 ${QUOTE_MARKER.border}`,
                      }}
                    />
                  )),
                )}
                {pageNotes.flatMap((n) =>
                  n.rects.map((r, i) => (
                    <div
                      key={`${n.id}-${i}`}
                      className="hl-box hl-box--note"
                      style={{
                        left: `${r.x * 100}%`,
                        top: `${r.y * 100}%`,
                        width: `${r.width * 100}%`,
                        height: `${r.height * 100}%`,
                        background: NOTE_MARKER.fill,
                        outline: `1px dashed ${NOTE_MARKER.border}`,
                      }}
                    />
                  )),
                )}
              </div>
              <div
                ref={textLayerRef}
                className={`textLayer text-layer ${tool !== "select" ? "text-layer-off" : "text-layer-custom"}`}
              />
              {rendered && viewport && tool === "select" && (
                <PdfLinkLayer
                  pdf={pdf}
                  pageNumber={pageNumber}
                  viewport={viewport}
                />
              )}
              {rendered && visible && (
                <PdfSelectLayer
                  enabled={tool === "select"}
                  textLayer={textLayerEl}
                  pageNumber={pageNumber}
                  revision={`${pageNumber}:${scale}:${marginRatio}:${rendered}`}
                />
              )}
              {!rendered && <div className="page-placeholder faint" />}
            </>
          ) : (
            <div className="page-placeholder">
              <span>{pageNumber}</span>
            </div>
          )}
        </div>

        {size.margin >= 8 && (
          <div
            className={`page-margin note-paper paper-${paper}${marginRatio >= 0.95 ? " is-sheet" : ""}`}
            style={{ width: size.margin, height: size.h }}
          >
            <div className="margin-lines" aria-hidden />
          </div>
        )}

        {visible && (
          <div
            className={`ink-overlay ${tool === "pen" || tool === "eraser" ? "ink-drawing" : ""}`}
          >
            <InkLayer
              page={pageNumber}
              width={totalW}
              height={size.h}
              pageWidth={size.w}
              marginWidth={size.margin}
              strokes={pageInk}
            />
            {size.margin >= 8 && (
              <MarginTextLayer
                page={pageNumber}
                width={size.margin}
                height={size.h}
                pageWidth={size.w}
                items={pageTexts}
              />
            )}
          </div>
        )}

        <button
          type="button"
          className={`page-bookmark-btn ${isBookmarked ? "on" : ""}`}
          onClick={() => void toggleBookmark(pageNumber)}
          aria-label="Bookmark"
        >
          {isBookmarked ? "★" : "☆"}
        </button>
      </div>
      <div className="page-num-label">{pageNumber}</div>
    </article>
  );
}
