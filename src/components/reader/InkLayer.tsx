"use client";

import { useEffect, useRef, useState } from "react";
import { useReaderStore } from "@/store/reader";
import { useSettingsStore } from "@/store/settings";
import type { InkPoint, InkStroke } from "@/lib/types";
import {
  migrateLegacyInk,
  packDrawnStroke,
  strokeOverlayPoints,
} from "@/lib/ink-space";

interface Props {
  page: number;
  width: number;
  height: number;
  pageWidth: number;
  marginWidth: number;
  strokes: InkStroke[];
}

function pressureOf(e: PointerEvent | React.PointerEvent): number {
  // Apple Pencil reports 0–1; some browsers use 0 when hovering
  if (e.pointerType === "pen") {
    const p = e.pressure;
    if (p > 0) return Math.min(1, Math.max(0.05, p));
    return 0.45;
  }
  // Force Touch trackpad / mouse — often 0.5 constant; use mild variation
  if (typeof e.pressure === "number" && e.pressure > 0 && e.pressure < 1) {
    return Math.min(1, Math.max(0.2, e.pressure));
  }
  return 0.55;
}

function drawVariableStroke(
  ctx: CanvasRenderingContext2D,
  points: InkPoint[],
  color: string,
  baseWidth: number,
  widthPx: number,
  heightPx: number,
) {
  if (points.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const p = b.p ?? a.p ?? 0.5;
    ctx.beginPath();
    ctx.lineWidth = baseWidth * (0.35 + p * 1.35);
    ctx.moveTo(a.x * widthPx, a.y * heightPx);
    ctx.lineTo(b.x * widthPx, b.y * heightPx);
    ctx.stroke();
  }
}

export function InkLayer({
  page,
  width,
  height,
  pageWidth,
  marginWidth,
  strokes,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<{
    pointerId: number;
    points: InkPoint[];
  } | null>(null);
  const tool = useReaderStore((s) => s.tool);
  const penColor = useReaderStore((s) => s.penColor);
  const penWidth = useReaderStore((s) => s.penWidth);
  const stylusOnly = useReaderStore((s) => s.stylusOnly);
  const pressureEnabled = useReaderStore((s) => s.pressureEnabled);
  const addInkStroke = useReaderStore((s) => s.addInkStroke);
  const removeInkStroke = useReaderStore((s) => s.removeInkStroke);
  const updateInkStroke = useReaderStore((s) => s.updateInkStroke);
  const storedRatio = useSettingsStore((s) => s.marginRatio);
  const [draft, setDraft] = useState<InkPoint[] | null>(null);
  const migrated = useRef(new Set<string>());

  const interactive = tool === "pen" || tool === "eraser";

  useEffect(() => {
    if (marginWidth < 8) return;
    for (const stroke of strokes) {
      if (stroke.space || migrated.current.has(stroke.id)) continue;
      const next = migrateLegacyInk(stroke, pageWidth, marginWidth);
      if (!next) continue;
      migrated.current.add(stroke.id);
      void updateInkStroke(stroke.id, next);
    }
  }, [strokes, pageWidth, marginWidth, updateInkStroke]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width < 1 || height < 1) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    for (const s of strokes) {
      const points = strokeOverlayPoints(
        s,
        pageWidth,
        marginWidth,
        storedRatio,
      );
      if (!points || points.length < 2) continue;
      ctx.save();
      ctx.beginPath();
      if (s.space === "margin" && marginWidth >= 8) {
        ctx.rect(pageWidth, 0, marginWidth, height);
        ctx.clip();
      } else if (s.space === "page" && marginWidth >= 8) {
        ctx.rect(0, 0, pageWidth, height);
        ctx.clip();
      }
      drawVariableStroke(ctx, points, s.color, s.width, width, height);
      ctx.restore();
    }
    if (draft) {
      drawVariableStroke(ctx, draft, penColor, penWidth, width, height);
    }
  }, [
    width,
    height,
    pageWidth,
    marginWidth,
    storedRatio,
    strokes,
    draft,
    penColor,
    penWidth,
  ]);

  function acceptPointer(e: React.PointerEvent): boolean {
    if (!interactive) return false;
    // Palm rejection: ignore finger/touch when "stylus only" is on
    if (stylusOnly && e.pointerType === "touch") return false;
    // Prefer pen: ignore touch while actively drawing with another pointer? handled by pointerId
    return true;
  }

  function norm(
    e: PointerEvent | React.PointerEvent,
    rect: DOMRect,
  ): InkPoint {
    const p = pressureEnabled ? pressureOf(e) : 0.55;
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
      p,
    };
  }

  function eraseAt(x: number, y: number, radius: number) {
    for (let i = strokes.length - 1; i >= 0; i--) {
      const stroke = strokes[i];
      const points = strokeOverlayPoints(
        stroke,
        pageWidth,
        marginWidth,
        storedRatio,
      );
      if (!points) continue;
      if (points.some((p) => Math.hypot(p.x - x, p.y - y) <= radius)) {
        void removeInkStroke(stroke.id);
        return;
      }
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!acceptPointer(e)) return;
    // Don't steal scroll with a second finger
    if (e.pointerType === "touch" && drawing.current) return;

    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    const rect = canvasRef.current!.getBoundingClientRect();
    const point = norm(e, rect);

    if (tool === "eraser") {
      eraseAt(point.x, point.y, e.pointerType === "pen" ? 0.04 : 0.03);
      drawing.current = { pointerId: e.pointerId, points: [point] };
      return;
    }

    drawing.current = { pointerId: e.pointerId, points: [point] };
    setDraft([point]);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drawing.current || drawing.current.pointerId !== e.pointerId) return;
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();

    // High-frequency samples from Apple Pencil
    const native = e.nativeEvent;
    const coalesced =
      typeof native.getCoalescedEvents === "function"
        ? native.getCoalescedEvents()
        : [native];

    if (tool === "eraser") {
      for (const ev of coalesced) {
        const p = norm(ev, rect);
        eraseAt(p.x, p.y, 0.035);
      }
      return;
    }

    if (tool !== "pen") return;

    const next = [...drawing.current.points];
    for (const ev of coalesced) {
      next.push(norm(ev, rect));
    }
    drawing.current.points = next;
    setDraft(next);
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!drawing.current || drawing.current.pointerId !== e.pointerId) {
      return;
    }
    const points = drawing.current.points;
    drawing.current = null;
    setDraft(null);

    if (tool !== "pen" || points.length < 2) return;

    for (const packed of packDrawnStroke(points, pageWidth, marginWidth)) {
      void addInkStroke({
        page,
        color: penColor,
        width: penWidth,
        space: packed.space,
        points: packed.points,
      });
    }
  }

  return (
    <canvas
      ref={canvasRef}
      className={`ink-layer ${interactive ? "ink-active" : ""}`}
      style={{ touchAction: interactive ? "none" : undefined }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}
