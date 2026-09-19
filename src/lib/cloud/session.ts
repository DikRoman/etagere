export type CloudProvider = "gdrive" | "yandex" | "dropbox" | "onedrive";
export type DiskProvider = Exclude<CloudProvider, "gdrive">;

export const CLOUD_PROVIDERS: CloudProvider[] = [
  "gdrive",
  "yandex",
  "dropbox",
  "onedrive",
];

const DISK_PROVIDERS: DiskProvider[] = ["yandex", "dropbox", "onedrive"];
const SKEW_MS = 60_000;

type StoredDiskSession = {
  accessToken?: string;
  expiresAt?: number;
  hasRefresh?: boolean;
};

const refreshInFlight = new Map<DiskProvider, Promise<string | null>>();

export function providerLabel(
  provider: CloudProvider,
  locale: "ru" | "en" = "ru",
): string {
  if (provider === "gdrive") return "Google Drive";
  if (provider === "yandex") return locale === "ru" ? "Яндекс.Диск" : "Yandex Disk";
  if (provider === "dropbox") return "Dropbox";
  return "OneDrive";
}

export function isProviderConfigured(provider: CloudProvider): boolean {
  if (provider === "gdrive")
    return Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
  if (provider === "yandex")
    return Boolean(process.env.NEXT_PUBLIC_YANDEX_CLIENT_ID);
  if (provider === "dropbox")
    return Boolean(process.env.NEXT_PUBLIC_DROPBOX_APP_KEY);
  return Boolean(process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID);
}

function storageKey(provider: DiskProvider): string {
  return `etagere-cloud-${provider}`;
}

function readDiskSession(provider: DiskProvider): StoredDiskSession | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(storageKey(provider));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredDiskSession;
  } catch {
    return { accessToken: raw };
  }
}

function writeDiskSession(provider: DiskProvider, row: StoredDiskSession): void {
  localStorage.setItem(storageKey(provider), JSON.stringify(row));
}

function liveAccessToken(row: StoredDiskSession | null): string | null {
  if (!row?.accessToken) return null;
  if (row.expiresAt && Date.now() > row.expiresAt - SKEW_MS) return null;
  return row.accessToken;
}

export function getAccessToken(provider: CloudProvider): string | null {
  if (typeof window === "undefined") return null;
  if (provider === "gdrive") {
    return localStorage.getItem("etagere-drive-token");
  }
  return liveAccessToken(readDiskSession(provider));
}

export function setAccessToken(
  provider: CloudProvider,
  token: string,
  expiresInSec?: number,
  opts?: { hasRefresh?: boolean },
): void {
  if (provider === "gdrive") {
    localStorage.setItem("etagere-drive-token", token);
    return;
  }
  const prev = readDiskSession(provider);
  writeDiskSession(provider, {
    accessToken: token,
    expiresAt: Date.now() + (expiresInSec ?? 3600) * 1000,
    hasRefresh: opts?.hasRefresh ?? prev?.hasRefresh ?? false,
  });
}

export function markDiskRefreshable(provider: DiskProvider): void {
  const prev = readDiskSession(provider) ?? {};
  writeDiskSession(provider, { ...prev, hasRefresh: true });
}

export function disconnectProvider(provider: CloudProvider): void {
  if (provider === "gdrive") {
    localStorage.removeItem("etagere-drive-token");
    localStorage.removeItem("etagere-drive-scope");
    localStorage.removeItem("etagere-drive-session");
    return;
  }
  localStorage.removeItem(storageKey(provider));
  void fetch(`/api/cloud/${provider}/session`, {
    method: "DELETE",
    credentials: "same-origin",
  }).catch(() => undefined);
}

export function isProviderConnected(provider: CloudProvider): boolean {
  if (typeof window === "undefined") return false;
  if (provider === "gdrive") {
    return Boolean(
      localStorage.getItem("etagere-drive-token") ||
        localStorage.getItem("etagere-drive-session"),
    );
  }
  const row = readDiskSession(provider);
  if (!row) return false;
  return Boolean(row.hasRefresh || row.accessToken);
}

export function connectedProviders(): CloudProvider[] {
  return CLOUD_PROVIDERS.filter(isProviderConnected);
}

export async function ensureAccessToken(
  provider: CloudProvider,
): Promise<string | null> {
  if (provider === "gdrive") return getAccessToken("gdrive");
  const live = getAccessToken(provider);
  if (live) return live;
  if (!isProviderConnected(provider)) return null;
  const existing = refreshInFlight.get(provider);
  if (existing) return existing;
  const pending = refreshDiskAccess(provider);
  refreshInFlight.set(provider, pending);
  try {
    return await pending;
  } finally {
    refreshInFlight.delete(provider);
  }
}

async function refreshDiskAccess(provider: DiskProvider): Promise<string | null> {
  const row = readDiskSession(provider);
  try {
    const res = await fetch(`/api/cloud/${provider}/refresh`, {
      method: "POST",
      credentials: "same-origin",
    });
    if (res.status === 401 || res.status === 404) {
      if (row && !row.hasRefresh) {
        localStorage.removeItem(storageKey(provider));
      }
      return null;
    }
    if (!res.ok) return liveAccessToken(row);
    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!data.access_token) return liveAccessToken(row);
    setAccessToken(provider, data.access_token, data.expires_in, {
      hasRefresh: true,
    });
    return data.access_token;
  } catch {
    return liveAccessToken(row);
  }
}

export async function refreshCloudSessions(): Promise<void> {
  await Promise.all(
    DISK_PROVIDERS.filter((p) => isProviderConnected(p)).map((p) =>
      ensureAccessToken(p),
    ),
  );
}
