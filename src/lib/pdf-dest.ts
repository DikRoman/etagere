import type { PDFDocumentProxy } from "pdfjs-dist";

/** Explicit destination kinds; these are not named destinations to look up. */
const DEST_KINDS = new Set([
  "XYZ",
  "Fit",
  "FitH",
  "FitV",
  "FitR",
  "FitB",
  "FitBH",
  "FitBV",
]);

function pageFromHash(hash: string): number | null {
  const cleaned = hash.replace(/^#/, "");
  const pageMatch = cleaned.match(/(?:^|&)page=(\d+)/i);
  if (pageMatch) return Number(pageMatch[1]);
  if (/^\d+$/.test(cleaned)) return Number(cleaned);
  return null;
}

function namedDestFromHash(hash: string): string | null {
  const cleaned = hash.replace(/^#/, "");
  const named = cleaned.match(/(?:^|&)nameddest=([^&]+)/i);
  if (named?.[1]) return decodeURIComponent(named[1]);
  return null;
}

function refKey(ref: unknown): string | null {
  if (typeof ref === "number" && Number.isInteger(ref)) return `i:${ref}`;
  if (ref && typeof ref === "object" && "num" in ref) {
    const r = ref as { num: number; gen?: number };
    return `r:${r.num}:${r.gen ?? 0}`;
  }
  return null;
}

export type PageResolver = {
  destToPage: (dest: unknown) => Promise<number | null>;
  urlToPage: (url: string | null | undefined) => Promise<number | null>;
  linkTarget: (link: {
    dest?: unknown;
    url?: string | null;
    unsafeUrl?: string | null;
  }) => Promise<number | null>;
};

/** Resolve many outline/link destinations without repeating worker round-trips. */
export function createPageResolver(pdf: PDFDocumentProxy): PageResolver {
  const named = new Map<string, unknown>();
  const pageByRef = new Map<string, number>();
  let namedReady: Promise<void> | null = null;

  function loadNamed(): Promise<void> {
    if (!namedReady) {
      namedReady = pdf
        .getDestinations()
        .then((dict) => {
          if (!dict) return;
          for (const [key, value] of Object.entries(dict)) {
            named.set(key, value);
          }
        })
        .catch(() => {
          /* older or damaged files still work via getDestination */
        });
    }
    return namedReady;
  }

  async function explicitToPage(explicit: unknown): Promise<number | null> {
    if (!Array.isArray(explicit) || explicit[0] == null) return null;
    const ref = explicit[0];
    if (typeof ref === "number" && Number.isInteger(ref)) {
      return Math.min(pdf.numPages, Math.max(1, ref + 1));
    }
    const key = refKey(ref);
    if (key && pageByRef.has(key)) return pageByRef.get(key)!;
    try {
      const idx = await pdf.getPageIndex(
        ref as Parameters<PDFDocumentProxy["getPageIndex"]>[0],
      );
      const page = idx + 1;
      if (key) pageByRef.set(key, page);
      return page;
    } catch {
      return null;
    }
  }

  async function destToPage(dest: unknown): Promise<number | null> {
    try {
      if (dest == null) return null;
      await loadNamed();
      let explicit: unknown = dest;
      if (typeof dest === "string") {
        explicit = named.get(dest) ?? (await pdf.getDestination(dest));
        if (explicit != null) named.set(dest, explicit);
      } else if (
        dest &&
        typeof dest === "object" &&
        "name" in dest &&
        typeof (dest as { name: unknown }).name === "string"
      ) {
        const name = (dest as { name: string }).name;
        if (!DEST_KINDS.has(name)) {
          explicit = named.get(name) ?? (await pdf.getDestination(name));
          if (explicit != null) named.set(name, explicit);
        }
      }
      return explicitToPage(explicit);
    } catch {
      return null;
    }
  }

  async function urlToPage(
    url: string | null | undefined,
  ): Promise<number | null> {
    if (!url) return null;
    const hash = url.includes("#") ? url.slice(url.indexOf("#") + 1) : url;
    const fromPage = pageFromHash(hash);
    if (fromPage) return Math.min(pdf.numPages, Math.max(1, fromPage));
    const name = namedDestFromHash(hash);
    if (name) return destToPage(name);
    return null;
  }

  async function linkTarget(link: {
    dest?: unknown;
    url?: string | null;
    unsafeUrl?: string | null;
  }): Promise<number | null> {
    return (
      (await destToPage(link.dest)) ??
      (await urlToPage(link.url)) ??
      (await urlToPage(link.unsafeUrl))
    );
  }

  return { destToPage, urlToPage, linkTarget };
}

const oneShot = new WeakMap<PDFDocumentProxy, PageResolver>();

function resolverFor(pdf: PDFDocumentProxy): PageResolver {
  let resolver = oneShot.get(pdf);
  if (!resolver) {
    resolver = createPageResolver(pdf);
    oneShot.set(pdf, resolver);
  }
  return resolver;
}

/** Resolve a PDF destination (named or explicit) to a 1-based page number. */
export function destToPage(
  pdf: PDFDocumentProxy,
  dest: unknown,
): Promise<number | null> {
  return resolverFor(pdf).destToPage(dest);
}

/** Resolve a link URL that points inside the same document. */
export function urlToPage(
  pdf: PDFDocumentProxy,
  url: string | null | undefined,
): Promise<number | null> {
  return resolverFor(pdf).urlToPage(url);
}

export function linkTargetPage(
  pdf: PDFDocumentProxy,
  link: { dest?: unknown; url?: string | null; unsafeUrl?: string | null },
): Promise<number | null> {
  return resolverFor(pdf).linkTarget(link);
}
