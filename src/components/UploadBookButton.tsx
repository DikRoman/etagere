"use client";

import { useRef, useState } from "react";
import { useLibraryStore } from "@/store/library";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";

export function UploadBookButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const addPdf = useLibraryStore((s) => s.addPdf);
  const locale = useSettingsStore((s) => s.locale);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file || file.type !== "application/pdf") return;
    setBusy(true);
    setStatus(t("uploading", locale));
    try {
      setStatus(t("extractingCover", locale));
      await addPdf(file);
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
        accept="application/pdf"
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
