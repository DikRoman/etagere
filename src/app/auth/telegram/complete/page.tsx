"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { RecordModel } from "pocketbase";
import { getPb } from "@/lib/pb";
import { useAuthStore } from "@/store/auth";
import { useSettingsStore } from "@/store/settings";

function parseTgAuthResult(): Record<string, string> | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash || "";
  if (!hash.includes("tgAuthResult=")) return null;
  try {
    let raw = hash.slice(hash.indexOf("tgAuthResult=") + "tgAuthResult=".length);
    raw = decodeURIComponent(raw.split("&")[0] || "");
    // Telegram uses URL-safe base64 sometimes
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const key of [
      "id",
      "first_name",
      "last_name",
      "username",
      "photo_url",
      "auth_date",
      "hash",
    ]) {
      if (parsed[key] !== undefined && parsed[key] !== null) {
        out[key] = String(parsed[key]);
      }
    }
    return out.id && out.hash ? out : null;
  } catch {
    return null;
  }
}

export default function TelegramAuthCompletePage() {
  const router = useRouter();
  const locale = useSettingsStore((s) => s.locale);
  const refreshSubscription = useAuthStore((s) => s.refreshSubscription);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 1) Hash fragment from oauth.telegram.org (most common)
        const fromHash = parseTgAuthResult();
        if (fromHash) {
          window.history.replaceState({}, "", window.location.pathname);
          const res = await fetch("/api/auth/telegram/callback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fromHash),
          });
          const data = (await res.json().catch(() => ({}))) as {
            token?: string;
            record?: RecordModel;
            error?: string;
          };
          if (!res.ok || !data.token || !data.record) {
            throw new Error(data.error || "OAUTH_FAILED");
          }
          await finish(data.token, data.record);
          return;
        }

        // 2) Cookie handoff from GET callback with query params
        const res = await fetch("/api/auth/telegram/session", {
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
        await finish(data.token, data.record);
      } catch {
        if (!cancelled) {
          setError(true);
          router.replace("/login?oauth_error=OAUTH_FAILED");
        }
      }

      async function finish(token: string, record: RecordModel) {
        const pb = getPb();
        pb.authStore.save(token, record);
        useAuthStore.setState({ user: record, error: null });
        try {
          await fetch("/api/billing/ensure-free", {
            method: "POST",
            headers: { Authorization: token },
          });
        } catch {
          /* ignore */
        }
        await refreshSubscription();
        if (!cancelled) router.replace("/");
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
            ? "Не удалось войти через Telegram…"
            : "Could not finish Telegram sign-in…"
          : ru
            ? "Входим через Telegram…"
            : "Signing in with Telegram…"}
      </p>
    </main>
  );
}
