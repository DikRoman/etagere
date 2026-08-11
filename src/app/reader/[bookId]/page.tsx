"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { getBook } from "@/lib/storage/local";
import type { BookMeta } from "@/lib/types";
import { useReaderStore } from "@/store/reader";
import { ReaderToolbar } from "@/components/reader/ReaderToolbar";
import { ReaderSidebar } from "@/components/reader/ReaderSidebar";
import { SelectionMenu } from "@/components/reader/SelectionMenu";
import { AiPanel } from "@/components/reader/AiPanel";
import { useSettingsStore } from "@/store/settings";

const PdfViewer = dynamic(
  () => import("@/components/reader/PdfViewer").then((m) => m.PdfViewer),
  { ssr: false, loading: () => <div className="pdf-loading">PDF…</div> },
);

const EpubViewer = dynamic(
  () => import("@/components/reader/EpubViewer").then((m) => m.EpubViewer),
  { ssr: false, loading: () => <div className="pdf-loading">EPUB…</div> },
);

export default function ReaderPage() {
  const params = useParams<{ bookId: string }>();
  const bookId = params.bookId;
  const locale = useSettingsStore((s) => s.locale);
  const theme = useSettingsStore((s) => s.theme);
  const setBook = useReaderStore((s) => s.setBook);
  const [book, setBookMeta] = useState<BookMeta | null>(null);
  const [missing, setMissing] = useState(false);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);

  const onPdf = useCallback((doc: PDFDocumentProxy | null) => {
    setPdf(doc);
  }, []);

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
    return (
      <div className="pdf-loading">
        {locale === "ru" ? "Открываю…" : "Opening…"}
      </div>
    );
  }

  return (
    <div className={`reader-shell theme-${theme}`}>
      <ReaderToolbar
        title={book.title}
        pageCount={book.pageCount}
        bookId={book.id}
        pdf={book.format === "pdf" ? pdf : null}
      />
      <div className="reader-body">
        <main className="reader-main">
          {book.format === "epub" ? (
            <EpubViewer bookId={book.id} />
          ) : (
            <PdfViewer
              bookId={book.id}
              pageCount={book.pageCount}
              onPdf={onPdf}
            />
          )}
        </main>
        <ReaderSidebar bookTitle={book.title} />
      </div>
      <SelectionMenu />
      <AiPanel />
    </div>
  );
}
