import { NextResponse } from "next/server";
import PocketBase from "pocketbase";
import { authAsAdmin, pbBaseUrl } from "@/lib/pb-admin";
import { stubBillingAllowed } from "@/lib/yookassa";

async function authUserFromHeader(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth) return null;
  const pb = new PocketBase(pbBaseUrl());
  pb.authStore.save(auth, null);
  try {
    await pb.collection("users").authRefresh();
    return pb;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const userPb = await authUserFromHeader(req);
  if (!userPb?.authStore.record) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = userPb.authStore.record;

  const body = (await req.json()) as {
    months?: number;
    trialDays?: number;
    subscriptionId?: string;
  };

  const trialDays =
    typeof body.trialDays === "number" && body.trialDays > 0
      ? Math.min(30, body.trialDays)
      : 0;

  if (trialDays === 0 && !stubBillingAllowed()) {
    return NextResponse.json(
      { error: "Stub billing is disabled" },
      { status: 403 },
    );
  }
  const months =
    trialDays > 0 ? 0 : Math.min(12, Math.max(1, body.months ?? 1));

  const expires = new Date();
  if (trialDays > 0) {
    expires.setDate(expires.getDate() + trialDays);
  } else {
    expires.setMonth(expires.getMonth() + months);
  }

  const payload = {
    user: user.id,
    plan: "pro" as const,
    status: (trialDays > 0 ? "trialing" : "active") as "trialing" | "active",
    expires_at: expires.toISOString(),
    provider: trialDays > 0 ? "trial" : "stub",
    provider_payment_id: `stub_${Date.now()}`,
  };

  try {
    const adminPb = new PocketBase(pbBaseUrl());
    await authAsAdmin(adminPb);

    try {
      const existing = await adminPb
        .collection("subscriptions")
        .getFirstListItem(`user = "${user.id}"`);
      await adminPb.collection("subscriptions").update(existing.id, payload);
    } catch {
      await adminPb.collection("subscriptions").create(payload);
    }

    return NextResponse.json({ ok: true, expires_at: payload.expires_at });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Failed to activate Pro stub",
      },
      { status: 500 },
    );
  }
}
