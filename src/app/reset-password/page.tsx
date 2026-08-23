"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useAuthStore } from "@/store/auth";
import { useSettingsStore } from "@/store/settings";
import { BrandMark } from "@/components/BrandMark";

function ResetPasswordForm() {
  const locale = useSettingsStore((s) => s.locale);
  const confirmPasswordReset = useAuthStore((s) => s.confirmPasswordReset);
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token")?.trim() ?? "";
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ru = locale === "ru";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (password !== passwordConfirm) {
      setError(ru ? "Пароли не совпадают" : "Passwords do not match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await confirmPasswordReset(token, password, passwordConfirm);
      router.push("/login?reset=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <BrandMark />
          <p className="auth-error">
            {ru ? "Ссылка для сброса недействительна." : "Invalid reset link."}
          </p>
          <Link href="/forgot-password" className="btn-ghost">
            {ru ? "Запросить новую" : "Request a new one"}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <BrandMark />
        <h1>{ru ? "Новый пароль" : "New password"}</h1>
        <label>
          {ru ? "Пароль" : "Password"}
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          {ru ? "Повторите пароль" : "Confirm password"}
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
          />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" className="btn-primary" disabled={busy}>
          {ru ? "Сохранить пароль" : "Save password"}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="auth-page"><div className="auth-card"><p className="muted">…</p></div></div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
