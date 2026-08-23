import { NextResponse } from "next/server";
import { billingUserFromRequest, setCancelAtPeriodEnd } from "@/lib/billing";
import { yookassaConfigured } from "@/lib/yookassa";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!yookassaConfigured()) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  const user = await billingUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const sub = await setCancelAtPeriodEnd(user.id, false);
    return NextResponse.json({
      ok: true,
      cancel_at_period_end: false,
      expires_at: sub.expires_at,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Resume failed";
    const status = msg === "NO_YOOKASSA_SUB" ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
