"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useReaderStore } from "@/store/reader";
import { HIGHLIGHT_COLORS, type TextRect } from "@/lib/types";
import { InkLayer } from "./InkLayer";

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
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(estimate);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);

  const annotations = useReaderStore((s) => s.annotations);
  const tool = useReaderStore((s) => s.tool);
  const setSelection = useReaderStore((s) => s.setSelection);
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
    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const margin = Math.max(120, viewport.width * marginRatio);
      setSize({ w: viewport.width, h: viewport.height, margin });

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

      textLayer.innerHTML = "";
      textLayer.style.width = `${viewport.width}px`;
      textLayer.style.height = `${viewport.height}px`;

      const textContent = await page.getTextContent();
      for (const item of textContent.items) {
        if (!("str" in item) || !item.str) continue;
        const tx = item.transform;
        const fontHeight = Math.hypot(tx[2], tx[3]) * scale;
        const left = tx[4] * scale;
        const top = viewport.height - tx[5] * scale - fontHeight * 0.85;
        const span = document.createElement("span");
        span.textContent =
          item.str + ("hasEOL" in item && item.hasEOL ? "\n" : " ");
        span.style.left = `${left}px`;
        span.style.top = `${top}px`;
        span.style.fontSize = `${Math.max(fontHeight, 1)}px`;
        span.style.fontFamily = "sans-serif";
        textLayer.appendChild(span);
      }
      setRendered(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber, scale, marginRatio, visible]);

  useEffect(() => {
    if (tool !== "select") return;
    const onUp = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";
      if (!text || !sel || sel.rangeCount === 0 || !textLayerRef.current) return;
      const range = sel.getRangeAt(0);
      if (!textLayerRef.current.contains(range.commonAncestorContainer)) return;

      const layerRect = textLayerRef.current.getBoundingClientRect();
      const rects: TextRect[] = [];
      for (const r of Array.from(range.getClientRects())) {
        rects.push({
          x: (r.left - layerRect.left) / (layerRect.width || 1),
          y: (r.top - layerRect.top) / (layerRect.height || 1),
          width: r.width / (layerRect.width || 1),
          height: r.height / (layerRect.height || 1),
        });
      }
      const last = range.getBoundingClientRect();
      setSelection({
        text,
        page: pageNumber,
        rects,
        screen: { x: last.left + last.width / 2, y: last.top },
      });
    };
    document.addEventListener("mouseup", onUp);
    return () => document.removeEventListener("mouseup", onUp);
  }, [pageNumber, setSelection, tool]);

  const pageHighlights = annotations.highlights.filter(
    (h) => h.page === pageNumber,
  );
  const pageInk = annotations.ink.filter((s) => s.page === pageNumber);
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
                      className="hl-box"
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
              </div>
              <div
                ref={textLayerRef}
                className={`text-layer ${tool !== "select" ? "text-layer-off" : ""}`}
              />
              {!rendered && <div className="page-placeholder faint" />}
            </>
          ) : (
            <div className="page-placeholder">
              <span>{pageNumber}</span>
            </div>
          )}
        </div>

        <div
          className="page-margin"
          style={{ width: size.margin, height: size.h }}
        >
          <div className="margin-lines" aria-hidden />
        </div>

        {visible && (
          <div className="ink-overlay">
            <InkLayer
              page={pageNumber}
              width={totalW}
              height={size.h}
              strokes={pageInk}
            />
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
