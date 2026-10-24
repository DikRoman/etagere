/**
 * Google Drive import — pick PDF/EPUB from user's Drive and open in the reader.
 * Google Picker with the drive.file scope.
 *
 * Authorization lives in @/lib/cloud/session like every other disk: the server
 * holds a refresh token and mints access tokens on demand. The old browser-only
 * GIS token client is gone — it issued a one-hour token with nothing to renew
 * it, so the connection died every hour.
 */

import { readWithProgress, type DownloadProgress } from "@/lib/fetch-progress";
import {
  disconnectProvider,
  ensureAccessToken,
  getAccessToken,
  isProviderConnected,
} from "@/lib/cloud/session";

const BOOK_MIMES = "application/pdf,application/epub+zip";
const GOOGLE_EXPORT_PDF = "application/vnd.google-apps.document";

export interface DriveConnectResult {
  ok: boolean;
  message: string;
}

export interface DrivePickedFile {
  id: string;
  name: string;
  mimeType: string;
}

declare global {
  interface Window {
    gapi?: {
      load: (name: string, callback: () => void) => void;
    };
    google?: {
      picker?: {
        PickerBuilder: new () => PickerBuilderInstance;
        DocsView: new (viewId: string) => DocsViewInstance;
        ViewId: { DOCS: string; PDFS: string };
        Feature: { MULTISELECT_ENABLED: string };
        Action: { PICKED: string; CANCEL: string };
        Response: { ACTION: string; DOCUMENTS: string };
        Document: { ID: string; NAME: string; MIME_TYPE: string };
      };
    };
  }
}

interface DocsViewInstance {
  setMimeTypes: (mimes: string) => DocsViewInstance;
  setFileIds: (ids: string[]) => DocsViewInstance;
  setIncludeFolders: (include: boolean) => DocsViewInstance;
}

interface PickerBuilderInstance {
  setAppId: (id: string) => PickerBuilderInstance;
  setOAuthToken: (token: string) => PickerBuilderInstance;
  setDeveloperKey: (key: string) => PickerBuilderInstance;
  setOrigin: (origin: string) => PickerBuilderInstance;
  addView: (view: DocsViewInstance) => PickerBuilderInstance;
  enableFeature: (feature: string) => PickerBuilderInstance;
  setCallback: (cb: (data: PickerResponse) => void) => PickerBuilderInstance;
  build: () => { setVisible: (v: boolean) => void };
}

interface PickerResponse {
  action?: string;
  docs?: PickerDoc[];
  [key: string]: string | PickerDoc[] | undefined;
}

interface PickerDoc {
  id?: string;
  name?: string;
  mimeType?: string;
}

function clientId(): string | undefined {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || undefined;
}

function apiKey(): string | undefined {
  return process.env.NEXT_PUBLIC_GOOGLE_API_KEY || undefined;
}

function appId(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_APP_ID || "1069484265184";
}

export function isDriveConfigured(): boolean {
  return Boolean(clientId());
}

export function isDriveConnected(): boolean {
  return isProviderConnected("gdrive");
}

function getToken(): string | null {
  return getAccessToken("gdrive");
}

export function disconnectDrive(): void {
  disconnectProvider("gdrive");
}

function linkAccessError(): string {
  if (typeof navigator !== "undefined" && navigator.language.startsWith("ru")) {
    return "Не удалось открыть файл по ссылке. Дай доступ «всем, у кого есть ссылка», или используй «Добавить с Google Drive».";
  }
  return "Could not open this Drive link. Share it with “anyone with the link”, or use “Add from Google Drive”.";
}

export function parseDriveFileId(urlOrId: string): string | null {
  const s = urlOrId.trim();
  const fromPath = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fromPath?.[1]) return fromPath[1];
  const fromQuery = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (fromQuery?.[1]) return fromQuery[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(s)) return s;
  return null;
}

function loadPickerApi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.picker) {
      resolve();
      return;
    }
    const start = () => {
      if (!window.gapi) {
        reject(new Error("gapi missing"));
        return;
      }
      window.gapi.load("picker", () => resolve());
    };
    if (window.gapi) {
      start();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://apis.google.com/js/api.js";
    s.async = true;
    s.onload = start;
    s.onerror = () => reject(new Error("Failed to load Google API script"));
    document.head.appendChild(s);
  });
}

function pickerAction(data: PickerResponse, picker: NonNullable<Window["google"]>["picker"]): string {
  const raw =
    (picker ? data[picker.Response.ACTION] : undefined) ??
    data.action ??
    "";
  return String(raw).toLowerCase();
}

function pickerDocs(data: PickerResponse, picker: NonNullable<Window["google"]>["picker"]): PickerDoc[] {
  const docs =
    (picker ? data[picker.Response.DOCUMENTS] : undefined) ??
    data.docs;
  return Array.isArray(docs) ? docs : [];
}

function docField(doc: PickerDoc, picker: NonNullable<Window["google"]>["picker"], field: "ID" | "NAME" | "MIME_TYPE"): string {
  const key = picker?.Document?.[field];
  if (key && doc[key as keyof PickerDoc]) {
    return String(doc[key as keyof PickerDoc]);
  }
  if (field === "ID") return doc.id ?? "";
  if (field === "NAME") return doc.name ?? "";
  return doc.mimeType ?? "";
}

const PICKER_CONFIG_ERROR_RU =
  "Google Picker недоступен (403). В Google Cloud → Credentials → API key: referrers https://etagere.ru/* и https://docs.google.com/*; API restrictions — Google Picker API и Google Drive API; OAuth app — Publish app.";

const PICKER_CONFIG_ERROR_EN =
  "Google Picker unavailable (403). In Google Cloud → Credentials → API key: allow referrers https://etagere.ru/* and https://docs.google.com/*; enable Picker + Drive APIs; publish the OAuth app.";

function pickerConfigError(): string {
  if (typeof navigator !== "undefined" && navigator.language.startsWith("ru")) {
    return PICKER_CONFIG_ERROR_RU;
  }
  return PICKER_CONFIG_ERROR_EN;
}

/** The picker closed, or stayed open, without ever calling back. */
function pickerNoAnswerError(): string {
  if (typeof navigator !== "undefined" && navigator.language.startsWith("ru")) {
    return "Окно Google не ответило. Попробуй ещё раз или вставь ссылку на файл Drive в поле ниже.";
  }
  return "Google’s window did not answer. Try again, or paste the Drive file link in the field below.";
}

/** Google Picker markup, used to tell "still open" from "closed silently". */
function pickerDialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".picker-dialog, .picker.modal-dialog");
}

async function fetchDriveFileMeta(
  fileId: string,
  auth: { token?: string; key?: string },
): Promise<DrivePickedFile | null> {
  const params = new URLSearchParams({
    fields: "id,name,mimeType",
    supportsAllDrives: "true",
  });
  if (!auth.token && auth.key) params.set("key", auth.key);

  const headers: HeadersInit = {};
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;

  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?${params}`,
    { headers },
  );

  if (metaRes.status === 401 || metaRes.status === 403 || metaRes.status === 404) {
    return null;
  }
  if (!metaRes.ok) {
    throw new Error(`Drive metadata ${metaRes.status}`);
  }

  const meta = (await metaRes.json()) as {
    id?: string;
    name?: string;
    mimeType?: string;
  };

  return {
    id: meta.id || fileId,
    name: meta.name || "book.pdf",
    mimeType: meta.mimeType || "application/pdf",
  };
}

function ensureExtension(name: string, mimeType: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf") || lower.endsWith(".epub")) return name;
  if (mimeType.includes("epub")) return `${name}.epub`;
  return `${name}.pdf`;
}

/**
 * Sends the browser to the shared OAuth start route. This navigates away and
 * comes back through /cloud/complete, so it never resolves in place.
 */
export async function connectDrive(): Promise<DriveConnectResult> {
  if (!clientId()) {
    return {
      ok: false,
      message: "Google Drive не настроен на сервере (нет Client ID).",
    };
  }
  window.location.assign("/api/cloud/gdrive/start");
  return { ok: true, message: "Google Drive подключается…" };
}

/**
 * A live access token for Drive, renewed from the server-held refresh token.
 * Never opens a Google window: if the refresh fails the user is disconnected
 * and has to reconnect deliberately.
 */
export async function ensureDriveToken(): Promise<string> {
  const token = await ensureAccessToken("gdrive");
  if (!token) throw new Error("DRIVE_DISCONNECTED");
  return token;
}

async function validateDriveToken(token: string): Promise<boolean> {
  try {
    const res = await fetch("/api/cloud/gdrive/ping", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Renew the Drive access token ahead of expiry. Never opens a Google window. */
export async function keepDriveAlive(): Promise<void> {
  if (!isDriveConnected()) return;
  await ensureAccessToken("gdrive");
}

export async function pickDriveBooks(): Promise<DrivePickedFile[] | null> {
  if (!isDriveConfigured()) {
    throw new Error("Google Drive не настроен на сервере.");
  }

  const key = apiKey();
  if (!key) {
    throw new Error(
      "Нужен NEXT_PUBLIC_GOOGLE_API_KEY (Browser key) в Google Cloud → Credentials.",
    );
  }

  // Not connected, or the refresh token was revoked: send the user through
  // consent instead of failing with an opaque error. connectDrive() navigates
  // away, so nothing after it runs.
  let token: string;
  try {
    token = await ensureDriveToken();
  } catch {
    await connectDrive();
    return null;
  }
  if (!(await validateDriveToken(token))) {
    await connectDrive();
    return null;
  }

  await loadPickerApi();

  const picker = window.google!.picker!;
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://etagere.ru";

  return new Promise((resolve, reject) => {
    let settled = false;
    let sawDialog = false;

    const timers: number[] = [];
    const cleanup = () => {
      for (const id of timers) window.clearTimeout(id);
      window.clearInterval(watcher);
    };

    const finish = (value: DrivePickedFile[] | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    // Without these the promise can hang forever: if Google's iframe never
    // calls back, the caller just spins with nothing on screen.
    //
    // 1. The dialog never appears — the API key or OAuth app is misconfigured.
    timers.push(
      window.setTimeout(() => {
        if (settled || sawDialog) return;
        fail(new Error(pickerConfigError()));
      }, 8000),
    );

    // 2. The dialog appeared and then went away without a callback. This is
    //    the silent case: the window closes and nothing happens.
    const watcher = window.setInterval(() => {
      if (settled) return;
      const open = Boolean(pickerDialog());
      if (open) {
        sawDialog = true;
        return;
      }
      if (!sawDialog) return;
      // Give a late callback a moment to land before giving up.
      timers.push(
        window.setTimeout(() => {
          if (settled) return;
          console.warn("[etagere] Google Picker closed without a callback");
          fail(new Error(pickerNoAnswerError()));
        }, 1200),
      );
      window.clearInterval(watcher);
    }, 400);

    // 3. Backstop: the dialog stays open but nothing ever comes back.
    timers.push(
      window.setTimeout(() => {
        if (settled) return;
        console.warn("[etagere] Google Picker timed out with no answer");
        fail(new Error(pickerNoAnswerError()));
      }, 5 * 60 * 1000),
    );

    try {
      const builder = new picker.PickerBuilder()
        .setAppId(appId())
        .setOAuthToken(token)
        .setDeveloperKey(key)
        .setOrigin(origin)
        .addView(new picker.DocsView(picker.ViewId.PDFS))
        .addView(
          new picker.DocsView(picker.ViewId.DOCS)
            .setIncludeFolders(true)
            .setMimeTypes(BOOK_MIMES),
        )
        .enableFeature(picker.Feature.MULTISELECT_ENABLED);

      builder.setCallback((data) => {
        sawDialog = true;
        const action = pickerAction(data, picker);
        if (action === "cancel" || action === "cancelled") {
          finish(null);
          return;
        }
        if (action !== "picked") return;

        const docs = pickerDocs(data, picker);
        const files: DrivePickedFile[] = [];
        for (const doc of docs) {
          const id = docField(doc, picker, "ID");
          if (!id) continue;
          files.push({
            id,
            name: docField(doc, picker, "NAME") || "book.pdf",
            mimeType: docField(doc, picker, "MIME_TYPE") || "application/pdf",
          });
        }
        if (!files.length) {
          fail(new Error("Google Picker не вернул ID файла."));
          return;
        }
        finish(files);
      });

      builder.build().setVisible(true);
    } catch (e) {
      fail(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

async function driveDownload(
  fileId: string,
  auth: { token?: string; key?: string },
): Promise<{ blob: Blob; name: string; mimeType: string } | null> {
  const meta = await fetchDriveFileMeta(fileId, auth);
  if (!meta) return null;

  let mimeType = meta.mimeType || "application/pdf";
  const params = new URLSearchParams({ supportsAllDrives: "true" });
  if (!auth.token && auth.key) params.set("key", auth.key);

  let url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&${params}`;
  if (mimeType === GOOGLE_EXPORT_PDF) {
    const exportParams = new URLSearchParams({
      mimeType: "application/pdf",
    });
    if (!auth.token && auth.key) exportParams.set("key", auth.key);
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?${exportParams}`;
    mimeType = "application/pdf";
  } else if (mimeType.startsWith("application/vnd.google-apps.")) {
    throw new Error(
      "Этот тип Google Docs не поддерживается. Нужен PDF или EPUB на Drive.",
    );
  }

  const headers: HeadersInit = {};
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;

  const res = await fetch(url, { headers });
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Не удалось скачать файл (${res.status}).`);
  }

  const blob = await res.blob();
  if (blob.type.includes("text/html") && blob.size < 512_000) {
    throw new Error(
      "Drive вернул HTML вместо файла. Проверь доступ к файлу или попробуй другой PDF.",
    );
  }

  const name = ensureExtension(meta.name || "book.pdf", mimeType);
  return { blob, name, mimeType };
}

async function driveDownloadViaProxy(
  fileId: string,
  token: string,
  onProgress?: DownloadProgress,
): Promise<{ blob: Blob; name: string; mimeType: string } | "unauthorized" | null> {
  const res = await fetch(
    `/api/cloud/gdrive/file?id=${encodeURIComponent(fileId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (res.status === 401) return "unauthorized";
  if (res.status === 403 || res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Не удалось скачать файл (${res.status}).`);
  }
  const blob = await readWithProgress(res, onProgress);
  if (blob.size < 1) return null;
  if (blob.type.includes("text/html") && blob.size < 512_000) {
    throw new Error(
      "Drive вернул HTML вместо файла. Проверь доступ к файлу или попробуй другой PDF.",
    );
  }
  const mimeType =
    decodeURIComponent(res.headers.get("x-mime-type") || "") ||
    blob.type ||
    "application/pdf";
  const rawName = res.headers.get("x-file-name") || "book.pdf";
  let name = "book.pdf";
  try {
    name = decodeURIComponent(rawName);
  } catch {
    name = rawName;
  }
  return { blob, name: ensureExtension(name, mimeType), mimeType };
}

export async function downloadDriveFile(
  fileId: string,
  onProgress?: DownloadProgress,
): Promise<{ blob: Blob; name: string; mimeType: string }> {
  // Renewal is silent now, so this is safe to call from background sync.
  let token: string | null = null;
  try {
    token = await ensureDriveToken();
  } catch {
    token = null;
  }

  if (token) {
    const viaProxy = await driveDownloadViaProxy(fileId, token, onProgress);
    if (viaProxy && viaProxy !== "unauthorized") return viaProxy;
  }

  // Public "anyone with the link" files still work without a connection.
  const key = apiKey();
  if (key) {
    try {
      const viaKey = await driveDownload(fileId, { key });
      if (viaKey) return viaKey;
    } catch {
      /* private files 403 via key */
    }
  }

  throw new Error(linkAccessError());
}

export async function importDriveFileById(
  fileId: string,
): Promise<DrivePickedFile> {
  const key = apiKey();
  const token = getToken();

  if (key) {
    const publicMeta = await fetchDriveFileMeta(fileId, { key });
    if (publicMeta) return publicMeta;
  }

  if (token) {
    const owned = await fetchDriveFileMeta(fileId, { token });
    if (owned) return owned;
  }

  throw new Error(linkAccessError());
}

export async function driveFileToBookFile(picked: DrivePickedFile): Promise<File> {
  const { blob, name, mimeType } = await downloadDriveFile(picked.id);
  return new File([blob], name, {
    type: mimeType || picked.mimeType || blob.type || "application/pdf",
  });
}

const FOLDER_NAME = "Étagère";
let folderIdMemo: string | null = null;

async function ensureEtagereFolder(token: string): Promise<string> {
  if (folderIdMemo) return folderIdMemo;
  const q = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  );
  const list = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (list.ok) {
    const data = (await list.json()) as { files?: { id?: string }[] };
    const id = data.files?.[0]?.id;
    if (id) {
      folderIdMemo = id;
      return id;
    }
  }
  const created = await fetch(
    "https://www.googleapis.com/drive/v3/files?fields=id",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
      }),
    },
  );
  if (!created.ok) throw new Error(`Drive folder ${created.status}`);
  const row = (await created.json()) as { id?: string };
  if (!row.id) throw new Error("Drive folder missing id");
  folderIdMemo = row.id;
  return row.id;
}

export async function listDriveBooks(): Promise<
  { id: string; name: string; mimeType?: string }[]
> {
  const token = await ensureDriveToken();
  const folderId = await ensureEtagereFolder(token);
  const q = encodeURIComponent(
    `'${folderId}' in parents and trashed=false and (mimeType='application/pdf' or mimeType='application/epub+zip' or name contains '.pdf' or name contains '.epub')`,
  );
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&pageSize=200`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Drive list ${res.status}`);
  const data = (await res.json()) as {
    files?: { id?: string; name?: string; mimeType?: string }[];
  };
  return (data.files ?? [])
    .filter((f) => f.id && /\.(pdf|epub)$/i.test(f.name || ""))
    .map((f) => ({
      id: f.id!,
      name: f.name || "book.pdf",
      mimeType: f.mimeType,
    }));
}

/** Upload a book into the user's Étagère folder. Returns Drive file id. */
export async function uploadDriveBook(
  file: Blob,
  name: string,
  mimeType: string,
): Promise<string> {
  const token = await ensureDriveToken();
  const folderId = await ensureEtagereFolder(token);
  const metadata = JSON.stringify({
    name,
    parents: [folderId],
  });
  const form = new FormData();
  form.append(
    "metadata",
    new Blob([metadata], { type: "application/json" }),
  );
  form.append("file", new File([file], name, { type: mimeType }));
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    },
  );
  if (!res.ok) throw new Error(`Drive upload ${res.status}`);
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error("Drive upload missing id");
  return data.id;
}
