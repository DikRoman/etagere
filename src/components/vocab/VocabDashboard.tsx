"use client";

import {
  formatVocabInterval,
  intervalDaysUntil,
  isVocabDue,
  type VocabEntry,
} from "@/lib/vocab";
import { reviewedToday, studyStreak } from "@/lib/vocab-progress";
import { pluralRu } from "@/lib/plural-ru";

export type VocabStage = "new" | "learning" | "young" | "mature";

/** Anki's maturity buckets; "mature" is a review interval of 21 days or more. */
export function vocabStage(e: VocabEntry): VocabStage {
  if (e.state === "new") return "new";
  if (e.state === "learning" || e.state === "relearning") return "learning";
  return e.interval >= 21 ? "mature" : "young";
}

const STAGES: { id: VocabStage; ru: string; en: string }[] = [
  { id: "new", ru: "Новые", en: "New" },
  { id: "learning", ru: "Изучаю", en: "Learning" },
  { id: "young", ru: "Молодые", en: "Young" },
  { id: "mature", ru: "Выучено", en: "Mature" },
];

function Ring({ value, max }: { value: number; max: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const share = max > 0 ? Math.min(1, value / max) : 1;
  return (
    <svg className="vocab-ring" viewBox="0 0 120 120" aria-hidden>
      <circle className="vocab-ring-track" cx="60" cy="60" r={r} />
      <circle
        className="vocab-ring-fill"
        cx="60"
        cy="60"
        r={r}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - share)}
      />
    </svg>
  );
}

interface Props {
  rows: VocabEntry[];
  dueCount: number;
  locale: "ru" | "en";
  onStudy: () => void;
  onCram: () => void;
}

export function VocabDashboard({ rows, dueCount, locale, onStudy, onCram }: Props) {
  const ru = locale === "ru";
  const today = reviewedToday();
  const streak = studyStreak();
  const counts: Record<VocabStage, number> = { new: 0, learning: 0, young: 0, mature: 0 };
  for (const e of rows) counts[vocabStage(e)] += 1;

  // When nothing is due, say when the next card comes back.
  const next = rows
    .filter((e) => !isVocabDue(e))
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];

  return (
    <section className="vocab-dash">
      <div className="vocab-hero">
        <div className="vocab-hero-ring">
          <Ring value={today} max={today + dueCount} />
          <div className="vocab-hero-ring-label">
            <strong>{dueCount}</strong>
            <span>{ru ? "к повторению" : "due"}</span>
          </div>
        </div>
        <div className="vocab-hero-body">
          <p className="vocab-hero-kicker">
            {streak > 0
              ? ru
                ? `🔥 ${streak} ${pluralRu(streak, "день", "дня", "дней")} подряд`
                : `🔥 ${streak}-day streak`
              : ru
                ? "Начни серию сегодня"
                : "Start a streak today"}
          </p>
          <h2 className="vocab-hero-title">
            {dueCount > 0
              ? ru
                ? `Сегодня ${today ? "осталось" : "ждут"} ${dueCount}`
                : `${dueCount} waiting today`
              : ru
                ? "На сегодня всё 🎉"
                : "All done for today 🎉"}
          </h2>
          <p className="vocab-hero-sub">
            {dueCount > 0
              ? ru
                ? `Повторено сегодня: ${today}. Минут пять — и слова останутся в памяти.`
                : `Reviewed today: ${today}. Five minutes keeps them in memory.`
              : next
                ? ru
                  ? `Следующее слово вернётся через ${formatVocabInterval(intervalDaysUntil(next), locale)}.`
                  : `The next word comes back in ${formatVocabInterval(intervalDaysUntil(next), locale)}.`
                : ru
                  ? "Добавь слова из книги — выдели слово и нажми «В словарь»."
                  : "Add words from a book — select a word and tap “Add to vocabulary”."}
          </p>
          <div className="vocab-hero-actions">
            {dueCount > 0 ? (
              <button type="button" className="btn-primary vocab-cta" onClick={onStudy}>
                {ru ? "Начать занятие" : "Start session"}
              </button>
            ) : rows.length > 0 ? (
              <button type="button" className="btn-ghost" onClick={onCram}>
                {ru ? "Повторить всё равно" : "Review anyway"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {rows.length > 0 && (
        <>
          <div className="vocab-tiles">
            {STAGES.map((s) => (
              <div key={s.id} className={`vocab-tile is-${s.id}`}>
                <strong>{counts[s.id]}</strong>
                <span>{ru ? s.ru : s.en}</span>
              </div>
            ))}
          </div>
          <div className="vocab-maturity" aria-hidden>
            {STAGES.map((s) =>
              counts[s.id] ? (
                <span
                  key={s.id}
                  className={`is-${s.id}`}
                  style={{ flexGrow: counts[s.id] }}
                />
              ) : null,
            )}
          </div>
        </>
      )}
    </section>
  );
}
