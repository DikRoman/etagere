"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { loadPdf } from "@/lib/pdf";
import { getPdfBlob } from "@/lib/storage/local";
import { getPdfOutline } from "@/lib/ai";
import { useReaderStore } from "@/store/reader";
import { useSettingsStore } from "@/store/settings";
import { PdfPage } from "./PdfPage";

interface Props {
  bookId: string;
  pageCount: number;
  onPdf?: (pdf: PDFDocumentProxy | null) => void;
}

export function PdfViewer({ bookId, pageCount, onPdf }: Props) {
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
  const tool = useReaderStore((s) => s.tool);
  const spread = useSettingsStore((s) => s.spread);

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
        onPdf?.(doc);
        const outline = await getPdfOutline(doc);
        if (!cancelled) setToc(outline);
      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : "Failed to load PDF");
      }
    })();
    return () => {
      cancelled = true;
      void pdfRef.current?.cleanup();
      pdfRef.current = null;
      setPdf(null);
      onPdf?.(null);
    };
  }, [bookId, onPdf, setToc]);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(1);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: spread ? scale * 0.85 : scale });
      const margin = Math.max(100, viewport.width * (spread ? 0.18 : 0.3));
      setEstimate({ w: viewport.width, h: viewport.height, margin });
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, scale, spread]);

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

  const renderScale = spread ? scale * 0.85 : scale;

  return (
    <div
      className={`pdf-scroll ${tool !== "select" ? "tool-draw" : ""} ${spread ? "is-spread" : ""}`}
      ref={scrollRef}
    >
      <div className={`pdf-column ${spread ? "spread-grid" : ""}`}>
        {pages.map((n) => (
          <PdfPage
            key={n}
            pdf={pdf}
            pageNumber={n}
            scale={renderScale}
            estimate={estimate}
            marginRatio={spread ? 0.18 : 0.3}
          />
        ))}
      </div>
    </div>
  );
}
