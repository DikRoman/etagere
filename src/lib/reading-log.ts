const STORAGE_KEY = "etagere-reading-log";
const KEEP_DAYS = 90;

export type ReadingDay = {
  /** Unique bookId:page visits that day */
  keys: string[];
};

export type ReadingLog = {
  days: Record<string, ReadingDay>;
};

export type WeekBar = {
  key: string;
  label: string;
  pages: number;
  isToday: boolean;
  isFuture: boolean;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function localDateKey(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function emptyLog(): ReadingLog {
  return { days: {} };
}

export function loadReadingLog(): ReadingLog {
  if (typeof window === "undefined") return emptyLog();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyLog();
    const parsed = JSON.parse(raw) as Partial<ReadingLog>;
    return { days: parsed.days ?? {} };
  } catch {
    return emptyLog();
  }
}

function prune(log: ReadingLog, now = new Date()): ReadingLog {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
  const min = localDateKey(cutoff);
  const days: Record<string, ReadingDay> = {};
  for (const [key, value] of Object.entries(log.days)) {
    if (key >= min) days[key] = value;
  }
  return { days };
}

function saveReadingLog(log: ReadingLog): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prune(log)));
  } catch {
    /* quota / private mode */
  }
}

/** Count a unique page visit for today. Returns true if it was new. */
export function recordPageVisit(bookId: string, page: number): boolean {
  if (!bookId || page < 1) return false;
  const log = loadReadingLog();
  const day = localDateKey();
  const entry = log.days[day] ?? { keys: [] };
  const key = `${bookId}:${page}`;
  if (entry.keys.includes(key)) return false;
  entry.keys.push(key);
  log.days[day] = entry;
  saveReadingLog(log);
  return true;
}

export function pagesOn(dateKey: string, log = loadReadingLog()): number {
  return log.days[dateKey]?.keys.length ?? 0;
}

function startOfWeek(now: Date, weekStartsOn: 0 | 1): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const dow = start.getDay();
  const offset = weekStartsOn === 1 ? (dow === 0 ? 6 : dow - 1) : dow;
  start.setDate(start.getDate() - offset);
  return start;
}

const EN_SUN = ["S", "M", "T", "W", "T", "F", "S"] as const;
const RU_MON = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

export function weekBars(
  locale: "ru" | "en",
  now = new Date(),
): WeekBar[] {
  const weekStartsOn: 0 | 1 = locale === "ru" ? 1 : 0;
  const labels = locale === "ru" ? RU_MON : EN_SUN;
  const start = startOfWeek(now, weekStartsOn);
  const today = localDateKey(now);
  const log = loadReadingLog();

  return labels.map((label, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = localDateKey(d);
    return {
      key,
      label,
      pages: pagesOn(key, log),
      isToday: key === today,
      isFuture: key > today,
    };
  });
}

export function pagesLabel(count: number, locale: "ru" | "en"): string {
  if (locale === "en") return count === 1 ? "page" : "pages";
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "страница";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return "страницы";
  }
  return "страниц";
}
