"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/auth";
import { useLibraryStore } from "@/store/library";
import { runFullSync } from "@/lib/sync/library-sync";
import { syncVocab } from "@/lib/sync/vocab-sync";
import {
  clearLegacyDriveSession,
  refreshCloudSessions,
} from "@/lib/cloud/session";
import { keepDriveAlive } from "@/lib/storage/drive";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const hydrate = useAuthStore((s) => s.hydrate);
  const keepAlive = useAuthStore((s) => s.keepAlive);
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const libraryHydrate = useLibraryStore((s) => s.hydrate);

  useEffect(() => {
    // The old Google Drive token cannot be renewed. Drop it once so the UI
    // shows Drive as disconnected instead of silently failing every request.
    clearLegacyDriveSession();
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const ping = () => {
      void keepAlive();
      void refreshCloudSessions();
      void keepDriveAlive();
    };
    ping();
    const id = window.setInterval(ping, 5 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };
    window.addEventListener("online", ping);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", ping);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [keepAlive]);

  useEffect(() => {
    if (!ready || !user) return;
    let cancelled = false;
    void (async () => {
      await refreshCloudSessions();
      await keepDriveAlive();
      await runFullSync();
      // Vocabulary is small and independent of the shelf; sync it after.
      await syncVocab();
      if (!cancelled) await libraryHydrate();
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, user?.id, libraryHydrate]);

  return <>{children}</>;
}
