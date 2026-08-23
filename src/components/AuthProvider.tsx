"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/auth";
import { useLibraryStore } from "@/store/library";
import { runFullSync } from "@/lib/sync/library-sync";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const hydrate = useAuthStore((s) => s.hydrate);
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const libraryHydrate = useLibraryStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!ready || !user) return;
    let cancelled = false;
    void (async () => {
      await runFullSync();
      if (!cancelled) await libraryHydrate();
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, user?.id, libraryHydrate]);

  return <>{children}</>;
}
