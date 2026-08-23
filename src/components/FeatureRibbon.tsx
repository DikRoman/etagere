"use client";

import { useSettingsStore } from "@/store/settings";
import type { Locale } from "@/lib/types";

type Feature = {
  id: string;
  title: { ru: string; en: string };
  blurb: { ru: string; en: string };
  visual: "pdf" | "mark" | "pen" | "drive" | "offline" | "theme" | "ai" | "search";
};

const FEATURES: Feature[] = [
  {
    id: "pdf",
    title: { ru: "PDF и EPUB", en: "PDF & EPUB" },
    blurb: { ru: "Читай оба формата на одной полке", en: "Both formats on one shelf" },
    visual: "pdf",
  },
  {
    id: "mark",
    title: { ru: "Закладки", en: "Bookmarks" },
    blurb: { ru: "Возвращайся к важным страницам", en: "Jump back to key pages" },
    visual: "mark",
  },
  {
    id: "pen",
    title: { ru: "Карандаш и выделения", en: "Pen & highlights" },
    blurb: { ru: "Рисуй и отмечай прямо в книге", en: "Draw and mark in the book" },
    visual: "pen",
  },
  {
    id: "drive",
    title: { ru: "Свой диск", en: "Your disk" },
    blurb: {
      ru: "Google Drive, Яндекс, Dropbox, OneDrive",
      en: "Google Drive, Yandex, Dropbox, OneDrive",
    },
    visual: "drive",
  },
  {
    id: "offline",
    title: { ru: "Офлайн", en: "Offline" },
    blurb: { ru: "Книги остаются у тебя локально", en: "Books stay on your device" },
    visual: "offline",
  },
  {
    id: "theme",
    title: { ru: "Темы чтения", en: "Reading themes" },
    blurb: { ru: "День, бумага или ночь", en: "Day, paper, or night" },
    visual: "theme",
  },
  {
    id: "ai",
    title: { ru: "ИИ-помощник", en: "AI helper" },
    blurb: { ru: "Перевод и чат по тексту", en: "Translate and chat about the text" },
    visual: "ai",
  },
  {
    id: "search",
    title: { ru: "Поиск в книге", en: "In-book search" },
    blurb: { ru: "Найди фразу за секунды", en: "Find a phrase in seconds" },
    visual: "search",
  },
];

function FeatureVisual({ kind }: { kind: Feature["visual"] }) {
  switch (kind) {
    case "pdf":
      return (
        <svg viewBox="0 0 88 64" className="feat-svg" aria-hidden>
          <rect x="8" y="10" width="28" height="40" rx="3" fill="currentColor" opacity="0.9" />
          <rect x="14" y="16" width="16" height="2.5" rx="1" fill="var(--paper)" opacity="0.7" />
          <rect x="14" y="22" width="12" height="2" rx="1" fill="var(--paper)" opacity="0.45" />
          <rect x="42" y="14" width="30" height="36" rx="3" fill="#245bdb" opacity="0.9" />
          <text x="49" y="36" fontSize="9" fill="#f3f5f8" fontFamily="system-ui">EPUB</text>
        </svg>
      );
    case "mark":
      return (
        <svg viewBox="0 0 88 64" className="feat-svg" aria-hidden>
          <rect x="22" y="8" width="36" height="48" rx="3" fill="currentColor" opacity="0.15" />
          <path d="M48 8v28l-8-5-8 5V8h16z" fill="#245bdb" />
          <rect x="28" y="14" width="14" height="2" rx="1" fill="currentColor" opacity="0.35" />
        </svg>
      );
    case "pen":
      return (
        <svg viewBox="0 0 88 64" className="feat-svg" aria-hidden>
          <rect x="12" y="12" width="40" height="40" rx="3" fill="currentColor" opacity="0.12" />
          <path
            d="M18 42c8-10 14-14 22-16"
            stroke="#245bdb"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          <path d="M58 14l12 12-22 22H36V36L58 14z" fill="currentColor" opacity="0.85" />
          <path d="M58 14l6 6" stroke="var(--paper)" strokeWidth="1.5" />
        </svg>
      );
    case "drive":
      return (
        <svg viewBox="0 0 88 64" className="feat-svg" aria-hidden>
          <path d="M28 44L44 16l16 28H28z" fill="#245bdb" opacity="0.9" />
          <path d="M20 44h20l-10 12H10l10-12z" fill="currentColor" opacity="0.75" />
          <path d="M48 44h20l10 12H58l-10-12z" fill="currentColor" opacity="0.45" />
          <path
            d="M44 20v10m0 0l-4-4m4 4l4-4"
            stroke="var(--paper)"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      );
    case "offline":
      return (
        <svg viewBox="0 0 88 64" className="feat-svg" aria-hidden>
          <rect x="26" y="10" width="36" height="44" rx="5" fill="currentColor" opacity="0.85" />
          <rect x="30" y="16" width="28" height="28" rx="2" fill="var(--paper)" opacity="0.9" />
          <circle cx="44" cy="48" r="2.5" fill="var(--paper)" opacity="0.8" />
          <path
            d="M38 26h12M38 32h8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.45"
          />
        </svg>
      );
    case "theme":
      return (
        <svg viewBox="0 0 88 64" className="feat-svg" aria-hidden>
          <circle cx="28" cy="32" r="14" fill="#f0e6d4" stroke="currentColor" strokeWidth="1.5" opacity="0.95" />
          <circle cx="28" cy="32" r="6" fill="#e8b84a" opacity="0.8" />
          <circle cx="60" cy="32" r="14" fill="#1c2430" />
          <path d="M60 22a10 10 0 0 0 0 20 8 8 0 0 1 0-20z" fill="#8bbcff" opacity="0.7" />
        </svg>
      );
    case "ai":
      return (
        <svg viewBox="0 0 88 64" className="feat-svg" aria-hidden>
          <rect x="14" y="18" width="36" height="22" rx="10" fill="currentColor" opacity="0.15" />
          <rect x="38" y="28" width="36" height="22" rx="10" fill="#245bdb" opacity="0.9" />
          <circle cx="48" cy="39" r="2" fill="#f3f5f8" />
          <circle cx="56" cy="39" r="2" fill="#f3f5f8" />
          <circle cx="64" cy="39" r="2" fill="#f3f5f8" />
        </svg>
      );
    case "search":
      return (
        <svg viewBox="0 0 88 64" className="feat-svg" aria-hidden>
          <rect x="10" y="20" width="52" height="24" rx="12" fill="currentColor" opacity="0.12" />
          <circle cx="28" cy="32" r="8" fill="none" stroke="currentColor" strokeWidth="3" />
          <path d="M34 38l8 8" stroke="#245bdb" strokeWidth="3" strokeLinecap="round" />
          <rect x="42" y="29" width="14" height="3" rx="1.5" fill="currentColor" opacity="0.35" />
        </svg>
      );
  }
}

function FeatureCard({ feature, locale }: { feature: Feature; locale: Locale }) {
  return (
    <article className="feat-card">
      <div className="feat-visual">
        <FeatureVisual kind={feature.visual} />
      </div>
      <h3>{feature.title[locale]}</h3>
      <p>{feature.blurb[locale]}</p>
    </article>
  );
}

export function FeatureRibbon() {
  const locale = useSettingsStore((s) => s.locale);
  const loop = [...FEATURES, ...FEATURES];

  return (
    <section className="feature-ribbon" aria-label={locale === "ru" ? "Возможности" : "Features"}>
      <div className="feature-ribbon-head">
        <h2>{locale === "ru" ? "Что умеет Этажер" : "What Étagère can do"}</h2>
        <p>
          {locale === "ru"
            ? "Пролистай ленту — коротко и наглядно"
            : "Scroll the ribbon — short and visual"}
        </p>
      </div>
      <div className="feature-ribbon-viewport">
        <div className="feature-ribbon-track">
          {loop.map((f, i) => (
            <FeatureCard key={`${f.id}-${i}`} feature={f} locale={locale} />
          ))}
        </div>
      </div>
    </section>
  );
}
