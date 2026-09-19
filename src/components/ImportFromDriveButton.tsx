"use client";

import { FormEvent, useState } from "react";
import { useLibraryStore } from "@/store/library";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";
import { parseDriveFileId } from "@/lib/storage/drive";

export function ImportFromDriveButton() {
  const locale = useSettingsStore((s) => s.locale);
  const importFromDrive = useLibraryStore((s) => s.importFromDrive);
  const importFromDriveLink = useLibraryStore((s) => s.importFromDriveLink);
  const driveConnected = useLibraryStore((s) => s.driveConnected);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function runImport(fn: () => Promise<unknown>) {
    setBusy(true);
    setStatus(null);
    try {
      const result = await fn();
      if (result == null || (Array.isArray(result) && result.length === 0)) {
        setStatus(locale === "ru" ? "Импорт отменён." : "Import cancelled.");
        return;
      }
      const n = Array.isArray(result) ? result.length : 1;
      setStatus(
        n === 1
          ? locale === "ru"
            ? "Книга добавлена на полку."
            : "Book added to your shelf."
          : locale === "ru"
            ? `Добавлено книг: ${n}.`
            : `Added ${n} books.`,
      );
      setLink("");
    } catch (e) {
      console.error(e);
      setStatus(
        e instanceof Error
          ? e.message
          : locale === "ru"
            ? "Не удалось импортировать"
            : "Import failed",
      );
    } finally {
      setBusy(false);
    }
  }

  const onPick = () => void runImport(() => importFromDrive());

  const onLink = (e: FormEvent) => {
    e.preventDefault();
    const id = parseDriveFileId(link);
    if (!id) {
      setStatus(
        locale === "ru"
          ? "Вставь ссылку Google Drive или ID файла"
          : "Paste a Google Drive link or file ID",
      );
      return;
    }
    void runImport(() => importFromDriveLink(link));
  };

  return (
    <div className="drive-import">
      <button
        type="button"
        className={`btn-primary ${driveConnected ? "is-on" : ""}`}
        disabled={busy}
        onClick={onPick}
      >
        {busy ? t("driveImporting", locale) : t("driveImport", locale)}
      </button>
      <form className="drive-import-link" onSubmit={onLink}>
        <input
          type="text"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder={t("driveLinkPlaceholder", locale)}
          disabled={busy}
        />
        <button type="submit" className="btn-ghost" disabled={busy || !link.trim()}>
          {t("driveLinkOpen", locale)}
        </button>
      </form>
      {status && <p className="drive-hint">{status}</p>}
    </div>
  );
}
