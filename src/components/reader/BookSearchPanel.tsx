"use client";

import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useSettingsStore } from "@/store/settings";
import { useReaderStore } from "@/store/reader";
import { t } from "@/lib/i18n";
import { searchPdf } from "@/lib/ai";

export function BookSearchPanel({ pdf }: { pdf: PDFDocumentProxy | null }) {
  const locale = useSettingsStore((s) => s.locale);
  const goToPage = useReaderStore((s) => s.goToPage);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ page: number; snippet: string }[]>(
    [],
  );

  useEffect(() => {
    setResults([]);
  }, [pdf]);

  async function run() {
    if (!pdf || !q.trim()) return;
    setBusy(true);
    try {
      setResults(await searchPdf(pdf, q.trim()));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="book-search">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void run();
        }}
        placeholder={t("searchInBook", locale)}
      />
      <button
        type="button"
        className="btn-ghost compact"
        disabled={busy || !pdf}
        onClick={() => void run()}
      >
        {busy ? t("searching", locale) : t("search", locale)}
      </button>
      {results.length > 0 && (
        <ul className="search-hits">
          {results.map((r, i) => (
            <li key={`${r.page}-${i}`}>
              <button type="button" onClick={() => void goToPage(r.page)}>
                <strong>p. {r.page}</strong> {r.snippet}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!busy && q && results.length === 0 && (
        <span className="muted tiny">{t("noResults", locale)}</span>
      )}
    </div>
  );
}
