import type { PDFDocumentProxy } from "pdfjs-dist";

export const THUMB_WIDTH = 84;

const queue: Array<() => void> = [];
let active = 0;
const MAX_ACTIVE = 2;

function drain() {
  while (active < MAX_ACTIVE && queue.length > 0) {
    const run = queue.shift();
    if (!run) return;
    active += 1;
    run();
  }
}

function schedule<T>(task: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      void task()
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          drain();
        });
    };
    queue.push(run);
    drain();
  });
}

export async function renderPageThumb(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
): Promise<void> {
  await schedule(async () => {
    const page = await pdf.getPage(pageNumber);
    const unscaled = page.getViewport({ scale: 1 });
    const scale = THUMB_WIDTH / unscaled.width;
    const viewport = page.getViewport({ scale });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.ceil(viewport.width * dpr);
    canvas.height = Math.ceil(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    await page.render({
      canvas,
      canvasContext: ctx,
      viewport,
      transform:
        dpr !== 1 ? ([dpr, 0, 0, dpr, 0, 0] as number[]) : undefined,
    }).promise;
  });
}
