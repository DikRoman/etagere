"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useState } from "react";
import { useSettingsStore } from "@/store/settings";
import { useAuthStore } from "@/store/auth";
import { t } from "@/lib/i18n";
import { BrandMark } from "./BrandMark";
import { SUPPORT_EMAIL } from "@/lib/site";

export function SiteFooter() {
  const pathname = usePathname();
  const locale = useSettingsStore((s) => s.locale);
  const user = useAuthStore((s) => s.user);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const ru = locale === "ru";

  if (pathname?.startsWith("/reader")) return null;
  if (user && (pathname === "/" || pathname === "" || pathname === "/vocab")) {
    return null;
  }

  const onSignup = async (e: FormEvent) => {
    e.preventDefault();
    const v = email.trim();
    if (!v || !v.includes("@")) {
      setNote(ru ? "Введите корректный email" : "Enter a valid email");
      return;
    }
    setNote(null);
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: v, locale }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        setNote(data.error || (ru ? "Не удалось подписаться" : "Subscribe failed"));
        return;
      }
      setNote(
        data.message ||
          (ru
            ? "Письмо с подтверждением отправлено — проверьте почту."
            : "Confirmation email sent — check your inbox."),
      );
      setEmail("");
    } catch {
      setNote(ru ? "Ошибка сети" : "Network error");
    }
  };

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <BrandMark size="nav" withMark />
          <p>{t("tagline", locale)}</p>
        </div>

        <div className="site-footer-grid">
          <section>
            <h2>{ru ? "О нас" : "About"}</h2>
            <ul>
              <li>
                <Link href="/pricing">{t("pricing", locale)}</Link>
              </li>
              <li>
                <Link href="/">{ru ? "Полка" : "Shelf"}</Link>
              </li>
              <li>
                <span>{ru ? "PDF и EPUB" : "PDF & EPUB"}</span>
              </li>
              <li>
                <Link href="/privacy">{t("privacy", locale)}</Link>
              </li>
              <li>
                <Link href="/terms">{t("terms", locale)}</Link>
              </li>
              <li>
                <a href={`mailto:${SUPPORT_EMAIL}`}>
                  {ru ? "Поддержка" : "Support"} · {SUPPORT_EMAIL}
                </a>
              </li>
            </ul>
          </section>

          <section>
            <h2>{ru ? "Почему Étagère" : "Why Étagère"}</h2>
            <ul>
              <li>
                <span>{ru ? "Книги на устройстве" : "Books on your device"}</span>
              </li>
              <li>
                <span>{ru ? "Книги со своего диска" : "Books from your own disk"}</span>
              </li>
              <li>
                <span>
                  {ru ? "7 дней бесплатно, затем 100 ₽/мес" : "7 days free, then 100 ₽/mo"}
                </span>
              </li>
            </ul>
          </section>

          <section>
            <h2>{ru ? "Личный кабинет" : "My account"}</h2>
            <ul>
              <li>
                <Link href="/">{t("myLibrary", locale)}</Link>
              </li>
              <li>
                <Link href={user ? "/account" : "/login"}>
                  {user ? t("account", locale) : t("login", locale)}
                </Link>
              </li>
              {user && (
                <li>
                  <Link href="/vocab">{t("wordLookup", locale)}</Link>
                </li>
              )}
              {!user && (
                <li>
                  <Link href="/register">{t("register", locale)}</Link>
                </li>
              )}
              <li>
                <Link href="/pricing">{t("subscription", locale)}</Link>
              </li>
            </ul>
          </section>

          <section>
            <h2>{ru ? "Рассылка" : "Email signup"}</h2>
            <p className="site-footer-signup-hint">
              {ru
                ? "Новости продукта и обновления — без спама."
                : "Product news and updates — no spam."}
            </p>
            <form className="site-footer-signup" onSubmit={onSignup}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={
                  ru ? "Введите ваш e-mail" : "Please enter your e-mail"
                }
                aria-label="Email"
              />
              <button type="submit" aria-label={ru ? "Подписаться" : "Subscribe"}>
                →
              </button>
            </form>
            {note && <p className="site-footer-note">{note}</p>}
          </section>
        </div>

        <p className="site-footer-copy">
          © {new Date().getFullYear()} Étagère · Этажер
        </p>
      </div>
    </footer>
  );
}
