"use client";

import {
  DragEvent,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLibraryStore } from "@/store/library";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";

function isBookFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type === "application/pdf" ||
    name.endsWith(".pdf") ||
    name.endsWith(".epub") ||
    file.type.includes("epub")
  );
}

function filesFromDataTransfer(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  return Array.from(dt.files || []).filter(isBookFile);
}

export function useBookUpload() {
  const addBookFile = useLibraryStore((s) => s.addBookFile);
  const locale = useSettingsStore((s) => s.locale);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const list = files.filter(isBookFile);
      if (!list.length) {
        setStatus(
          locale === "ru"
            ? "Нужен файл PDF или EPUB"
            : "Need a PDF or EPUB file",
        );
        return;
      }
      setBusy(true);
      try {
        for (let i = 0; i < list.length; i++) {
          const file = list[i]!;
          setStatus(
            list.length > 1
              ? locale === "ru"
                ? `Загрузка ${i + 1}/${list.length}…`
                : `Uploading ${i + 1}/${list.length}…`
              : t("extractingCover", locale),
          );
          await addBookFile(file);
        }
        setStatus(null);
      } catch (e) {
        console.error(e);
        setStatus(locale === "ru" ? "Ошибка загрузки" : "Upload failed");
      } finally {
        setBusy(false);
      }
    },
    [addBookFile, locale],
  );

  return { busy, status, uploadFiles, locale };
}

export function UploadBookButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { busy, status, uploadFiles, locale } = useBookUpload();
  const [over, setOver] = useState(false);
  const dragDepth = useRef(0);

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current += 1;
    setOver(true);
  };
  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setOver(false);
  };
  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setOver(false);
    void uploadFiles(filesFromDataTransfer(e.dataTransfer));
  };

  return (
    <div
      className={`upload-wrap ${over ? "is-dragover" : ""} ${busy ? "is-busy" : ""}`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf,application/epub+zip,.epub"
        hidden
        multiple
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          void uploadFiles(files);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      <button
        type="button"
        className="btn-primary"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy
          ? status ?? t("uploading", locale)
          : over
            ? locale === "ru"
              ? "Отпустите файл"
              : "Drop file"
            : t("addBook", locale)}
      </button>
    </div>
  );
}

/** Full-area drop target (shelf / account). */
export function BookDropZone({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const { busy, status, uploadFiles, locale } = useBookUpload();
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  if (!enabled) return <>{children}</>;

  return (
    <div
      className={`book-drop-zone ${over ? "is-dragover" : ""} ${busy ? "is-busy" : ""}`}
      onDragEnter={(e) => {
        e.preventDefault();
        if (document.body.classList.contains("is-dragging-book")) return;
        depth.current += 1;
        if (e.dataTransfer.types.includes("Files")) setOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (document.body.classList.contains("is-dragging-book")) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (document.body.classList.contains("is-dragging-book")) {
          e.dataTransfer.dropEffect = "none";
          return;
        }
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        if (document.body.classList.contains("is-dragging-book")) return;
        void uploadFiles(filesFromDataTransfer(e.dataTransfer));
      }}
    >
      {children}
      {(over || busy) && (
        <div className="book-drop-overlay" aria-live="polite">
          <div className="book-drop-card">
            <strong>
              {busy
                ? status ?? t("uploading", locale)
                : locale === "ru"
                  ? "Перетащите PDF или EPUB сюда"
                  : "Drop PDF or EPUB here"}
            </strong>
            {!busy && (
              <p>
                {locale === "ru"
                  ? "Можно несколько файлов сразу"
                  : "You can drop several files at once"}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
