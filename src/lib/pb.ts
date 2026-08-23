import PocketBase from "pocketbase";

const url =
  process.env.NEXT_PUBLIC_POCKETBASE_URL?.replace(/\/$/, "") ||
  "http://127.0.0.1:8090";

let client: PocketBase | null = null;

/** Browser singleton. Do not use on the server without a fresh instance. */
export function getPb(): PocketBase {
  if (typeof window === "undefined") {
    return new PocketBase(url);
  }
  if (!client) {
    client = new PocketBase(url);
    // Parallel list/update during library sync must not cancel each other.
    client.autoCancellation(false);
  }
  return client;
}

export function pbUrl(): string {
  return url;
}

export type Plan = "free" | "pro";
export type SubStatus = "active" | "canceled" | "past_due" | "trialing";

export interface SubscriptionRecord {
  id: string;
  user: string;
  plan: Plan;
  status: SubStatus;
  expires_at?: string;
  provider?: string;
  provider_payment_id?: string;
  provider_method_id?: string;
  cancel_at_period_end?: boolean;
}

export function isPro(sub: SubscriptionRecord | null | undefined): boolean {
  if (!sub) return false;
  if (sub.plan !== "pro") return false;
  if (sub.status !== "active" && sub.status !== "trialing") return false;
  if (sub.expires_at) {
    return new Date(sub.expires_at).getTime() > Date.now();
  }
  return true;
}
