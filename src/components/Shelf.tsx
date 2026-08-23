"use client";

import { useEffect, useState } from "react";
import { useLibraryStore } from "@/store/library";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";
import { BrandMark } from "./BrandMark";
import { UploadBookButton, BookDropZone } from "./UploadBookButton";
import { CloudDisks } from "./CloudDisks";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { ShelfRecent, ShelfStats } from "./ShelfStats";
import { FeatureRibbon } from "./FeatureRibbon";
import { LibrarySidebar } from "./LibrarySidebar";
import { LibraryBooksGrid } from "./LibraryBooksGrid";
import { SelectionBar } from "./SelectionBar";
import { AccountLink } from "./AccountLink";
import { useAuthStore } from "@/store/auth";
import Link from "next/link";

export function Shelf() {
  const locale = useSettingsStore((s) => s.locale);
  const user = useAuthStore((s) => s.user);
  const { books, loading, hydrate } = useLibraryStore();
  const [query, setQuery] = useState("");

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const hasBooks = books.length > 0;

  return (
    <BookDropZone enabled={Boolean(user)}>
      <div className={`shelf-page ${user ? "shelf-page--library" : ""}`}>
        <header className="shelf-header">
          <div className="shelf-top">
            <BrandMark link={false} size="nav" className="shelf-top-brand" />
            <div className="shelf-auth-bar">
              <ThemeSwitcher />
              <LanguageSwitcher />
              {user ? (
                <AccountLink />
              ) : (
                <>
                  <Link href="/login" className="btn-ghost">
                    {t("login", locale)}
                  </Link>
                  <Link href="/register" className="btn-primary">
                    {t("register", locale)}
                  </Link>
                </>
              )}
            </div>
          </div>
          <p className="tagline">{t("tagline", locale)}</p>
          {!user && (
            <div className="shelf-actions">
              <Link href="/pricing" className="btn-ghost">
                {t("pricing", locale)}
              </Link>
            </div>
          )}
        </header>

        {!user && (
          <>
            <p className="drive-hint">
              {locale === "ru"
                ? "Войди в личный кабинет, чтобы добавлять книги с диска или с компьютера."
                : "Sign in to add books from your disk or your device."}
            </p>
            <FeatureRibbon />
            <div className="empty-state">
              <p>
                {locale === "ru"
                  ? "Библиотека доступна после входа в личный кабинет."
                  : "Your library opens after you sign in."}
              </p>
              <Link href="/login" className="btn-primary">
                {t("login", locale)}
              </Link>
            </div>
          </>
        )}

        {user && (
          <div className="library-layout">
            <LibrarySidebar />
            <div className="library-main">
              <div className="library-main-head">
                <h1>{t("myLibrary", locale)}</h1>
                <input
                  className="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("searchPlaceholder", locale)}
                />
              </div>

              <div className="library-main-actions">
                <UploadBookButton />
                <Link href="/pricing" className="btn-ghost">
                  {t("pricing", locale)}
                </Link>
              </div>
              <CloudDisks />

              {!loading && hasBooks && <ShelfRecent books={books} />}

              {user &&
                !loading &&
                books.some(
                  (b) =>
                    b.missingLocalFile &&
                    !b.hasCloudFile &&
                    !b.driveFileId &&
                    !b.cloudFileId,
                ) && (
                  <p className="drive-hint">{t("missingFileBanner", locale)}</p>
                )}

              <LibraryBooksGrid query={query} />
              <SelectionBar />

              {!loading && hasBooks && <ShelfStats books={books} />}
            </div>
          </div>
        )}
      </div>
    </BookDropZone>
  );
}
