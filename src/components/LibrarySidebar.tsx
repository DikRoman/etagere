"use client";

import { FormEvent, useState } from "react";
import { useLibraryStore } from "@/store/library";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";
import { collectionBookCount } from "@/lib/library-filters";
import type { LibraryFilter } from "@/lib/types";
import { SyncStatusLine } from "@/components/SyncStatusLine";

function NavIcon({ name }: { name: string }) {
  const common = {
    viewBox: "0 0 24 24",
    width: 18,
    height: 18,
    "aria-hidden": true,
  } as const;

  switch (name) {
    case "all":
      return (
        <svg {...common}>
          <path
            fill="currentColor"
            d="M4 4h5v5H4V4Zm0 7h5v5H4v-5Zm7-7h5v5h-5V4Zm0 7h5v5h-5v-5Z"
          />
        </svg>
      );
    case "want":
      return (
        <svg {...common}>
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            d="M12 7v10M7 12h10"
          />
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "finished":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            d="M8 12.5 10.5 15 16 9"
          />
        </svg>
      );
    case "epub":
      return (
        <svg {...common}>
          <path
            fill="currentColor"
            d="M6 4h8l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm7 1.5V9h3.5L13 5.5Z"
          />
        </svg>
      );
    case "pdf":
      return (
        <svg {...common}>
          <path
            fill="currentColor"
            d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm6 1.5V9h4.5L13 4.5ZM8 14h8v2H8v-2Zm0-4h8v2H8v-2Z"
          />
        </svg>
      );
    case "collection":
      return (
        <svg {...common}>
          <path fill="currentColor" d="M5 6h14v2H5V6Zm0 5h14v2H5v-2Zm0 5h14v2H5v-2Z" />
        </svg>
      );
    default:
      return null;
  }
}

function isActive(a: LibraryFilter, b: LibraryFilter): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "collection" && b.kind === "collection") return a.id === b.id;
  return true;
}

export function LibrarySidebar() {
  const locale = useSettingsStore((s) => s.locale);
  const books = useLibraryStore((s) => s.books);
  const collections = useLibraryStore((s) => s.collections);
  const libraryFilter = useLibraryStore((s) => s.libraryFilter);
  const setLibraryFilter = useLibraryStore((s) => s.setLibraryFilter);
  const createCollection = useLibraryStore((s) => s.createCollection);
  const deleteCollection = useLibraryStore((s) => s.deleteCollection);
  const draggingBookId = useLibraryStore((s) => s.draggingBookId);
  const dropTargetCollectionId = useLibraryStore((s) => s.dropTargetCollectionId);
  const selectMode = useLibraryStore((s) => s.selectMode);
  const selectedCount = useLibraryStore((s) => s.selectedBookIds.length);

  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");

  const libraryItems: { filter: LibraryFilter; label: string; icon: string }[] = [
    { filter: { kind: "all" }, label: t("filterAll", locale), icon: "all" },
    { filter: { kind: "want" }, label: t("filterWant", locale), icon: "want" },
    {
      filter: { kind: "finished" },
      label: t("filterFinished", locale),
      icon: "finished",
    },
    { filter: { kind: "epub" }, label: t("filterBooks", locale), icon: "epub" },
    { filter: { kind: "pdf" }, label: t("filterPdf", locale), icon: "pdf" },
  ];

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const created = await createCollection(draft);
    if (created) {
      setLibraryFilter({ kind: "collection", id: created.id });
      setDraft("");
      setCreating(false);
    }
  }

  return (
    <aside
      className={`library-sidebar${draggingBookId || selectMode ? " is-receiving" : ""}`}
      aria-label={t("myLibrary", locale)}
    >
      <div className="library-sidebar-section">
        <h2 className="library-sidebar-title">{t("librarySection", locale)}</h2>
        <SyncStatusLine />
        <ul className="library-nav">
          {libraryItems.map((item) => (
            <li key={item.filter.kind}>
              <button
                type="button"
                className={`library-nav-btn ${isActive(libraryFilter, item.filter) ? "is-on" : ""}`}
                onClick={() => setLibraryFilter(item.filter)}
              >
                <NavIcon name={item.icon} />
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div
        className={`library-sidebar-section library-collections${draggingBookId || selectMode ? " is-drop-zone" : ""}`}
      >
        <h2 className="library-sidebar-title">{t("myCollections", locale)}</h2>
        {(draggingBookId || selectMode) && (
          <p className="library-drop-hint">
            {collections.length === 0
              ? locale === "ru"
                ? "Сначала создай коллекцию"
                : "Create a collection first"
              : selectedCount > 1
                ? t("dropBooksHere", locale)
                : t("dropBookHere", locale)}
          </p>
        )}
        <ul className="library-nav">
          {collections.map((collection) => {
            const filter: LibraryFilter = {
              kind: "collection",
              id: collection.id,
            };
            const count = collectionBookCount(books, collection.id);
            return (
              <li
                key={collection.id}
                data-collection-id={collection.id}
                className={`library-nav-collection${dropTargetCollectionId === collection.id ? " is-drop-target" : ""}`}
                title={t(selectedCount > 1 ? "dropBooksHere" : "dropBookHere", locale)}
              >
                <button
                  type="button"
                  className={`library-nav-btn ${isActive(libraryFilter, filter) ? "is-on" : ""}`}
                  onClick={() => setLibraryFilter(filter)}
                >
                  <NavIcon name="collection" />
                  <span className="library-nav-label">{collection.name}</span>
                  {count > 0 && <span className="library-nav-count">{count}</span>}
                </button>
                <button
                  type="button"
                  className="library-nav-remove"
                  title={t("deleteCollection", locale)}
                  onClick={() => {
                    if (
                      confirm(
                        locale === "ru"
                          ? `Удалить коллекцию «${collection.name}»?`
                          : `Delete collection “${collection.name}”?`,
                      )
                    ) {
                      void deleteCollection(collection.id);
                    }
                  }}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>

        {creating ? (
          <form className="library-new-collection" onSubmit={onCreate}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("collectionName", locale)}
              autoFocus
            />
            <div className="library-new-collection-actions">
              <button type="submit" className="btn-primary compact">
                {t("saveNote", locale)}
              </button>
              <button
                type="button"
                className="btn-ghost compact"
                onClick={() => {
                  setCreating(false);
                  setDraft("");
                }}
              >
                {t("close", locale)}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="library-new-collection-btn"
            onClick={() => setCreating(true)}
          >
            <span aria-hidden>+</span>
            {t("newCollection", locale)}
          </button>
        )}
      </div>
    </aside>
  );
}
