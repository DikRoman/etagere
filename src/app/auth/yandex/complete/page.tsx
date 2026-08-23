"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { RecordModel } from "pocketbase";
import { getPb } from "@/lib/pb";
import { useAuthStore } from "@/store/auth";
import { useSettingsStore } from "@/store/settings";

export default function YandexAuthCompletePage() {
  const router = useRouter();
  const locale = useSettingsStore((s) => s.locale);
  const refreshSubscription = useAuthStore((s) => s.refreshSubscription);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/yandex/session", {
          credentials: "same-origin",
        });
        const data = (await res.json().catch(() => ({}))) as {
          token?: string;
          record?: RecordModel;
          error?: string;
        };
        if (!res.ok || !data.token || !data.record) {
          throw new Error(data.error || "NO_SESSION");
        }
        const pb = getPb();
        pb.authStore.save(data.token, data.record);
        useAuthStore.setState({ user: data.record, error: null });
        try {
          await fetch("/api/billing/ensure-free", {
            method: "POST",
            headers: { Authorization: data.token },
          });
        } catch {
          /* ignore */
        }
        await refreshSubscription();
        if (!cancelled) router.replace("/");
      } catch {
        if (!cancelled) {
          setError(true);
          router.replace("/login?oauth_error=OAUTH_FAILED");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSubscription, router]);

  const ru = locale === "ru";
  return (
    <main className="auth-page">
      <p className="auth-muted">
        {error
          ? ru
            ? "Не удалось войти через Яндекс…"
            : "Could not finish Yandex sign-in…"
          : ru
            ? "Входим через Яндекс…"
            : "Signing in with Yandex…"}
      </p>
    </main>
  );
}
