"use client";

import Link from "next/link";
import { FormEvent, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore, EmailNotVerifiedError } from "@/store/auth";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";
import { BrandMark } from "@/components/BrandMark";
import { OAuthButtons } from "@/components/OAuthButtons";

function LoginForm() {
  const locale = useSettingsStore((s) => s.locale);
  const login = useAuthStore((s) => s.login);
  const resendVerification = useAuthStore((s) => s.resendVerification);
  const error = useAuthStore((s) => s.error);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendNote, setResendNote] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const ru = locale === "ru";
  const verifiedBanner = searchParams.get("verified") === "1";
  const resetBanner = searchParams.get("reset") === "1";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResendNote(null);
    setUnverifiedEmail(null);
    try {
      await login(email, password);
      router.push("/");
    } catch (e) {
      if (e instanceof EmailNotVerifiedError) {
        setUnverifiedEmail(e.email);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    const target = unverifiedEmail || email.trim();
    if (!target) return;
    setResendBusy(true);
    setResendNote(null);
    try {
      await resendVerification(target);
      setResendNote(
        ru
          ? "Письмо с подтверждением отправлено повторно."
          : "Verification email sent again.",
      );
    } catch (err) {
      setResendNote(err instanceof Error ? err.message : "Error");
    } finally {
      setResendBusy(false);
    }
  }

  const showUnverified =
    unverifiedEmail || error === "EMAIL_NOT_VERIFIED";

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <BrandMark />
        <h1>{t("login", locale)}</h1>
        {verifiedBanner && (
          <p className="muted">
            {ru
              ? "Email подтверждён — войдите в личный кабинет."
              : "Email confirmed — sign in to continue."}
          </p>
        )}
        {resetBanner && (
          <p className="muted">
            {ru ? "Пароль обновлён — войдите с новым." : "Password updated — sign in."}
          </p>
        )}
        <label>
          {t("email", locale)}
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          {t("password", locale)}
          <input
            type="password"
            required
            minLength={8}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error &&
          error !== "EMAIL_NOT_VERIFIED" &&
          !error.startsWith("OAUTH_") && (
          <p className="auth-error">{error}</p>
        )}
        {showUnverified && (
          <div className="auth-notice">
            <p>
              {ru
                ? "Подтвердите email по ссылке из письма, затем войдите."
                : "Confirm your email via the link we sent, then sign in."}
            </p>
            <button
              type="button"
              className="btn-ghost"
              disabled={resendBusy}
              onClick={() => void onResend()}
            >
              {ru ? "Отправить письмо ещё раз" : "Resend verification email"}
            </button>
          </div>
        )}
        {resendNote && <p className="muted tiny">{resendNote}</p>}
        <button type="submit" className="btn-primary" disabled={busy}>
          {t("login", locale)}
        </button>
        <OAuthButtons />
        <p className="auth-switch">
          <Link href="/forgot-password">
            {ru ? "Забыли пароль?" : "Forgot password?"}
          </Link>
        </p>
        <p className="auth-switch">
          {t("noAccount", locale)}{" "}
          <Link href="/register">{t("register", locale)}</Link>
        </p>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="auth-page"><div className="auth-card"><p className="muted">…</p></div></div>}>
      <LoginForm />
    </Suspense>
  );
}
