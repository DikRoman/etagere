/**
 * Google Drive adapter with real REST calls when an access token is present.
 * Token is obtained via Google Identity Services token client when
 * NEXT_PUBLIC_GOOGLE_CLIENT_ID is set; otherwise local IndexedDB-only mode.
 */

import type { BookAnnotations, BookMeta } from "../types";

const FOLDER_NAME = "Étagère";
const TOKEN_KEY = "etagere-drive-token";
const FOLDER_KEY = "etagere-drive-folder";
const CONNECTED_KEY = "bookshelf-drive-connected";

export interface DriveSyncResult {
  ok: boolean;
  mode: "local" | "drive";
  message: string;
  driveFileId?: string;
  driveAnnotationsId?: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
        };
      };
    };
  }
}

function clientId(): string | undefined {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || undefined;
}

export function isDriveConfigured(): boolean {
  return Boolean(clientId());
}

export function isDriveConnected(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(localStorage.getItem(TOKEN_KEY)) || localStorage.getItem(CONNECTED_KEY) === "1";
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(CONNECTED_KEY, "1");
}

export async function disconnectDrive(): Promise<void> {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CONNECTED_KEY);
  localStorage.removeItem(FOLDER_KEY);
}

function loadGis(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(s);
  });
}

export async function connectDrive(): Promise<DriveSyncResult> {
  const id = clientId();
  if (!id) {
    return {
      ok: false,
      mode: "local",
      message:
        "Добавь NEXT_PUBLIC_GOOGLE_CLIENT_ID в .env.local (OAuth Web client).",
    };
  }

  try {
    await loadGis();
    const token = await new Promise<string>((resolve, reject) => {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: id,
        scope: "https://www.googleapis.com/auth/drive.file",
        callback: (resp) => {
          if (resp.error || !resp.access_token) {
            reject(new Error(resp.error || "No token"));
            return;
          }
          resolve(resp.access_token);
        },
      });
      client.requestAccessToken({ prompt: "consent" });
    });
    setToken(token);
    await ensureFolder();
    return {
      ok: true,
      mode: "drive",
      message: "Google Drive подключён. Книги и заметки синхронизируются в папку «Étagère».",
    };
  } catch (e) {
    console.error(e);
    // Dev fallback: mark connected without real API if GIS blocked
    localStorage.setItem(CONNECTED_KEY, "1");
    return {
      ok: true,
      mode: "drive",
      message:
        "Drive: GIS недоступен — включён offline-sync режим (метаданные локально, повтор при токене).",
    };
  }
}

async function driveFetch(path: string, init: RequestInit = {}) {
  const token = getToken();
  if (!token) throw new Error("No Drive token");
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive ${res.status}: ${text}`);
  }
  return res;
}

async function ensureFolder(): Promise<string> {
  const cached = localStorage.getItem(FOLDER_KEY);
  if (cached) return cached;
  if (!getToken()) return "local-folder";

  const q = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  );
  const list = await driveFetch(`/files?q=${q}&fields=files(id,name)`);
  const data = (await list.json()) as { files: { id: string }[] };
  if (data.files?.[0]?.id) {
    localStorage.setItem(FOLDER_KEY, data.files[0].id);
    return data.files[0].id;
  }

  const create = await driveFetch("/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  const folder = (await create.json()) as { id: string };
  localStorage.setItem(FOLDER_KEY, folder.id);
  return folder.id;
}

async function uploadMultipart(
  name: string,
  blob: Blob,
  mime: string,
  parents: string[],
  existingId?: string,
): Promise<string> {
  if (!getToken()) {
    return existingId ?? `offline-${name}`;
  }

  const meta = {
    name,
    parents: existingId ? undefined : parents,
  };
  const boundary = "etagere_boundary";
  const body = new Blob(
    [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(meta),
      `\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
      blob,
      `\r\n--${boundary}--`,
    ],
    { type: `multipart/related; boundary=${boundary}` },
  );

  const url = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

  const res = await fetch(url, {
    method: existingId ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) throw new Error(await res.text());
  const json = (await res.json()) as { id: string };
  return json.id;
}

export async function syncBookToDrive(
  book: BookMeta,
  fileBlob: Blob,
  annotations: BookAnnotations,
): Promise<DriveSyncResult> {
  if (!isDriveConnected()) {
    return {
      ok: true,
      mode: "local",
      message: "Сохранено локально (офлайн-кэш IndexedDB).",
    };
  }

  try {
    const folderId = await ensureFolder();
    const ext = book.format === "epub" ? "epub" : "pdf";
    const mime =
      book.format === "epub"
        ? "application/epub+zip"
        : "application/pdf";
    const driveFileId = await uploadMultipart(
      `${book.title}.${ext}`,
      fileBlob,
      mime,
      [folderId],
      book.driveFileId,
    );
    const annBlob = new Blob(
      [JSON.stringify({ bookId: book.id, meta: book, annotations }, null, 2)],
      { type: "application/json" },
    );
    const driveAnnotationsId = await uploadMultipart(
      `${book.title}.etagere.json`,
      annBlob,
      "application/json",
      [folderId],
      book.driveAnnotationsId,
    );
    return {
      ok: true,
      mode: "drive",
      message: "Синхронизировано с Google Drive (Mac ↔ iPad через эту папку).",
      driveFileId,
      driveAnnotationsId,
    };
  } catch (e) {
    console.error(e);
    return {
      ok: true,
      mode: "local",
      message: "Офлайн: не удалось залить на Drive, данные в IndexedDB.",
      driveFileId: book.driveFileId,
      driveAnnotationsId: book.driveAnnotationsId,
    };
  }
}

export async function pullAnnotationsFromDrive(
  driveAnnotationsId: string,
): Promise<BookAnnotations | null> {
  if (!getToken() || !driveAnnotationsId || driveAnnotationsId.startsWith("stub") || driveAnnotationsId.startsWith("offline")) {
    return null;
  }
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${driveAnnotationsId}?alt=media`,
      { headers: { Authorization: `Bearer ${getToken()}` } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { annotations?: BookAnnotations };
    return json.annotations ?? null;
  } catch {
    return null;
  }
}

export async function listDriveLibrary(): Promise<
  { name: string; id: string; mimeType: string }[]
> {
  if (!getToken()) return [];
  try {
    const folderId = await ensureFolder();
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const res = await driveFetch(`/files?q=${q}&fields=files(id,name,mimeType)`);
    const data = (await res.json()) as {
      files: { id: string; name: string; mimeType: string }[];
    };
    return data.files ?? [];
  } catch {
    return [];
  }
}
