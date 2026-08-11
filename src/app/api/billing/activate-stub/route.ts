import { NextResponse } from "next/server";
import PocketBase from "pocketbase";

function pbBase() {
  return (
    process.env.NEXT_PUBLIC_POCKETBASE_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:8090"
  );
}

async function authAsAdmin(pb: PocketBase) {
  const email = process.env.POCKETBASE_ADMIN_EMAIL;
  const pass = process.env.POCKETBASE_ADMIN_PASSWORD;
  if (!email || !pass) {
    throw new Error(
      "Set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD in .env.local",
    );
  }
  // PocketBase ≥0.23 uses _superusers
  try {
    await pb.collection("_superusers").authWithPassword(email, pass);
  } catch {
    await pb.admins.authWithPassword(email, pass);
  }
}

async function authUserFromHeader(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth) return null;
  const pb = new PocketBase(pbBase());
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
    subscriptionId?: string;
  };
  const months = Math.min(12, Math.max(1, body.months ?? 1));
  const expires = new Date();
  expires.setMonth(expires.getMonth() + months);

  const payload = {
    user: user.id,
    plan: "pro" as const,
    status: "active" as const,
    expires_at: expires.toISOString(),
    provider: "stub",
    provider_payment_id: `stub_${Date.now()}`,
  };

  try {
    const adminPb = new PocketBase(pbBase());
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
