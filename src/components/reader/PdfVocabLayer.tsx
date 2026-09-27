"use client";

import { useEffect, useState } from "react";
import type { TextRect } from "@/lib/types";
import {
  getPdfTextIndex,
  mergeGlyphRects,
  wordRuns,
} from "@/lib/pdf-select";
import {
  loadKnownWords,
  normalizeWord,
  subscribeKnownWords,
} from "@/lib/vocab";

interface Props {
  textLayer: HTMLElement | null;
  enabled: boolean;
  /** Changes when the pdf.js spans are rebuilt. */
  revision: string;
}

/**
 * Underlines words already in the reader's vocabulary. Matching is exact on
 * the stored word or its lemma, so an inflected form ("running" against a
 * stored "run") is not marked.
 */
export function PdfVocabLayer({ textLayer, enabled, revision }: Props) {
  const [rects, setRects] = useState<TextRect[]>([]);

  useEffect(() => {
    let cancelled = false;

    const mark = async () => {
      if (!enabled || !textLayer) {
        if (!cancelled) setRects([]);
        return;
      }
      const known = await loadKnownWords();
      if (cancelled) return;
      if (!known.size) {
        setRects([]);
        return;
      }
      const index = getPdfTextIndex(textLayer, revision);
      const hits = wordRuns(index).filter((run) =>
        known.has(normalizeWord(run.text)),
      );
      if (cancelled) return;
      setRects(
        hits.flatMap((run) =>
          mergeGlyphRects(run.glyphs, index.width, index.height),
        ),
      );
    };

    void mark();
    // Re-mark when a word is added or removed while the page is open.
    const off = subscribeKnownWords(() => void mark());
    return () => {
      cancelled = true;
      off();
    };
  }, [enabled, textLayer, revision]);

  if (!rects.length) return null;

  return (
    <div className="pdf-vocab-layer" aria-hidden>
      {rects.map((r, i) => (
        <div
          key={i}
          className="pdf-vocab-mark"
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
