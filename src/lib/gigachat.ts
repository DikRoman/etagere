import { randomUUID } from "crypto";
import https from "https";
import { URL } from "url";

const OAUTH_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
const CHAT_URL = "https://api.giga.chat/v1/chat/completions";

/** Sber gateway often presents a private CA; Node rejects it by default. */
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

type CachedToken = { access: string; expiresAt: number };

let cached: CachedToken | null = null;

export function gigachatConfigured(): boolean {
  return Boolean(
    process.env.GIGACHAT_AUTH_KEY?.trim() ||
      process.env.GIGACHAT_CREDENTIALS?.trim(),
  );
}

function authKey(): string {
  const key =
    process.env.GIGACHAT_AUTH_KEY?.trim() ||
    process.env.GIGACHAT_CREDENTIALS?.trim() ||
    "";
  if (!key) throw new Error("GIGACHAT_AUTH_KEY missing");
  return key;
}

function scope(): string {
  return process.env.GIGACHAT_SCOPE?.trim() || "GIGACHAT_API_PERS";
}

function model(): string {
  return process.env.GIGACHAT_MODEL?.trim() || "GigaChat-2-Max";
}

function timeoutMs(kind: "oauth" | "chat"): number {
  const n = Number(process.env.GIGACHAT_TIMEOUT_MS);
  if (Number.isFinite(n) && n >= 5_000) return n;
  return kind === "oauth" ? 20_000 : 90_000;
}

function httpsJson(
  urlStr: string,
  opts: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  },
): Promise<{ status: number; json: Record<string, unknown> }> {
  const url = new URL(urlStr);
  const ms = opts.timeoutMs ?? timeoutMs("chat");
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: opts.method,
        headers: {
          ...opts.headers,
          ...(opts.body
            ? { "Content-Length": Buffer.byteLength(opts.body) }
            : {}),
        },
        agent: insecureAgent,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json: Record<string, unknown> = {};
          try {
            json = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
          } catch {
            json = { message: raw || "invalid json" };
          }
          finish(() => resolve({ status: res.statusCode || 0, json }));
        });
      },
    );
    req.on("error", (err) => finish(() => reject(err)));
    req.setTimeout(ms, () => {
      req.destroy();
      finish(() =>
        reject(new Error("GigaChat не ответил. Попробуй ещё раз.")),
      );
    });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.access;
  }

  const body = new URLSearchParams({ scope: scope() }).toString();
  const { status, json } = await httpsJson(OAUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      RqUID: randomUUID(),
      Authorization: `Basic ${authKey()}`,
    },
    body,
    timeoutMs: timeoutMs("oauth"),
  });

  const access = typeof json.access_token === "string" ? json.access_token : "";
  if (status < 200 || status >= 300 || !access) {
    throw new Error(
      (typeof json.message === "string" && json.message) ||
        (typeof json.error === "string" && json.error) ||
        `GigaChat OAuth HTTP ${status}`,
    );
  }

  const expiresAt =
    typeof json.expires_at === "number" && json.expires_at > now
      ? json.expires_at
      : now + 25 * 60_000;

  cached = { access, expiresAt };
  return access;
}

export async function gigachatText(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const token = await getAccessToken();
  const body = JSON.stringify({
    model: model(),
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    stream: false,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: 0.2,
  });

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { status, json } = await httpsJson(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body,
        timeoutMs: timeoutMs("chat"),
      });

      if (status < 200 || status >= 300) {
        const errObj = json.error;
        const err =
          (typeof errObj === "object" &&
            errObj &&
            typeof (errObj as { message?: string }).message === "string" &&
            (errObj as { message: string }).message) ||
          (typeof errObj === "string" && errObj) ||
          (typeof json.message === "string" && json.message) ||
          `GigaChat HTTP ${status}`;
        lastErr = new Error(err);
        if (status === 401) cached = null;
        continue;
      }

      const text = extractChatContent(json);
      if (text) return text;
      lastErr = new Error("Empty GigaChat response");
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr ?? new Error("Empty GigaChat response");
}

function extractChatContent(json: Record<string, unknown>): string {
  const choices = json.choices as
    | Array<{ message?: { content?: unknown }; text?: string }>
    | undefined;
  const msg = choices?.[0]?.message?.content;
  if (typeof msg === "string" && msg.trim()) return msg.trim();
  if (Array.isArray(msg)) {
    const joined = msg
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: string }).text ?? "");
        }
        return "";
      })
      .join("")
      .trim();
    if (joined) return joined;
  }
  const alt = choices?.[0]?.text;
  if (typeof alt === "string" && alt.trim()) return alt.trim();
  return "";
}
