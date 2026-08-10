"use client";

import { useEffect, useRef, useState } from "react";
import { useReaderStore } from "@/store/reader";
import type { InkPoint } from "@/lib/types";

interface Props {
  page: number;
  width: number;
  height: number;
  strokes: {
    color: string;
    width: number;
    points: InkPoint[];
  }[];
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

export function InkLayer({ page, width, height, strokes }: Props) {
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
  const eraseInkNear = useReaderStore((s) => s.eraseInkNear);
  const [draft, setDraft] = useState<InkPoint[] | null>(null);

  const interactive = tool === "pen" || tool === "eraser";

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
      drawVariableStroke(ctx, s.points, s.color, s.width, width, height);
    }
    if (draft) {
      drawVariableStroke(ctx, draft, penColor, penWidth, width, height);
    }
  }, [width, height, strokes, draft, penColor, penWidth]);

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

  function onPointerDown(e: React.PointerEvent) {
    if (!acceptPointer(e)) return;
    // Don't steal scroll with a second finger
    if (e.pointerType === "touch" && drawing.current) return;

    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    const rect = canvasRef.current!.getBoundingClientRect();
    const point = norm(e, rect);

    if (tool === "eraser") {
      void eraseInkNear(page, point.x, point.y, e.pointerType === "pen" ? 0.04 : 0.03);
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
        void eraseInkNear(page, p.x, p.y, 0.035);
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

    // Average pressure → store as stroke width factor already in points
    void addInkStroke({
      page,
      color: penColor,
      width: penWidth,
      points,
    });
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
