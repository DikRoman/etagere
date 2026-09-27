"use client";

import { useEffect, useRef, useState } from "react";
import { useReaderStore } from "@/store/reader";
import type { TextRect } from "@/lib/types";
import {
  expandLine,
  expandWord,
  flowGlyphs,
  hitGlyph,
  getPdfTextIndex,
  pickFromGlyphs,
  type PdfGlyph,
  type PdfTextIndex,
} from "@/lib/pdf-select";

interface Props {
  textLayer: HTMLElement | null;
  pageNumber: number;
  enabled: boolean;
  /** Changes when the pdf.js spans are rebuilt. */
  revision: string;
}

const DRAG_PX = 3;

export function PdfSelectLayer({
  textLayer,
  pageNumber,
  enabled,
  revision,
}: Props) {
  const setSelection = useReaderStore((s) => s.setSelection);
  const clearSelection = useReaderStore((s) => s.clearSelection);
  const committed = useReaderStore((s) =>
    s.selection?.page === pageNumber ? s.selection.rects : null,
  );
  const indexRef = useRef<PdfTextIndex | null>(null);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: PdfGlyph | null;
    moved: boolean;
  } | null>(null);
  const clicks = useRef({ n: 0, at: 0, x: 0, y: 0 });
  const [preview, setPreview] = useState<TextRect[]>([]);

  useEffect(() => {
    if (!enabled || !textLayer) {
      indexRef.current = null;
      setPreview([]);
      return;
    }
    indexRef.current = getPdfTextIndex(textLayer, revision);
  }, [enabled, textLayer, revision]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPreview([]);
        clearSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, clearSelection]);

  if (!enabled) return null;

  function localPoint(e: PointerEvent | React.PointerEvent) {
    const layer = textLayer;
    if (!layer) return null;
    const r = layer.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function glyphsFor(
    origin: PdfGlyph,
    current: PdfGlyph | null,
    clickCount: number,
    moved: boolean,
  ): PdfGlyph[] {
    const index = indexRef.current;
    if (!index) return [];
    if (!moved) {
      if (clickCount >= 3) return expandLine(index, origin);
      if (clickCount === 2) return expandWord(index, origin);
      return [];
    }
    if (!current) return [origin];
    return flowGlyphs(index, origin, current);
  }

  function paint(
    origin: PdfGlyph,
    current: PdfGlyph | null,
    clickCount: number,
    moved: boolean,
  ) {
    const index = indexRef.current;
    if (!index) return [];
    const glyphs = glyphsFor(origin, current, clickCount, moved);
    return glyphs.length
      ? pickFromGlyphs(glyphs, index, textLayer!)?.rects ?? []
      : [];
  }

  function commit(
    origin: PdfGlyph | null,
    current: PdfGlyph | null,
    clickCount: number,
    moved: boolean,
  ) {
    const index = indexRef.current;
    if (!index || !textLayer || !origin) {
      setPreview([]);
      if (!moved) clearSelection();
      return;
    }
    const glyphs = glyphsFor(origin, current, clickCount, moved);
    const picked = glyphs.length ? pickFromGlyphs(glyphs, index, textLayer) : null;
    setPreview([]);
    if (!picked) {
      if (!moved) clearSelection();
      return;
    }
    setSelection({ ...picked, page: pageNumber });
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    const pt = localPoint(e);
    if (!pt || !indexRef.current) return;
    const now = performance.now();
    const close =
      now - clicks.current.at < 420 &&
      Math.abs(e.clientX - clicks.current.x) < 6 &&
      Math.abs(e.clientY - clicks.current.y) < 6;
    clicks.current = {
      n: close ? clicks.current.n + 1 : 1,
      at: now,
      x: e.clientX,
      y: e.clientY,
    };
    const origin = hitGlyph(indexRef.current, pt.x, pt.y);
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origin,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (origin && clicks.current.n >= 2) {
      setPreview(paint(origin, null, clicks.current.n, false));
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId || !d.origin || !indexRef.current) {
      return;
    }
    const dist = Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY);
    if (!d.moved && dist < DRAG_PX) return;
    d.moved = true;
    e.preventDefault();
    const pt = localPoint(e);
    if (!pt) return;
    const current = hitGlyph(indexRef.current, pt.x, pt.y);
    setPreview(paint(d.origin, current, 1, true));
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (!d.moved && clicks.current.n === 1) {
      setPreview([]);
      const surface = e.currentTarget as HTMLElement;
      surface.style.pointerEvents = "none";
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      surface.style.pointerEvents = "";
      const link = hit?.closest?.(".pdf-link") as HTMLElement | null;
      if (link) {
        clearSelection();
        link.click();
        return;
      }
      clearSelection();
      return;
    }
    const pt = localPoint(e);
    const current =
      pt && indexRef.current ? hitGlyph(indexRef.current, pt.x, pt.y) : null;
    commit(d.origin, current, clicks.current.n, d.moved);
  }

  return (
    <div
      className="pdf-select-layer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {(preview.length ? preview : committed ?? []).map((r, i) => (
        <div
          key={i}
          className="pdf-select-box"
          style={{
            left: `${r.x * 100}%`,
            top: `${r.y * 100}%`,
            width: `${r.width * 100}%`,
            height: `${r.height * 100}%`,
          }}
        />
      ))}
    </div>
  );
}
