"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useSettingsStore } from "@/store/settings";
import { useReaderStore } from "@/store/reader";
import { useLibraryStore } from "@/store/library";
import { t, type MessageKey } from "@/lib/i18n";
import {
  downloadBlob,
  exportMarginNotesPdf,
  textsWithDrafts,
} from "@/lib/margin-export";
import {
  MARGIN_RATIO_MAX,
  MARGIN_RATIO_MIN,
  NOTE_PAPERS,
  type NotePaper,
} from "@/lib/types";
import { Slider, usePopover } from "./panel-kit";

const PAPER_LABELS: Record<NotePaper, MessageKey> = {
  plain: "paperPlain",
  lines: "paperLines",
  grid: "paperGrid",
  gridWide: "paperGridWide",
};

/** Width and ruling of the writing strip beside a PDF page. */
export function MarginPanel() {
  const locale = useSettingsStore((s) => s.locale);
  const paper = useSettingsStore((s) => s.notePaper);
  const setPaper = useSettingsStore((s) => s.setNotePaper);
  const ratio = useSettingsStore((s) => s.marginRatio);
  const setRatio = useSettingsStore((s) => s.setMarginRatio);
  const on = useSettingsStore((s) => s.marginNotes);
  const setOn = useSettingsStore((s) => s.setMarginNotes);
  const bookId = useReaderStore((s) => s.bookId);
  const annotations = useReaderStore((s) => s.annotations);
  const title =
    useLibraryStore((s) => s.books.find((b) => b.id === bookId)?.title) ??
    "Étagère";
  const { open, setOpen, spot, buttonRef, panelRef } = usePopover();
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<MessageKey | null>(null);

  async function downloadNotes() {
    if (busy) return;
    setHint(null);
    setBusy(true);
    try {
      const result = await exportMarginNotesPdf({
        title,
        texts: textsWithDrafts(annotations.texts ?? []),
        ink: annotations.ink ?? [],
        marginRatio: ratio,
        paper,
        pageLabel: t("pages", locale),
      });
      if (result.kind === "empty") {
        setHint("downloadMarginEmpty");
        return;
      }
      downloadBlob(result.blob, result.filename);
    } catch {
      setHint("downloadMarginError");
    } finally {
      setBusy(false);
    }
  }

  const panel = (
    <div
      className="type-panel"
      role="dialog"
      aria-label={t("marginNotes", locale)}
      ref={panelRef}
      style={{ top: spot.top, left: spot.left }}
    >
      <label className="toggle-row">
        <span className="type-row-label">{t("marginNotesOn", locale)}</span>
        <span className={`toggle ${on ? "is-on" : ""}`}>
          <input
            type="checkbox"
            checked={on}
            onChange={(e) => setOn(e.target.checked)}
          />
          <span className="toggle-knob" />
        </span>
      </label>
      <Slider
        label={t("marginWidth", locale)}
        value={ratio}
        min={MARGIN_RATIO_MIN}
        max={MARGIN_RATIO_MAX}
        step={0.05}
        disabled={!on}
        format={(v) => `${Math.round(v * 100)} %`}
        onChange={setRatio}
      />

      <div className="type-group">
        <span className="type-row-label">{t("paperFormat", locale)}</span>
        <div className="paper-pick">
          {NOTE_PAPERS.map((id) => (
            <button
              key={id}
              type="button"
              className={`paper-chip paper-${id}${paper === id ? " on" : ""}`}
              aria-pressed={paper === id}
              onClick={() => setPaper(id)}
            >
              <span className="paper-swatch" aria-hidden="true" />
              <span className="paper-name">{t(PAPER_LABELS[id], locale)}</span>
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="type-choice"
        disabled={busy}
        onClick={() => void downloadNotes()}
      >
        {busy ? t("downloadingMargin", locale) : t("downloadMarginNotes", locale)}
      </button>
      {hint && <p className="tiny">{t(hint, locale)}</p>}
    </div>
  );

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        className={`btn-ghost compact ${open ? "is-on" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title={t("marginNotes", locale)}
      >
        {t("marginNotes", locale)}
      </button>
      {open && createPortal(panel, document.body)}
    </>
  );
}
