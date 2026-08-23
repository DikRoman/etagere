import { randomBytes } from "crypto";
import { appOrigin } from "@/lib/vk-id";
import type { CloudProvider } from "./session";

export function randomState(): string {
  return randomBytes(24).toString("base64url");
}

export function diskRedirectUri(provider: Exclude<CloudProvider, "gdrive">): string {
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

export async function exchangeYandexDiskCode(code: string): Promise<{
  access_token: string;
  expires_in?: number;
}> {
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
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || "YANDEX_DISK_TOKEN");
  }
  return { access_token: data.access_token, expires_in: data.expires_in };
}

export function dropboxAuthUrl(state: string): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: process.env.NEXT_PUBLIC_DROPBOX_APP_KEY?.trim() || "",
    redirect_uri: diskRedirectUri("dropbox"),
    state,
    token_access_type: "online",
  });
  return `https://www.dropbox.com/oauth2/authorize?${q}`;
}

export async function exchangeDropboxCode(code: string): Promise<{
  access_token: string;
  expires_in?: number;
}> {
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
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || "DROPBOX_TOKEN");
  }
  return { access_token: data.access_token, expires_in: data.expires_in };
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

export async function exchangeOnedriveCode(code: string): Promise<{
  access_token: string;
  expires_in?: number;
}> {
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
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || "ONEDRIVE_TOKEN");
  }
  return { access_token: data.access_token, expires_in: data.expires_in };
}

export function providerConfigured(
  provider: Exclude<CloudProvider, "gdrive">,
): boolean {
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
