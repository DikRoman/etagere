"use client";

import { useEffect, useMemo, useState } from "react";
import { useReaderStore } from "@/store/reader";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";
import type { TocItem } from "@/lib/types";
import {
  chapterForPage,
  printedLabel,
  sameTocItem,
  tocItemKey,
  tocOpenPath,
} from "@/lib/toc";

function displayTitle(title: string): string {
  const clean = title.replace(/\s+/g, " ").trim();
  return clean.length > 140 ? `${clean.slice(0, 137)}…` : clean;
}

function Branch({
  items,
  depth,
  active,
  labels,
  open,
  onToggle,
}: {
  items: TocItem[];
  depth: number;
  active?: TocItem;
  labels: string[] | null;
  open: Set<string>;
  onToggle: (key: string) => void;
}) {
  const goToPage = useReaderStore((s) => s.goToPage);

  return (
    <ul className={depth ? "toc-nested" : "toc-root"} role={depth ? "group" : "tree"}>
      {items.map((item, i) => {
        const key = tocItemKey(item, i);
        const kids = item.children ?? [];
        const hasKids = kids.length > 0;
        const expanded = !hasKids || open.has(key);
        const current = sameTocItem(item, active);
        const pageLabel = printedLabel(labels, item.page) ?? String(item.page);

        return (
          <li key={key} className="toc-item">
            <div className="toc-row">
              {hasKids ? (
                <button
                  type="button"
                  className={`toc-twist${expanded ? " is-open" : ""}`}
                  aria-expanded={expanded}
                  aria-label={expanded ? "▾" : "▸"}
                  onClick={() => onToggle(key)}
                >
                  ▸
                </button>
              ) : (
                <span className="toc-twist-spacer" aria-hidden />
              )}
              <button
                type="button"
                className={`toc-link${current ? " is-current" : ""}`}
                title={item.title}
                onClick={() => void goToPage(item.page, item.href || item.anchor)}
              >
                <span className="toc-title">{displayTitle(item.title)}</span>
                <span className="toc-leader" aria-hidden />
                <span className="toc-page">{pageLabel}</span>
              </button>
            </div>
            {hasKids && expanded ? (
              <Branch
                items={kids}
                depth={depth + 1}
                active={active}
                labels={labels}
                open={open}
                onToggle={onToggle}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function TocPanel() {
  const locale = useSettingsStore((s) => s.locale);
  const toc = useReaderStore((s) => s.toc);
  const tocLoading = useReaderStore((s) => s.tocLoading);
  const tocSource = useReaderStore((s) => s.tocSource);
  const pageLabels = useReaderStore((s) => s.pageLabels);
  const page = useReaderStore((s) => s.page);
  const tab = useReaderStore((s) => s.sidebarTab);

  const active = useMemo(() => chapterForPage(toc, page), [toc, page]);
  const path = useMemo(() => tocOpenPath(toc, active), [toc, active]);
  const [manual, setManual] = useState<Record<string, boolean>>({});

  const open = useMemo(() => {
    const next = new Set(path);
    for (const [key, on] of Object.entries(manual)) {
      if (on) next.add(key);
      else next.delete(key);
    }
    return next;
  }, [path, manual]);

  useEffect(() => {
    if (tab !== "toc") return;
    document
      .querySelector(".toc-link.is-current")
      ?.scrollIntoView({ block: "nearest" });
  }, [tab, active, open]);

  if (tocLoading && toc.length === 0) {
    return <p className="muted">{t("tocLoading", locale)}</p>;
  }
  if (toc.length === 0) {
    return <p className="muted">{t("noToc", locale)}</p>;
  }

  return (
    <section className="toc-panel">
      <Branch
        items={toc}
        depth={0}
        active={active}
        labels={pageLabels}
        open={open}
        onToggle={(key) =>
          setManual((prev) => ({ ...prev, [key]: !open.has(key) }))
        }
      />
      {tocSource === "text" && (
        <p className="muted tiny toc-note">{t("tocApprox", locale)}</p>
      )}
    </section>
  );
}
