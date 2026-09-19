"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";
import { BrandMark } from "@/components/BrandMark";
import { PasswordInput } from "@/components/PasswordInput";
import { OAuthButtons } from "@/components/OAuthButtons";

export default function RegisterPage() {
  const locale = useSettingsStore((s) => s.locale);
  const register = useAuthStore((s) => s.register);
  const error = useAuthStore((s) => s.error);
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== passwordConfirm) {
      setLocalError(t("passwordsMismatch", locale));
      return;
    }
    setLocalError(null);
    setBusy(true);
    try {
      await register(email, password, name);
      router.push(
        `/register/check-email?email=${encodeURIComponent(email.trim())}`,
      );
    } catch {
      /* store */
    } finally {
      setBusy(false);
    }
  }

  const displayError =
    localError ||
    (error?.startsWith("OAUTH_")
      ? null
      : error === "EMAIL_TAKEN"
        ? t("emailTaken", locale)
        : error === "PASSWORD_TOO_SHORT"
          ? t("passwordTooShort", locale)
          : error);

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <BrandMark />
        <h1>{t("register", locale)}</h1>
        <p className="muted tiny">
          {locale === "ru"
            ? "После регистрации пришлём письмо для подтверждения email."
            : "After sign-up we will email you a confirmation link."}
        </p>
        <label>
          {t("name", locale)}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
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
          <PasswordInput
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          {t("passwordConfirm", locale)}
          <PasswordInput
            value={passwordConfirm}
            onChange={setPasswordConfirm}
            autoComplete="new-password"
            required
          />
        </label>
        {displayError && <p className="auth-error">{displayError}</p>}
        <p className="auth-legal">
          {locale === "ru" ? "Регистрируясь, вы принимаете " : "By signing up you accept the "}
          <Link href="/terms">{t("terms", locale)}</Link>
          {locale === "ru" ? " и " : " and "}
          <Link href="/privacy">{t("privacy", locale)}</Link>.
        </p>
        <button type="submit" className="btn-primary" disabled={busy}>
          {t("register", locale)}
        </button>
        <OAuthButtons />
        <p className="auth-switch">
          {t("hasAccount", locale)}{" "}
          <Link href="/login">{t("login", locale)}</Link>
        </p>
      </form>
    </div>
  );
}
