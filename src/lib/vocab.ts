/** Local vocabulary (words saved from the reader lookup sheet). */

export interface VocabEntry {
  id: string;
  word: string;
  lemma?: string;
  translations: string[];
  context?: string;
  bookId?: string;
  page?: number;
  createdAt: string;
  updatedAt: string;
}

const DB_NAME = "etagere-vocab";
const DB_VERSION = 1;
const STORE = "entries";

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

function normalizeWord(s: string): string {
  return s.trim().toLowerCase();
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
  input: Omit<VocabEntry, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
  },
): Promise<VocabEntry> {
  const now = new Date().toISOString();
  const existing =
    input.id
      ? null
      : await findVocabEntry(input.word, input.lemma);
  const entry: VocabEntry = {
    id: input.id ?? existing?.id ?? crypto.randomUUID(),
    word: input.word.trim(),
    lemma: input.lemma?.trim() || existing?.lemma,
    translations: input.translations.map((t) => t.trim()).filter(Boolean),
    context: input.context?.trim() || existing?.context,
    bookId: input.bookId ?? existing?.bookId,
    page: input.page ?? existing?.page,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(entry);
  await txDone(tx);
  db.close();
  return entry;
}

export async function listVocabEntries(): Promise<VocabEntry[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const req = tx.objectStore(STORE).getAll();
  const rows = await new Promise<VocabEntry[]>((resolve, reject) => {
    req.onsuccess = () => resolve((req.result as VocabEntry[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  await txDone(tx);
  db.close();
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
