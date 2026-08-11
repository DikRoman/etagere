import { NextResponse } from "next/server";
import PocketBase from "pocketbase";

function pbBase() {
  return (
    process.env.NEXT_PUBLIC_POCKETBASE_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:8090"
  );
}

export async function POST(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userPb = new PocketBase(pbBase());
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

  // Prefer client create (allowed for free plan)
  try {
    await userPb
      .collection("subscriptions")
      .getFirstListItem(`user = "${user.id}"`);
    return NextResponse.json({ ok: true, existed: true });
  } catch {
    try {
      await userPb.collection("subscriptions").create({
        user: user.id,
        plan: "free",
        status: "active",
      });
      return NextResponse.json({ ok: true, created: true });
    } catch (e) {
      return NextResponse.json(
        {
          error: e instanceof Error ? e.message : "Could not create free plan",
        },
        { status: 500 },
      );
    }
  }
}
