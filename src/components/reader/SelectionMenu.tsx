"use client";

import { useSettingsStore } from "@/store/settings";
import { useReaderStore } from "@/store/reader";
import { t } from "@/lib/i18n";
import { HIGHLIGHT_COLORS } from "@/lib/types";
import { stubSummarize, stubTranslate } from "@/lib/ai";

export function SelectionMenu() {
  const locale = useSettingsStore((s) => s.locale);
  const selection = useReaderStore((s) => s.selection);
  const clearSelection = useReaderStore((s) => s.clearSelection);
  const addHighlightFromSelection = useReaderStore(
    (s) => s.addHighlightFromSelection,
  );
  const addQuoteFromSelection = useReaderStore((s) => s.addQuoteFromSelection);
  const setAiOpen = useReaderStore((s) => s.setAiOpen);
  const setAiResult = useReaderStore((s) => s.setAiResult);

  if (!selection) return null;

  const style = {
    left: Math.min(window.innerWidth - 220, Math.max(12, selection.screen.x - 100)),
    top: Math.max(8, selection.screen.y - 56),
  };

  async function translate() {
    setAiOpen(true);
    setAiResult({
      title: t("aiTranslateTitle", locale),
      body: locale === "ru" ? "Перевожу…" : "Translating…",
    });
    const result = await stubTranslate(selection!.text, locale);
    setAiResult({ title: t("aiTranslateTitle", locale), body: result });
  }

  async function summarize() {
    setAiOpen(true);
    setAiResult({
      title: t("aiSummaryTitle", locale),
      body: locale === "ru" ? "Думаю…" : "Thinking…",
    });
    const result = await stubSummarize(selection!.text, locale);
    setAiResult({ title: t("aiSummaryTitle", locale), body: result });
  }

  return (
    <div className="selection-menu" style={style} role="toolbar">
      <button type="button" onClick={() => void addHighlightFromSelection()}>
        {t("highlight", locale)}
      </button>
      <button type="button" onClick={() => void addQuoteFromSelection()}>
        {t("saveQuote", locale)}
      </button>
      <button type="button" onClick={() => void translate()}>
        {t("translate", locale)}
      </button>
      <button type="button" onClick={() => void summarize()}>
        {t("summarize", locale)}
      </button>
      <button type="button" className="dim" onClick={clearSelection}>
        {t("close", locale)}
      </button>
      <span className="sel-color-hint" style={{ background: HIGHLIGHT_COLORS.yellow.fill }} />
    </div>
  );
}
