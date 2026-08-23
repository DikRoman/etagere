"use client";

import { useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { renderPageThumb } from "@/lib/pdf-thumb";
import { t } from "@/lib/i18n";
import { useReaderStore } from "@/store/reader";
import { useSettingsStore } from "@/store/settings";

function ThumbItem({
  pdf,
  pageNumber,
  active,
  onSelect,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  active: boolean;
  onSelect: (n: number) => void;
}) {
  const rootRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    void renderPageThumb(pdf, pageNumber, canvas).catch(() => {
      if (!cancelled && rootRef.current) {
        rootRef.current.dataset.failed = "1";
      }
    });

    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber]);

  useEffect(() => {
    if (active && rootRef.current) {
      rootRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [active]);

  return (
    <button
      ref={rootRef}
      type="button"
      className={`page-thumb ${active ? "is-active" : ""}`}
      onClick={() => onSelect(pageNumber)}
      aria-current={active ? "page" : undefined}
      aria-label={`Page ${pageNumber}`}
    >
      <canvas ref={canvasRef} className="page-thumb-canvas" />
      <span className="page-thumb-num">{pageNumber}</span>
    </button>
  );
}

export function PageFilmstrip({
  pdf,
  pageCount,
}: {
  pdf: PDFDocumentProxy;
  pageCount: number;
}) {
  const page = useReaderStore((s) => s.page);
  const goToPage = useReaderStore((s) => s.goToPage);
  const locale = useSettingsStore((s) => s.locale);
  const setOpen = useSettingsStore((s) => s.setFilmstripOpen);

  if (pageCount < 1) return null;

  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <aside
      className="page-filmstrip"
      aria-label={locale === "ru" ? "Превью страниц" : "Page previews"}
    >
      <div className="page-filmstrip-head">
        <span>{t("pagesPanel", locale)}</span>
        <button
          type="button"
          className="icon-btn"
          title={t("hidePages", locale)}
          aria-label={t("hidePages", locale)}
          onClick={() => setOpen(false)}
        >
          ‹
        </button>
      </div>
      <div className="page-filmstrip-scroll">
        {pages.map((n) => (
          <ThumbItem
            key={n}
            pdf={pdf}
            pageNumber={n}
            active={n === page}
            onSelect={(p) => void goToPage(p)}
          />
        ))}
      </div>
    </aside>
  );
}
