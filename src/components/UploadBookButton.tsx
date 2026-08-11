"use client";

import { useRef, useState } from "react";
import { useLibraryStore } from "@/store/library";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";

export function UploadBookButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const addBookFile = useLibraryStore((s) => s.addBookFile);
  const locale = useSettingsStore((s) => s.locale);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    const ok =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf") ||
      file.name.toLowerCase().endsWith(".epub") ||
      file.type.includes("epub");
    if (!ok) return;
    setBusy(true);
    setStatus(t("uploading", locale));
    try {
      setStatus(t("extractingCover", locale));
      await addBookFile(file);
      setStatus(null);
    } catch (e) {
      console.error(e);
      setStatus(locale === "ru" ? "Ошибка загрузки" : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="upload-wrap">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf,application/epub+zip,.epub"
        hidden
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <button
        type="button"
        className="btn-primary"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? status ?? t("uploading", locale) : t("addBook", locale)}
      </button>
    </div>
  );
}
