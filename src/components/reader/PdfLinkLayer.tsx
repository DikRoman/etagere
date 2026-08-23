"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PageViewport } from "pdfjs-dist";
import { getInternalLinks, type PdfLink } from "@/lib/pdf-links";
import { linkTargetPage } from "@/lib/pdf-dest";
import { useReaderStore } from "@/store/reader";

interface Props {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  viewport: PageViewport;
}

type PlacedLink = {
  link: PdfLink;
  left: number;
  top: number;
  width: number;
  height: number;
};

function place(link: PdfLink, viewport: PageViewport): PlacedLink | null {
  const [x1, y1, x2, y2] = link.rect;
  const [ax, ay] = viewport.convertToViewportPoint(x1, y1);
  const [bx, by] = viewport.convertToViewportPoint(x2, y2);
  const left = Math.min(ax, bx);
  const top = Math.min(ay, by);
  const width = Math.abs(bx - ax);
  const height = Math.abs(by - ay);
  if (width < 2 || height < 2) return null;
  return { link, left, top, width, height };
}

/** Internal PDF links (contents entries, cross-references) as clickable areas. */
export function PdfLinkLayer({ pdf, pageNumber, viewport }: Props) {
  const [links, setLinks] = useState<PlacedLink[]>([]);
  const pressedAt = useRef<{ x: number; y: number } | null>(null);
  const goToPage = useReaderStore((s) => s.goToPage);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const page = await pdf.getPage(pageNumber);
      const found = await getInternalLinks(page);
      if (cancelled) return;
      setLinks(
        found
          .map((link) => place(link, viewport))
          .filter((l): l is PlacedLink => l !== null),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber, viewport]);

  if (!links.length) return null;

  return (
    <div className="pdf-link-layer">
      {links.map((placed, i) => (
        <button
          key={`${pageNumber}-${i}`}
          type="button"
          className="pdf-link"
          style={{
            left: placed.left,
            top: placed.top,
            width: placed.width,
            height: placed.height,
          }}
          onPointerDown={(e) => {
            pressedAt.current = { x: e.clientX, y: e.clientY };
          }}
          onClick={async (e) => {
            // A drag across the link is a text selection, not a jump.
            const from = pressedAt.current;
            pressedAt.current = null;
            if (from) {
              const moved =
                Math.abs(e.clientX - from.x) + Math.abs(e.clientY - from.y);
              if (moved > 6) return;
            }
            if (!window.getSelection()?.isCollapsed) return;
            const target = await linkTargetPage(pdf, placed.link);
            if (target) void goToPage(target);
          }}
        />
      ))}
    </div>
  );
}
