"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { speakText } from "@/lib/tts";
import {
  VOCAB_GRADES,
  formatVocabInterval,
  intervalDaysUntil,
  previewVocabGrade,
  reviewVocabEntry,
  staysInStudySession,
  type VocabEntry,
  type VocabGrade,
} from "@/lib/vocab";
import { recordReview, studyStreak } from "@/lib/vocab-progress";
import { HighlightedContext } from "./HighlightedContext";
import { pluralRu } from "@/lib/plural-ru";

const GRADE_KEYS = {
  again: "vocabAgain",
  hard: "vocabHard",
  good: "vocabGood",
  easy: "vocabEasy",
} as const;

const KEY_TO_GRADE: Record<string, VocabGrade> = {
  "1": "again",
  "2": "hard",
  "3": "good",
  "4": "easy",
};

const SPEAK_KEY = "etagere-vocab-autospeak";

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Anki's three queue counters: new, learning, review. */
function queueCounts(queue: VocabEntry[]) {
  let fresh = 0;
  let learning = 0;
  let review = 0;
  for (const e of queue) {
    if (e.state === "new") fresh += 1;
    else if (e.state === "learning" || e.state === "relearning") learning += 1;
    else review += 1;
  }
  return { fresh, learning, review };
}

function readAutoSpeak(): boolean {
  try {
    return localStorage.getItem(SPEAK_KEY) === "1";
  } catch {
    return false;
  }
}

interface Props {
  deck: VocabEntry[];
  locale: "ru" | "en";
  onExit: () => void;
  onChange: () => Promise<void>;
}

export function VocabStudy({ deck, locale, onExit, onChange }: Props) {
  const ru = locale === "ru";
  // New cards go last, reviews first — the order Anki studies in.
  const [queue, setQueue] = useState<VocabEntry[]>(() => {
    const reviews = shuffle(deck.filter((e) => e.state !== "new"));
    const fresh = deck.filter((e) => e.state === "new");
    return [...reviews, ...fresh];
  });
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(readAutoSpeak);
  const [stats, setStats] = useState({ reviewed: 0, again: 0, ms: 0 });
  const [cardKey, setCardKey] = useState(0);
  const [total, setTotal] = useState(deck.length);
  // Set once mounted; read only in handlers, never during render.
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  const card = queue[0];

  useEffect(() => {
    if (card && autoSpeak) void speakText(card.word, card.sourceLang);
    // Speak when a new card arrives, not when the setting is toggled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, cardKey]);

  const answer = useCallback(
    async (grade: VocabGrade) => {
      if (!card || busy) return;
      setBusy(true);
      try {
        const updated = await reviewVocabEntry(card.id, grade);
        recordReview(grade);
        await onChange();
        const elapsed = Date.now() - startedAt.current;
        setStats((s) => ({
          reviewed: s.reviewed + 1,
          again: s.again + (grade === "again" ? 1 : 0),
          ms: elapsed,
        }));
        setFlipped(false);
        setCardKey((k) => k + 1);
        // Still in its learning steps: comes back later in this session.
        const again = updated && staysInStudySession(updated) ? updated : null;
        if (again) setTotal((n) => n + 1);
        setQueue((q) => {
          const rest = q.slice(1);
          if (!again) return rest;
          const at = Math.min(rest.length, Math.max(2, Math.floor(rest.length * 0.4)));
          return [...rest.slice(0, at), again, ...rest.slice(at)];
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, card, onChange],
  );

  useEffect(() => {
    if (!card) return;
    function onKey(event: KeyboardEvent) {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      // The target can be window or document for synthetic events.
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea")) return;
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        // Like Anki: show the answer, then the same key means "Good".
        if (!flipped) setFlipped(true);
        else void answer("good");
        return;
      }
      const grade = KEY_TO_GRADE[event.key];
      if (grade && flipped) {
        event.preventDefault();
        void answer(grade);
      }
      if (event.key === "Escape") onExit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer, card, flipped, onExit]);

  if (!card) {
    const minutes = Math.max(1, Math.round(stats.ms / 60000));
    const accuracy = stats.reviewed
      ? Math.round(((stats.reviewed - stats.again) / stats.reviewed) * 100)
      : 100;
    const streak = studyStreak();
    return (
      <section className="vocab-done" aria-live="polite">
        <div className="vocab-confetti" aria-hidden>
          {Array.from({ length: 18 }, (_, i) => (
            <span key={i} style={{ "--i": i } as React.CSSProperties} />
          ))}
        </div>
        <p className="vocab-done-emoji" aria-hidden>
          🎉
        </p>
        <h2>{ru ? "Занятие окончено!" : "Session complete!"}</h2>
        <div className="vocab-done-stats">
          <div>
            <strong>{stats.reviewed}</strong>
            <span>{ru ? pluralRu(stats.reviewed, "повторение", "повторения", "повторений") : "reviews"}</span>
          </div>
          <div>
            <strong>{accuracy}%</strong>
            <span>{ru ? "точность" : "accuracy"}</span>
          </div>
          <div>
            <strong>{minutes}</strong>
            <span>{ru ? "мин" : "min"}</span>
          </div>
          <div>
            <strong>🔥 {streak}</strong>
            <span>{ru ? `${pluralRu(streak, "день", "дня", "дней")} подряд` : "day streak"}</span>
          </div>
        </div>
        <button type="button" className="btn-primary vocab-cta" onClick={onExit}>
          {ru ? "К словарю" : "Back to vocabulary"}
        </button>
      </section>
    );
  }

  const counts = queueCounts(queue);
  const progress = Math.min(100, Math.round((stats.reviewed / Math.max(1, total)) * 100));
  const showLemma =
    card.lemma && card.lemma.toLowerCase() !== card.word.toLowerCase();

  return (
    <section className="vocab-session">
      <div className="vocab-session-top">
        <button type="button" className="btn-ghost compact" onClick={onExit}>
          ← {ru ? "Закончить" : "End"}
        </button>
        <div className="vocab-counts" aria-label={ru ? "Осталось" : "Remaining"}>
          <span className="is-new" title={ru ? "Новые" : "New"}>
            {counts.fresh}
          </span>
          <span className="is-learning" title={ru ? "Изучаю" : "Learning"}>
            {counts.learning}
          </span>
          <span className="is-review" title={ru ? "Повторить" : "Review"}>
            {counts.review}
          </span>
        </div>
        <button
          type="button"
          className={`vocab-speak-toggle ${autoSpeak ? "is-on" : ""}`}
          aria-pressed={autoSpeak}
          title={ru ? "Озвучивать слова" : "Speak words"}
          onClick={() => {
            const next = !autoSpeak;
            setAutoSpeak(next);
            try {
              localStorage.setItem(SPEAK_KEY, next ? "1" : "0");
            } catch {
              /* not persisted */
            }
          }}
        >
          {autoSpeak ? "🔊" : "🔈"}
        </button>
      </div>
      <div className="vocab-progress" aria-hidden>
        <div style={{ width: `${progress}%` }} />
      </div>

      <div className="vocab-stage">
        <button
          key={cardKey}
          type="button"
          className={`vocab-flip ${flipped ? "is-flipped" : ""}`}
          onClick={() => setFlipped((v) => !v)}
          aria-label={flipped ? (ru ? "Перевернуть обратно" : "Flip back") : ru ? "Показать ответ" : "Show answer"}
        >
          <span className="vocab-flip-inner">
          <span className="vocab-face vocab-face--front">
            <span className={`vocab-state vocab-state--${card.state}`}>
              {card.state === "new"
                ? ru ? "новое" : "new"
                : card.state === "review"
                  ? ru ? "повторение" : "review"
                  : ru ? "изучаю" : "learning"}
            </span>
            <strong className="vocab-face-word">{card.word}</strong>
            {card.ipa ? <span className="vocab-face-ipa">{card.ipa}</span> : null}
            {card.pos ? <span className="vocab-face-pos">{card.pos}</span> : null}
            <span className="vocab-face-hint">
              {ru ? "Нажми или пробел — показать ответ" : "Tap or Space to show the answer"}
            </span>
          </span>
          <span className="vocab-face vocab-face--back">
            <span className="vocab-face-small">
              {card.word}
              {showLemma ? <em> · {card.lemma}</em> : null}
            </span>
            <strong className="vocab-face-tr">
              {card.translations.join(" · ") || "—"}
            </strong>
            {card.context ? (
              <span className="vocab-face-ctx">
                <HighlightedContext
                  text={card.context}
                  words={[card.word, card.lemma]}
                />
              </span>
            ) : null}
          </span>
          </span>
        </button>
        <button
          type="button"
          className="vocab-say"
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

      {flipped ? (
        <div className="vocab-grades">
          {VOCAB_GRADES.map((grade, i) => (
            <button
              key={grade}
              type="button"
              className={`vocab-grade-btn is-${grade}`}
              disabled={busy}
              onClick={() => void answer(grade)}
            >
              <span className="vocab-grade-ivl">
                {formatVocabInterval(intervalDaysUntil(previewVocabGrade(card, grade)), locale)}
              </span>
              <span className="vocab-grade-name">{t(GRADE_KEYS[grade], locale)}</span>
              <kbd>{i + 1}</kbd>
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          className="btn-primary vocab-show"
          onClick={() => setFlipped(true)}
        >
          {ru ? "Показать ответ" : "Show answer"} <kbd>␣</kbd>
        </button>
      )}
    </section>
  );
}
