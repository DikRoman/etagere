"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  storedFilesStats,
  type StoredFilesStats,
} from "@/lib/storage/local";
import { useLibraryStore } from "@/store/library";
import { useSettingsStore } from "@/store/settings";

function formatBytes(n: number, ru: boolean): string {
  const mb = n / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} ${ru ? "ГБ" : "GB"}`;
  if (mb >= 1) return `${Math.round(mb)} ${ru ? "МБ" : "MB"}`;
  return `${Math.max(1, Math.round(n / 1024))} ${ru ? "КБ" : "KB"}`;
}

function booksRu(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "книга";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "книги";
  return "книг";
}

/** "файлы 1 книги", "файлы 5 книг": genitive after a count. */
function booksGenitiveRu(n: number): string {
  return n % 10 === 1 && n % 100 !== 11 ? "книги" : "книг";
}

function booksLabel(n: number, ru: boolean): string {
  return ru ? `${n} ${booksRu(n)}` : `${n} ${n === 1 ? "book" : "books"}`;
}

/**
 * "Clear memory": drops downloaded book files from this browser and keeps
 * the shelf — covers, progress, notes. Books that exist only in this
 * browser are never touched; see clearDownloadedBookFiles.
 */
export function StorageCleaner() {
  const locale = useSettingsStore((s) => s.locale);
  const books = useLibraryStore((s) => s.books);
  const clearBookFiles = useLibraryStore((s) => s.clearBookFiles);
  const [stats, setStats] = useState<StoredFilesStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tipAt, setTipAt] = useState<{ top: number; left: number } | null>(
    null,
  );
  const infoRef = useRef<HTMLButtonElement>(null);
  const tipId = useId();
  const infoOpen = tipAt !== null;

  // The sidebar sits under the main column in the stacking order, so a tip
  // nested inside it is painted over by the book covers. It is portalled to
  // <body> and placed against the icon instead.
  const showTip = () => {
    const r = infoRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(240, window.innerWidth - 32);
    setTipAt({
      top: r.bottom + 6,
      left: Math.max(16, Math.min(r.left - 6, window.innerWidth - width - 16)),
    });
  };
  const hideTip = () => setTipAt(null);
  const ru = locale === "ru";

  // Recount whenever the shelf changes — opening a book downloads its file.
  useEffect(() => {
    let cancelled = false;
    void storedFilesStats().then((next) => {
      if (!cancelled) setStats(next);
    });
    return () => {
      cancelled = true;
    };
  }, [books]);

  if (!stats) return null;
  const clearable = stats.count - stats.onlyHere;

  async function clear() {
    if (!stats || clearable < 1) return;
    const question = ru
      ? `Удалить из памяти браузера файлы ${clearable} ${booksGenitiveRu(clearable)}? Обложки, прогресс и заметки останутся, а книга скачается заново, когда вы её откроете.`
      : `Remove ${booksLabel(clearable, false)} from this browser's memory? Covers, progress and notes stay; a book downloads again when you open it.`;
    if (!confirm(question)) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await clearBookFiles();
      const freed = formatBytes(result.freedBytes, ru);
      let text = ru
        ? `Освобождено ${freed}: ${booksLabel(result.cleared, true)}.`
        : `Freed ${freed}: ${booksLabel(result.cleared, false)}.`;
      if (result.kept) {
        text += ru
          ? ` Не тронуто: ${booksLabel(result.kept, true)} — ${result.kept === 1 ? "она есть" : "они есть"} только в этом браузере.`
          : ` Kept ${booksLabel(result.kept, false)} that exist only in this browser.`;
      }
      setMessage(text);
      setStats(await storedFilesStats());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : ru ? "Не удалось очистить" : "Could not clear");
    } finally {
      setBusy(false);
    }
  }

  const info = ru
    ? "Удаляет из памяти браузера файлы книг. Обложки, названия, прогресс, закладки и заметки остаются. Книга скачается из облака заново, когда вы её откроете. Книги, которых нет ни на одном облачном диске, не удаляются — иначе их нельзя будет вернуть."
    : "Removes book files from this browser's memory. Covers, titles, progress, bookmarks and notes stay. A book downloads from the cloud again when you open it. Books that are on no cloud disk are kept — otherwise they could not be recovered.";

  return (
    <div className="storage-cleaner">
      <div className="storage-cleaner-line">
        <span className="storage-cleaner-label">
          {stats.count
            ? ru
              ? `В памяти: ${booksLabel(stats.count, true)} · ${formatBytes(stats.bytes, true)}`
              : `In memory: ${booksLabel(stats.count, false)} · ${formatBytes(stats.bytes, false)}`
            : ru
              ? "Файлов книг в памяти нет"
              : "No book files in memory"}
        </span>
        <button
          type="button"
          className="library-sync-btn"
          disabled={busy || clearable < 1}
          onClick={() => void clear()}
        >
          {busy
            ? ru
              ? "Очищаю…"
              : "Clearing…"
            : ru
              ? "Очистить память"
              : "Clear memory"}
        </button>
        <span
          className="storage-cleaner-info"
          onMouseEnter={showTip}
          onMouseLeave={hideTip}
        >
          <button
            ref={infoRef}
            type="button"
            className="storage-cleaner-i"
            aria-label={ru ? "Что это значит" : "What this does"}
            aria-describedby={infoOpen ? tipId : undefined}
            aria-expanded={infoOpen}
            onClick={() => (infoOpen ? hideTip() : showTip())}
            onBlur={hideTip}
          >
            i
          </button>
        </span>
        {tipAt &&
          createPortal(
            <span
              id={tipId}
              role="tooltip"
              className="storage-cleaner-tip"
              style={{ top: tipAt.top, left: tipAt.left }}
            >
              {info}
            </span>,
            document.body,
          )}
      </div>
      {stats.onlyHere > 0 && (
        <p className="storage-cleaner-note">
          {ru
            ? `${booksLabel(stats.onlyHere, true)} только в этом браузере — очистка ${stats.onlyHere === 1 ? "её" : "их"} не тронет.`
            : `${booksLabel(stats.onlyHere, false)} only in this browser — clearing leaves ${stats.onlyHere === 1 ? "it" : "them"}.`}
        </p>
      )}
      {message && <p className="storage-cleaner-note">{message}</p>}
    </div>
  );
}
