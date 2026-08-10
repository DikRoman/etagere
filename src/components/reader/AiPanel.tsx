"use client";

import { useSettingsStore } from "@/store/settings";
import { useReaderStore } from "@/store/reader";
import { t } from "@/lib/i18n";

export function AiPanel() {
  const locale = useSettingsStore((s) => s.locale);
  const open = useReaderStore((s) => s.aiOpen);
  const result = useReaderStore((s) => s.aiResult);
  const setAiOpen = useReaderStore((s) => s.setAiOpen);

  if (!open || !result) return null;

  return (
    <div className="ai-panel" role="dialog" aria-label={t("aiPanel", locale)}>
      <div className="ai-head">
        <div>
          <h2>{result.title}</h2>
          <p className="ai-stub">{t("aiStub", locale)}</p>
        </div>
        <button type="button" className="icon-btn" onClick={() => setAiOpen(false)}>
          ×
        </button>
      </div>
      <div className="ai-body">{result.body}</div>
    </div>
  );
}
