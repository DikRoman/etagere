"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";
import { BrandMark } from "@/components/BrandMark";

export default function RegisterPage() {
  const locale = useSettingsStore((s) => s.locale);
  const register = useAuthStore((s) => s.register);
  const error = useAuthStore((s) => s.error);
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await register(email, password, name);
      router.push("/account");
    } catch {
      /* store */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <BrandMark />
        <h1>{t("register", locale)}</h1>
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
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" className="btn-primary" disabled={busy}>
          {t("register", locale)}
        </button>
        <p className="auth-switch">
          {t("hasAccount", locale)}{" "}
          <Link href="/login">{t("login", locale)}</Link>
        </p>
      </form>
    </div>
  );
}
