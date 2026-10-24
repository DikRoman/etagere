import { getPb } from "@/lib/pb";
import type { VocabGrade } from "@/lib/vocab";

/**
 * A small per-account log of study days, for the streak and today's count.
 * Days are local calendar days: studying at 23:50 and 00:10 is two days.
 */

type Log = { days: Record<string, number> };

function key(): string {
  const id = getPb().authStore.record?.id ?? "guest";
  return `etagere-vocab-log-${id}`;
}

function read(): Log {
  try {
    const raw = JSON.parse(localStorage.getItem(key()) || "null") as Log | null;
    return raw?.days ? raw : { days: {} };
  } catch {
    return { days: {} };
  }
}

export function dayKey(at = new Date()): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, "0");
  const d = String(at.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function recordReview(_grade: VocabGrade, at = new Date()): void {
  const log = read();
  const k = dayKey(at);
  log.days[k] = (log.days[k] ?? 0) + 1;
  // Keep a year of history; the streak never needs more.
  const keys = Object.keys(log.days).sort();
  for (const old of keys.slice(0, Math.max(0, keys.length - 370))) {
    delete log.days[old];
  }
  try {
    localStorage.setItem(key(), JSON.stringify(log));
  } catch {
    /* storage full or blocked: the streak is a nicety */
  }
}

export function reviewedToday(at = new Date()): number {
  return read().days[dayKey(at)] ?? 0;
}

/**
 * Consecutive days with at least one review, ending today — or yesterday,
 * so the streak is not shown as broken before today's session.
 */
export function studyStreak(at = new Date()): number {
  const days = read().days;
  const cursor = new Date(at);
  if (!days[dayKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
  let n = 0;
  while (days[dayKey(cursor)]) {
    n += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
}
