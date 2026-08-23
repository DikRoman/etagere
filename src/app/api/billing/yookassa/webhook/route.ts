import { NextResponse } from "next/server";
import { applyVerifiedPaymentId } from "@/lib/billing";
import { yookassaConfigured, type YooNotification } from "@/lib/yookassa";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!yookassaConfigured()) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  let body: YooNotification;
  try {
    body = (await req.json()) as YooNotification;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const paymentId = body.object?.id;
  if (!paymentId) {
    return NextResponse.json({ ok: true });
  }

  try {
    await applyVerifiedPaymentId(paymentId);
  } catch (e) {
    console.error("[billing/webhook]", e);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
