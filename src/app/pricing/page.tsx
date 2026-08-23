"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSettingsStore } from "@/store/settings";
import { useAuthStore } from "@/store/auth";
import { t } from "@/lib/i18n";
import { BrandMark } from "@/components/BrandMark";
import { AccountLink } from "@/components/AccountLink";

export default function PricingPage() {
  const locale = useSettingsStore((s) => s.locale);
  const user = useAuthStore((s) => s.user);
  const hasPro = useAuthStore((s) => s.hasPro);
  const subscription = useAuthStore((s) => s.subscription);
  const startYookassaCheckout = useAuthStore((s) => s.startYookassaCheckout);
  const ru = locale === "ru";
  const [payEnabled, setPayEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/billing/config")
      .then((r) => r.json())
      .then((data: { enabled?: boolean }) => setPayEnabled(Boolean(data.enabled)))
      .catch(() => setPayEnabled(false));
  }, []);

  const showPay =
    Boolean(user) &&
    payEnabled &&
    (!hasPro() ||
      subscription?.status === "trialing" ||
      subscription?.status === "past_due");

  return (
    <div className="account-page">
      <header className="account-header">
        <BrandMark />
        {user ? (
          <AccountLink />
        ) : (
          <Link href="/login" className="btn-ghost">
            {t("login", locale)}
          </Link>
        )}
      </header>

      <main className="pricing-main">
        <h1>{t("pricing", locale)}</h1>
        <p className="muted pricing-lead">
          {ru
            ? "Первые 7 дней бесплатно. Дальше — 100 ₽ в месяц через ЮKassa."
            : "First 7 days free. Then 100 ₽ per month via YooKassa."}
        </p>
        <div className="pricing-grid">
          <article className="price-card">
            <h2>{ru ? "Пробный период" : "Trial"}</h2>
            <p className="price">
              0 ₽<span>/{ru ? "7 дней" : "7 days"}</span>
            </p>
            <ul>
              <li>{ru ? "Полный доступ ко всем функциям" : "Full access to all features"}</li>
              <li>PDF / EPUB</li>
              <li>{ru ? "Без привязки карты на старте" : "No card required to start"}</li>
            </ul>
            <Link
              href={user ? "/account" : "/register"}
              className="btn-ghost"
            >
              {ru ? "Начать бесплатно" : "Start free"}
            </Link>
          </article>
          <article className={`price-card featured ${hasPro() ? "is-on" : ""}`}>
            <h2>{t("planPro", locale)}</h2>
            <p className="price">
              100 ₽<span>/{ru ? "мес" : "mo"}</span>
            </p>
            <ul>
              <li>{ru ? "После 7 дней пробного периода" : "After the 7-day trial"}</li>
              <li>{ru ? "Облачный синк и ИИ" : "Cloud sync and AI"}</li>
              <li>{ru ? "Отмена автопродления в любой момент" : "Cancel auto-renew anytime"}</li>
            </ul>
            {showPay ? (
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setErr(null);
                  try {
                    await startYookassaCheckout();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : "Error");
                    setBusy(false);
                  }
                }}
              >
                {t("payPro", locale)}
              </button>
            ) : (
              <Link
                href={user ? "/account" : "/register"}
                className="btn-primary"
              >
                {hasPro()
                  ? t("planActive", locale)
                  : user
                    ? ru
                      ? "Перейти в личный кабинет"
                      : "Go to account"
                    : ru
                      ? "Создать аккаунт"
                      : "Create an account"}
              </Link>
            )}
            {err && <p className="auth-error">{err}</p>}
            <p className="muted tiny">
              {payEnabled
                ? ru
                  ? "Оплата картой, СБП и SberPay на стороне ЮKassa. Чек — на почту."
                  : "Card, SBP and SberPay via YooKassa. Receipt goes to your email."
                : ru
                  ? "Живая оплата включится после договора с ЮKassa. Сейчас пробный период в кабинете."
                  : "Live payments start after the YooKassa contract. Use the trial in your account for now."}
            </p>
          </article>
        </div>
      </main>
    </div>
  );
}
