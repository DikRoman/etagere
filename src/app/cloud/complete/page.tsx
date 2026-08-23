"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setAccessToken, type CloudProvider } from "@/lib/cloud/session";
import { useSettingsStore } from "@/store/settings";

export default function CloudCompletePage() {
  const router = useRouter();
  const locale = useSettingsStore((s) => s.locale);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const provider = new URLSearchParams(window.location.search).get(
        "p",
      ) as CloudProvider | null;
      if (
        provider !== "yandex" &&
        provider !== "dropbox" &&
        provider !== "onedrive"
      ) {
        router.replace("/");
        return;
      }
      try {
        const res = await fetch(`/api/cloud/${provider}/session`, {
          credentials: "same-origin",
        });
        const data = (await res.json().catch(() => ({}))) as {
          access_token?: string;
          expires_in?: number;
        };
        if (!res.ok || !data.access_token) throw new Error("NO_SESSION");
        setAccessToken(provider, data.access_token, data.expires_in);
        if (!cancelled) router.replace("/");
      } catch {
        if (!cancelled) {
          setError(true);
          router.replace("/?cloud_error=OAUTH_FAILED");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const ru = locale === "ru";
  return (
    <main className="auth-page">
      <p className="auth-muted">
        {error
          ? ru
            ? "Не удалось подключить диск…"
            : "Could not connect the disk…"
          : ru
            ? "Подключаю диск…"
            : "Connecting disk…"}
      </p>
    </main>
  );
}
