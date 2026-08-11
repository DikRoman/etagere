import JSZip from "jszip";
import type { EpubChapter } from "./types";

function stripXmlNs(name: string) {
  return name.replace(/^.*:/, "");
}

function textContent(el: Element | null): string {
  return (el?.textContent ?? "").trim();
}

export async function parseEpub(file: File): Promise<{
  title: string;
  author?: string;
  chapters: EpubChapter[];
  coverDataUrl?: string;
}> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const container = await zip.file("META-INF/container.xml")?.async("text");
  if (!container) throw new Error("Invalid EPUB: no container.xml");

  const containerDoc = new DOMParser().parseFromString(container, "application/xml");
  const rootfile = containerDoc.getElementsByTagName("rootfile")[0];
  const opfPath = rootfile?.getAttribute("full-path");
  if (!opfPath) throw new Error("Invalid EPUB: no OPF path");

  const opfDir = opfPath.includes("/")
    ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1)
    : "";
  const opfText = await zip.file(opfPath)?.async("text");
  if (!opfText) throw new Error("Invalid EPUB: missing OPF");

  const opf = new DOMParser().parseFromString(opfText, "application/xml");
  const title =
    textContent(opf.getElementsByTagName("dc:title")[0]) ||
    textContent(opf.getElementsByTagName("title")[0]) ||
    file.name.replace(/\.epub$/i, "");
  const author =
    textContent(opf.getElementsByTagName("dc:creator")[0]) ||
    textContent(opf.getElementsByTagName("creator")[0]) ||
    undefined;

  const manifest = new Map<string, { href: string; type: string }>();
  for (const item of Array.from(opf.getElementsByTagName("item"))) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    const type = item.getAttribute("media-type") ?? "";
    if (id && href) manifest.set(id, { href, type });
  }

  const spineIds: string[] = [];
  for (const itemref of Array.from(opf.getElementsByTagName("itemref"))) {
    const idref = itemref.getAttribute("idref");
    if (idref) spineIds.push(idref);
  }

  const chapters: EpubChapter[] = [];
  for (let i = 0; i < spineIds.length; i++) {
    const meta = manifest.get(spineIds[i]);
    if (!meta || !/html|xml/i.test(meta.type)) continue;
    const path = opfDir + meta.href;
    const html = await zip.file(path)?.async("text");
    if (!html) continue;
    const doc = new DOMParser().parseFromString(html, "text/html");
    const body = doc.body?.innerHTML || html;
    const h =
      textContent(doc.querySelector("h1,h2,title")) ||
      `${title} · ${i + 1}`;
    chapters.push({ id: spineIds[i], title: h, html: body });
  }

  let coverDataUrl: string | undefined;
  const coverItem =
    Array.from(opf.getElementsByTagName("item")).find(
      (it) =>
        (it.getAttribute("properties") ?? "").includes("cover-image") ||
        /cover/i.test(it.getAttribute("id") ?? ""),
    ) ?? null;
  if (coverItem) {
    const href = coverItem.getAttribute("href");
    if (href) {
      const blob = await zip.file(opfDir + href)?.async("blob");
      if (blob) {
        coverDataUrl = await blobToDataUrl(blob);
      }
    }
  }

  void stripXmlNs;
  return { title, author, chapters, coverDataUrl };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
