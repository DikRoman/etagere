import { jpegsToA4Pdf } from "./jpeg-pdf";
import type {
  EpubFontChoice,
  InkStroke,
  MarginText,
  NotePaper,
} from "./types";

const A4_PX_W = 1240;
const A4_PX_H = 1754;
const PAPER = "#f7f4ee";
const RULE = "rgba(80, 110, 160, 0.22)";
const FOOT = "rgba(28, 36, 48, 0.45)";

const CANVAS_FONTS: Record<EpubFontChoice, string> = {
  literary: "Georgia, 'Times New Roman', serif",
  grotesque: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  verdana: "Verdana, Tahoma, sans-serif",
};

function overlayToMargin(
  item: Pick<MarginText, "x" | "y" | "w" | "h">,
  pageW: number,
  marginW: number,
): { x: number; y: number; w: number; h: number } {
  const total = pageW + marginW;
  if (total < 1 || marginW < 1) {
    return { x: item.x, y: item.y, w: item.w, h: item.h };
  }
  const left = item.x * total;
  const boxW = item.w * total;
  let x = (left - pageW) / marginW;
  let w = boxW / marginW;
  if (left + boxW * 0.4 < pageW) {
    x = 0.04;
    w = Math.min(0.92, Math.max(0.5, w));
  }
  x = Math.min(Math.max(0, x), 0.88);
  w = Math.min(Math.max(0.2, w), 1 - x);
  return { x, y: item.y, w, h: item.h };
}

function marginBox(
  item: MarginText,
  ratio: number,
): { x: number; y: number; w: number; h: number } {
  if (item.space === "margin") {
    return { x: item.x, y: item.y, w: item.w, h: item.h };
  }
  return overlayToMargin(item, 1, ratio);
}

function pageFrac(ratio: number): number {
  return 1 / (1 + Math.max(0.05, ratio));
}

function strokeInMargin(stroke: InkStroke, ratio: number): boolean {
  if (stroke.space === "margin") return true;
  if (stroke.space === "page") return false;
  const cut = pageFrac(ratio) + 0.008;
  return stroke.points.filter((p) => p.x > cut).length >= 2;
}

function remapStroke(stroke: InkStroke, ratio: number): InkStroke {
  if (stroke.space === "margin") return stroke;
  const cut = pageFrac(ratio);
  const span = Math.max(0.05, 1 - cut);
  return {
    ...stroke,
    points: stroke.points.map((p) => ({
      ...p,
      x: (p.x - cut) / span,
    })),
  };
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    if (!para) {
      lines.push("");
      continue;
    }
    const words = para.split(/(\s+)/);
    let cur = "";
    const flush = () => {
      if (cur) lines.push(cur);
      cur = "";
    };
    for (const word of words) {
      if (!word) continue;
      const trial = cur + word;
      if (cur && ctx.measureText(trial).width > maxWidth) {
        flush();
        if (ctx.measureText(word).width > maxWidth) {
          let chunk = "";
          for (const ch of word) {
            const next = chunk + ch;
            if (chunk && ctx.measureText(next).width > maxWidth) {
              lines.push(chunk);
              chunk = ch;
            } else {
              chunk = next;
            }
          }
          cur = chunk;
        } else {
          cur = word.trimStart();
        }
      } else {
        cur = trial;
      }
    }
    flush();
  }
  return lines.length ? lines : [""];
}

function drawPaper(
  ctx: CanvasRenderingContext2D,
  paper: NotePaper,
  w: number,
  h: number,
) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);
  if (paper === "plain") return;

  const step =
    paper === "grid" ? h / 44 : paper === "gridWide" ? h / 24 : h / 32;
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = step; y < h; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  if (paper === "grid" || paper === "gridWide") {
    for (let x = step; x < w; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
  }
  ctx.stroke();
}

function drawInk(
  ctx: CanvasRenderingContext2D,
  stroke: InkStroke,
  w: number,
  h: number,
) {
  const points = stroke.points;
  if (points.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  ctx.strokeStyle = stroke.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const scale = h / 900;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.x < -0.02 && b.x < -0.02) continue;
    if (a.x > 1.02 && b.x > 1.02) continue;
    const p = b.p ?? a.p ?? 0.5;
    ctx.beginPath();
    ctx.lineWidth = stroke.width * scale * (0.35 + p * 1.35);
    ctx.moveTo(a.x * w, a.y * h);
    ctx.lineTo(b.x * w, b.y * h);
    ctx.stroke();
  }
  ctx.restore();
}

function drawNote(
  ctx: CanvasRenderingContext2D,
  item: MarginText,
  ratio: number,
  w: number,
  h: number,
) {
  const body = item.body.trimEnd();
  if (!body.trim()) return;
  const box = marginBox(item, ratio);
  const x = box.x * w;
  const y = box.y * h;
  const boxW = Math.max(24, box.w * w);
  const fontPx = Math.max(12, item.fontSize * h);
  ctx.save();
  ctx.fillStyle = item.color || "#1c2430";
  ctx.font = `${fontPx}px ${CANVAS_FONTS[item.font] ?? CANVAS_FONTS.georgia}`;
  ctx.textBaseline = "top";
  const pad = Math.max(4, fontPx * 0.15);
  const lines = wrapText(ctx, body, boxW - pad * 2);
  const lh = fontPx * 1.35;
  let ty = y + pad;
  for (const line of lines) {
    if (ty > h - 8) break;
    ctx.fillText(line, x + pad, ty);
    ty += lh;
  }
  ctx.restore();
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error("JPEG encode failed"));
          return;
        }
        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      "image/jpeg",
      0.9,
    );
  });
}

export function pagesWithMarginNotes(
  texts: MarginText[],
  ink: InkStroke[],
  ratio: number,
): number[] {
  const pages = new Set<number>();
  for (const item of texts) {
    if (item.body.trim()) pages.add(item.page);
  }
  for (const stroke of ink) {
    if (strokeInMargin(stroke, ratio)) pages.add(stroke.page);
  }
  return [...pages].sort((a, b) => a - b);
}

export function marginNotesFilename(title: string): string {
  const base =
    title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() ||
    "notes";
  return `${base.slice(0, 80)}-поля.pdf`;
}

export type MarginExportResult =
  | { kind: "empty" }
  | { kind: "ok"; blob: Blob; filename: string };

/** Prefer the live textarea so a download mid-edit is not empty. */
export function textsWithDrafts(texts: MarginText[]): MarginText[] {
  if (typeof document === "undefined") return texts;
  return texts.map((item) => {
    const area = document.querySelector<HTMLTextAreaElement>(
      `.margin-text textarea[data-note-id="${item.id}"]`,
    );
    if (!area || area.value === item.body) return item;
    return { ...item, body: area.value };
  });
}

export async function exportMarginNotesPdf(opts: {
  title: string;
  texts: MarginText[];
  ink: InkStroke[];
  marginRatio: number;
  paper: NotePaper;
  pageLabel: string;
}): Promise<MarginExportResult> {
  const ratio = Math.min(1, Math.max(0.1, opts.marginRatio));
  const pages = pagesWithMarginNotes(opts.texts, opts.ink, ratio);
  if (!pages.length) return { kind: "empty" };

  const canvas = document.createElement("canvas");
  canvas.width = A4_PX_W;
  canvas.height = A4_PX_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");

  const images: { jpeg: Uint8Array; width: number; height: number }[] = [];
  for (const page of pages) {
    drawPaper(ctx, opts.paper, A4_PX_W, A4_PX_H);
    for (const stroke of opts.ink.filter((s) => s.page === page)) {
      if (!strokeInMargin(stroke, ratio)) continue;
      drawInk(ctx, remapStroke(stroke, ratio), A4_PX_W, A4_PX_H);
    }
    for (const item of opts.texts.filter((t) => t.page === page)) {
      drawNote(ctx, item, ratio, A4_PX_W, A4_PX_H);
    }
    ctx.fillStyle = FOOT;
    ctx.font = "15px system-ui, -apple-system, sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    const label = opts.title.slice(0, 72);
    ctx.fillText(label, 28, A4_PX_H - 22);
    ctx.textAlign = "right";
    ctx.fillText(`${opts.pageLabel} ${page}`, A4_PX_W - 28, A4_PX_H - 22);
    ctx.textAlign = "left";
    images.push({
      jpeg: await canvasToJpeg(canvas),
      width: A4_PX_W,
      height: A4_PX_H,
    });
  }

  return {
    kind: "ok",
    blob: jpegsToA4Pdf(images),
    filename: marginNotesFilename(opts.title),
  };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
