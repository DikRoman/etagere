"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";
import { BrandMark } from "@/components/BrandMark";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

export default function AccountPage() {
  const locale = useSettingsStore((s) => s.locale);
  const ready = useAuthStore((s) => s.ready);
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const logout = useAuthStore((s) => s.logout);
  const hasPro = useAuthStore((s) => s.hasPro);
  const activateProStub = useAuthStore((s) => s.activateProStub);
  const hydrate = useAuthStore((s) => s.hydrate);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  if (!ready || !user) {
    return (
      <div className="auth-page">
        <p className="muted">{locale === "ru" ? "Загрузка…" : "Loading…"}</p>
      </div>
    );
  }

  const name =
    (user.name as string) || (user.email as string)?.split("@")[0] || "user";

  return (
    <div className="account-page">
      <header className="account-header">
        <BrandMark />
        <div className="shelf-actions">
          <ThemeSwitcher />
          <LanguageSwitcher />
          <Link href="/pricing" className="btn-ghost">
            {t("pricing", locale)}
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
        <h1>
          {t("welcome", locale)}, {name}
        </h1>
        <p className="muted">{user.email as string}</p>

        <section className="account-card">
          <h2>{t("subscription", locale)}</h2>
          <p>
            <strong>
              {hasPro() ? t("planPro", locale) : t("planFree", locale)}
            </strong>
            {subscription?.status
              ? ` · ${subscription.status}`
              : ` · ${t("planActive", locale)}`}
            {subscription?.expires_at
              ? ` · ${t("expires", locale)} ${new Date(subscription.expires_at).toLocaleDateString(locale === "ru" ? "ru" : "en")}`
              : ""}
          </p>
          {!hasPro() && (
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setMsg(null);
                try {
                  await activateProStub(1);
                  setMsg(
                    locale === "ru"
                      ? "Pro включён на месяц (заглушка). Для боя — ЮKassa."
                      : "Pro enabled for a month (stub). YooKassa comes next.",
                  );
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : "Error");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("activateProStub", locale)}
            </button>
          )}
          {msg && <p className="drive-hint">{msg}</p>}
        </section>

        <section className="account-card">
          <h2>{t("myLibrary", locale)}</h2>
          <p className="muted">{t("localLibrary", locale)}</p>
          <Link href="/" className="btn-ghost">
            ← {t("backToShelf", locale)}
          </Link>
        </section>
      </main>
    </div>
  );
}
