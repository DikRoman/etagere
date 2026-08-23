import type { Locale } from "./types";
import type { WordLookupResult } from "./word-lookup";
import type { QuotaSnapshot } from "./ai-quota";
import { getPb } from "./pb";

function authHeaders(): Record<string, string> {
  const token = getPb().authStore.token;
  return token ? { Authorization: token } : {};
}

export class AiRequestError extends Error {
  code?: string;
  status: number;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AiRequestError";
    this.status = status;
    this.code = code;
  }
}

async function postAiText(
  path: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as {
    result?: string;
    error?: string;
    code?: string;
    used?: number;
    limit?: number;
  };
  if (!res.ok) {
    if (data.code === "LOGIN_REQUIRED") {
      throw new AiRequestError("LOGIN_REQUIRED", 401, data.code);
    }
    if (data.code === "QUOTA_EXCEEDED") {
      throw new AiRequestError("QUOTA_EXCEEDED", 429, data.code);
    }
    throw new AiRequestError(data.error || "AI request failed", res.status, data.code);
  }
  return data.result ?? "";
}

export async function fetchAiQuota(): Promise<QuotaSnapshot | null> {
  const token = getPb().authStore.token;
  if (!token) return null;
  const res = await fetch("/api/ai/quota", {
    headers: { Authorization: token },
  });
  if (!res.ok) return null;
  return (await res.json()) as QuotaSnapshot;
}

export async function stubChat(
  question: string,
  bookTitle: string,
  context: string,
  locale: Locale,
): Promise<string> {
  return postAiText("/api/ai/chat", {
    question,
    bookTitle,
    context,
    locale,
  });
}

export async function stubTranslate(
  text: string,
  targetLocale: Locale,
): Promise<string> {
  const res = await fetch("/api/ai/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, targetLocale }),
  });
  const data = (await res.json()) as { result?: string; error?: string };
  if (!res.ok) throw new Error(data.error || "Translate failed");
  return data.result ?? "";
}

export async function lookupSelection(
  text: string,
  targetLocale: Locale,
  sentence?: string,
): Promise<WordLookupResult> {
  const res = await fetch("/api/ai/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, targetLocale, sentence }),
  });
  const data = (await res.json()) as {
    data?: WordLookupResult;
    error?: string;
  };
  if (!res.ok || !data.data) {
    throw new Error(data.error || "Lookup failed");
  }
  return data.data;
}

export async function fetchEtymology(
  word: string,
  targetLocale: Locale,
  lemma?: string,
  sourceLang?: string,
): Promise<string> {
  const res = await fetch("/api/ai/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      section: "etymology",
      word,
      lemma,
      sourceLang,
      targetLocale,
    }),
  });
  const data = (await res.json()) as { etymology?: string; error?: string };
  if (!res.ok) throw new Error(data.error || "Etymology failed");
  return data.etymology ?? "";
}

export { getPdfToc } from "./pdf";

