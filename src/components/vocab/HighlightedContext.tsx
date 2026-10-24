"use client";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The sentence a word came from, with the word itself picked out. */
export function HighlightedContext({
  text,
  words,
}: {
  text: string;
  words: (string | undefined)[];
}) {
  const forms = [...new Set(words.filter((w): w is string => Boolean(w && w.trim())))]
    .map((w) => w.trim())
    .sort((a, b) => b.length - a.length);
  if (!forms.length) return <>{text}</>;
  const re = new RegExp(`(${forms.map(escapeRe).join("|")})`, "giu");
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>,
      )}
    </>
  );
}
