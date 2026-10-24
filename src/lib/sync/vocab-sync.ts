import type { RecordModel } from "pocketbase";
import { getPb } from "@/lib/pb";
import {
  LEGACY_VOCAB_DB,
  deleteVocabEntriesRaw,
  getVocabEntry,
  listVocabEntries,
  normalizeVocab,
  normalizeWord,
  putVocabEntriesRaw,
  setVocabWriteHook,
  vocabDbName,
  type VocabEntry,
} from "@/lib/vocab";

/**
 * Mirrors the vocabulary to PocketBase (collection vocab_entries), so a card
 * survives another device, another browser and cleared site data.
 *
 * Every local write marks the card dirty; dirty cards are pushed shortly
 * after. A full sync pulls the server's cards and merges them card by card,
 * newest updatedAt winning. Deletions travel as tombstones, otherwise a card
 * removed here would come back from another device.
 */

type VocabRecord = RecordModel & {
  local_id: string;
  word?: string;
  data?: Partial<VocabEntry> | null;
  updated_at?: string;
  deleted?: boolean;
};

type Dirty = Record<string, "put" | "delete">;

const COLLECTION = "vocab_entries";
const ADOPTED_KEY = "etagere-vocab-legacy-adopted";
const PUSH_DELAY_MS = 1500;

function signedInUserId(): string | null {
  const auth = getPb().authStore;
  return auth.isValid ? (auth.record?.id ?? null) : null;
}

function dirtyKey(uid: string): string {
  return `etagere-vocab-dirty-${uid}`;
}

function readDirty(uid: string): Dirty {
  try {
    return JSON.parse(localStorage.getItem(dirtyKey(uid)) || "{}") as Dirty;
  } catch {
    return {};
  }
}

function writeDirty(uid: string, dirty: Dirty): void {
  if (Object.keys(dirty).length) {
    localStorage.setItem(dirtyKey(uid), JSON.stringify(dirty));
  } else {
    localStorage.removeItem(dirtyKey(uid));
  }
}

function markDirty(uid: string, id: string, kind: "put" | "delete"): void {
  const dirty = readDirty(uid);
  dirty[id] = kind;
  writeDirty(uid, dirty);
}

/** a strictly later than b; missing timestamps count as oldest. */
function later(a?: string, b?: string): boolean {
  return (a ? Date.parse(a) : 0) > (b ? Date.parse(b) : 0);
}

function isNotFound(e: unknown): boolean {
  return (e as { status?: number } | null)?.status === 404;
}

/** local_id -> record id, filled by a full sync and by creates. */
const remoteIds = new Map<string, string>();
let remoteIdsUser: string | null = null;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let syncInFlight: Promise<void> | null = null;
let pushInFlight: Promise<void> | null = null;

function schedulePush(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushDirtyNow();
  }, PUSH_DELAY_MS);
}

// Every local add, review or delete marks the card for upload.
setVocabWriteHook((id, kind) => {
  const uid = signedInUserId();
  if (!uid) return;
  markDirty(uid, id, kind);
  schedulePush();
});

/**
 * Before vocab was per account it lived in one shared store. The first
 * account to sign in on this browser takes those words over, so nothing
 * already learned is lost; the old store is left in place as a backup and
 * never adopted twice.
 */
async function adoptLegacyStore(uid: string): Promise<void> {
  if (localStorage.getItem(ADOPTED_KEY)) return;
  const legacy = await listVocabEntries(LEGACY_VOCAB_DB);
  if (legacy.length) {
    const mine = new Set((await listVocabEntries()).map((e) => e.id));
    const fresh = legacy.filter((e) => !mine.has(e.id));
    await putVocabEntriesRaw(fresh, vocabDbName(uid));
    for (const e of fresh) markDirty(uid, e.id, "put");
  }
  localStorage.setItem(ADOPTED_KEY, uid);
}

async function findRecordId(uid: string, localId: string): Promise<string | null> {
  const known = remoteIds.get(localId);
  if (known) return known;
  try {
    const row = await getPb()
      .collection(COLLECTION)
      .getFirstListItem<VocabRecord>(
        `user = "${uid}" && local_id = "${localId}"`,
      );
    remoteIds.set(localId, row.id);
    return row.id;
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

async function pushOne(uid: string, id: string, kind: "put" | "delete"): Promise<void> {
  const pb = getPb();
  const recordId = await findRecordId(uid, id);
  if (kind === "delete") {
    if (recordId) {
      await pb.collection(COLLECTION).update(recordId, {
        deleted: true,
        data: null,
        updated_at: new Date().toISOString(),
      });
    }
    return;
  }
  const entry = await getVocabEntry(id);
  if (!entry) return; // removed locally since; its delete is queued
  const body = {
    user: uid,
    local_id: id,
    word: entry.word,
    data: entry,
    updated_at: entry.updatedAt,
    deleted: false,
  };
  if (recordId) {
    await pb.collection(COLLECTION).update(recordId, body);
  } else {
    const created = await pb.collection(COLLECTION).create<VocabRecord>(body);
    remoteIds.set(id, created.id);
  }
}

async function pushDirty(uid: string): Promise<void> {
  const dirty = readDirty(uid);
  for (const [id, kind] of Object.entries(dirty)) {
    if (signedInUserId() !== uid) return;
    try {
      await pushOne(uid, id, kind);
      // A write during the upload re-marks the card; keep it dirty then.
      const latest = readDirty(uid);
      if (latest[id] === kind) {
        delete latest[id];
        writeDirty(uid, latest);
      }
    } catch (e) {
      console.warn("[vocab-sync] push", id, e);
    }
  }
}

function pushDirtyNow(): Promise<void> {
  const uid = signedInUserId();
  if (!uid) return Promise.resolve();
  if (pushInFlight) return pushInFlight;
  pushInFlight = (async () => {
    if (syncInFlight) await syncInFlight.catch(() => undefined);
    await pushDirty(uid);
  })().finally(() => {
    pushInFlight = null;
  });
  return pushInFlight;
}

async function fullSync(uid: string): Promise<void> {
  if (remoteIdsUser !== uid) {
    remoteIds.clear();
    remoteIdsUser = uid;
  }
  await adoptLegacyStore(uid);

  const remote = await getPb()
    .collection(COLLECTION)
    .getFullList<VocabRecord>({ filter: `user = "${uid}"` });
  const local = await listVocabEntries();
  const byId = new Map(local.map((e) => [e.id, e]));
  const dirty = readDirty(uid);
  const onServer = new Set<string>();
  const toPut = new Map<string, VocabEntry>();
  const toDelete = new Set<string>();

  for (const row of remote) {
    remoteIds.set(row.local_id, row.id);
    onServer.add(row.local_id);
    const mine = byId.get(row.local_id);
    const pending = dirty[row.local_id];

    if (row.deleted) {
      // Removed on another device. Keep ours only if it was edited after.
      if (mine && !(pending === "put" && later(mine.updatedAt, row.updated_at))) {
        toDelete.add(mine.id);
        byId.delete(mine.id);
        delete dirty[mine.id];
      }
      continue;
    }
    if (pending === "delete" || !row.data) continue;

    const theirs = normalizeVocab({
      ...row.data,
      id: row.local_id,
      word: row.data.word || row.word || "",
    });
    if (!mine || later(theirs.updatedAt, mine.updatedAt)) {
      toPut.set(theirs.id, theirs);
      byId.set(theirs.id, theirs);
      delete dirty[theirs.id];
    } else if (later(mine.updatedAt, theirs.updatedAt)) {
      dirty[mine.id] = "put";
    }
  }

  // Cards the server has never seen go up — this is how words saved before
  // sync existed reach the server.
  for (const e of byId.values()) {
    if (!onServer.has(e.id) && dirty[e.id] !== "delete") dirty[e.id] = "put";
  }

  // The same word added on two devices: keep the card with more reviews.
  const byWord = new Map<string, VocabEntry[]>();
  for (const e of byId.values()) {
    const key = normalizeWord(e.word);
    const group = byWord.get(key);
    if (group) group.push(e);
    else byWord.set(key, [e]);
  }
  for (const group of byWord.values()) {
    if (group.length < 2) continue;
    group.sort(
      (a, b) => b.reps - a.reps || b.updatedAt.localeCompare(a.updatedAt),
    );
    for (const loser of group.slice(1)) {
      toPut.delete(loser.id);
      toDelete.add(loser.id);
      dirty[loser.id] = "delete";
    }
  }

  await putVocabEntriesRaw([...toPut.values()]);
  await deleteVocabEntriesRaw([...toDelete]);
  writeDirty(uid, dirty);
  await pushDirty(uid);
}

/** Pull, merge and push. Safe to call often; concurrent calls share a run. */
export function syncVocab(): Promise<void> {
  const uid = signedInUserId();
  if (!uid) return Promise.resolve();
  if (syncInFlight) return syncInFlight;
  syncInFlight = fullSync(uid)
    .catch((e) => {
      console.warn("[vocab-sync]", e);
    })
    .finally(() => {
      syncInFlight = null;
    });
  return syncInFlight;
}
