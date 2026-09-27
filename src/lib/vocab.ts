/** Local vocabulary with Anki-style SM-2 spaced repetition. */

export interface VocabEntry {
  id: string;
  word: string;
  lemma?: string;
  translations: string[];
  context?: string;
  ipa?: string;
  pos?: string;
  sourceLang?: string;
  bookId?: string;
  page?: number;
  /** Maturity 0–5, derived from SRS state / interval. */
  box: number;
  dueAt: string;
  seenCount: number;
  ease: number;
  /** Interval in days (fractional while learning). */
  interval: number;
  reps: number;
  lapses: number;
  state: VocabCardState;
  step: number;
  lastReviewAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type VocabCardState = "new" | "learning" | "review" | "relearning";
export type VocabGrade = "again" | "hard" | "good" | "easy";

export const VOCAB_GRADES: VocabGrade[] = ["again", "hard", "good", "easy"];

const DB_NAME = "etagere-vocab";
const DB_VERSION = 1;
const STORE = "entries";
const MAX_BOX = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** Anki default learning / relearning steps (minutes). */
const LEARNING_STEPS_MIN = [1, 10];
const RELEARN_STEPS_MIN = [10];
const GRADUATING_INTERVAL_DAYS = 1;
const EASY_INTERVAL_DAYS = 4;
const STARTING_EASE = 2.5;
const MIN_EASE = 1.3;
const EASY_BONUS = 1.3;
const HARD_FACTOR = 1.2;
const LAPSE_MULTIPLIER = 0;
const MIN_LAPSE_INTERVAL_DAYS = 1;
const MAX_INTERVAL_DAYS = 36500;
const AGAIN_EASE_DELTA = 0.2;
const HARD_EASE_DELTA = 0.15;
const EASY_EASE_DELTA = 0.15;
/** Cards due within this window stay in the current study session. */
export const SESSION_REINSERT_MS = 20 * 60 * 1000;

const LEGACY_INTERVAL_DAYS = [0, 0.5, 1, 3, 7, 21];

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("word", "word", { unique: false });
        store.createIndex("bookId", "bookId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function normalizeWord(s: string): string {
  return s.trim().toLowerCase();
}

function nowIso(at = new Date()): string {
  return at.toISOString();
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function addMinutes(at: Date, minutes: number): Date {
  return new Date(at.getTime() + minutes * MINUTE_MS);
}

function addDays(at: Date, days: number): Date {
  return new Date(at.getTime() + days * DAY_MS);
}

function boxFromSrs(state: VocabCardState, interval: number): number {
  if (state !== "review") return 0;
  if (interval < 1) return 1;
  if (interval < 7) return 2;
  if (interval < 21) return 3;
  if (interval < 90) return 4;
  return 5;
}

function daysLate(entry: VocabEntry, at: Date): number {
  if (entry.state !== "review") return 0;
  return Math.max(0, (at.getTime() - new Date(entry.dueAt).getTime()) / DAY_MS);
}

/** Fuzz like Anki so cards don't cluster on the same day. Off for previews. */
function fuzzInterval(days: number, fuzz: boolean): number {
  if (!fuzz || days < 2.5) return days;
  let spread: number;
  if (days < 7) spread = Math.max(1, days * 0.15);
  else if (days < 20) spread = Math.max(2, days * 0.1);
  else spread = Math.max(4, days * 0.05);
  const min = Math.round(days - spread);
  const max = Math.round(days + spread);
  if (max <= min) return Math.max(1, min);
  return Math.max(1, min + Math.floor(Math.random() * (max - min + 1)));
}

function hardLearningMinutes(steps: number[], step: number): number {
  const current = steps[step] ?? steps[0] ?? 1;
  const next = steps[step + 1];
  return next != null ? (current + next) / 2 : current * 1.5;
}

function lapseIntervalDays(entry: VocabEntry): number {
  return Math.max(MIN_LAPSE_INTERVAL_DAYS, entry.interval * LAPSE_MULTIPLIER);
}

function withReviewMeta(
  entry: VocabEntry,
  patch: Partial<VocabEntry>,
  at: Date,
): VocabEntry {
  const next = {
    ...entry,
    ...patch,
    seenCount: entry.seenCount + 1,
    lastReviewAt: nowIso(at),
    updatedAt: nowIso(at),
  };
  next.box = boxFromSrs(next.state, next.interval);
  return next;
}

function graduate(
  entry: VocabEntry,
  at: Date,
  days: number,
  easy: boolean,
  fuzz: boolean,
): VocabEntry {
  const ease = clamp(
    easy ? entry.ease + EASY_EASE_DELTA : entry.ease,
    MIN_EASE,
    6,
  );
  const interval = clamp(fuzzInterval(Math.max(1, days), fuzz), 1, MAX_INTERVAL_DAYS);
  return withReviewMeta(
    entry,
    {
      state: "review",
      step: 0,
      ease,
      interval,
      reps: entry.reps + 1,
      dueAt: addDays(at, interval).toISOString(),
    },
    at,
  );
}

function scheduleLearning(
  entry: VocabEntry,
  grade: VocabGrade,
  at: Date,
  steps: number[],
  relearn: boolean,
  fuzz: boolean,
): VocabEntry {
  const step = clamp(entry.step, 0, Math.max(0, steps.length - 1));
  const stay = relearn ? "relearning" : "learning";

  if (grade === "again") {
    const minutes = steps[0] ?? 1;
    return withReviewMeta(
      entry,
      {
        state: stay,
        step: 0,
        interval: minutes / (24 * 60),
        dueAt: addMinutes(at, minutes).toISOString(),
      },
      at,
    );
  }

  if (grade === "hard") {
    const minutes = hardLearningMinutes(steps, step);
    return withReviewMeta(
      entry,
      {
        state: stay,
        step,
        interval: minutes / (24 * 60),
        dueAt: addMinutes(at, minutes).toISOString(),
      },
      at,
    );
  }

  if (grade === "good") {
    if (step + 1 < steps.length) {
      const minutes = steps[step + 1] ?? 10;
      return withReviewMeta(
        entry,
        {
          state: stay,
          step: step + 1,
          interval: minutes / (24 * 60),
          dueAt: addMinutes(at, minutes).toISOString(),
        },
        at,
      );
    }
    const days = relearn ? lapseIntervalDays(entry) : GRADUATING_INTERVAL_DAYS;
    return graduate(entry, at, days, false, fuzz);
  }

  const days = relearn
    ? Math.max(EASY_INTERVAL_DAYS, lapseIntervalDays(entry), GRADUATING_INTERVAL_DAYS)
    : EASY_INTERVAL_DAYS;
  return graduate(entry, at, days, true, fuzz);
}

function scheduleReview(
  entry: VocabEntry,
  grade: VocabGrade,
  at: Date,
  fuzz: boolean,
): VocabEntry {
  if (grade === "again") {
    const minutes = RELEARN_STEPS_MIN[0] ?? 10;
    return withReviewMeta(
      entry,
      {
        state: "relearning",
        step: 0,
        ease: Math.max(MIN_EASE, entry.ease - AGAIN_EASE_DELTA),
        lapses: entry.lapses + 1,
        interval: lapseIntervalDays(entry),
        dueAt: addMinutes(at, minutes).toISOString(),
      },
      at,
    );
  }

  const late = daysLate(entry, at);
  let ease = entry.ease;
  if (grade === "hard") ease = Math.max(MIN_EASE, ease - HARD_EASE_DELTA);
  if (grade === "easy") ease = ease + EASY_EASE_DELTA;

  const hardDays = Math.max(entry.interval + 1, entry.interval * HARD_FACTOR);
  const goodDays = Math.max(entry.interval + 1, (entry.interval + late / 2) * entry.ease);
  const easyDays = Math.max(
    entry.interval + 1,
    (entry.interval + late) * (entry.ease + EASY_EASE_DELTA) * EASY_BONUS,
  );
  const hardI = Math.max(1, Math.round(hardDays));
  const goodI = Math.max(hardI + 1, Math.round(goodDays));
  const easyI = Math.max(goodI + 1, Math.round(easyDays));
  const chosen = grade === "hard" ? hardI : grade === "good" ? goodI : easyI;
  const interval = clamp(fuzzInterval(chosen, fuzz), 1, MAX_INTERVAL_DAYS);
  return withReviewMeta(
    entry,
    {
      state: "review",
      step: 0,
      ease,
      interval,
      reps: entry.reps + 1,
      dueAt: addDays(at, interval).toISOString(),
    },
    at,
  );
}

export function scheduleVocab(
  entry: VocabEntry,
  grade: VocabGrade,
  at = new Date(),
  opts: { fuzz?: boolean } = {},
): VocabEntry {
  const card = normalizeVocab(entry);
  const fuzz = opts.fuzz ?? true;
  if (card.state === "review") return scheduleReview(card, grade, at, fuzz);
  if (card.state === "relearning") {
    return scheduleLearning(card, grade, at, RELEARN_STEPS_MIN, true, fuzz);
  }
  return scheduleLearning(card, grade, at, LEARNING_STEPS_MIN, false, fuzz);
}

export function previewVocabGrade(
  entry: VocabEntry,
  grade: VocabGrade,
  at = new Date(),
): VocabEntry {
  return scheduleVocab(entry, grade, at, { fuzz: false });
}

export function intervalDaysUntil(entry: VocabEntry, at = new Date()): number {
  return Math.max(0, (new Date(entry.dueAt).getTime() - at.getTime()) / DAY_MS);
}

export function formatVocabInterval(days: number, locale: "ru" | "en"): string {
  const minutes = days * 24 * 60;
  if (minutes < 0.75) return locale === "ru" ? "<1 мин" : "<1m";
  if (minutes < 60) {
    const m = Math.max(1, Math.round(minutes));
    return locale === "ru" ? `${m} мин` : `${m}m`;
  }
  const hours = minutes / 60;
  if (hours < 24) {
    const h = Math.max(1, Math.round(hours));
    return locale === "ru" ? `${h} ч` : `${h}h`;
  }
  if (days < 30.5) {
    const d = Math.max(1, Math.round(days));
    return locale === "ru" ? `${d} д` : `${d}d`;
  }
  const months = days / 30.437;
  if (months < 12) {
    const value = months < 10 ? months.toFixed(1) : String(Math.round(months));
    const shown = locale === "ru" ? value.replace(".", ",") : value;
    return locale === "ru" ? `${shown} мес` : `${shown}mo`;
  }
  const years = days / 365;
  const value = years < 10 ? years.toFixed(1) : String(Math.round(years));
  const shown = locale === "ru" ? value.replace(".", ",") : value;
  return locale === "ru" ? `${shown} г` : `${shown}y`;
}

export function formatVocabDue(entry: VocabEntry, locale: "ru" | "en", at = new Date()): string {
  if (isVocabDue(entry, at)) return locale === "ru" ? "повторить" : "due";
  return formatVocabInterval(intervalDaysUntil(entry, at), locale);
}

function inferSrs(row: Partial<VocabEntry>): Pick<
  VocabEntry,
  "ease" | "interval" | "reps" | "lapses" | "state" | "step"
> {
  if (row.state && row.ease != null && row.interval != null) {
    return {
      ease: clamp(row.ease, MIN_EASE, 6),
      interval: Math.max(0, row.interval),
      reps: Math.max(0, row.reps ?? 0),
      lapses: Math.max(0, row.lapses ?? 0),
      state: row.state,
      step: Math.max(0, row.step ?? 0),
    };
  }
  const box = clamp(row.box ?? 0, 0, MAX_BOX);
  const seen = row.seenCount ?? 0;
  if (seen === 0 && box === 0) {
    return {
      ease: STARTING_EASE,
      interval: 0,
      reps: 0,
      lapses: 0,
      state: "new",
      step: 0,
    };
  }
  if (box === 0) {
    return {
      ease: STARTING_EASE,
      interval: LEARNING_STEPS_MIN[0]! / (24 * 60),
      reps: 0,
      lapses: 0,
      state: "learning",
      step: 0,
    };
  }
  return {
    ease: STARTING_EASE,
    interval: LEGACY_INTERVAL_DAYS[box] ?? 1,
    reps: seen,
    lapses: 0,
    state: "review",
    step: 0,
  };
}

export function normalizeVocab(row: Partial<VocabEntry> & Pick<VocabEntry, "id" | "word">): VocabEntry {
  const created = row.createdAt || nowIso();
  const srs = inferSrs(row);
  const interval = srs.interval;
  const state = srs.state;
  return {
    id: row.id,
    word: row.word,
    lemma: row.lemma,
    translations: row.translations ?? [],
    context: row.context,
    ipa: row.ipa,
    pos: row.pos,
    sourceLang: row.sourceLang,
    bookId: row.bookId,
    page: row.page,
    box: boxFromSrs(state, interval),
    dueAt: row.dueAt || created,
    seenCount: row.seenCount ?? 0,
    ease: srs.ease,
    interval,
    reps: srs.reps,
    lapses: srs.lapses,
    state,
    step: srs.step,
    lastReviewAt: row.lastReviewAt,
    createdAt: created,
    updatedAt: row.updatedAt || created,
  };
}

async function putEntry(entry: VocabEntry): Promise<VocabEntry> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(entry);
  await txDone(tx);
  db.close();
  invalidateKnownWords();
  return entry;
}

export async function findVocabEntry(
  word: string,
  lemma?: string,
): Promise<VocabEntry | null> {
  const keys = [word, lemma]
    .filter((x): x is string => Boolean(x && x.trim()))
    .map(normalizeWord);
  if (!keys.length) return null;
  const rows = await listVocabEntries();
  return (
    rows.find((e) => {
      const w = normalizeWord(e.word);
      const l = e.lemma ? normalizeWord(e.lemma) : "";
      return keys.includes(w) || (l && keys.includes(l));
    }) ?? null
  );
}

export async function addVocabEntry(
  input: {
    id?: string;
    word: string;
    lemma?: string;
    translations: string[];
    context?: string;
    ipa?: string;
    pos?: string;
    sourceLang?: string;
    bookId?: string;
    page?: number;
  },
): Promise<VocabEntry> {
  const now = nowIso();
  const existing = input.id ? null : await findVocabEntry(input.word, input.lemma);
  const translations = [
    ...new Set(
      [...(input.translations ?? []), ...(existing?.translations ?? [])]
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ];
  const entry = normalizeVocab({
    id: input.id ?? existing?.id ?? crypto.randomUUID(),
    word: input.word.trim(),
    lemma: input.lemma?.trim() || existing?.lemma,
    translations,
    context: input.context?.trim() || existing?.context,
    ipa: input.ipa?.trim() || existing?.ipa,
    pos: input.pos?.trim() || existing?.pos,
    sourceLang: input.sourceLang || existing?.sourceLang,
    bookId: input.bookId ?? existing?.bookId,
    page: input.page ?? existing?.page,
    box: existing?.box ?? 0,
    dueAt: existing?.dueAt ?? now,
    seenCount: existing?.seenCount ?? 0,
    ease: existing?.ease,
    interval: existing?.interval,
    reps: existing?.reps,
    lapses: existing?.lapses,
    state: existing?.state,
    step: existing?.step,
    lastReviewAt: existing?.lastReviewAt,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
  return putEntry(entry);
}

let knownWordsCache: Set<string> | null = null;
const knownWordsListeners = new Set<() => void>();

/** Every word and lemma in the vocabulary, normalized, for marking text. */
export async function loadKnownWords(): Promise<Set<string>> {
  if (knownWordsCache) return knownWordsCache;
  const rows = await listVocabEntries();
  const set = new Set<string>();
  for (const row of rows) {
    const w = normalizeWord(row.word);
    if (w) set.add(w);
    if (row.lemma) {
      const l = normalizeWord(row.lemma);
      if (l) set.add(l);
    }
  }
  knownWordsCache = set;
  return set;
}

export function knownWordsNow(): Set<string> | null {
  return knownWordsCache;
}

/** Called whenever the vocabulary changes, so open pages re-mark. */
export function invalidateKnownWords(): void {
  knownWordsCache = null;
  for (const fn of knownWordsListeners) fn();
}

export function subscribeKnownWords(fn: () => void): () => void {
  knownWordsListeners.add(fn);
  return () => knownWordsListeners.delete(fn);
}

export async function listVocabEntries(): Promise<VocabEntry[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const req = tx.objectStore(STORE).getAll();
  const rows = await new Promise<VocabEntry[]>((resolve, reject) => {
    req.onsuccess = () =>
      resolve(((req.result as Partial<VocabEntry>[]) ?? []).map((r) =>
        normalizeVocab(r as VocabEntry),
      ));
    req.onerror = () => reject(req.error);
  });
  await txDone(tx);
  db.close();
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteVocabEntry(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  await txDone(tx);
  db.close();
  invalidateKnownWords();
}

export function isVocabDue(entry: VocabEntry, at = new Date()): boolean {
  return new Date(entry.dueAt).getTime() <= at.getTime();
}

function dueRank(entry: VocabEntry): number {
  if (entry.state === "learning" || entry.state === "relearning") return 0;
  if (entry.state === "review") return 1;
  return 2;
}

export function dueVocabEntries(rows: VocabEntry[], at = new Date()): VocabEntry[] {
  return rows
    .filter((e) => isVocabDue(e, at))
    .sort(
      (a, b) =>
        dueRank(a) - dueRank(b) ||
        a.dueAt.localeCompare(b.dueAt) ||
        a.box - b.box,
    );
}

/** Anki-style session: all due reviews/learning, plus a daily-sized slice of new cards. */
const MAX_NEW_PER_SESSION = 20;

export function studyVocabDeck(rows: VocabEntry[], at = new Date()): VocabEntry[] {
  const due = dueVocabEntries(rows, at);
  const rest = due.filter((e) => e.state !== "new");
  const news = due.filter((e) => e.state === "new").slice(0, MAX_NEW_PER_SESSION);
  const deck = [...rest, ...news];
  return deck.length ? deck : rows;
}

export function vocabStudyStats(rows: VocabEntry[], at = new Date()) {
  return {
    total: rows.length,
    due: dueVocabEntries(rows, at).length,
    newCount: rows.filter((e) => e.state === "new").length,
    learning: rows.filter(
      (e) => e.state === "learning" || e.state === "relearning",
    ).length,
    mature: rows.filter((e) => e.state === "review" && e.interval >= 21).length,
  };
}

export function staysInStudySession(entry: VocabEntry, at = new Date()): boolean {
  return new Date(entry.dueAt).getTime() <= at.getTime() + SESSION_REINSERT_MS;
}

export async function reviewVocabEntry(
  id: string,
  grade: VocabGrade,
): Promise<VocabEntry | null> {
  const rows = await listVocabEntries();
  const current = rows.find((e) => e.id === id);
  if (!current) return null;
  return putEntry(scheduleVocab(current, grade));
}
