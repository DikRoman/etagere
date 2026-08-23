import PocketBase from "pocketbase";
import { getAdminPb, pbBaseUrl } from "@/lib/pb-admin";
import type { SubscriptionRecord } from "@/lib/pb";
import {
  createRenewalPayment,
  getPayment,
  PRO_PRICE,
  type YooPayment,
} from "@/lib/yookassa";

export type BillingUser = {
  id: string;
  email?: string;
  name?: string;
};

export async function billingUserFromRequest(
  req: Request,
): Promise<BillingUser | null> {
  const auth = req.headers.get("Authorization") || "";
  if (!auth) return null;
  const pb = new PocketBase(pbBaseUrl());
  pb.authStore.save(auth, null);
  try {
    await pb.collection("users").authRefresh();
  } catch {
    return null;
  }
  const user = pb.authStore.record;
  if (!user) return null;
  return {
    id: user.id,
    email: typeof user.email === "string" ? user.email : undefined,
    name: typeof user.name === "string" ? user.name : undefined,
  };
}

function addOneMonth(from: Date): Date {
  const next = new Date(from.getTime());
  next.setMonth(next.getMonth() + 1);
  return next;
}

export async function applySucceededPayment(payment: YooPayment): Promise<void> {
  const userId = payment.metadata?.user_id?.trim();
  if (!userId) return;
  if (payment.status !== "succeeded" || !payment.paid) return;
  if (
    payment.amount.currency !== "RUB" ||
    payment.amount.value !== PRO_PRICE.value
  ) {
    console.warn("[billing] skip payment with unexpected amount", payment.id);
    return;
  }

  const admin = await getAdminPb();
  let existing: SubscriptionRecord | null = null;
  try {
    existing = (await admin
      .collection("subscriptions")
      .getFirstListItem(`user = "${userId}"`)) as SubscriptionRecord;
  } catch {
    existing = null;
  }

  if (existing?.provider_payment_id === payment.id) return;

  const now = new Date();
  const currentEnd = existing?.expires_at
    ? new Date(existing.expires_at)
    : now;
  const base = currentEnd.getTime() > now.getTime() ? currentEnd : now;

  const methodId =
    payment.payment_method?.saved && payment.payment_method.id
      ? payment.payment_method.id
      : existing?.provider_method_id || "";

  const payload = {
    user: userId,
    plan: "pro" as const,
    status: "active" as const,
    expires_at: addOneMonth(base).toISOString(),
    provider: "yookassa",
    provider_payment_id: payment.id,
    provider_method_id: methodId,
    cancel_at_period_end: false,
  };

  if (existing) {
    await admin.collection("subscriptions").update(existing.id, payload);
  } else {
    await admin.collection("subscriptions").create(payload);
  }
}

export async function applyCanceledPayment(payment: YooPayment): Promise<void> {
  if (payment.metadata?.kind !== "renew") return;
  const userId = payment.metadata.user_id?.trim();
  if (!userId) return;
  const admin = await getAdminPb();
  try {
    const existing = await admin
      .collection("subscriptions")
      .getFirstListItem(`user = "${userId}"`);
    await admin.collection("subscriptions").update(existing.id, {
      status: "past_due",
      provider_payment_id: payment.id,
    });
  } catch {
    /* no row yet */
  }
}

export async function applyVerifiedPaymentId(paymentId: string): Promise<void> {
  const payment = await getPayment(paymentId);
  if (payment.status === "succeeded") {
    await applySucceededPayment(payment);
    return;
  }
  if (payment.status === "canceled") {
    await applyCanceledPayment(payment);
  }
}

export async function setCancelAtPeriodEnd(
  userId: string,
  cancel: boolean,
): Promise<SubscriptionRecord> {
  const admin = await getAdminPb();
  const existing = (await admin
    .collection("subscriptions")
    .getFirstListItem(`user = "${userId}"`)) as SubscriptionRecord;
  if (existing.provider !== "yookassa") {
    throw new Error("NO_YOOKASSA_SUB");
  }
  const updated = await admin.collection("subscriptions").update(existing.id, {
    cancel_at_period_end: cancel,
  });
  return updated as unknown as SubscriptionRecord;
}

export async function renewDueSubscriptions(): Promise<{
  charged: number;
  skipped: number;
  failed: number;
}> {
  const admin = await getAdminPb();
  const horizon = new Date();
  horizon.setHours(horizon.getHours() + 36);
  const list = await admin.collection("subscriptions").getFullList({
    filter: `provider = "yookassa" && (status = "active" || status = "past_due")`,
    expand: "user",
  });

  let charged = 0;
  let skipped = 0;
  let failed = 0;

  for (const raw of list) {
    const row = raw as unknown as SubscriptionRecord & {
      expand?: { user?: { email?: string } };
    };
    if (row.cancel_at_period_end) {
      if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
        await admin.collection("subscriptions").update(row.id, {
          plan: "free",
          status: "canceled",
        });
      }
      skipped += 1;
      continue;
    }
    if (!row.provider_method_id) {
      skipped += 1;
      continue;
    }
    const dueSoon =
      !row.expires_at ||
      new Date(row.expires_at).getTime() <= horizon.getTime() ||
      row.status === "past_due";
    if (!dueSoon) {
      skipped += 1;
      continue;
    }
    const email = row.expand?.user?.email;
    const period = (row.expires_at || new Date().toISOString()).slice(0, 10);
    try {
      const payment = await createRenewalPayment({
        userId: row.user,
        email,
        paymentMethodId: row.provider_method_id,
        idempotenceKey: `renew-${row.user}-${period}`,
      });
      if (payment.status === "succeeded") {
        await applySucceededPayment(payment);
        charged += 1;
      } else if (payment.status === "canceled") {
        await applyCanceledPayment(payment);
        failed += 1;
      } else {
        skipped += 1;
      }
    } catch (e) {
      console.error("[billing] renew failed", row.user, e);
      failed += 1;
      await admin.collection("subscriptions").update(row.id, {
        status: "past_due",
      });
    }
  }

  return { charged, skipped, failed };
}
