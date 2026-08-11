"use client";

import Link from "next/link";
import { useSettingsStore } from "@/store/settings";
import { useAuthStore } from "@/store/auth";
import { t } from "@/lib/i18n";
import { BrandMark } from "@/components/BrandMark";

export default function PricingPage() {
  const locale = useSettingsStore((s) => s.locale);
  const user = useAuthStore((s) => s.user);
  const hasPro = useAuthStore((s) => s.hasPro);

  return (
    <div className="account-page">
      <header className="account-header">
        <BrandMark />
        <Link href={user ? "/account" : "/login"} className="btn-ghost">
          {user ? t("account", locale) : t("login", locale)}
        </Link>
      </header>

      <main className="pricing-main">
        <h1>{t("pricing", locale)}</h1>
        <div className="pricing-grid">
          <article className="price-card">
            <h2>{t("planFree", locale)}</h2>
            <p className="price">0 ₽</p>
            <ul>
              <li>PDF / EPUB локально</li>
              <li>Закладки, выделения, карандаш</li>
              <li>ИИ-заглушки с лимитом позже</li>
            </ul>
            <Link href="/" className="btn-ghost">
              {t("open", locale)}
            </Link>
          </article>
          <article className={`price-card featured ${hasPro() ? "is-on" : ""}`}>
            <h2>{t("planPro", locale)}</h2>
            <p className="price">
              399 ₽<span>/мес</span>
            </p>
            <ul>
              <li>Облачный синк (PocketBase)</li>
              <li>ИИ без жёстких лимитов</li>
              <li>Экспорт, приоритет фич</li>
            </ul>
            <Link
              href={user ? "/account" : "/register"}
              className="btn-primary"
            >
              {hasPro()
                ? t("planActive", locale)
                : locale === "ru"
                  ? "Перейти в кабинет"
                  : "Go to account"}
            </Link>
            <p className="muted tiny">
              {locale === "ru"
                ? "Оплата ЮKassa — следующий шаг; сейчас stub в кабинете."
                : "YooKassa next; stub activation in account for now."}
            </p>
          </article>
        </div>
      </main>
    </div>
  );
}
