import { NextResponse } from "next/server";
import { renewDueSubscriptions } from "@/lib/billing";
import { yookassaConfigured } from "@/lib/yookassa";

export const runtime = "nodejs";

function authorized(req: Request): boolean {
  const secret = process.env.YOOKASSA_RENEW_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const alt = req.headers.get("x-renew-secret") || "";
  return bearer === secret || alt === secret;
}

export async function POST(req: Request) {
  if (!yookassaConfigured()) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await renewDueSubscriptions();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[billing/renew]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Renew failed" },
      { status: 500 },
    );
  }
}
