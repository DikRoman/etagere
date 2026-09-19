"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { useAuthStore } from "@/store/auth";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";
import { speakText } from "@/lib/tts";
import {
  VOCAB_GRADES,
  deleteVocabEntry,
  dueVocabEntries,
  formatVocabDue,
  formatVocabInterval,
  intervalDaysUntil,
  listVocabEntries,
  previewVocabGrade,
  reviewVocabEntry,
  staysInStudySession,
  studyVocabDeck,
  vocabStudyStats,
  type VocabEntry,
  type VocabGrade,
} from "@/lib/vocab";

const GRADE_KEYS = {
  again: "vocabAgain",
  hard: "vocabHard",
  good: "vocabGood",
  easy: "vocabEasy",
} as const;

export default function VocabPage() {
  const locale = useSettingsStore((s) => s.locale);
  const ru = locale === "ru";
  const ready = useAuthStore((s) => s.ready);
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [rows, setRows] = useState<VocabEntry[]>([]);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"list" | "study">("list");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const entries = await listVocabEntries();
    setRows(entries);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  useEffect(() => {
    let cancelled = false;
    void listVocabEntries().then((entries) => {
      if (cancelled) return;
      setRows(entries);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const due = useMemo(() => dueVocabEntries(rows), [rows]);
  const stats = useMemo(() => vocabStudyStats(rows), [rows]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((e) => {
      const hay = [e.word, e.lemma, ...e.translations, e.context]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query]);

  if (!ready || !user) {
    return (
      <div className="auth-page">
        <p className="muted">{ru ? "Загрузка…" : "Loading…"}</p>
      </div>
    );
  }

  return (
    <div className="account-page vocab-page">
      <header className="account-header">
        <BrandMark />
        <div className="shelf-actions">
          <Link href="/" className="btn-ghost">
            {t("backToShelf", locale)}
          </Link>
        </div>
      </header>

      <main className="vocab-main">
        <div className="vocab-head">
          <div>
            <h1>{t("wordLookup", locale)}</h1>
            <p className="muted">
              {ru
                ? "Интервальные повторения как в Anki. Чем увереннее ответ, тем позже слово вернётся — по кривой забывания."
                : "Spaced repetition like Anki. The more confident the answer, the later the word comes back — along the forgetting curve."}
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={!rows.length}
            onClick={() => setMode(mode === "study" ? "list" : "study")}
          >
            {mode === "study"
              ? t("vocabList", locale)
              : due.length
                ? `${t("vocabStudy", locale)} · ${due.length}`
                : t("vocabStudy", locale)}
          </button>
        </div>

        {mode === "study" ? (
          <VocabStudy
            deck={studyVocabDeck(rows)}
            locale={locale}
            onDone={async () => {
              await reload();
              setMode("list");
            }}
            onChange={reload}
          />
        ) : (
          <>
            {rows.length > 0 ? (
              <p className="vocab-stats">
                <span>
                  {t("vocabStatsDue", locale)} {stats.due}
                </span>
                <span>
                  {t("vocabStatsNew", locale)} {stats.newCount}
                </span>
                <span>
                  {t("vocabStatsLearning", locale)} {stats.learning}
                </span>
                <span>
                  {t("vocabStatsMature", locale)} {stats.mature}
                </span>
              </p>
            ) : null}
            <input
              className="search vocab-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={ru ? "Поиск по словам…" : "Search words…"}
            />
            {loading ? (
              <p className="muted">{ru ? "Загрузка…" : "Loading…"}</p>
            ) : filtered.length === 0 ? (
              <div className="vocab-empty">
                <p>
                  {rows.length === 0
                    ? ru
                      ? "Словарь пуст. Открой книгу, выдели слово и нажми «В словарь»."
                      : "The dictionary is empty. Open a book, select a word, and tap “Add to vocabulary”."
                    : ru
                      ? "Ничего не найдено."
                      : "No matches."}
                </p>
                <Link href="/" className="btn-ghost">
                  {t("backToShelf", locale)}
                </Link>
              </div>
            ) : (
              <ul className="vocab-list">
                {filtered.map((entry) => (
                  <li key={entry.id} className="vocab-row">
                    <div>
                      <p className="vocab-word">
                        {entry.word}
                        {entry.lemma &&
                        entry.lemma.toLowerCase() !== entry.word.toLowerCase() ? (
                          <span className="vocab-lemma"> · {entry.lemma}</span>
                        ) : null}
                      </p>
                      <p className="vocab-tr">
                        {entry.translations.join(" · ") || "—"}
                      </p>
                      {entry.context ? (
                        <p className="vocab-ctx">{entry.context}</p>
                      ) : null}
                      <p className="vocab-row-due">
                        {ru ? "Следующий показ: " : "Next: "}
                        {formatVocabDue(entry, locale)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-ghost compact"
                      onClick={async () => {
                        if (
                          !confirm(
                            ru
                              ? `Удалить «${entry.word}» из словаря?`
                              : `Remove “${entry.word}” from the dictionary?`,
                          )
                        ) {
                          return;
                        }
                        await deleteVocabEntry(entry.id);
                        await reload();
                      }}
                    >
                      {t("delete", locale)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function VocabStudy({
  deck,
  locale,
  onDone,
  onChange,
}: {
  deck: VocabEntry[];
  locale: "ru" | "en";
  onDone: () => void;
  onChange: () => Promise<void>;
}) {
  const ru = locale === "ru";
  const [queue, setQueue] = useState<VocabEntry[]>(() => shuffle(deck));
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);

  const card = queue[0];
  const left = queue.length;

  const answer = useCallback(
    async (grade: VocabGrade) => {
      if (!card || busy) return;
      setBusy(true);
      try {
        const updated = await reviewVocabEntry(card.id, grade);
        await onChange();
        setFlipped(false);
        setDone((n) => n + 1);
        setQueue((q) => {
          const rest = q.slice(1);
          if (!updated || !staysInStudySession(updated)) return rest;
          const insertAt = Math.min(
            rest.length,
            Math.max(2, Math.floor(rest.length * 0.4)),
          );
          return [...rest.slice(0, insertAt), updated, ...rest.slice(insertAt)];
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, card, onChange],
  );

  useEffect(() => {
    if (!card || !flipped || busy) return;
    function onKey(event: KeyboardEvent) {
      if (event.repeat) return;
      const map: Record<string, VocabGrade> = {
        "1": "again",
        "2": "hard",
        "3": "good",
        "4": "easy",
      };
      const grade = map[event.key];
      if (!grade) return;
      event.preventDefault();
      void answer(grade);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer, busy, card, flipped]);

  if (!card) {
    return (
      <div className="vocab-study vocab-study-done">
        <p>
          {ru
            ? `Готово. Повторили ${done} ${cardsWord(done, ru)}.`
            : `Done. Reviewed ${done} ${done === 1 ? "card" : "cards"}.`}
        </p>
        <button type="button" className="btn-primary" onClick={onDone}>
          {t("vocabList", locale)}
        </button>
      </div>
    );
  }

  return (
    <div className="vocab-study">
      <p className="vocab-study-meta">
        {ru ? `Осталось ${left}` : `${left} left`}
      </p>
      <button
        type="button"
        className={`vocab-card ${flipped ? "is-flipped" : ""}`}
        onClick={() => setFlipped((v) => !v)}
      >
        {!flipped ? (
          <>
            <span className="vocab-card-kicker">
              {ru ? "Слово" : "Word"}
            </span>
            <strong className="vocab-card-front">{card.word}</strong>
            {card.ipa ? <span className="vocab-card-ipa">{card.ipa}</span> : null}
            {card.pos ? <span className="vocab-card-pos">{card.pos}</span> : null}
            <span className="vocab-card-hint">
              {ru ? "Нажми, чтобы перевернуть" : "Tap to flip"}
            </span>
          </>
        ) : (
          <>
            <span className="vocab-card-kicker">
              {ru ? "Перевод" : "Translation"}
            </span>
            <strong className="vocab-card-back">
              {card.translations.join(" · ") || "—"}
            </strong>
            {card.lemma &&
            card.lemma.toLowerCase() !== card.word.toLowerCase() ? (
              <span className="vocab-card-pos">{card.lemma}</span>
            ) : null}
            {card.context ? (
              <span className="vocab-card-ctx">{card.context}</span>
            ) : null}
          </>
        )}
      </button>
      <div className="vocab-study-actions">
        <button
          type="button"
          className="icon-btn"
          aria-label={t("speakWord", locale)}
          onClick={() => void speakText(card.word, card.sourceLang)}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path
              fill="currentColor"
              d="M3 10v4h3l4 3V7L6 10H3Zm11.5 2a2.5 2.5 0 0 0-1.5-2.3v4.6a2.5 2.5 0 0 0 1.5-2.3Zm-1.5-6.1v1.6a5 5 0 0 1 0 9v1.6a6.5 6.5 0 0 0 0-12.2Z"
            />
          </svg>
        </button>
      </div>
      <div className="vocab-grade-row">
        {VOCAB_GRADES.map((grade) => {
          const next = previewVocabGrade(card, grade);
          return (
            <button
              key={grade}
              type="button"
              className={`vocab-grade vocab-grade-${grade}`}
              disabled={!flipped || busy}
              onClick={() => void answer(grade)}
            >
              <span className="vocab-grade-label">{t(GRADE_KEYS[grade], locale)}</span>
              <span className="vocab-grade-ivl">
                {formatVocabInterval(intervalDaysUntil(next), locale)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function cardsWord(n: number, ru: boolean): string {
  if (!ru) return n === 1 ? "card" : "cards";
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "карточку";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "карточки";
  return "карточек";
}
