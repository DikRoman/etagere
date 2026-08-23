"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";
import { BrandMark } from "@/components/BrandMark";
import { UserAvatar } from "@/components/AccountLink";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { PasswordInput } from "@/components/PasswordInput";
import { SUPPORT_EMAIL } from "@/lib/site";
import { BillingPanel } from "@/components/BillingPanel";

export default function AccountPage() {
  const locale = useSettingsStore((s) => s.locale);
  const ready = useAuthStore((s) => s.ready);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const changePassword = useAuthStore((s) => s.changePassword);
  const router = useRouter();

  const [name, setName] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  useEffect(() => {
    if (user) {
      setName(
        (user.name as string) ||
          (user.email as string)?.split("@")[0] ||
          "",
      );
    }
  }, [user]);

  if (!ready || !user) {
    return (
      <div className="auth-page">
        <p className="muted">{locale === "ru" ? "Загрузка…" : "Loading…"}</p>
      </div>
    );
  }

  async function onSaveName(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      await updateProfile({ name });
      setMsg(t("profileSaved", locale));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      if (password !== passwordConfirm) {
            setErr(t("passwordsMismatch", locale));
            setBusy(false);
            return;
      }
      await changePassword({ oldPassword, password, passwordConfirm });
      setOldPassword("");
      setPassword("");
      setPasswordConfirm("");
      setMsg(t("passwordChanged", locale));
    } catch (e) {
      const text = e instanceof Error ? e.message : "Error";
      setErr(
        text === "PASSWORDS_MISMATCH" ? t("passwordsMismatch", locale) : text,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="account-page account-page--cabinet">
      <header className="account-header">
        <BrandMark />
        <div className="shelf-actions">
          <Link href="/" className="btn-ghost">
            {t("goToLibrary", locale)}
          </Link>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              logout();
              router.push("/");
            }}
          >
            {t("logout", locale)}
          </button>
        </div>
      </header>

      <main className="account-main">
        <section className="account-card">
          <div className="account-identity">
            <UserAvatar user={user} size="lg" editable />
            <div>
              <h1>{t("account", locale)}</h1>
              <p className="muted">{user.email as string}</p>
              <p className="muted tiny">{t("photoHint", locale)}</p>
            </div>
          </div>
          {(msg || err) && (
            <p className={err ? "auth-error" : "drive-hint"}>{err || msg}</p>
          )}
          <form className="account-form" onSubmit={onSaveName}>
            <label>
              {t("name", locale)}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </label>
            <button type="submit" className="btn-primary" disabled={busy}>
              {t("saveProfile", locale)}
            </button>
          </form>
        </section>

        <section className="account-card">
          <h2>{t("appearance", locale)}</h2>
          <div className="account-settings-row">
            <ThemeSwitcher />
            <LanguageSwitcher />
          </div>
        </section>

        <section className="account-card">
          <h2>{t("security", locale)}</h2>
          <form className="account-form" onSubmit={onChangePassword}>
            <label>
              {t("currentPassword", locale)}
              <PasswordInput
                value={oldPassword}
                onChange={setOldPassword}
                autoComplete="current-password"
                required
              />
            </label>
            <label>
              {t("newPassword", locale)}
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
            <button type="submit" className="btn-primary" disabled={busy}>
              {t("changePasswordBtn", locale)}
            </button>
          </form>
        </section>

        <Suspense
          fallback={
            <section className="account-card">
              <h2>{t("subscription", locale)}</h2>
              <p className="muted tiny">…</p>
            </section>
          }
        >
          <BillingPanel />
        </Suspense>

        <p className="account-support muted tiny">
          {t("support", locale)}:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </p>
      </main>
    </div>
  );
}
