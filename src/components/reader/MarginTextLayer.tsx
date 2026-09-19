"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useReaderStore } from "@/store/reader";
import { MARGIN_GUTTER_PX } from "@/lib/ink-space";
import {
  EPUB_FONT_STACKS,
  type EpubFontChoice,
  type MarginText,
} from "@/lib/types";

const FONTS: EpubFontChoice[] = ["literary", "grotesque", "georgia", "verdana"];

interface Props {
  page: number;
  /** Width of the writing strip. */
  width: number;
  height: number;
  /** PDF page width; used to migrate legacy overlay-relative notes. */
  pageWidth: number;
  items: MarginText[];
}

/** Map a box stored against page+margin onto the writing strip. */
function overlayToMargin(
  item: Pick<MarginText, "x" | "y" | "w" | "h">,
  pageW: number,
  marginW: number,
): { x: number; y: number; w: number; h: number } {
  const total = pageW + marginW;
  if (total < 1 || marginW < 1) {
    return { x: item.x, y: item.y, w: item.w, h: item.h };
  }
  const left = item.x * total;
  const boxW = item.w * total;
  let x = (left - pageW) / marginW;
  let w = boxW / marginW;
  if (left + boxW * 0.4 < pageW) {
    x = 0.04;
    w = Math.min(0.92, Math.max(0.5, w));
  }
  x = Math.min(Math.max(0, x), 0.88);
  w = Math.min(Math.max(0.2, w), 1 - x);
  return { x, y: item.y, w, h: item.h };
}

function marginBox(
  item: MarginText,
  pageW: number,
  marginW: number,
): { x: number; y: number; w: number; h: number } {
  if (item.space === "margin") {
    return { x: item.x, y: item.y, w: item.w, h: item.h };
  }
  return overlayToMargin(item, pageW, marginW);
}

export function MarginTextLayer({
  page,
  width,
  height,
  pageWidth,
  items,
}: Props) {
  const tool = useReaderStore((s) => s.tool);
  const textFont = useReaderStore((s) => s.textFont);
  const textSize = useReaderStore((s) => s.textSize);
  const penColor = useReaderStore((s) => s.penColor);
  const addMarginText = useReaderStore((s) => s.addMarginText);
  const updateMarginText = useReaderStore((s) => s.updateMarginText);
  const [activeId, setActiveId] = useState<string | null>(null);
  const placing = tool === "type";
  const busy = useRef(false);
  const migrated = useRef(new Set<string>());

  useEffect(() => {
    if (width < 1) return;
    for (const item of items) {
      if (item.space === "margin" || migrated.current.has(item.id)) continue;
      migrated.current.add(item.id);
      void updateMarginText(item.id, {
        ...overlayToMargin(item, pageWidth, width),
        space: "margin",
      });
    }
  }, [items, width, pageWidth, updateMarginText]);

  async function placeAt(e: React.PointerEvent<HTMLDivElement>) {
    if (!placing || busy.current) return;
    if ((e.target as HTMLElement).closest(".margin-text")) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / Math.max(1, rect.width);
    const clickY = (e.clientY - rect.top) / Math.max(1, rect.height);
    const x = Math.min(Math.max(0, clickX), 0.8);
    const w = Math.min(0.88, 1 - x);
    const h = 0.11;
    const y = Math.min(Math.max(0, clickY), 1 - h);
    busy.current = true;
    try {
      const id = await addMarginText({
        page,
        space: "margin",
        x,
        y,
        w,
        h,
        body: "",
        font: textFont,
        fontSize: textSize,
        color: penColor,
      });
      if (id) setActiveId(id);
    } finally {
      busy.current = false;
    }
  }

  return (
    <div
      className={`margin-texts ${placing ? "is-placing" : ""}`}
      style={{
        left: pageWidth + (width >= 8 ? MARGIN_GUTTER_PX : 0),
        width,
      }}
      onPointerDown={placeAt}
    >
      {items.map((item) => (
        <TextBox
          key={item.id}
          item={item}
          overlayW={width}
          overlayH={height}
          pageW={pageWidth}
          active={activeId === item.id}
          onActive={() => setActiveId(item.id)}
          onIdle={() => setActiveId((cur) => (cur === item.id ? null : cur))}
        />
      ))}
    </div>
  );
}

function TextBox({
  item,
  overlayW,
  overlayH,
  pageW,
  active,
  onActive,
  onIdle,
}: {
  item: MarginText;
  overlayW: number;
  overlayH: number;
  pageW: number;
  active: boolean;
  onActive: () => void;
  onIdle: () => void;
}) {
  const tool = useReaderStore((s) => s.tool);
  const setTextFont = useReaderStore((s) => s.setTextFont);
  const setTextSize = useReaderStore((s) => s.setTextSize);
  const updateMarginText = useReaderStore((s) => s.updateMarginText);
  const removeMarginText = useReaderStore((s) => s.removeMarginText);
  const [body, setBody] = useState(item.body);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerId: number;
    kind: "move" | "resize";
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);
  const box = marginBox(item, pageW, overlayW);

  useEffect(() => {
    setBody(item.body);
  }, [item.body, item.id]);

  useEffect(() => {
    if (active) areaRef.current?.focus();
  }, [active, item.id]);

  function fitArea() {
    const area = areaRef.current;
    if (!area || overlayH < 1) return;
    area.style.height = "0px";
    const minPx = Math.max(28, box.h * overlayH);
    const maxPx = Math.max(minPx, overlayH * (1 - box.y) - 8);
    const next = Math.min(Math.max(area.scrollHeight, minPx), maxPx);
    area.style.height = `${next}px`;
    area.style.overflowY = area.scrollHeight > maxPx + 1 ? "auto" : "hidden";
  }

  useLayoutEffect(() => {
    fitArea();
  }, [body, active, item.font, item.fontSize, overlayH, box.h, box.y]);

  function save(patch: Partial<MarginText> = {}) {
    const el = boxRef.current;
    const grown =
      el && overlayH > 0
        ? Math.min(1 - box.y, Math.max(box.h, el.offsetHeight / overlayH))
        : box.h;
    void updateMarginText(item.id, {
      body,
      space: "margin",
      h: grown,
      ...patch,
    });
  }

  function onHandleStart(
    kind: "move" | "resize",
    e: React.PointerEvent,
  ) {
    if (tool === "pen") return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      kind,
      startX: e.clientX,
      startY: e.clientY,
      origX: box.x,
      origY: box.y,
      origW: box.w,
      origH: box.h,
    };
    onActive();
  }

  function applyBoxStyle(x: number, y: number, w: number, h: number) {
    const el = boxRef.current;
    if (!el) return;
    el.style.left = `${x * 100}%`;
    el.style.top = `${y * 100}%`;
    el.style.width = `${w * 100}%`;
    el.style.minHeight = `${h * 100}%`;
  }

  function onHandleMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    e.preventDefault();
    const dx = (e.clientX - d.startX) / Math.max(1, overlayW);
    const dy = (e.clientY - d.startY) / Math.max(1, overlayH);
    if (d.kind === "move") {
      const x = Math.min(Math.max(0, d.origX + dx), 1 - d.origW);
      const y = Math.min(Math.max(0, d.origY + dy), 1 - d.origH);
      applyBoxStyle(x, y, d.origW, d.origH);
      return;
    }
    const w = Math.min(Math.max(0.2, d.origW + dx), 1 - d.origX);
    const h = Math.min(Math.max(0.05, d.origH + dy), 1 - d.origY);
    applyBoxStyle(d.origX, d.origY, w, h);
  }

  function onHandleEnd(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    const el = boxRef.current;
    if (!el) return;
    const x = parseFloat(el.style.left) / 100;
    const y = parseFloat(el.style.top) / 100;
    const w = parseFloat(el.style.width) / 100;
    const h = parseFloat(el.style.minHeight) / 100;
    const patch: Partial<MarginText> = { body, space: "margin" };
    if (Number.isFinite(x) && Number.isFinite(y)) {
      patch.x = x;
      patch.y = y;
    }
    if (d.kind === "resize" && Number.isFinite(w) && Number.isFinite(h)) {
      patch.w = w;
      patch.h = h;
    }
    void updateMarginText(item.id, patch);
  }

  const interactive = tool === "type" || tool === "select" || tool === "eraser";

  return (
    <div
      ref={boxRef}
      className={`margin-text ${active ? "is-on" : ""} ${interactive ? "is-live" : ""}`}
      style={{
        left: `${box.x * 100}%`,
        top: `${box.y * 100}%`,
        width: `${box.w * 100}%`,
        minHeight: `${box.h * 100}%`,
        color: item.color,
        fontFamily: EPUB_FONT_STACKS[item.font],
        fontSize: `${Math.max(11, item.fontSize * overlayH)}px`,
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (tool === "eraser") {
          void removeMarginText(item.id);
          return;
        }
        onActive();
      }}
    >
      {active && (
        <div
          className="margin-text-bar"
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="margin-text-drag"
            aria-label="Move"
            onPointerDown={(e) => onHandleStart("move", e)}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleEnd}
            onPointerCancel={onHandleEnd}
          >
            ⋮⋮
          </button>
          {FONTS.map((font) => (
            <button
              key={font}
              type="button"
              className={`font-${font} ${item.font === font ? "is-on" : ""}`}
              style={{ fontFamily: EPUB_FONT_STACKS[font] }}
              onClick={() => {
                setTextFont(font);
                void updateMarginText(item.id, { font, body, space: "margin" });
              }}
            >
              Aa
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              const fontSize = Math.max(0.014, item.fontSize - 0.004);
              setTextSize(fontSize);
              void updateMarginText(item.id, { fontSize, body, space: "margin" });
            }}
          >
            −
          </button>
          <button
            type="button"
            onClick={() => {
              const fontSize = Math.min(0.045, item.fontSize + 0.004);
              setTextSize(fontSize);
              void updateMarginText(item.id, { fontSize, body, space: "margin" });
            }}
          >
            +
          </button>
          <button
            type="button"
            className="is-danger"
            onClick={() => void removeMarginText(item.id)}
          >
            ×
          </button>
        </div>
      )}
      <textarea
        ref={areaRef}
        data-note-id={item.id}
        value={body}
        readOnly={tool === "pen"}
        placeholder="…"
        onChange={(e) => setBody(e.target.value)}
        onFocus={onActive}
        onBlur={(e) => {
          const next = e.relatedTarget as Node | null;
          if (boxRef.current?.contains(next)) return;
          if (body !== item.body) save({ body });
          window.setTimeout(onIdle, 160);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
      />
      {active && (
        <span
          className="margin-text-resize"
          onPointerDown={(e) => onHandleStart("resize", e)}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleEnd}
          onPointerCancel={onHandleEnd}
        />
      )}
    </div>
  );
}
