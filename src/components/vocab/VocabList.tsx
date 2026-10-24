"use client";

import { useMemo, useState } from "react";
import { speakText } from "@/lib/tts";
import {
  deleteVocabEntry,
  formatVocabDue,
  isVocabDue,
  type VocabEntry,
} from "@/lib/vocab";
import { HighlightedContext } from "./HighlightedContext";
import { vocabStage, type VocabStage } from "./VocabDashboard";

type Filter = "all" | "due" | VocabStage;

const FILTERS: { id: Filter; ru: string; en: string }[] = [
  { id: "all", ru: "Все", en: "All" },
  { id: "due", ru: "К повторению", en: "Due" },
  { id: "new", ru: "Новые", en: "New" },
  { id: "learning", ru: "Изучаю", en: "Learning" },
  { id: "young", ru: "Молодые", en: "Young" },
  { id: "mature", ru: "Выучено", en: "Mature" },
];

function matches(e: VocabEntry, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "due") return isVocabDue(e);
  return vocabStage(e) === f;
}

/** Five pips: how far the card has climbed toward long-term memory. */
function Maturity({ box }: { box: number }) {
  return (
    <span className="vocab-pips" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < box ? "is-on" : ""} />
      ))}
    </span>
  );
}

interface Props {
  rows: VocabEntry[];
  locale: "ru" | "en";
  onChange: () => Promise<void>;
}

export function VocabList({ rows, locale, onChange }: Props) {
  const ru = locale === "ru";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const out = {} as Record<Filter, number>;
    for (const f of FILTERS) out[f.id] = rows.filter((e) => matches(e, f.id)).length;
    return out;
  }, [rows]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((e) => {
      if (!matches(e, filter)) return false;
      if (!q) return true;
      return [e.word, e.lemma, ...e.translations, e.context]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rows, query, filter]);

  if (!rows.length) return null;

  return (
    <section className="vocab-deck">
      <div className="vocab-deck-head">
        <input
          className="search vocab-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={ru ? "Поиск по словам и переводам…" : "Search words and translations…"}
        />
        <div className="vocab-chips" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={`vocab-chip ${filter === f.id ? "is-on" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {ru ? f.ru : f.en}
              <span>{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="vocab-none">{ru ? "Ничего не найдено." : "No matches."}</p>
      ) : (
        <ul className="vocab-cards">
          {shown.map((e) => {
            const due = isVocabDue(e);
            return (
              <li key={e.id} className={`vocab-item is-${vocabStage(e)}`}>
                <div className="vocab-item-main">
                  <div className="vocab-item-top">
                    <span className="vocab-item-word">{e.word}</span>
                    {e.ipa ? <span className="vocab-item-ipa">{e.ipa}</span> : null}
                    <button
                      type="button"
                      className="vocab-item-say"
                      aria-label={ru ? "Произнести" : "Say it"}
                      onClick={() => void speakText(e.word, e.sourceLang)}
                    >
                      🔈
                    </button>
                  </div>
                  <p className="vocab-item-tr">{e.translations.join(" · ") || "—"}</p>
                  {e.context ? (
                    <p className="vocab-item-ctx">
                      <HighlightedContext text={e.context} words={[e.word, e.lemma]} />
                    </p>
                  ) : null}
                </div>
                <div className="vocab-item-side">
                  <Maturity box={e.box} />
                  <span className={`vocab-due ${due ? "is-due" : ""}`}>
                    {formatVocabDue(e, locale)}
                  </span>
                  <button
                    type="button"
                    className="vocab-item-del"
                    aria-label={ru ? `Удалить «${e.word}»` : `Remove “${e.word}”`}
                    title={ru ? "Удалить" : "Remove"}
                    onClick={async () => {
                      if (
                        !confirm(
                          ru
                            ? `Удалить «${e.word}» из словаря?`
                            : `Remove “${e.word}” from the vocabulary?`,
                        )
                      ) {
                        return;
                      }
                      await deleteVocabEntry(e.id);
                      await onChange();
                    }}
                  >
                    ✕
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
