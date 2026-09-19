import { randomBytes } from "crypto";
import { appOrigin } from "@/lib/vk-id";
import type { CloudProvider } from "./session";

export type DiskProvider = Exclude<CloudProvider, "gdrive">;

export type CloudTokenSet = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
};

export const REFRESH_COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 180,
};

export function refreshCookieName(provider: DiskProvider): string {
  return `cloud_${provider}_rt`;
}

export function randomState(): string {
  return randomBytes(24).toString("base64url");
}

export function diskRedirectUri(provider: DiskProvider): string {
  return `${appOrigin()}/api/cloud/${provider}/callback`;
}

export function yandexDiskAuthUrl(state: string): string {
  const id = process.env.NEXT_PUBLIC_YANDEX_CLIENT_ID?.trim() || "";
  const q = new URLSearchParams({
    response_type: "code",
    client_id: id,
    redirect_uri: diskRedirectUri("yandex"),
    state,
    scope: "cloud_api:disk.appfolder",
  });
  return `https://oauth.yandex.ru/authorize?${q}`;
}

function asTokenSet(
  data: {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    error_description?: string;
  },
  ok: boolean,
  fallback: string,
): CloudTokenSet {
  if (!ok || !data.access_token) {
    throw new Error(data.error_description || fallback);
  }
  return {
    access_token: data.access_token,
    expires_in: data.expires_in,
    refresh_token: data.refresh_token,
  };
}

export async function exchangeYandexDiskCode(code: string): Promise<CloudTokenSet> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: process.env.NEXT_PUBLIC_YANDEX_CLIENT_ID?.trim() || "",
    client_secret: process.env.YANDEX_CLIENT_SECRET?.trim() || "",
    redirect_uri: diskRedirectUri("yandex"),
  });
  const res = await fetch("https://oauth.yandex.ru/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return asTokenSet(
    (await res.json()) as CloudTokenSet & { error_description?: string },
    res.ok,
    "YANDEX_DISK_TOKEN",
  );
}

export async function refreshYandexDiskToken(
  refreshToken: string,
): Promise<CloudTokenSet> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: process.env.NEXT_PUBLIC_YANDEX_CLIENT_ID?.trim() || "",
    client_secret: process.env.YANDEX_CLIENT_SECRET?.trim() || "",
  });
  const res = await fetch("https://oauth.yandex.ru/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return asTokenSet(
    (await res.json()) as CloudTokenSet & { error_description?: string },
    res.ok,
    "YANDEX_DISK_REFRESH",
  );
}

export function dropboxAuthUrl(state: string): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: process.env.NEXT_PUBLIC_DROPBOX_APP_KEY?.trim() || "",
    redirect_uri: diskRedirectUri("dropbox"),
    state,
    token_access_type: "offline",
  });
  return `https://www.dropbox.com/oauth2/authorize?${q}`;
}

export async function exchangeDropboxCode(code: string): Promise<CloudTokenSet> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: process.env.NEXT_PUBLIC_DROPBOX_APP_KEY?.trim() || "",
    client_secret: process.env.DROPBOX_APP_SECRET?.trim() || "",
    redirect_uri: diskRedirectUri("dropbox"),
  });
  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return asTokenSet(
    (await res.json()) as CloudTokenSet & { error_description?: string },
    res.ok,
    "DROPBOX_TOKEN",
  );
}

export async function refreshDropboxToken(
  refreshToken: string,
): Promise<CloudTokenSet> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: process.env.NEXT_PUBLIC_DROPBOX_APP_KEY?.trim() || "",
    client_secret: process.env.DROPBOX_APP_SECRET?.trim() || "",
  });
  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return asTokenSet(
    (await res.json()) as CloudTokenSet & { error_description?: string },
    res.ok,
    "DROPBOX_REFRESH",
  );
}

export function onedriveAuthUrl(state: string): string {
  const q = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID?.trim() || "",
    response_type: "code",
    redirect_uri: diskRedirectUri("onedrive"),
    response_mode: "query",
    scope: "offline_access Files.ReadWrite.AppFolder",
    state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${q}`;
}

export async function exchangeOnedriveCode(code: string): Promise<CloudTokenSet> {
  const body = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID?.trim() || "",
    client_secret: process.env.ONEDRIVE_CLIENT_SECRET?.trim() || "",
    code,
    redirect_uri: diskRedirectUri("onedrive"),
    grant_type: "authorization_code",
  });
  const res = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  return asTokenSet(
    (await res.json()) as CloudTokenSet & { error_description?: string },
    res.ok,
    "ONEDRIVE_TOKEN",
  );
}

export async function refreshOnedriveToken(
  refreshToken: string,
): Promise<CloudTokenSet> {
  const body = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID?.trim() || "",
    client_secret: process.env.ONEDRIVE_CLIENT_SECRET?.trim() || "",
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  return asTokenSet(
    (await res.json()) as CloudTokenSet & { error_description?: string },
    res.ok,
    "ONEDRIVE_REFRESH",
  );
}

export async function refreshDiskToken(
  provider: DiskProvider,
  refreshToken: string,
): Promise<CloudTokenSet> {
  if (provider === "yandex") return refreshYandexDiskToken(refreshToken);
  if (provider === "dropbox") return refreshDropboxToken(refreshToken);
  return refreshOnedriveToken(refreshToken);
}

export function providerConfigured(provider: DiskProvider): boolean {
  if (provider === "yandex") {
    return Boolean(
      process.env.NEXT_PUBLIC_YANDEX_CLIENT_ID &&
        process.env.YANDEX_CLIENT_SECRET,
    );
  }
  if (provider === "dropbox") {
    return Boolean(
      process.env.NEXT_PUBLIC_DROPBOX_APP_KEY &&
        process.env.DROPBOX_APP_SECRET,
    );
  }
  return Boolean(
    process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID &&
      process.env.ONEDRIVE_CLIENT_SECRET,
  );
}
