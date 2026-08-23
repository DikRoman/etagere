import { createHmac, randomBytes } from "crypto";
import { appOrigin } from "@/lib/vk-id";

export const YANDEX_AUTHORIZE_URL = "https://oauth.yandex.ru/authorize";
export const YANDEX_TOKEN_URL = "https://oauth.yandex.ru/token";
export const YANDEX_USER_INFO_URL = "https://login.yandex.ru/info";

export function yandexClientId(): string {
  const id =
    process.env.NEXT_PUBLIC_YANDEX_CLIENT_ID?.trim() ||
    process.env.YANDEX_CLIENT_ID?.trim() ||
    "";
  if (!id) throw new Error("YANDEX_CLIENT_ID_MISSING");
  return id;
}

export function yandexClientSecret(): string {
  const secret = process.env.YANDEX_CLIENT_SECRET?.trim() || "";
  if (!secret) throw new Error("YANDEX_CLIENT_SECRET_MISSING");
  return secret;
}

export function yandexRedirectUri(): string {
  return `${appOrigin()}/api/auth/yandex/callback`;
}

export function randomOAuthState(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function deriveYandexPassword(yandexId: string): string {
  const pepper =
    process.env.YANDEX_CLIENT_SECRET?.trim() ||
    process.env.ETAGERE_AUTH_PEPPER?.trim() ||
    process.env.POCKETBASE_ADMIN_PASSWORD ||
    "etagere-yandex-dev";
  const dig = createHmac("sha256", pepper)
    .update(`etagere:yandex:${yandexId}`)
    .digest("base64url");
  return `${dig}Aa1!`;
}

export function buildYandexAuthorizeUrl(state: string): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: yandexClientId(),
    redirect_uri: yandexRedirectUri(),
    state,
    // login:info — name; login:email — email; login:avatar — photo
    scope: "login:info login:email login:avatar",
  });
  return `${YANDEX_AUTHORIZE_URL}?${q.toString()}`;
}

export type YandexTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  token_type?: string;
};

export async function exchangeYandexCode(
  code: string,
): Promise<YandexTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: yandexClientId(),
    client_secret: yandexClientSecret(),
    redirect_uri: yandexRedirectUri(),
  });
  const res = await fetch(YANDEX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !data.access_token) {
    const desc =
      (typeof data.error_description === "string" && data.error_description) ||
      (typeof data.error === "string" && data.error) ||
      "token_exchange_failed";
    throw new Error(desc);
  }
  return data as unknown as YandexTokenResponse;
}

export type YandexUserInfo = {
  id: string;
  login?: string;
  client_id?: string;
  display_name?: string;
  real_name?: string;
  first_name?: string;
  last_name?: string;
  default_email?: string;
  emails?: string[];
  default_avatar_id?: string;
  is_avatar_empty?: boolean;
};

export async function fetchYandexUserInfo(
  accessToken: string,
): Promise<YandexUserInfo> {
  const res = await fetch(`${YANDEX_USER_INFO_URL}?format=json`, {
    headers: { Authorization: `OAuth ${accessToken}` },
  });
  const data = (await res.json().catch(() => ({}))) as YandexUserInfo & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.id) {
    throw new Error(
      data.error_description || data.error || "user_info_failed",
    );
  }
  return data;
}

export function yandexEmail(info: YandexUserInfo): string | null {
  const fromDefault = info.default_email?.trim();
  if (fromDefault?.includes("@")) return fromDefault;
  const fromList = info.emails?.find((e) => e.includes("@"));
  return fromList?.trim() || null;
}

export function yandexDisplayName(info: YandexUserInfo): string {
  return (
    info.real_name?.trim() ||
    info.display_name?.trim() ||
    [info.first_name, info.last_name].filter(Boolean).join(" ").trim() ||
    info.login?.trim() ||
    `Yandex ${info.id}`
  );
}

/** https://yandex.ru/dev/id/doc/ru/user-information#response-format */
export function yandexAvatarUrl(info: YandexUserInfo): string | null {
  if (info.is_avatar_empty || !info.default_avatar_id) return null;
  return `https://avatars.yandex.net/get-yapic/${info.default_avatar_id}/islands-200`;
}
