"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";
import { BrandMark } from "@/components/BrandMark";

export default function LoginPage() {
  const locale = useSettingsStore((s) => s.locale);
  const login = useAuthStore((s) => s.login);
  const error = useAuthStore((s) => s.error);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      router.push("/account");
    } catch {
      /* store has error */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <BrandMark />
        <h1>{t("login", locale)}</h1>
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
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" className="btn-primary" disabled={busy}>
          {t("login", locale)}
        </button>
        <p className="auth-switch">
          {t("noAccount", locale)}{" "}
          <Link href="/register">{t("register", locale)}</Link>
        </p>
        <p className="muted tiny">{t("pbHint", locale)}</p>
      </form>
    </div>
  );
}
