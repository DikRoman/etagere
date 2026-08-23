import { createHash, createHmac, randomBytes } from "crypto";

export const VK_AUTHORIZE_URL = "https://id.vk.ru/authorize";
export const VK_TOKEN_URL = "https://id.vk.ru/oauth2/auth";
export const VK_USER_INFO_URL = "https://id.vk.ru/oauth2/user_info";

export function vkClientId(): string {
  const id =
    process.env.NEXT_PUBLIC_VK_CLIENT_ID?.trim() ||
    process.env.VK_CLIENT_ID?.trim() ||
    "";
  if (!id) throw new Error("VK_CLIENT_ID_MISSING");
  return id;
}

export function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://etagere.ru"
  );
}

export function vkRedirectUri(): string {
  return `${appOrigin()}/api/auth/vk/callback`;
}

/** Random URL-safe string (state / code_verifier). */
export function randomOAuthString(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Stable password for VK-linked accounts (meets PocketBase rules). */
export function deriveVkPassword(vkId: string): string {
  const pepper =
    process.env.VK_CLIENT_SECRET?.trim() ||
    process.env.ETAGERE_AUTH_PEPPER?.trim() ||
    process.env.POCKETBASE_ADMIN_PASSWORD ||
    "etagere-vk-dev";
  const dig = createHmac("sha256", pepper)
    .update(`etagere:vk:${vkId}`)
    .digest("base64url");
  return `${dig}Aa1!`;
}

export type VkCallbackPayload = {
  code: string;
  state: string;
  device_id: string;
};

export function parseVkCallbackParams(
  searchParams: URLSearchParams,
): VkCallbackPayload | null {
  const payloadRaw = searchParams.get("payload");
  if (payloadRaw) {
    try {
      const parsed = JSON.parse(payloadRaw) as Record<string, unknown>;
      const code = String(parsed.code ?? "");
      const state = String(parsed.state ?? "");
      const device_id = String(parsed.device_id ?? "");
      if (code && state && device_id) return { code, state, device_id };
    } catch {
      /* fall through */
    }
  }

  const code = searchParams.get("code") ?? "";
  const state = searchParams.get("state") ?? "";
  const device_id = searchParams.get("device_id") ?? "";
  if (code && state && device_id) return { code, state, device_id };
  return null;
}

export type VkTokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  user_id: number | string;
  scope?: string;
};

export async function exchangeVkCode(opts: {
  code: string;
  codeVerifier: string;
  deviceId: string;
  state: string;
}): Promise<VkTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    code_verifier: opts.codeVerifier,
    client_id: vkClientId(),
    device_id: opts.deviceId,
    redirect_uri: vkRedirectUri(),
    state: opts.state,
  });
  const secret = process.env.VK_CLIENT_SECRET?.trim();
  if (secret) body.set("client_secret", secret);

  const res = await fetch(VK_TOKEN_URL, {
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
  return data as unknown as VkTokenResponse;
}

export type VkUserInfo = {
  user_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  avatar?: string;
  phone?: string;
};

export async function fetchVkUserInfo(
  accessToken: string,
): Promise<VkUserInfo> {
  const body = new URLSearchParams({
    access_token: accessToken,
    client_id: vkClientId(),
  });
  const res = await fetch(VK_USER_INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json().catch(() => ({}))) as {
    user?: VkUserInfo;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.user?.user_id) {
    throw new Error(
      data.error_description || data.error || "user_info_failed",
    );
  }
  return data.user;
}

export function buildVkAuthorizeUrl(opts: {
  state: string;
  codeChallenge: string;
}): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: vkClientId(),
    redirect_uri: vkRedirectUri(),
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    scope: "email phone",
  });
  return `${VK_AUTHORIZE_URL}?${q.toString()}`;
}
