"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSettingsStore } from "@/store/settings";
import { BrandMark } from "@/components/BrandMark";

function NewsletterConfirmContent() {
  const locale = useSettingsStore((s) => s.locale);
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const ru = locale === "ru";
  const [state, setState] = useState<"loading" | "ok" | "error">(
    token ? "loading" : "error",
  );

  useEffect(() => {
    if (!token) return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(
          `/api/newsletter/confirm?token=${encodeURIComponent(token)}`,
        );
        if (!res.ok) throw new Error("bad");
        if (alive) setState("ok");
      } catch {
        if (alive) setState("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <BrandMark />
        <h1>{ru ? "Подписка на рассылку" : "Newsletter"}</h1>
        {state === "loading" && (
          <p className="muted">{ru ? "Подтверждаем…" : "Confirming…"}</p>
        )}
        {state === "ok" && (
          <>
            <p className="muted">
              {ru
                ? "Подписка подтверждена. Спасибо!"
                : "Subscription confirmed. Thank you!"}
            </p>
            <Link href="/" className="btn-primary">
              {ru ? "На полку" : "Back to shelf"}
            </Link>
          </>
        )}
        {state === "error" && (
          <>
            <p className="auth-error">
              {ru ? "Ссылка недействительна." : "Invalid link."}
            </p>
            <Link href="/" className="btn-ghost">
              {ru ? "На главную" : "Home"}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function NewsletterConfirmPage() {
  return (
    <Suspense fallback={<div className="auth-page"><div className="auth-card"><p className="muted">…</p></div></div>}>
      <NewsletterConfirmContent />
    </Suspense>
  );
}
