"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { useSettingsStore } from "@/store/settings";
import { BrandMark } from "@/components/BrandMark";

function VerifyEmailContent() {
  const locale = useSettingsStore((s) => s.locale);
  const confirmVerification = useAuthStore((s) => s.confirmVerification);
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
        await confirmVerification(token);
        if (alive) setState("ok");
      } catch {
        if (alive) setState("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, confirmVerification]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <BrandMark />
        <h1>{ru ? "Подтверждение email" : "Email verification"}</h1>
        {state === "loading" && (
          <p className="muted">{ru ? "Проверяем ссылку…" : "Verifying link…"}</p>
        )}
        {state === "ok" && (
          <>
            <p className="muted">
              {ru
                ? "Email подтверждён. Теперь можно войти."
                : "Email confirmed. You can sign in now."}
            </p>
            <Link href="/login?verified=1" className="btn-primary">
              {ru ? "Войти" : "Sign in"}
            </Link>
          </>
        )}
        {state === "error" && (
          <>
            <p className="auth-error">
              {ru
                ? "Ссылка недействительна или устарела."
                : "This link is invalid or expired."}
            </p>
            <Link href="/login" className="btn-ghost">
              {ru ? "На страницу входа" : "Back to login"}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="auth-page">
          <div className="auth-card">
            <p className="muted">…</p>
          </div>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
