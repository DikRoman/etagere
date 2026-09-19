import type { InkPoint, InkStroke } from "./types";

export type InkSpace = "page" | "margin";

/** Visual gap between the book page and the margin slip. */
export const MARGIN_GUTTER_PX = 16;

type OverlayLayout = {
  pageFrac: number;
  marginStart: number;
  marginSpan: number;
};

export function overlayLayout(
  pageW: number,
  marginW: number,
  gutter = 0,
): OverlayLayout {
  const g = marginW >= 8 ? Math.max(0, gutter) : 0;
  const total = Math.max(1, pageW + g + Math.max(0, marginW));
  return {
    pageFrac: pageW / total,
    marginStart: (pageW + g) / total,
    marginSpan: Math.max(0.05, Math.max(0, marginW) / total),
  };
}

export function overlayPageFrac(pageW: number, marginW: number): number {
  return overlayLayout(pageW, marginW).pageFrac;
}

export function ratioPageFrac(ratio: number): number {
  return 1 / (1 + Math.max(0.05, ratio));
}

function layoutFromFrac(pageFrac: number): OverlayLayout {
  return {
    pageFrac,
    marginStart: pageFrac,
    marginSpan: Math.max(0.05, 1 - pageFrac),
  };
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
  pageFrac: number | OverlayLayout,
): InkPoint[] {
  const L = typeof pageFrac === "number" ? layoutFromFrac(pageFrac) : pageFrac;
  if (space === "page") {
    const span = Math.max(0.05, L.pageFrac);
    return points.map((p) => ({ ...p, x: p.x / span }));
  }
  return points.map((p) => ({
    ...p,
    x: (p.x - L.marginStart) / L.marginSpan,
  }));
}

export function localToOverlay(
  points: InkPoint[],
  space: InkSpace,
  pageFrac: number | OverlayLayout,
): InkPoint[] {
  const L = typeof pageFrac === "number" ? layoutFromFrac(pageFrac) : pageFrac;
  if (space === "page") {
    return points.map((p) => ({ ...p, x: p.x * L.pageFrac }));
  }
  return points.map((p) => ({
    ...p,
    x: L.marginStart + p.x * L.marginSpan,
  }));
}

export function packDrawnStroke(
  points: InkPoint[],
  pageW: number,
  marginW: number,
  gutter = 0,
): { space: InkSpace; points: InkPoint[] }[] {
  if (marginW < 8) return [{ space: "page", points }];
  const L = overlayLayout(pageW, marginW, gutter);
  const pagePts = points.filter((p) => p.x <= L.pageFrac + 0.012);
  const marginPts = points.filter((p) => p.x >= L.marginStart - 0.012);
  const out: { space: InkSpace; points: InkPoint[] }[] = [];
  if (pagePts.length >= 2) {
    out.push({ space: "page", points: overlayToLocal(pagePts, "page", L) });
  }
  if (marginPts.length >= 2) {
    out.push({
      space: "margin",
      points: overlayToLocal(marginPts, "margin", L),
    });
  }
  if (!out.length) {
    const space = classifyOverlayPoints(points, L.marginStart);
    out.push({ space, points: overlayToLocal(points, space, L) });
  }
  return out;
}

/**
 * Map a stored stroke onto the current overlay (page, or page+gap+margin).
 * Margin ink is omitted when the writing strip is closed.
 */
export function strokeOverlayPoints(
  stroke: Pick<InkStroke, "points" | "space">,
  pageW: number,
  marginW: number,
  storedRatio: number,
  gutter = 0,
): InkPoint[] | null {
  const marginOpen = marginW >= 8;
  const live = overlayLayout(pageW, Math.max(0, marginW), gutter);

  if (stroke.space === "margin") {
    if (!marginOpen) return null;
    return localToOverlay(stroke.points, "margin", live);
  }
  if (stroke.space === "page") {
    if (!marginOpen) return stroke.points;
    return localToOverlay(stroke.points, "page", live);
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
  return localToOverlay(local, space, live);
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
