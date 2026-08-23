"use client";

import { createPortal } from "react-dom";
import { useSettingsStore } from "@/store/settings";
import { t, type MessageKey } from "@/lib/i18n";
import type { EpubFontChoice } from "@/lib/types";
import { Slider, usePopover } from "./panel-kit";

const FONT_LABELS: { id: EpubFontChoice; key: MessageKey }[] = [
  { id: "literary", key: "fontLiterary" },
  { id: "grotesque", key: "fontGrotesque" },
  { id: "georgia", key: "fontGeorgia" },
  { id: "verdana", key: "fontVerdana" },
];

export function EpubTypePanel() {
  const locale = useSettingsStore((s) => s.locale);
  const type = useSettingsStore((s) => s.epubType);
  const setEpubType = useSettingsStore((s) => s.setEpubType);
  const resetEpubType = useSettingsStore((s) => s.resetEpubType);
  const { open, setOpen, spot, buttonRef, panelRef } = usePopover();

  const em = (v: number) => `${v.toFixed(2)} em`;

  const panel = (
    <div
      className="type-panel"
      role="dialog"
      aria-label={t("typography", locale)}
      ref={panelRef}
      style={{ top: spot.top, left: spot.left }}
    >
      <div className="type-group">
        <span className="type-row-label">{t("fontLabel", locale)}</span>
        <div className="type-choices">
          {FONT_LABELS.map((font) => (
            <button
              key={font.id}
              type="button"
              className={`type-choice font-${font.id} ${
                type.font === font.id ? "is-on" : ""
              }`}
              onClick={() => setEpubType({ font: font.id })}
            >
              {t(font.key, locale)}
            </button>
          ))}
        </div>
      </div>

      <Slider
        label={t("lineHeight", locale)}
        value={type.lineHeight}
        min={1.2}
        max={2.2}
        step={0.05}
        format={(v) => v.toFixed(2)}
        onChange={(lineHeight) => setEpubType({ lineHeight })}
      />
      <Slider
        label={t("paragraphGap", locale)}
        value={type.paragraphGap}
        min={0}
        max={2}
        step={0.1}
        format={em}
        onChange={(paragraphGap) => setEpubType({ paragraphGap })}
      />
      <Slider
        label={t("wordSpacing", locale)}
        value={type.wordSpacing}
        min={0}
        max={0.5}
        step={0.01}
        format={em}
        onChange={(wordSpacing) => setEpubType({ wordSpacing })}
      />
      <Slider
        label={t("letterSpacing", locale)}
        value={type.letterSpacing}
        min={0}
        max={0.12}
        step={0.005}
        format={em}
        onChange={(letterSpacing) => setEpubType({ letterSpacing })}
      />
      <Slider
        label={t("textMargins", locale)}
        value={type.margin}
        min={0}
        max={6}
        step={0.25}
        format={(v) => `${v.toFixed(2)} rem`}
        onChange={(margin) => setEpubType({ margin })}
      />
      <Slider
        label={t("textMeasure", locale)}
        value={type.measure}
        min={22}
        max={60}
        step={1}
        format={(v) => `${v} em`}
        onChange={(measure) => setEpubType({ measure })}
      />

      <div className="type-group type-group--row">
        <label className="check-pill">
          <input
            type="checkbox"
            checked={type.justify}
            onChange={(e) => setEpubType({ justify: e.target.checked })}
          />
          {t("justifyText", locale)}
        </label>
        <button
          type="button"
          className="btn-ghost compact"
          onClick={resetEpubType}
        >
          {t("resetType", locale)}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        className={`btn-ghost compact ${open ? "is-on" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title={t("typography", locale)}
      >
        Aa
      </button>
      {/* Rendered on the body so the reader frame cannot clip it. */}
      {open && createPortal(panel, document.body)}
    </>
  );
}
