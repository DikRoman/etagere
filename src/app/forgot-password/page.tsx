"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { useSettingsStore } from "@/store/settings";
import { BrandMark } from "@/components/BrandMark";

export default function ForgotPasswordPage() {
  const locale = useSettingsStore((s) => s.locale);
  const requestPasswordReset = useAuthStore((s) => s.requestPasswordReset);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ru = locale === "ru";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <BrandMark />
        <h1>{ru ? "Сброс пароля" : "Reset password"}</h1>
        {sent ? (
          <p className="muted">
            {ru
              ? "Если аккаунт с таким email есть, мы отправили ссылку для сброса пароля."
              : "If an account exists for this email, we sent a reset link."}
          </p>
        ) : (
          <>
            <p className="muted">
              {ru
                ? "Введите email — пришлём ссылку для нового пароля."
                : "Enter your email and we will send a reset link."}
            </p>
            <label>
              Email
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" className="btn-primary" disabled={busy}>
              {ru ? "Отправить ссылку" : "Send link"}
            </button>
          </>
        )}
        <p className="auth-switch">
          <Link href="/login">{ru ? "Назад ко входу" : "Back to login"}</Link>
        </p>
      </form>
    </div>
  );
}
