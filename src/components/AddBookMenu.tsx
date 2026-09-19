"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";
import { UploadBookButton } from "./UploadBookButton";
import { CloudDisks } from "./CloudDisks";

export function AddBookMenu() {
  const locale = useSettingsStore((s) => s.locale);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="add-book-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden>+</span>
        {t("addBook", locale)}
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="add-book-sheet-backdrop"
            onClick={() => setOpen(false)}
          >
            <div
              className="add-book-sheet"
              role="dialog"
              aria-label={t("addBook", locale)}
              onClick={(e) => e.stopPropagation()}
            >
              <header className="add-book-sheet-head">
                <h2>{t("addBook", locale)}</h2>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setOpen(false)}
                  aria-label={t("close", locale)}
                >
                  ×
                </button>
              </header>
              <section>
                <h3>{t("addFromDevice", locale)}</h3>
                <UploadBookButton />
              </section>
              <section>
                <h3>{t("addFromCloud", locale)}</h3>
                <CloudDisks />
              </section>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
