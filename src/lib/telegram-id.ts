import { createHash, createHmac, randomBytes } from "crypto";
import { appOrigin } from "@/lib/vk-id";

export function telegramBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
  if (!token || !token.includes(":")) throw new Error("TELEGRAM_BOT_TOKEN_MISSING");
  return token;
}

export function telegramBotId(): string {
  return telegramBotToken().split(":")[0]!;
}

export function telegramRedirectUri(): string {
  return `${appOrigin()}/auth/telegram/complete`;
}

export function randomOAuthState(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function deriveTelegramPassword(telegramId: string): string {
  const pepper =
    process.env.TELEGRAM_BOT_TOKEN?.trim() ||
    process.env.ETAGERE_AUTH_PEPPER?.trim() ||
    process.env.POCKETBASE_ADMIN_PASSWORD ||
    "etagere-telegram-dev";
  const dig = createHmac("sha256", pepper)
    .update(`etagere:telegram:${telegramId}`)
    .digest("base64url");
  return `${dig}Aa1!`;
}

/**
 * Login Widget redirect. Telegram returns either:
 * - `https://etagere.ru/auth/telegram/complete#tgAuthResult=<base64json>`
 * - or query params id/hash on return_to
 */
export function buildTelegramAuthorizeUrl(): string {
  const origin = appOrigin();
  const q = new URLSearchParams({
    bot_id: telegramBotId(),
    origin,
    embed: "0",
    request_access: "write",
    return_to: telegramRedirectUri(),
  });
  return `https://oauth.telegram.org/auth?${q.toString()}`;
}

export type TelegramAuthPayload = {
  id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: string;
  hash: string;
};

/**
 * Verify Login Widget payload.
 * https://core.telegram.org/widgets/login#checking-authorization
 */
export function verifyTelegramAuth(
  raw: Record<string, string>,
): TelegramAuthPayload {
  const hash = raw.hash;
  if (!hash) throw new Error("missing_hash");

  const authDate = Number(raw.auth_date || 0);
  if (!authDate || Number.isNaN(authDate)) throw new Error("bad_auth_date");
  if (Math.abs(Date.now() / 1000 - authDate) > 86400) {
    throw new Error("auth_expired");
  }

  const check = Object.keys(raw)
    .filter((k) => k !== "hash" && raw[k] !== undefined && raw[k] !== "")
    .sort()
    .map((k) => `${k}=${raw[k]}`)
    .join("\n");

  const secretKey = createHash("sha256").update(telegramBotToken()).digest();
  const computed = createHmac("sha256", secretKey).update(check).digest("hex");
  if (computed !== hash) throw new Error("bad_hash");

  const id = String(raw.id || "");
  if (!id) throw new Error("missing_id");

  return {
    id,
    first_name: raw.first_name,
    last_name: raw.last_name,
    username: raw.username,
    photo_url: raw.photo_url,
    auth_date: String(raw.auth_date),
    hash,
  };
}

export function telegramDisplayName(p: TelegramAuthPayload): string {
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (p.username) return p.username;
  return `Telegram ${p.id}`;
}

export function extractTelegramFields(
  input: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of [
    "id",
    "first_name",
    "last_name",
    "username",
    "photo_url",
    "auth_date",
    "hash",
  ]) {
    const v = input[key];
    if (v !== undefined && v !== null && String(v) !== "") {
      out[key] = String(v);
    }
  }
  return out;
}

/** Decode `#tgAuthResult=` base64 (URL-safe or standard) JSON. */
export function decodeTgAuthResult(hashOrParam: string): Record<string, string> {
  let raw = hashOrParam;
  if (raw.startsWith("#")) raw = raw.slice(1);
  const idx = raw.indexOf("tgAuthResult=");
  if (idx >= 0) raw = raw.slice(idx + "tgAuthResult=".length);
  raw = decodeURIComponent(raw.split("&")[0] || "");
  const json = Buffer.from(raw, "base64").toString("utf8");
  const parsed = JSON.parse(json) as Record<string, unknown>;
  return extractTelegramFields(parsed);
}
