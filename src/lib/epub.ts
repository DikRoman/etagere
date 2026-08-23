import type { Book, Contents, NavItem, Rendition } from "epubjs";
import type {
  EpubChapter,
  EpubTypography,
  ReaderTheme,
  TocItem,
} from "./types";
import { EPUB_FONT_STACKS } from "./types";
import { flattenToc } from "./toc";

type SpineSection = {
  idref: string;
  index: number;
  href: string;
  load: (request?: (path: string) => Promise<object>) => unknown;
  unload: () => void;
};

export const EPUB_BUNDLE_VERSION = 4;

type EpubJs = typeof import("epubjs").default;

let epubLoader: Promise<EpubJs> | null = null;

function ensureBrowserGlobal(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { global?: unknown };
  if (!w.global) w.global = window;
}

export function loadEpubJs(): Promise<EpubJs> {
  if (!epubLoader) {
    epubLoader = (async () => {
      ensureBrowserGlobal();
      const mod = await import("epubjs");
      return (mod.default ?? mod) as EpubJs;
    })();
  }
  return epubLoader;
}

/** Cover only — do not parse every chapter. */
export async function extractEpubCoverFromBuffer(
  data: ArrayBuffer,
): Promise<string | undefined> {
  const book = await openEpubBook(data);
  try {
    const coverUrl = await book.coverUrl();
    if (!coverUrl) return undefined;
    return await shrinkCover(coverUrl);
  } catch {
    return undefined;
  } finally {
    try {
      book.destroy();
    } catch {
      /* already torn down */
    }
  }
}

export async function openEpubBook(data: ArrayBuffer): Promise<Book> {
  const ePub = await loadEpubJs();
  const book = ePub(data, { replacements: "blobUrl" });
  await book.ready;
  return book;
}

export function spineLength(book: Book): number {
  let n = 0;
  book.spine.each(() => {
    n += 1;
  });
  return n;
}

export function spineSections(book: Book): SpineSection[] {
  const list: SpineSection[] = [];
  book.spine.each((section: SpineSection) => {
    list.push(section);
  });
  return list;
}

export function pageForHref(book: Book, href: string): number {
  if (!href) return 1;
  const section =
    book.spine.get(href) ||
    book.spine.get(href.replace(/^\.\//, "")) ||
    book.spine.get(decodeURI(href));
  if (section) return section.index + 1;
  const file = href.split("#")[0]?.split("/").pop()?.toLowerCase();
  if (!file) return 1;
  let found = 1;
  book.spine.each((item: SpineSection) => {
    if (item.href.split("/").pop()?.toLowerCase() === file) {
      found = item.index + 1;
    }
  });
  return found;
}

export function tocFromBook(
  book: Book,
  items: NavItem[],
  inherited = 1,
): TocItem[] {
  return items
    .map((item) => {
      const href = item.href || "";
      const hash = href.includes("#") ? href.slice(href.indexOf("#") + 1) : "";
      let page = pageForHref(book, href);
      const children = item.subitems?.length
        ? tocFromBook(book, item.subitems, page || inherited)
        : undefined;
      if ((!page || page < 1) && children?.[0]) page = children[0].page;
      const title = (item.label || "").replace(/\s+/g, " ").trim();
      if (!title && !children?.length) return null;
      const node: TocItem = {
        title: title || "…",
        page: page || inherited || 1,
        ...(href ? { href } : {}),
        ...(hash ? { anchor: hash } : {}),
        ...(children?.length ? { children } : {}),
      };
      return node;
    })
    .filter((item): item is TocItem => item !== null);
}

async function shrinkCover(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return shrinkImage(bytes, blob.type || "image/jpeg");
  } catch {
    return undefined;
  }
}

/** Covers are shown small; keep the library light instead of storing originals. */
async function shrinkImage(
  bytes: Uint8Array,
  mime: string,
  maxWidth = 320,
): Promise<string> {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxWidth / bitmap.width);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas context");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return bytesToDataUrl(bytes, mime);
  }
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

async function parseEpubBuffer(data: ArrayBuffer): Promise<{
  title: string;
  author?: string;
  chapters: EpubChapter[];
  toc: TocItem[];
  coverDataUrl?: string;
}> {
  const book = await openEpubBook(data);
  try {
    const metadata = await book.loaded.metadata;
    const navigation = await book.loaded.navigation;
    const sections = spineSections(book);
    const chapters: EpubChapter[] = sections.map((section, i) => ({
      id: section.idref || String(i + 1),
      title: "",
      html: "",
      path: section.href,
    }));
    let toc = tocFromBook(book, navigation.toc ?? []);
    if (!toc.length) {
      toc = chapters.map((c, i) => ({
        title: c.title || String(i + 1),
        page: i + 1,
        href: c.path,
      }));
    } else {
      const titleByPage = new Map<number, string>();
      for (const item of flattenToc(toc)) {
        if (!titleByPage.has(item.page)) titleByPage.set(item.page, item.title);
      }
      for (let i = 0; i < chapters.length; i++) {
        const named = titleByPage.get(i + 1);
        if (named) chapters[i]!.title = named;
      }
    }
    for (let i = 0; i < chapters.length; i++) {
      if (!chapters[i]!.title) chapters[i]!.title = String(i + 1);
    }

    let coverDataUrl: string | undefined;
    try {
      const coverUrl = await book.coverUrl();
      if (coverUrl) coverDataUrl = await shrinkCover(coverUrl);
    } catch {
      /* some books have no cover */
    }

    return {
      title: metadata.title?.trim() || "Untitled",
      author: metadata.creator?.trim() || undefined,
      chapters,
      toc,
      coverDataUrl,
    };
  } finally {
    book.destroy();
  }
}

export async function parseEpubTocFromBuffer(
  data: ArrayBuffer,
): Promise<TocItem[]> {
  try {
    const parsed = await parseEpubBuffer(data);
    return parsed.toc;
  } catch {
    return [];
  }
}

/** Re-read a stored EPUB file; used to refresh books imported by older builds. */
export async function reparseEpubFromBlob(blob: Blob): Promise<{
  chapters: EpubChapter[];
  toc: TocItem[];
  coverDataUrl?: string;
}> {
  return parseEpubBuffer(await blob.arrayBuffer());
}

export async function parseEpub(file: File): Promise<{
  title: string;
  author?: string;
  chapters: EpubChapter[];
  toc: TocItem[];
  coverDataUrl?: string;
}> {
  const parsed = await parseEpubBuffer(await file.arrayBuffer());
  if (!parsed.title || parsed.title === "Untitled") {
    parsed.title = file.name.replace(/\.epub$/i, "") || parsed.title;
  }
  return parsed;
}

export async function displayLocation(
  rendition: Rendition,
  target: string | number,
): Promise<void> {
  if (typeof target === "number") await rendition.display(target);
  else await rendition.display(target);
}

export function displayTarget(
  book: Book,
  page: number,
  target?: string | null,
): string | number {
  if (target && /[./]/.test(target) && !target.startsWith("#")) {
    return target;
  }
  const section = book.spine.get(Math.max(0, page - 1));
  if (!section) return Math.max(0, page - 1);
  if (target) {
    const id = target.startsWith("#") ? target.slice(1) : target;
    return `${section.href}#${id}`;
  }
  return section.href || Math.max(0, page - 1);
}

export function renditionContents(rendition: Rendition): Contents[] {
  const raw = rendition.getContents() as unknown;
  if (Array.isArray(raw)) return raw.filter(Boolean) as Contents[];
  if (raw) return [raw as Contents];
  return [];
}

const NOTE_REF = /noteref|doc-noteref/i;
const NOTE_TARGET = /footnote|endnote|doc-footnote|doc-endnote|rearnote/i;

function attrBag(el: Element): string {
  const ops = el.getAttributeNS("http://www.idpf.org/2007/ops", "type") ?? "";
  return `${el.getAttribute("epub:type") ?? ""} ${el.getAttribute("role") ?? ""} ${el.className} ${ops}`;
}

export function isNoteRef(el: Element): boolean {
  return NOTE_REF.test(attrBag(el));
}

export function footnoteFromDoc(doc: Document, href: string): Element | null {
  const hash = href.includes("#") ? href.slice(href.indexOf("#") + 1) : "";
  if (!hash) return null;
  let id = hash;
  try {
    id = decodeURIComponent(hash);
  } catch {
    /* keep raw */
  }
  const el =
    doc.getElementById(id) ||
    doc.querySelector(`[name="${CSS.escape(id)}"]`) ||
    doc.querySelector(`[id="${CSS.escape(id)}"]`);
  if (!el) return null;
  const host =
    el.closest("aside, [hidden], .footnote, .endnote, footer") ?? el;
  if (NOTE_TARGET.test(attrBag(host)) || NOTE_TARGET.test(attrBag(el))) {
    return host;
  }
  if (host !== el && host.tagName.toLowerCase() === "aside") return host;
  if (el.tagName.toLowerCase() === "aside") return el;
  if (el.closest("[epub\\:type*='footnote'], [role='doc-footnote']")) {
    return host;
  }
  return null;
}

export function footnoteHtml(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll("script, iframe, object, embed").forEach((n) => {
    n.remove();
  });
  return clone.innerHTML;
}

function collectFontFaceCss(): string {
  if (typeof document === "undefined") return "";
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSFontFaceRule) out.push(rule.cssText);
    }
  }
  return out.join("\n");
}

function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

function resolveFontStack(stack: string): string {
  return stack.replace(/var\((--[^)]+)\)/g, (_, name: string) => {
    return cssVar(name, "Georgia, serif");
  });
}

export function epubContentCss(opts: {
  theme: ReaderTheme;
  type: EpubTypography;
  scale: number;
  paged: boolean;
}): string {
  const font = resolveFontStack(EPUB_FONT_STACKS[opts.type.font]);
  const paper = cssVar("--paper", opts.theme === "night" ? "#121820" : "#fafbfd");
  const ink = cssVar("--ink", opts.theme === "night" ? "#e8eef6" : "#1c2430");
  const inkSoft = cssVar("--ink-soft", "#6b7380");
  const accent = cssVar("--accent", "#2f6fed");
  const line = cssVar("--line", "rgba(28, 36, 48, 0.12)");
  const align = opts.type.justify ? "justify" : "start";
  const hyphens = opts.type.justify ? "auto" : "manual";
  const measure = opts.paged ? "100%" : `${opts.type.measure}em`;
  return `
${collectFontFaceCss()}
html, body {
  background: ${paper} !important;
  color: ${ink} !important;
}
body {
  margin: 0 auto;
  max-width: ${measure};
  padding: ${opts.type.margin}rem;
  font-family: ${font};
  font-size: ${opts.scale}rem;
  line-height: ${opts.type.lineHeight};
  word-spacing: ${opts.type.wordSpacing}em;
  letter-spacing: ${opts.type.letterSpacing}em;
  text-align: ${align};
  hyphens: ${hyphens};
  -webkit-hyphens: ${hyphens};
  overflow-wrap: anywhere;
}
p, li {
  margin: 0 0 ${opts.type.paragraphGap}em;
  line-height: ${opts.type.lineHeight};
  text-align: ${align};
  hyphens: ${hyphens};
}
h1, h2, h3, h4, h5 {
  font-family: ${font};
  font-weight: 650;
  line-height: 1.25;
  text-align: start;
  margin: 1.4em 0 0.6em;
}
img, svg, image {
  max-width: 100%;
  height: auto;
}
a {
  color: ${accent};
}
table {
  max-width: 100%;
  border-collapse: collapse;
}
td, th {
  border: 1px solid ${line};
  padding: 0.35em 0.5em;
}
blockquote {
  margin: 1em 0;
  padding-left: 1em;
  border-left: 2px solid ${line};
  color: ${inkSoft};
}
aside[epub\\:type*="footnote"],
aside[role="doc-footnote"],
.footnote, .endnote {
  font-size: 0.92em;
  color: ${inkSoft};
}
`;
}
