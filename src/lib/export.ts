import type { BookAnnotations, BookMeta, Locale } from "./types";

export function annotationsToMarkdown(
  book: BookMeta,
  ann: BookAnnotations,
  locale: Locale,
): string {
  const lines: string[] = [];
  lines.push(`# ${book.title}`);
  if (book.author) lines.push(`*${book.author}*`);
  lines.push("");
  lines.push(
    locale === "ru"
      ? `Экспорт из Étagère · Этажер · ${new Date().toLocaleString("ru")}`
      : `Exported from Étagère · ${new Date().toLocaleString("en")}`,
  );
  lines.push("");

  if (ann.quotes.length) {
    lines.push(locale === "ru" ? "## Цитаты" : "## Quotes");
    for (const q of ann.quotes) {
      lines.push(`> ${q.text.replace(/\n/g, "\n> ")}`);
      lines.push(`> — p. ${q.page}`);
      if (q.note) lines.push(`> _${q.note}_`);
      lines.push("");
    }
  }

  if (ann.highlights.length) {
    lines.push(locale === "ru" ? "## Выделения" : "## Highlights");
    for (const h of ann.highlights) {
      lines.push(`- (${h.color}, p. ${h.page}) ${h.text}`);
    }
    lines.push("");
  }

  if (ann.bookmarks.length) {
    lines.push(locale === "ru" ? "## Закладки" : "## Bookmarks");
    for (const b of ann.bookmarks.sort((a, c) => a.page - c.page)) {
      lines.push(`- [ ] p. ${b.page}${b.label ? ` — ${b.label}` : ""}`);
    }
    lines.push("");
  }

  if (ann.flashcards.length) {
    lines.push(locale === "ru" ? "## Карточки" : "## Flashcards");
    for (const c of ann.flashcards) {
      lines.push(`**Q:** ${c.front}`);
      lines.push(`**A:** ${c.back}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

export function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".md") ? filename : `${filename}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
