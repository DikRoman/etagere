"use client";

import { useEffect, useState } from "react";
import {
  cancelSync,
  getSyncError,
  getSyncProgress,
  getSyncStatus,
  runFullSync,
  subscribeSync,
  type SyncProgress,
  type SyncStatus,
} from "@/lib/sync/library-sync";
import { refreshCloudSessions } from "@/lib/cloud/session";
import { ensureDriveToken, isDriveConnected } from "@/lib/storage/drive";
import { useAuthStore } from "@/store/auth";
import { useLibraryStore } from "@/store/library";
import { useSettingsStore } from "@/store/settings";

let lastHydratedDone = -1;
let hydrateTimer: number | null = null;

function scheduleHydrate(done: number, hydrate: () => Promise<void>) {
  if (done === lastHydratedDone) return;
  lastHydratedDone = done;
  if (hydrateTimer) window.clearTimeout(hydrateTimer);
  hydrateTimer = window.setTimeout(() => {
    hydrateTimer = null;
    void hydrate();
  }, 160);
}

function useSyncState() {
  const hydrate = useLibraryStore((s) => s.hydrate);
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus());
  const [error, setError] = useState(getSyncError());
  const [progress, setProgress] = useState<SyncProgress>(getSyncProgress());

  useEffect(
    () =>
      subscribeSync((s, msg, next) => {
        setStatus(s);
        setError(msg);
        setProgress(next ?? null);
        if (typeof next?.done === "number") {
          scheduleHydrate(next.done, hydrate);
        }
      }),
    [hydrate],
  );

  return { status, error, progress };
}

function syncLabel(
  status: SyncStatus,
  progress: SyncProgress,
  ru: boolean,
): string {
  if (status === "syncing") {
    if (progress && progress.total > 0) {
      const n = `${progress.done} ${ru ? "из" : "of"} ${progress.total}`;
      if (progress.phase === "recover" || progress.phase === "files") {
        return ru ? `Загрузка книг ${n}` : `Downloading books ${n}`;
      }
      return ru ? `Сверяю полку ${n}` : `Updating shelf ${n}`;
    }
    if (progress?.phase === "files" || progress?.phase === "recover") {
      return ru ? "Загрузка книг…" : "Downloading books…";
    }
    return ru ? "Синхронизация…" : "Syncing…";
  }
  if (status === "ok") return ru ? "Синхронизировано" : "Synced";
  if (status === "error") return ru ? "Ошибка sync" : "Sync error";
  return ru ? "Облачная полка" : "Cloud shelf";
}

export function SyncStatusLine() {
  const locale = useSettingsStore((s) => s.locale);
  const user = useAuthStore((s) => s.user);
  const hydrate = useLibraryStore((s) => s.hydrate);
  const { status, error, progress } = useSyncState();
  const [busy, setBusy] = useState(false);
  const ru = locale === "ru";

  if (!user) return null;

  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : status === "syncing"
        ? null
        : 0;

  return (
    <div className="library-sync">
      <div className="library-sync-line">
        <span className={`library-sync-dot is-${status}`} aria-hidden />
        <span className="library-sync-label" title={error || progress?.title || undefined}>
          {syncLabel(status, progress, ru)}
        </span>
        {status === "syncing" && (
          <button
            type="button"
            className="library-sync-btn"
            onClick={() => cancelSync()}
          >
            {ru ? "Отменить" : "Cancel"}
          </button>
        )}
        <button
          type="button"
          className="library-sync-btn"
          disabled={busy || status === "syncing"}
          onClick={() => {
            setBusy(true);
            void (async () => {
              try {
                await refreshCloudSessions();
                if (isDriveConnected()) {
                  await ensureDriveToken().catch(() => undefined);
                }
                await runFullSync();
                await hydrate();
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {ru ? "Обновить" : "Refresh"}
        </button>
      </div>
      {status === "syncing" && (
        <div
          className={`library-sync-track${pct === null ? " is-indeterminate" : ""}`}
          aria-hidden
        >
          <div
            className="library-sync-bar"
            style={pct === null ? undefined : { width: `${pct}%` }}
          />
        </div>
      )}
      {status === "syncing" && progress?.title ? (
        <p className="library-sync-book">{progress.title}</p>
      ) : null}
    </div>
  );
}
