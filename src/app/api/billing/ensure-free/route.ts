import { NextResponse } from "next/server";
import PocketBase from "pocketbase";
import { authAsAdmin, pbBaseUrl } from "@/lib/pb-admin";

/** On first login/register: 7-day Pro trial. */
export async function POST(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userPb = new PocketBase(pbBaseUrl());
  userPb.authStore.save(auth, null);
  try {
    await userPb.collection("users").authRefresh();
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }
  const user = userPb.authStore.record;
  if (!user) {
    return NextResponse.json({ error: "No user" }, { status: 401 });
  }

  try {
    await userPb
      .collection("subscriptions")
      .getFirstListItem(`user = "${user.id}"`);
    return NextResponse.json({ ok: true, existed: true });
  } catch {
    // createRule blocks client-side pro/trialing — use admin
    try {
      const expires = new Date();
      expires.setDate(expires.getDate() + 7);
      const adminPb = new PocketBase(pbBaseUrl());
      await authAsAdmin(adminPb);
      await adminPb.collection("subscriptions").create({
        user: user.id,
        plan: "pro",
        status: "trialing",
        expires_at: expires.toISOString(),
        provider: "trial",
      });
      return NextResponse.json({
        ok: true,
        created: true,
        trial: true,
        expires_at: expires.toISOString(),
      });
    } catch (e) {
      return NextResponse.json(
        {
          error:
            e instanceof Error ? e.message : "Could not start free trial",
        },
        { status: 500 },
      );
    }
  }
}
