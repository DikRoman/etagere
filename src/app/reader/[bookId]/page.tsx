"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { getBook } from "@/lib/storage/local";
import type { BookMeta } from "@/lib/types";
import { useReaderStore } from "@/store/reader";
import { ReaderToolbar } from "@/components/reader/ReaderToolbar";
import { ReaderSidebar } from "@/components/reader/ReaderSidebar";
import { SelectionMenu } from "@/components/reader/SelectionMenu";
import { AiPanel } from "@/components/reader/AiPanel";
import { useSettingsStore } from "@/store/settings";

const PdfViewer = dynamic(
  () =>
    import("@/components/reader/PdfViewer").then((m) => m.PdfViewer),
  { ssr: false, loading: () => <div className="pdf-loading">PDF…</div> },
);

export default function ReaderPage() {
  const params = useParams<{ bookId: string }>();
  const bookId = params.bookId;
  const locale = useSettingsStore((s) => s.locale);
  const setBook = useReaderStore((s) => s.setBook);
  const [book, setBookMeta] = useState<BookMeta | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const meta = await getBook(bookId);
      if (cancelled) return;
      if (!meta) {
        setMissing(true);
        return;
      }
      setBookMeta(meta);
      await setBook(meta.id, meta.lastPage || 1, meta.pageCount);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId, setBook]);

  if (missing) {
    return (
      <div className="reader-error">
        {locale === "ru" ? "Книга не найдена" : "Book not found"} ·{" "}
        <a href="/">{locale === "ru" ? "На полку" : "Back"}</a>
      </div>
    );
  }

  if (!book) {
    return <div className="pdf-loading">{locale === "ru" ? "Открываю…" : "Opening…"}</div>;
  }

  return (
    <div className="reader-shell">
      <ReaderToolbar title={book.title} pageCount={book.pageCount} />
      <div className="reader-body">
        <main className="reader-main">
          <PdfViewer bookId={book.id} pageCount={book.pageCount} />
        </main>
        <ReaderSidebar />
      </div>
      <SelectionMenu />
      <AiPanel />
    </div>
  );
}
