/** Minimal PDF writer: one JPEG image per A4 portrait page. */

const A4_W = 595.28;
const A4_H = 841.89;

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export function jpegsToA4Pdf(
  pages: { jpeg: Uint8Array; width: number; height: number }[],
): Blob {
  if (!pages.length) throw new Error("No pages");
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let pos = 0;

  const add = (data: string | Uint8Array) => {
    const bytes = typeof data === "string" ? enc.encode(data) : data;
    chunks.push(bytes);
    pos += bytes.length;
  };

  add("%PDF-1.4\n%\x80\x80\x80\x80\n");

  type Deferred = { id: number; write: () => void };
  const deferred: Deferred[] = [];

  const pageIds: number[] = [];
  let next = 3;

  for (const page of pages) {
    const imgId = next++;
    const contentId = next++;
    const pageId = next++;
    pageIds.push(pageId);
    const content = `q\n${A4_W.toFixed(2)} 0 0 ${A4_H.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`;

    deferred.push({
      id: imgId,
      write: () => {
        offsets[imgId] = pos;
        add(`${imgId} 0 obj\n`);
        add(
          `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
        );
        add(page.jpeg);
        add("\nendstream\nendobj\n");
      },
    });
    deferred.push({
      id: contentId,
      write: () => {
        offsets[contentId] = pos;
        add(`${contentId} 0 obj\n`);
        add(`<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);
      },
    });
    deferred.push({
      id: pageId,
      write: () => {
        offsets[pageId] = pos;
        add(`${pageId} 0 obj\n`);
        add(
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_W} ${A4_H}] /Resources << /XObject << /Im0 ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
        );
      },
    });
  }

  offsets[1] = pos;
  add("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  offsets[2] = pos;
  add(
    `2 0 obj\n<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>\nendobj\n`,
  );
  for (const item of deferred) item.write();

  const xrefAt = pos;
  add(`xref\n0 ${next}\n`);
  add("0000000000 65535 f \n");
  for (let i = 1; i < next; i++) {
    add(`${String(offsets[i] ?? 0).padStart(10, "0")} 00000 n \n`);
  }
  add(`trailer\n<< /Size ${next} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);
  return new Blob([concat(chunks)], { type: "application/pdf" });
}
