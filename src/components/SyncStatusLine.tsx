"use client";

import { useEffect, useState } from "react";
import {
  getSyncError,
  getSyncStatus,
  runFullSync,
  subscribeSync,
  type SyncStatus,
} from "@/lib/sync/library-sync";
import { useAuthStore } from "@/store/auth";
import { useLibraryStore } from "@/store/library";
import { useSettingsStore } from "@/store/settings";

export function SyncStatusLine() {
  const locale = useSettingsStore((s) => s.locale);
  const user = useAuthStore((s) => s.user);
  const hydrate = useLibraryStore((s) => s.hydrate);
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus());
  const [error, setError] = useState(getSyncError());
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeSync((s, msg) => {
    setStatus(s);
    setError(msg);
  }), []);

  if (!user) return null;

  const ru = locale === "ru";
  const label =
    status === "syncing"
      ? ru
        ? "Синхронизация…"
        : "Syncing…"
      : status === "ok"
        ? ru
          ? "Синхронизировано"
          : "Synced"
        : status === "error"
          ? ru
            ? "Ошибка sync"
            : "Sync error"
          : ru
            ? "Облачная полка"
            : "Cloud shelf";

  return (
    <div className="library-sync-line">
      <span className={`library-sync-dot is-${status}`} aria-hidden />
      <span className="library-sync-label" title={error || undefined}>
        {label}
      </span>
      <button
        type="button"
        className="library-sync-btn"
        disabled={busy || status === "syncing"}
        onClick={() => {
          setBusy(true);
          void runFullSync()
            .then(() => hydrate())
            .finally(() => setBusy(false));
        }}
      >
        {ru ? "Обновить" : "Refresh"}
      </button>
    </div>
  );
}
