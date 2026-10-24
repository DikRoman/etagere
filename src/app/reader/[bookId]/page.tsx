"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { getBook, hasLocalBookFile, saveBook, touchBookOpened } from "@/lib/storage/local";
import { ensureLocalBookFile } from "@/lib/sync/book-file";
import type { BookMeta } from "@/lib/types";
import { useReaderStore } from "@/store/reader";
import { useLibraryStore } from "@/store/library";
import { ReaderToolbar } from "@/components/reader/ReaderToolbar";
import { ReaderSidebar } from "@/components/reader/ReaderSidebar";
import { SelectionMenu } from "@/components/reader/SelectionMenu";
import { BookLoader } from "@/components/reader/BookLoader";
import { AiPanel } from "@/components/reader/AiPanel";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";
import { useReaderWheelZoom } from "@/lib/reader-zoom";

const PdfViewer = dynamic(
  () => import("@/components/reader/PdfViewer").then((m) => m.PdfViewer),
  { ssr: false, loading: () => <div className="pdf-loading">PDF…</div> },
);

const EpubViewer = dynamic(
  () => import("@/components/reader/EpubViewer").then((m) => m.EpubViewer),
  { ssr: false, loading: () => <div className="pdf-loading">EPUB…</div> },
);

export default function ReaderPage() {
  const params = useParams<{ bookId: string }>();
  const bookId = params.bookId;
  const locale = useSettingsStore((s) => s.locale);
  const theme = useSettingsStore((s) => s.theme);
  const tool = useReaderStore((s) => s.tool);
  const goToPage = useReaderStore((s) => s.goToPage);
  const page = useReaderStore((s) => s.page);
  const liveCount = useReaderStore((s) => s.pageCount);
  const spread = useSettingsStore((s) => s.spread);
  const setBook = useReaderStore((s) => s.setBook);
  const addBookFile = useLibraryStore((s) => s.addBookFile);
  const importFromDriveLink = useLibraryStore((s) => s.importFromDriveLink);
  const [book, setBookMeta] = useState<BookMeta | null>(null);
  const [missing, setMissing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useReaderWheelZoom();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, [contenteditable=true]")
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (book?.format === "epub") return;
      if (tool !== "select") return;
      const count = liveCount || book?.pageCount || 1;
      const step = spread ? 2 : 1;
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        void goToPage(Math.min(count, page + step));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        void goToPage(Math.max(1, page - step));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [book, tool, liveCount, spread, page, goToPage]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const meta = await getBook(bookId);
      if (cancelled) return;
      if (!meta) {
        setMissing(true);
        return;
      }
      const hasFile = await hasLocalBookFile(meta.id);
      if (cancelled) return;
      if (hasFile) {
        if (meta.missingLocalFile) {
          const fixed = { ...meta, missingLocalFile: false };
          await saveBook(fixed);
          if (cancelled) return;
          setBookMeta(fixed);
        } else {
          setBookMeta(meta);
        }
        await setBook(meta.id, meta.lastPage || 1, meta.pageCount);
        void touchBookOpened(meta.id);
        return;
      }

      setBookMeta(meta);
      setProgress({ loaded: 0, total: 0 });
      setDownloading(true);
      const restored = await ensureLocalBookFile(meta, (loaded, total) => {
        if (!cancelled) setProgress({ loaded, total });
      });
      if (cancelled) return;
      setDownloading(false);
      if (restored) {
        const fresh = await getBook(meta.id);
        setBookMeta(fresh ?? { ...meta, missingLocalFile: false });
        void useLibraryStore.getState().hydrate();
        // The download reads the real page count from the file; a book that
        // arrived as a card only had a placeholder.
        await setBook(
          meta.id,
          meta.lastPage || 1,
          fresh?.pageCount ?? meta.pageCount,
        );
        void touchBookOpened(meta.id);
        return;
      }

      if (!meta.missingLocalFile) {
        await saveBook({ ...meta, missingLocalFile: true });
      }
      setBookMeta({ ...meta, missingLocalFile: true });
      setMissing(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId, setBook]);

  async function restoreFromFile(file: File) {
    setDownloading(true);
    setRestoreError(null);
    try {
      await addBookFile(
        file,
        book?.driveFileId,
        bookId,
        book?.cloudProvider && book?.cloudFileId
          ? { provider: book.cloudProvider, fileId: book.cloudFileId }
          : undefined,
      );
      window.location.reload();
    } catch (e) {
      setRestoreError(
        e instanceof Error
          ? e.message
          : locale === "ru"
            ? "Не удалось загрузить файл"
            : "Could not load the file",
      );
      setDownloading(false);
    }
  }

  async function restoreFromDisk() {
    if (!book) return;
    setDownloading(true);
    setRestoreError(null);
    try {
      setProgress({ loaded: 0, total: 0 });
      const restored = await ensureLocalBookFile(book, (loaded, total) =>
        setProgress({ loaded, total }),
      );
      if (restored) {
        window.location.reload();
        return;
      }
      setRestoreError(
        locale === "ru"
          ? "Подключи диск на полке и попробуй ещё раз."
          : "Connect the disk on the shelf and try again.",
      );
    } catch (e) {
      setRestoreError(
        e instanceof Error
          ? e.message
          : locale === "ru"
            ? "Не удалось взять файл с диска"
            : "Could not load the file from disk",
      );
    } finally {
      setDownloading(false);
    }
  }

  async function restoreFromDrive() {
    if (!book?.driveFileId) return;
    setDownloading(true);
    setRestoreError(null);
    try {
      await importFromDriveLink(book.driveFileId);
      window.location.reload();
    } catch (e) {
      setRestoreError(
        e instanceof Error
          ? e.message
          : locale === "ru"
            ? "Не удалось взять файл с Drive"
            : "Could not fetch the Drive file",
      );
      setDownloading(false);
    }
  }

  if (downloading && !missing) {
    return (
      <BookLoader
        loaded={progress.loaded}
        // The shelf knows the file size even when the response does not say.
        total={progress.total || book?.sizeBytes || 0}
        title={book?.title}
        locale={locale}
      />
    );
  }

  if (missing) {
    return (
      <div className="reader-error">
        <p>
          <strong>{t("missingFileTitle", locale)}</strong>
        </p>
        <p>{book?.title}</p>
        <p>{t("missingFileBody", locale)}</p>
        <div className="reader-error-actions">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.epub,application/pdf,application/epub+zip"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void restoreFromFile(file);
            }}
          />
          <button
            type="button"
            className="btn-primary"
            disabled={downloading}
            onClick={() => fileRef.current?.click()}
          >
            {downloading ? "…" : t("missingFilePick", locale)}
          </button>
          {(book?.driveFileId || book?.cloudFileId || book?.hasCloudFile) && (
            <button
              type="button"
              className="btn-ghost"
              disabled={downloading}
              onClick={() => void restoreFromDisk()}
            >
              {t("missingFileRetry", locale)}
            </button>
          )}
          {book?.driveFileId && (
            <button
              type="button"
              className="btn-ghost"
              disabled={downloading}
              onClick={() => void restoreFromDrive()}
            >
              {t("missingFileDrive", locale)}
            </button>
          )}
          <Link href="/">{locale === "ru" ? "На полку" : "Back"}</Link>
        </div>
        {restoreError && <p className="drive-hint">{restoreError}</p>}
      </div>
    );
  }

  if (!book) {
    return (
      <div className="pdf-loading">
        {locale === "ru" ? "Открываю…" : "Opening…"}
      </div>
    );
  }

  return (
    <div
      className={`reader-shell theme-${theme}`}
    >
      <ReaderToolbar
        title={book.title}
        pageCount={book.pageCount}
        bookId={book.id}
        format={book.format}
      />
      <div className="reader-body">
        <main className="reader-main">
          {book.format === "epub" ? (
            <EpubViewer bookId={book.id} />
          ) : (
            <PdfViewer bookId={book.id} pageCount={book.pageCount} />
          )}
        </main>
        <ReaderSidebar bookTitle={book.title} />
      </div>
      <SelectionMenu />
      <AiPanel />
    </div>
  );
}
