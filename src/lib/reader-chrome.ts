export type ReaderTapZone = "prev" | "next" | "chrome";

/** Left/right page-turn bands like Apple Books; center toggles chrome. */
export function readerTapZone(
  clientX: number,
  bounds: { left: number; width: number },
): ReaderTapZone {
  const x = clientX - bounds.left;
  const edge = Math.min(140, Math.max(64, bounds.width * 0.2));
  if (x <= edge) return "prev";
  if (bounds.width - x <= edge) return "next";
  return "chrome";
}

export function isPlainReaderTap(start: { x: number; y: number } | null, x: number, y: number) {
  if (!start) return false;
  return Math.hypot(x - start.x, y - start.y) < 10;
}
