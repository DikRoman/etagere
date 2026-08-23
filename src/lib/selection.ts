import type { TextRect } from "./types";

/** Pull a short sentence-ish window around the selection for disambiguation. */
export function sentenceAroundText(
  source: string,
  selected: string,
): string | undefined {
  const full = source.replace(/\s+/g, " ").trim();
  if (!full || !selected.trim()) return undefined;
  const needle = selected.trim().replace(/\s+/g, " ");
  const lower = full.toLowerCase();
  const idx = lower.indexOf(needle.toLowerCase());
  if (idx < 0) {
    // Fallback: nearby chunk from selection range length
    return full.length <= 280 ? full : undefined;
  }
  const startBound = Math.max(
    0,
    ...[". ", "? ", "! ", "… ", "; "].map((p) => {
      const i = full.lastIndexOf(p, idx);
      return i >= 0 ? i + p.length : 0;
    }),
  );
  let endBound = full.length;
  for (const p of [". ", "? ", "! ", "… "]) {
    const i = full.indexOf(p, idx + needle.length);
    if (i >= 0 && i + 1 < endBound) endBound = i + 1;
  }
  const slice = full.slice(startBound, endBound).trim();
  if (slice.length < needle.length) return undefined;
  return slice.slice(0, 500);
}

export function sentenceAroundSelection(
  container: HTMLElement,
  selected: string,
): string | undefined {
  return sentenceAroundText(container.innerText || "", selected);
}

export function captureSelectionIn(container: HTMLElement): {
  text: string;
  rects: TextRect[];
  screen: { x: number; y: number };
  sentence?: string;
} | null {
  const sel = window.getSelection();
  const text = sel?.toString().replace(/\s+/g, " ").trim() ?? "";
  if (!sel || sel.isCollapsed || sel.rangeCount === 0 || text.length < 1) {
    return null;
  }
  const range = sel.getRangeAt(0);
  const root = range.commonAncestorContainer;
  if (!container.contains(root.nodeType === Node.ELEMENT_NODE ? root : root.parentNode)) {
    return null;
  }

  const layerRect = container.getBoundingClientRect();
  const rects: TextRect[] = [];
  for (const r of Array.from(range.getClientRects())) {
    if (r.width < 1 || r.height < 1) continue;
    rects.push({
      x: (r.left - layerRect.left) / (layerRect.width || 1),
      y: (r.top - layerRect.top) / (layerRect.height || 1),
      width: r.width / (layerRect.width || 1),
      height: r.height / (layerRect.height || 1),
    });
  }
  if (!rects.length) return null;
  const last = range.getBoundingClientRect();
  const sentence = sentenceAroundSelection(container, text);
  return {
    text,
    rects,
    screen: { x: last.left + last.width / 2, y: last.top },
    sentence:
      sentence && sentence.toLowerCase() !== text.toLowerCase()
        ? sentence
        : sentence || text,
  };
}

export function afterSelectionSettles(fn: () => void): void {
  window.requestAnimationFrame(() => window.requestAnimationFrame(fn));
}
