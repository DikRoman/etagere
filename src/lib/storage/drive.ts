/**
 * Google Drive import — pick PDF/EPUB from user's Drive and open in the reader.
 * Uses GIS token + Google Picker (drive.file scope).
 */

const TOKEN_KEY = "etagere-drive-token";
const SCOPE_KEY = "etagere-drive-scope";
const SCOPE_FILE = "https://www.googleapis.com/auth/drive.file";
const SCOPE_READ = "https://www.googleapis.com/auth/drive.readonly";
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
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
        };
      };
      picker?: {
        PickerBuilder: new () => PickerBuilderInstance;
        DocsView: new (viewId: string) => DocsViewInstance;
        ViewId: { DOCS: string; PDFS: string };
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
  if (typeof window === "undefined") return false;
  return Boolean(localStorage.getItem(TOKEN_KEY));
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string, scope = SCOPE_FILE) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(SCOPE_KEY, scope);
}

export function disconnectDrive(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SCOPE_KEY);
}

function storedScope(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(SCOPE_KEY) || "";
}

function hasReadScope(): boolean {
  return storedScope().includes("drive.readonly");
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

export async function connectDrive(opts?: {
  forceConsent?: boolean;
  scope?: string;
}): Promise<DriveConnectResult> {
  const id = clientId();
  if (!id) {
    return {
      ok: false,
      message: "Google Drive не настроен на сервере (нет Client ID).",
    };
  }

  const scope = opts?.scope || SCOPE_FILE;

  try {
    await loadGis();
    const token = await new Promise<string>((resolve, reject) => {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: id,
        scope,
        callback: (resp) => {
          if (resp.error || !resp.access_token) {
            reject(new Error(resp.error || "No token"));
            return;
          }
          resolve(resp.access_token);
        },
      });
      const prompt =
        opts?.forceConsent || !getToken() ? "consent" : "";
      client.requestAccessToken({ prompt });
    });
    setToken(token, scope);
    return {
      ok: true,
      message: "Google Drive подключён.",
    };
  } catch (e) {
    console.error(e);
    return {
      ok: false,
      message:
        e instanceof Error
          ? e.message
          : "Не удалось подключить Google Drive.",
    };
  }
}

async function ensureDriveToken(
  force = false,
  scope = SCOPE_FILE,
): Promise<string> {
  const needRead = scope.includes("drive.readonly");
  if (!force && getToken() && (!needRead || hasReadScope())) {
    return getToken()!;
  }
  if (force) disconnectDrive();
  const result = await connectDrive({
    forceConsent: force || (needRead && !hasReadScope()),
    scope: needRead ? `${SCOPE_FILE} ${SCOPE_READ}` : SCOPE_FILE,
  });
  if (!result.ok) throw new Error(result.message);
  const token = getToken();
  if (!token) throw new Error("No Drive token");
  return token;
}

async function validateDriveToken(token: string): Promise<boolean> {
  const res = await fetch(
    "https://www.googleapis.com/drive/v3/about?fields=user",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return res.ok;
}

export async function pickDriveBook(): Promise<DrivePickedFile | null> {
  if (!isDriveConfigured()) {
    throw new Error("Google Drive не настроен на сервере.");
  }

  const key = apiKey();
  if (!key) {
    throw new Error(
      "Нужен NEXT_PUBLIC_GOOGLE_API_KEY (Browser key) в Google Cloud → Credentials.",
    );
  }

  let token = await ensureDriveToken();
  if (!(await validateDriveToken(token))) {
    disconnectDrive();
    token = await ensureDriveToken(true);
  }

  await loadPickerApi();

  const picker = window.google!.picker!;
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://etagere.ru";

  return new Promise((resolve, reject) => {
    let settled = false;
    let sawPickerFrame = false;

    const finish = (value: DrivePickedFile | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(failTimer);
      resolve(value);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(failTimer);
      reject(error);
    };

    const failTimer = window.setTimeout(() => {
      if (settled || sawPickerFrame) return;
      fail(new Error(pickerConfigError()));
    }, 4000);

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
        );

      builder.setCallback((data) => {
        sawPickerFrame = true;
        const action = pickerAction(data, picker);
        if (action === "cancel" || action === "cancelled") {
          finish(null);
          return;
        }
        if (action !== "picked") return;

        const doc = pickerDocs(data, picker)[0];
        const id = doc ? docField(doc, picker, "ID") : "";
        if (!id) {
          fail(new Error("Google Picker не вернул ID файла."));
          return;
        }
        finish({
          id,
          name: docField(doc, picker, "NAME") || "book.pdf",
          mimeType: docField(doc, picker, "MIME_TYPE") || "application/pdf",
        });
      });

      builder.build().setVisible(true);
      window.setTimeout(() => {
        sawPickerFrame = true;
      }, 800);
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

export async function downloadDriveFile(
  fileId: string,
): Promise<{ blob: Blob; name: string; mimeType: string }> {
  const key = apiKey();
  const token = getToken();

  if (token) {
    const viaToken = await driveDownload(fileId, { token });
    if (viaToken) return viaToken;
  }

  if (key) {
    const viaKey = await driveDownload(fileId, { key });
    if (viaKey) return viaKey;
  }

  const readToken = await ensureDriveToken(false, SCOPE_READ);
  const viaRead = await driveDownload(fileId, { token: readToken });
  if (viaRead) return viaRead;

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

  const readToken = await ensureDriveToken(false, SCOPE_READ);
  const readable = await fetchDriveFileMeta(fileId, { token: readToken });
  if (readable) return readable;

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
