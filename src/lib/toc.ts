import type { TocItem } from "./types";

export function flattenToc(items: TocItem[]): TocItem[] {
  const out: TocItem[] = [];
  const walk = (list: TocItem[]) => {
    for (const it of list) {
      out.push(it);
      if (it.children?.length) walk(it.children);
    }
  };
  walk(items);
  return out;
}

export function tocItemKey(item: TocItem, index: number): string {
  return `${item.href ?? ""}::${item.title}::${item.page}::${index}`;
}

export function sameTocItem(a?: TocItem | null, b?: TocItem | null): boolean {
  if (!a || !b) return false;
  if (a.href && b.href) return a.href === b.href;
  return a.page === b.page && a.title === b.title;
}

/** Keys of items that should stay open so the current chapter is visible. */
export function tocOpenPath(items: TocItem[], active?: TocItem): Set<string> {
  const open = new Set<string>();
  const walk = (list: TocItem[], trail: string[]): boolean => {
    for (let i = 0; i < list.length; i++) {
      const item = list[i]!;
      const key = tocItemKey(item, i);
      const next = [...trail, key];
      const hit = sameTocItem(item, active);
      const inChild = item.children?.length ? walk(item.children, next) : false;
      if (hit || inChild) {
        for (const k of next) open.add(k);
        return true;
      }
    }
    return false;
  };
  walk(items, []);
  for (let i = 0; i < items.length; i++) {
    if (items[i]?.children?.length) open.add(tocItemKey(items[i]!, i));
  }
  return open;
}

export function chapterForPage(
  items: TocItem[],
  page: number,
): TocItem | undefined {
  const ordered = flattenToc(items).filter((it) => it.page > 0);
  const onPage = ordered.filter((it) => it.page === page);
  if (onPage.length) {
    const fileOnly = onPage.find((it) => it.href && !it.anchor);
    return fileOnly ?? onPage[0];
  }
  let best: TocItem | undefined;
  const ranked = ordered.slice().sort(
    (a, b) => a.page - b.page || a.title.localeCompare(b.title),
  );
  for (const it of ranked) {
    if (it.page <= page) best = it;
    else break;
  }
  return best ?? ranked[0];
}

/** The number printed on the page, when it differs from the PDF page index. */
export function printedLabel(
  labels: string[] | null,
  page: number,
): string | null {
  const label = labels?.[page - 1];
  if (!label || label === String(page)) return null;
  return label;
}
