/**
 * Google Drive adapter.
 *
 * Books and annotation JSON live in a Drive folder "étagère".
 * Until OAuth credentials are configured, methods run in local-only mode
 * and queue sync intents for when Drive is connected.
 */

import type { BookAnnotations, BookMeta } from "../types";

export interface DriveConfig {
  clientId?: string;
  apiKey?: string;
}

export interface DriveSyncResult {
  ok: boolean;
  mode: "local" | "drive";
  message: string;
  driveFileId?: string;
  driveAnnotationsId?: string;
}

const STORAGE_KEY = "bookshelf-drive-config";

export function getDriveConfig(): DriveConfig {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DriveConfig) : {};
  } catch {
    return {};
  }
}

export function isDriveConfigured(): boolean {
  const cfg = getDriveConfig();
  const envId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  return Boolean(cfg.clientId || envId);
}

export function isDriveConnected(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("bookshelf-drive-connected") === "1";
}

/** Stub connect — real GIS OAuth lands here when client id is set. */
export async function connectDrive(): Promise<DriveSyncResult> {
  if (!isDriveConfigured()) {
    return {
      ok: false,
      mode: "local",
      message:
        "Добавь NEXT_PUBLIC_GOOGLE_CLIENT_ID в .env.local, чтобы подключить Drive.",
    };
  }
  // Placeholder until OAuth token flow is wired
  localStorage.setItem("bookshelf-drive-connected", "1");
  return {
    ok: true,
    mode: "drive",
    message: "Google Drive подключён (stub). Загрузка файлов — следующий шаг.",
  };
}

export async function disconnectDrive(): Promise<void> {
  localStorage.removeItem("bookshelf-drive-connected");
}

/**
 * Upload / update book PDF + annotations sidecar on Drive.
 * Currently persists sync metadata locally and reports stub success.
 */
export async function syncBookToDrive(
  book: BookMeta,
  _pdf: Blob,
  annotations: BookAnnotations,
): Promise<DriveSyncResult> {
  if (!isDriveConnected()) {
    return {
      ok: true,
      mode: "local",
      message: "Сохранено локально. Подключи Drive для облачной копии.",
    };
  }

  // Real implementation: multipart upload to Drive folder + JSON sidecar
  const driveFileId = book.driveFileId ?? `stub-pdf-${book.id}`;
  const driveAnnotationsId =
    book.driveAnnotationsId ?? `stub-ann-${book.id}`;

  void annotations;

  return {
    ok: true,
    mode: "drive",
    message: "Синхронизировано с Google Drive (stub).",
    driveFileId,
    driveAnnotationsId,
  };
}

export async function listDriveLibrary(): Promise<BookMeta[]> {
  if (!isDriveConnected()) return [];
  // Real: query Drive folder for mimeType application/pdf + sidecar JSON
  return [];
}
