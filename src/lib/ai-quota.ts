import PocketBase from "pocketbase";
import { authAsAdmin, pbBaseUrl } from "@/lib/pb-admin";
import { isPro, type SubscriptionRecord } from "@/lib/pb";

export type AiQuotaKind = "chat";

export class QuotaError extends Error {
  code: "LOGIN_REQUIRED" | "QUOTA_EXCEEDED";
  used: number;
  limit: number;
  kind: AiQuotaKind;
  period: string;
  constructor(
    code: QuotaError["code"],
    kind: AiQuotaKind,
    used: number,
    limit: number,
    period: string,
    message: string,
  ) {
    super(message);
    this.name = "QuotaError";
    this.code = code;
    this.kind = kind;
    this.used = used;
    this.limit = limit;
    this.period = period;
  }
}

export interface QuotaBucket {
  used: number;
  limit: number;
  remaining: number;
}

export interface QuotaSnapshot {
  period: string;
  pro: boolean;
  chat: QuotaBucket;
}

function monthPeriod(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function numEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function quotaLimit(pro: boolean): number {
  return pro
    ? numEnv("AI_LIMIT_CHAT_PRO", 200)
    : numEnv("AI_LIMIT_CHAT_FREE", 40);
}

export async function userIdFromRequest(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") || "";
  if (!auth) return null;
  const userPb = new PocketBase(pbBaseUrl());
  userPb.authStore.save(auth, null);
  try {
    await userPb.collection("users").authRefresh();
  } catch {
    return null;
  }
  return userPb.authStore.record?.id ?? null;
}

async function userIsPro(admin: PocketBase, userId: string): Promise<boolean> {
  try {
    const sub = (await admin
      .collection("subscriptions")
      .getFirstListItem(`user = "${userId}"`)) as SubscriptionRecord;
    return isPro(sub);
  } catch {
    return false;
  }
}

type UsageRow = {
  id: string;
  explain_count?: number;
  summary_count?: number;
};

async function getOrCreateUsage(
  admin: PocketBase,
  userId: string,
  period: string,
): Promise<UsageRow> {
  try {
    return (await admin
      .collection("ai_usage")
      .getFirstListItem(
        `user = "${userId}" && period = "${period}"`,
      )) as UsageRow;
  } catch {
    return (await admin.collection("ai_usage").create({
      user: userId,
      period,
      explain_count: 0,
      summary_count: 0,
    })) as UsageRow;
  }
}

function pack(pro: boolean, period: string, used: number): QuotaSnapshot {
  const limit = quotaLimit(pro);
  return {
    period,
    pro,
    chat: {
      used,
      limit,
      remaining: Math.max(0, limit - used),
    },
  };
}

export async function readQuota(userId: string): Promise<QuotaSnapshot> {
  const admin = new PocketBase(pbBaseUrl());
  await authAsAdmin(admin);
  const period = monthPeriod();
  const pro = await userIsPro(admin, userId);
  let used = 0;
  try {
    const row = (await admin
      .collection("ai_usage")
      .getFirstListItem(
        `user = "${userId}" && period = "${period}"`,
      )) as UsageRow;
    used = Number(row.explain_count ?? 0) + Number(row.summary_count ?? 0);
  } catch {
    used = 0;
  }
  return pack(pro, period, used);
}

export async function consumeQuota(userId: string): Promise<QuotaSnapshot> {
  const admin = new PocketBase(pbBaseUrl());
  await authAsAdmin(admin);
  const period = monthPeriod();
  const pro = await userIsPro(admin, userId);
  const limit = quotaLimit(pro);
  const row = await getOrCreateUsage(admin, userId, period);
  const used =
    Number(row.explain_count ?? 0) + Number(row.summary_count ?? 0);
  if (used >= limit) {
    throw new QuotaError(
      "QUOTA_EXCEEDED",
      "chat",
      used,
      limit,
      period,
      "Monthly AI limit reached",
    );
  }
  const updated = (await admin.collection("ai_usage").update(row.id, {
    explain_count: Number(row.explain_count ?? 0) + 1,
  })) as UsageRow;
  return pack(
    pro,
    period,
    Number(updated.explain_count ?? 0) + Number(updated.summary_count ?? 0),
  );
}

export function quotaJson(err: QuotaError) {
  return {
    error: err.message,
    code: err.code,
    kind: err.kind,
    used: err.used,
    limit: err.limit,
    period: err.period,
  };
}
