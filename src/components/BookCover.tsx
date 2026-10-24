"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import type { BookMeta } from "@/lib/types";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";
import { useLibraryStore } from "@/store/library";

const LONG_PRESS_MS = 480;
const DRAG_PX = 12;

function collectionIdAtPoint(x: number, y: number): string | null {
  const nodes = document.elementsFromPoint(x, y);
  for (const node of nodes) {
    if (!(node instanceof Element)) continue;
    if (node.closest(".book-drag-ghost")) continue;
    const id = node.closest<HTMLElement>("[data-collection-id]")?.dataset
      .collectionId;
    if (id) return id;
  }
  return null;
}

function CoverArt({ book }: { book: BookMeta }) {
  const [broken, setBroken] = useState(false);
  const src = !broken && book.coverDataUrl ? book.coverDataUrl : "";

  useEffect(() => {
    setBroken(false);
  }, [book.id, book.coverDataUrl]);

  useEffect(() => {
    if (!broken || book.missingLocalFile) return;
    void useLibraryStore.getState().restoreCover(book.id);
  }, [broken, book.id, book.missingLocalFile]);

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className="cover-img"
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onError={() => setBroken(true)}
      />
    );
  }
  const hue = (book.title.charCodeAt(0) * 37) % 360;
  return (
    <div
      className="cover-fallback"
      style={{
        background: `linear-gradient(155deg, hsl(${hue} 28% 28%), hsl(${(hue + 40) % 360} 35% 18%))`,
      }}
    >
      <span>{book.title.slice(0, 48)}</span>
    </div>
  );
}

type BookCoverProps = {
  book: BookMeta;
  index: number;
  part?: "cover" | "details";
};

export function BookCover({ book, index, part = "cover" }: BookCoverProps) {
  const locale = useSettingsStore((s) => s.locale);
  const removeBook = useLibraryStore((s) => s.removeBook);
  const collections = useLibraryStore((s) => s.collections);
  const libraryFilter = useLibraryStore((s) => s.libraryFilter);
  const toggleBookCollection = useLibraryStore((s) => s.toggleBookCollection);
  const setReadingStatus = useLibraryStore((s) => s.setReadingStatus);
  const downloadBookFromCloud = useLibraryStore((s) => s.downloadBookFromCloud);
  const refreshCover = useLibraryStore((s) => s.refreshCover);
  const draggingBookId = useLibraryStore((s) => s.draggingBookId);
  const selectMode = useLibraryStore((s) => s.selectMode);
  const selected = useLibraryStore((s) => s.selectedBookIds.includes(book.id));
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; count: number } | null>(
    null,
  );
  const [pressing, setPressing] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const draggedRef = useRef(false);
  const enteredSelectRef = useRef(false);
  const longTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragIdsRef = useRef<string[]>([book.id]);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);
  const progress = Math.min(
    100,
    Math.round(((book.lastPage || 1) / Math.max(1, book.pageCount)) * 100),
  );

  const animStyle = {
    animationDelay: `${Math.min(index, 12) * 45}ms`,
    ["--jiggle-delay" as string]: `${(index % 6) * 38}ms`,
  };

  function clearLongPress() {
    if (longTimerRef.current != null) {
      clearTimeout(longTimerRef.current);
      longTimerRef.current = null;
    }
  }

  function onCoverPointerDown(e: ReactPointerEvent<HTMLElement>) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".book-delete, .book-menu-btn, .book-menu")) return;

    const node = e.currentTarget;
    const alreadySelecting = useLibraryStore.getState().selectMode;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
    };
    draggedRef.current = false;
    enteredSelectRef.current = false;
    dragIdsRef.current = [book.id];
    setPressing(true);

    if (!alreadySelecting) {
      longTimerRef.current = setTimeout(() => {
        longTimerRef.current = null;
        const drag = dragRef.current;
        if (!drag || drag.active) return;
        enteredSelectRef.current = true;
        setPressing(false);
        useLibraryStore.getState().enterSelectMode(book.id);
        try {
          navigator.vibrate?.(15);
        } catch {
          /* ignore */
        }
      }, LONG_PRESS_MS);
    }

    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || ev.pointerId !== drag.pointerId) return;
      const dist = Math.hypot(ev.clientX - drag.startX, ev.clientY - drag.startY);
      if (!drag.active && dist > DRAG_PX) {
        clearLongPress();
        drag.active = true;
        draggedRef.current = true;
        setPressing(false);
        try {
          node.setPointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
        const store = useLibraryStore.getState();
        if (store.selectMode && !store.selectedBookIds.includes(book.id)) {
          store.toggleBookSelected(book.id);
        }
        const ids = store.selectMode
          ? Array.from(new Set([book.id, ...store.selectedBookIds]))
          : [book.id];
        dragIdsRef.current = ids;
        store.setDraggingBookId(book.id);
        document.body.classList.add("is-dragging-book");
        setGhost({ x: ev.clientX, y: ev.clientY, count: ids.length });
      }
      if (!drag.active) return;
      if (ev.cancelable) ev.preventDefault();
      setGhost((g) => ({
        x: ev.clientX,
        y: ev.clientY,
        count: g?.count ?? dragIdsRef.current.length,
      }));
      useLibraryStore
        .getState()
        .setDropTargetCollectionId(collectionIdAtPoint(ev.clientX, ev.clientY));
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.classList.remove("is-dragging-book");
      clearLongPress();
      setPressing(false);
      try {
        if (node.hasPointerCapture(e.pointerId)) {
          node.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* already released */
      }

      const drag = dragRef.current;
      dragRef.current = null;
      setGhost(null);

      const store = useLibraryStore.getState();
      if (drag?.active) {
        const over = collectionIdAtPoint(ev.clientX, ev.clientY);
        if (over) void store.addBooksToCollection(dragIdsRef.current, over);
      }
      store.setDraggingBookId(null);
      store.setDropTargetCollectionId(null);
      window.setTimeout(() => {
        draggedRef.current = false;
        enteredSelectRef.current = false;
      }, 50);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (menuBtnRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const onCtx = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) e.preventDefault();
    };
    // After the opening right-click, otherwise that same event closes the menu.
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("pointerdown", onDoc);
    }, 0);
    document.addEventListener("keydown", onKey);
    document.addEventListener("contextmenu", onCtx);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("contextmenu", onCtx);
    };
  }, [menuOpen]);

  useEffect(() => () => clearLongPress(), []);

  function openMenuAt(clientX: number, clientY: number) {
    const width = 248;
    const approxH = 320;
    const left = Math.max(8, Math.min(clientX, window.innerWidth - width - 8));
    const top =
      clientY + approxH > window.innerHeight - 8
        ? Math.max(8, clientY - approxH)
        : clientY;
    setMenuPos({ top, left });
    setMenuOpen(true);
  }

  function openMenu(e: ReactMouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    openMenuAt(r.left, r.bottom + 8);
  }

  function onCoverContextMenu(e: ReactMouseEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    clearLongPress();
    setPressing(false);
    dragRef.current = null;
    openMenuAt(e.clientX, e.clientY);
  }

  const isNew = (book.lastPage || 1) <= 1 && progress < 2;
  const currentCollection =
    libraryFilter.kind === "collection"
      ? collections.find((c) => c.id === libraryFilter.id)
      : undefined;
  const inCurrentCollection = Boolean(
    currentCollection && book.collectionIds.includes(currentCollection.id),
  );
  const menu = menuOpen &&
    menuPos &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={menuRef}
        className="book-menu"
        role="menu"
        style={{ top: menuPos.top, left: menuPos.left }}
      >
        <button
          type="button"
          role="menuitem"
          className={book.readingStatus === "want" ? "is-on" : ""}
          onClick={() => {
            void setReadingStatus(
              book.id,
              book.readingStatus === "want" ? "none" : "want",
            );
            setMenuOpen(false);
          }}
        >
          <span className="book-menu-ico" aria-hidden>
            +
          </span>
          {book.readingStatus === "want"
            ? t("removeFromWant", locale)
            : t("addToWant", locale)}
        </button>
        {inCurrentCollection && currentCollection && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void toggleBookCollection(book.id, currentCollection.id);
              setMenuOpen(false);
            }}
          >
            <span className="book-menu-ico" aria-hidden>
              −
            </span>
            {`${t("removeFromCollection", locale)} «${currentCollection.name}»`}
          </button>
        )}
        <div className="book-menu-label">{t("inCollections", locale)}</div>
        <div className="book-menu-collections">
          {collections.length === 0 ? (
            <p className="book-collection-empty">
              {t("noCollectionsYet", locale)}
            </p>
          ) : (
            collections.map((c) => (
              <label key={c.id} className="book-collection-option">
                <input
                  type="checkbox"
                  checked={book.collectionIds.includes(c.id)}
                  onChange={() => void toggleBookCollection(book.id, c.id)}
                />
                <span>{c.name}</span>
              </label>
            ))
          )}
        </div>
        <button
          type="button"
          role="menuitem"
          className={book.readingStatus === "finished" ? "is-on" : ""}
          onClick={() => {
            void setReadingStatus(
              book.id,
              book.readingStatus === "finished" ? "none" : "finished",
            );
            setMenuOpen(false);
          }}
        >
          <span className="book-menu-ico" aria-hidden>
            ✓
          </span>
          {book.readingStatus === "finished"
            ? t("unmarkFinished", locale)
            : t("markFinished", locale)}
        </button>
        {!book.missingLocalFile && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              void refreshCover(book.id);
            }}
          >
            <span className="book-menu-ico" aria-hidden>
              ↻
            </span>
            {t("refreshCover", locale)}
          </button>
        )}
        {book.missingLocalFile &&
          (book.hasCloudFile || book.driveFileId || book.cloudFileId) && (
            <>
              <div className="book-menu-sep" />
              <button
                type="button"
                role="menuitem"
                disabled={cloudBusy}
                onClick={() => {
                  setCloudBusy(true);
                  void (async () => {
                    try {
                      const ok = await downloadBookFromCloud(book.id);
                      if (ok) setMenuOpen(false);
                      else alert(t("downloadFromCloudFailed", locale));
                    } catch {
                      alert(t("downloadFromCloudFailed", locale));
                    } finally {
                      setCloudBusy(false);
                    }
                  })();
                }}
              >
                <span className="book-menu-ico" aria-hidden>
                  ↓
                </span>
                {cloudBusy
                  ? t("downloadingFromCloud", locale)
                  : t("downloadFromCloud", locale)}
              </button>
            </>
          )}
        <div className="book-menu-sep" />
        <button
          type="button"
          role="menuitem"
          className="is-danger"
          onClick={() => {
            setMenuOpen(false);
            if (confirm(t("removeConfirm", locale))) {
              void removeBook(book.id);
            }
          }}
        >
          <span className="book-menu-ico" aria-hidden>
            ⌫
          </span>
          {t("deleteBook", locale)}
        </button>
      </div>,
      document.body,
    );

  if (part === "cover") {
    const coverClass = [
      "book-item book-item--cover",
      draggingBookId === book.id ? "is-dragging" : "",
      selectMode ? "is-jiggling" : "",
      selected ? "is-selected" : "",
      pressing ? "is-pressing" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <article
        className={coverClass}
        style={animStyle}
        onPointerDown={onCoverPointerDown}
        onContextMenu={onCoverContextMenu}
        onDragStart={(e) => e.preventDefault()}
      >
        <Link
          href={`/reader/${book.id}`}
          className="book-link"
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          onContextMenu={onCoverContextMenu}
          onClick={(e) => {
            if (draggedRef.current || enteredSelectRef.current || selectMode) {
              e.preventDefault();
              if (
                selectMode &&
                !draggedRef.current &&
                !enteredSelectRef.current
              ) {
                useLibraryStore.getState().toggleBookSelected(book.id);
              }
            }
          }}
        >
          <div className="book-3d">
            <div className="book-spine" aria-hidden />
            <div className="book-face">
              <CoverArt book={book} />
              <div className="progress-track" title={`${progress}%`}>
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
              {book.format === "epub" && <span className="format-badge">EPUB</span>}
              {book.readingStatus === "finished" && (
                <span className="format-badge format-badge--done">✓</span>
              )}
              {book.missingLocalFile &&
                !book.hasCloudFile &&
                !book.driveFileId &&
                !book.cloudFileId && (
                <span className="format-badge format-badge--cloud">
                  {locale === "ru" ? "нет файла" : "no file"}
                </span>
              )}
              {selectMode && (
                <span
                  className={`book-select-mark${selected ? " is-on" : ""}`}
                  aria-hidden
                >
                  {selected ? "✓" : ""}
                </span>
              )}
            </div>
          </div>
        </Link>
        {ghost &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              className={`book-drag-ghost${ghost.count > 1 ? " is-stack" : ""}`}
              style={{
                left: ghost.x,
                top: ghost.y,
                pointerEvents: "none",
              }}
              aria-hidden
            >
              {ghost.count > 1 && <span className="book-drag-ghost-back" />}
              <CoverArt book={book} />
              {ghost.count > 1 && (
                <span className="book-drag-count">{ghost.count}</span>
              )}
            </div>,
            document.body,
          )}
        {menu}
      </article>
    );
  }

  return (
    <article
      className="book-item book-item--details"
      style={animStyle}
      onContextMenu={onCoverContextMenu}
    >
      <div className="book-foot">
        <div className="book-copy">
          <p className="book-title">{book.title}</p>
          <p className="book-meta">
            {book.author ? `${book.author} · ` : ""}
            {isNew ? t("newBadge", locale) : `${progress}%`}
          </p>
        </div>
        <button
          ref={menuBtnRef}
          type="button"
          className="book-menu-btn"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={t("bookMenu", locale)}
          onClick={openMenu}
        >
          <svg viewBox="0 0 24 12" width="16" height="8" aria-hidden>
            <circle cx="4" cy="6" r="1.7" fill="currentColor" />
            <circle cx="12" cy="6" r="1.7" fill="currentColor" />
            <circle cx="20" cy="6" r="1.7" fill="currentColor" />
          </svg>
        </button>
      </div>
      {menu}
    </article>
  );
}
