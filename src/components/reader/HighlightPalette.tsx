"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import {
  HIGHLIGHT_PALETTE,
  highlightSolid,
  sameHighlightColor,
} from "@/lib/highlight-color";
import { useReaderStore } from "@/store/reader";
import { useSettingsStore } from "@/store/settings";

interface Props {
  /** A slot circle was chosen; the selection menu highlights with it. */
  onPick?: (color: string) => void;
  /**
   * How the full palette opens. The selection menu reveals it on hover;
   * the toolbar needs a click so it also works on touch screens.
   */
  gridOpenOn: "hover" | "click";
  /** Open the full palette below the slots instead of above. */
  dropDown?: boolean;
}

const CLOSE_DELAY_MS = 220;

/**
 * Three highlight colours the reader keeps at hand, plus the full palette.
 * Picking from the palette replaces the active slot, so the circle the
 * reader is on turns into the new colour.
 */
export function HighlightPalette({ onPick, gridOpenOn, dropDown }: Props) {
  const locale = useSettingsStore((s) => s.locale);
  const slots = useSettingsStore((s) => s.highlightSlots);
  const setHighlightSlot = useSettingsStore((s) => s.setHighlightSlot);
  const activeColor = useReaderStore((s) => s.activeColor);
  const setActiveColor = useReaderStore((s) => s.setActiveColor);

  const [gridOpen, setGridOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const closeTimer = useRef<number | null>(null);
  // The native colour picker opens its own window and the pointer leaves the
  // palette; closing then would unmount the input and dismiss the picker.
  const pickingCustom = useRef(false);
  const customPicked = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  const activeIndex = Math.max(
    0,
    slots.findIndex((c) => sameHighlightColor(c, activeColor)),
  );

  const openGrid = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setGridOpen(true);
  };

  // A short grace period lets the pointer cross the gap into the grid.
  const closeGridSoon = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      if (pickingCustom.current) return;
      setGridOpen(false);
      setPreview(null);
    }, CLOSE_DELAY_MS);
  };

  const chooseSlot = (color: string) => {
    setActiveColor(color);
    onPick?.(color);
  };

  // In the selection menu a palette pick also applies: the grid collapses
  // under the pointer, so asking for a second click on the circle would
  // mean hunting for a palette that has just closed.
  const putInPalette = (color: string) => {
    setHighlightSlot(activeIndex, color);
    setActiveColor(color);
    setPreview(null);
    setGridOpen(false);
    onPick?.(color);
  };

  // The native picker reports every drag step: follow it live in the slot,
  // and apply once, when the picker closes.
  const followCustom = (color: string) => {
    customPicked.current = color;
    setHighlightSlot(activeIndex, color);
    setActiveColor(color);
  };
  const finishCustom = () => {
    pickingCustom.current = false;
    const color = customPicked.current;
    customPicked.current = null;
    if (color) {
      setGridOpen(false);
      onPick?.(color);
    } else if (gridOpenOn === "hover") {
      closeGridSoon();
    }
  };

  const hoverHandlers =
    gridOpenOn === "hover"
      ? { onMouseEnter: openGrid, onMouseLeave: closeGridSoon }
      : {};

  return (
    <div
      className={`hl-palette ${dropDown ? "hl-palette--down" : ""}`}
      role="group"
      aria-label={t("highlightPalette", locale)}
    >
      <div className="hl-palette-slots">
        {slots.map((color, i) => {
          const shown = i === activeIndex && preview ? preview : color;
          return (
            <button
              key={i}
              type="button"
              className={`hl-slot ${i === activeIndex ? "is-active" : ""}`}
              style={{ background: highlightSolid(shown) }}
              aria-label={`${t("highlightWith", locale)} ${highlightSolid(color)}`}
              aria-pressed={i === activeIndex}
              onClick={() => chooseSlot(color)}
            />
          );
        })}
        <div className="hl-palette-more" {...hoverHandlers}>
          <button
            type="button"
            className={`hl-slot hl-slot--all ${gridOpen ? "is-open" : ""}`}
            aria-label={t("highlightPalette", locale)}
            aria-expanded={gridOpen}
            title={t("highlightPalette", locale)}
            onClick={() => (gridOpen ? setGridOpen(false) : openGrid())}
          />
          {gridOpen && (
            <div className="hl-grid" role="listbox">
              {HIGHLIGHT_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="option"
                  aria-selected={sameHighlightColor(color, activeColor)}
                  className={`hl-swatch ${sameHighlightColor(color, activeColor) ? "is-active" : ""}`}
                  style={{ background: color }}
                  aria-label={color}
                  onMouseEnter={() => setPreview(color)}
                  onMouseLeave={() => setPreview(null)}
                  onFocus={() => setPreview(color)}
                  onClick={() => putInPalette(color)}
                />
              ))}
              <label
                className="hl-swatch hl-swatch--custom"
                title={t("otherColor", locale)}
              >
                <input
                  type="color"
                  value={highlightSolid(activeColor)}
                  aria-label={t("otherColor", locale)}
                  onClick={() => {
                    pickingCustom.current = true;
                  }}
                  onChange={(e) => followCustom(e.target.value)}
                  onBlur={finishCustom}
                />
                +
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
