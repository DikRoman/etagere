import { HIGHLIGHT_COLORS, type LegacyHighlightColor } from "./types";

/**
 * A highlight colour is either one of the original named colours
 * ("yellow", "green", "blue", "coral") or any "#rrggbb" picked from the
 * palette. Named colours keep their exact original fills, so highlights made
 * before custom colours existed look the same as they always did.
 */

const LEGACY_HEX: Record<LegacyHighlightColor, string> = {
  yellow: "#ffd60a",
  green: "#34c759",
  blue: "#32ade6",
  coral: "#ff6961",
};

const HEX_RE = /^#[0-9a-f]{6}$/i;

function isLegacy(color: string): color is LegacyHighlightColor {
  return color in LEGACY_HEX;
}

export function isHighlightColor(color: string | undefined): boolean {
  return Boolean(color && (isLegacy(color) || HEX_RE.test(color)));
}

/** Opaque colour, for swatches and the menu icon. */
export function highlightSolid(color: string | undefined): string {
  if (color && isLegacy(color)) return LEGACY_HEX[color];
  if (color && HEX_RE.test(color)) return color.toLowerCase();
  return LEGACY_HEX.yellow;
}

/** Translucent fill laid over the page text. */
export function highlightFill(color: string | undefined): string {
  if (color && isLegacy(color)) return HIGHLIGHT_COLORS[color].fill;
  const hex = highlightSolid(color);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.42)`;
}

/** Two colours count as the same slot whether named or written as hex. */
export function sameHighlightColor(a: string, b: string): boolean {
  return highlightSolid(a) === highlightSolid(b);
}

export const DEFAULT_HIGHLIGHT_SLOTS = ["yellow", "green", "blue"];

/**
 * The full palette: highlighter-friendly hues in rows from warm to cool,
 * then muted tones. Any other colour is one click away via the native
 * picker at the end of the grid.
 */
export const HIGHLIGHT_PALETTE = [
  "#ffd60a", "#ffb703", "#ff9f1c", "#ff7b54", "#ff6961", "#ff4d6d",
  "#f72585", "#e056fd", "#b5179e", "#9b5de5", "#7209b7", "#5e60ce",
  "#4361ee", "#32ade6", "#4cc9f0", "#00b4d8", "#2ec4b6", "#06d6a0",
  "#34c759", "#80ed99", "#b5e48c", "#d9ed92", "#c9a227", "#a68a64",
  "#e9c46a", "#f4a261", "#e76f51", "#adb5bd", "#6c757d", "#495057",
];
