export type CloudProvider = "gdrive" | "yandex" | "dropbox" | "onedrive";

export const CLOUD_PROVIDERS: CloudProvider[] = [
  "gdrive",
  "yandex",
  "dropbox",
  "onedrive",
];

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

export function getAccessToken(provider: CloudProvider): string | null {
  if (typeof window === "undefined") return null;
  if (provider === "gdrive") {
    return localStorage.getItem("etagere-drive-token");
  }
  const raw = localStorage.getItem(`etagere-cloud-${provider}`);
  if (!raw) return null;
  try {
    const row = JSON.parse(raw) as {
      accessToken?: string;
      expiresAt?: number;
    };
    if (row.expiresAt && Date.now() > row.expiresAt - 15_000) return null;
    return row.accessToken || null;
  } catch {
    return null;
  }
}

export function setAccessToken(
  provider: CloudProvider,
  token: string,
  expiresInSec?: number,
): void {
  if (provider === "gdrive") {
    localStorage.setItem("etagere-drive-token", token);
    return;
  }
  localStorage.setItem(
    `etagere-cloud-${provider}`,
    JSON.stringify({
      accessToken: token,
      expiresAt: expiresInSec
        ? Date.now() + expiresInSec * 1000
        : Date.now() + 3600 * 1000,
    }),
  );
}

export function disconnectProvider(provider: CloudProvider): void {
  if (provider === "gdrive") {
    localStorage.removeItem("etagere-drive-token");
    localStorage.removeItem("etagere-drive-scope");
    return;
  }
  localStorage.removeItem(`etagere-cloud-${provider}`);
}

export function isProviderConnected(provider: CloudProvider): boolean {
  return Boolean(getAccessToken(provider));
}

export function connectedProviders(): CloudProvider[] {
  return CLOUD_PROVIDERS.filter(isProviderConnected);
}
