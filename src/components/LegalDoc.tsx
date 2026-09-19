"use client";

import Link from "next/link";
import { BrandMark } from "./BrandMark";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";
import { SUPPORT_EMAIL } from "@/lib/site";

export function LegalDoc({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const locale = useSettingsStore((s) => s.locale);

  return (
    <div className="account-page legal-page">
      <header className="account-header">
        <BrandMark />
        <Link href="/" className="btn-ghost">
          {t("backToShelf", locale)}
        </Link>
      </header>
      <main className="legal-main">
        <h1>{title}</h1>
        {children}
        <p className="legal-contact">
          {locale === "ru" ? "Вопросы — " : "Questions — "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </p>
      </main>
    </div>
  );
}
