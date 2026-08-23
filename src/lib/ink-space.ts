import type { InkPoint, InkStroke } from "./types";

export type InkSpace = "page" | "margin";

export function overlayPageFrac(pageW: number, marginW: number): number {
  const total = pageW + marginW;
  if (total < 1) return 1;
  return pageW / total;
}

export function ratioPageFrac(ratio: number): number {
  return 1 / (1 + Math.max(0.05, ratio));
}

export function classifyOverlayPoints(
  points: InkPoint[],
  pageFrac: number,
): InkSpace {
  const cut = pageFrac + 0.008;
  const inMargin = points.filter((p) => p.x > cut).length;
  return inMargin >= 2 && inMargin >= points.length / 2 ? "margin" : "page";
}

export function overlayToLocal(
  points: InkPoint[],
  space: InkSpace,
  pageFrac: number,
): InkPoint[] {
  if (space === "page") {
    const span = Math.max(0.05, pageFrac);
    return points.map((p) => ({ ...p, x: p.x / span }));
  }
  const span = Math.max(0.05, 1 - pageFrac);
  return points.map((p) => ({ ...p, x: (p.x - pageFrac) / span }));
}

export function localToOverlay(
  points: InkPoint[],
  space: InkSpace,
  pageFrac: number,
): InkPoint[] {
  if (space === "page") {
    return points.map((p) => ({ ...p, x: p.x * pageFrac }));
  }
  return points.map((p) => ({
    ...p,
    x: pageFrac + p.x * (1 - pageFrac),
  }));
}

export function packDrawnStroke(
  points: InkPoint[],
  pageW: number,
  marginW: number,
): { space: InkSpace; points: InkPoint[] }[] {
  if (marginW < 8) return [{ space: "page", points }];
  const pf = overlayPageFrac(pageW, marginW);
  const pagePts = points.filter((p) => p.x <= pf + 0.012);
  const marginPts = points.filter((p) => p.x >= pf - 0.012);
  const out: { space: InkSpace; points: InkPoint[] }[] = [];
  if (pagePts.length >= 2) {
    out.push({ space: "page", points: overlayToLocal(pagePts, "page", pf) });
  }
  if (marginPts.length >= 2) {
    out.push({
      space: "margin",
      points: overlayToLocal(marginPts, "margin", pf),
    });
  }
  if (!out.length) {
    const space = classifyOverlayPoints(points, pf);
    out.push({ space, points: overlayToLocal(points, space, pf) });
  }
  return out;
}

/**
 * Map a stored stroke onto the current overlay (page, or page+margin).
 * Margin ink is omitted when the writing strip is closed.
 */
export function strokeOverlayPoints(
  stroke: Pick<InkStroke, "points" | "space">,
  pageW: number,
  marginW: number,
  storedRatio: number,
): InkPoint[] | null {
  const marginOpen = marginW >= 8;
  const liveFrac = overlayPageFrac(pageW, Math.max(0, marginW));

  if (stroke.space === "margin") {
    if (!marginOpen) return null;
    return localToOverlay(stroke.points, "margin", liveFrac);
  }
  if (stroke.space === "page") {
    if (!marginOpen) return stroke.points;
    return localToOverlay(stroke.points, "page", liveFrac);
  }

  const writtenFrac = ratioPageFrac(storedRatio);
  if (!marginOpen) {
    const pagePts = stroke.points
      .filter((p) => p.x <= writtenFrac + 0.01)
      .map((p) => ({ ...p, x: p.x / Math.max(0.05, writtenFrac) }));
    return pagePts.length >= 2 ? pagePts : null;
  }
  const space = classifyOverlayPoints(stroke.points, writtenFrac);
  const local = overlayToLocal(stroke.points, space, writtenFrac);
  return localToOverlay(local, space, liveFrac);
}

export function migrateLegacyInk(
  stroke: InkStroke,
  pageW: number,
  marginW: number,
): Pick<InkStroke, "space" | "points"> | null {
  if (stroke.space || marginW < 8) return null;
  const pf = overlayPageFrac(pageW, marginW);
  const space = classifyOverlayPoints(stroke.points, pf);
  return { space, points: overlayToLocal(stroke.points, space, pf) };
}
