import { NextResponse } from "next/server";
import {
  billingUserFromRequest,
} from "@/lib/billing";
import { isPro, type SubscriptionRecord } from "@/lib/pb";
import { getAdminPb } from "@/lib/pb-admin";
import {
  appPublicUrl,
  createCheckoutPayment,
  yookassaConfigured,
} from "@/lib/yookassa";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!yookassaConfigured()) {
    return NextResponse.json(
      { error: "Payments are not configured", code: "NOT_CONFIGURED" },
      { status: 503 },
    );
  }
  const user = await billingUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = await getAdminPb();
    let sub: SubscriptionRecord | null = null;
    try {
      sub = (await admin
        .collection("subscriptions")
        .getFirstListItem(`user = "${user.id}"`)) as SubscriptionRecord;
    } catch {
      sub = null;
    }

    const paidYoo =
      sub?.provider === "yookassa" &&
      sub.status === "active" &&
      isPro(sub);
    if (paidYoo && sub?.expires_at) {
      const left = new Date(sub.expires_at).getTime() - Date.now();
      if (left > 5 * 24 * 60 * 60 * 1000) {
        return NextResponse.json({
          already: true,
          expires_at: sub.expires_at,
        });
      }
    }

    const returnUrl = `${appPublicUrl()}/account?billing=return`;
    const day = new Date().toISOString().slice(0, 10);
    const payment = await createCheckoutPayment({
      userId: user.id,
      email: user.email,
      returnUrl,
      idempotenceKey: `checkout-${user.id}-${day}`,
    });

    const url = payment.confirmation?.confirmation_url;
    if (!url) {
      return NextResponse.json(
        { error: "No confirmation URL" },
        { status: 502 },
      );
    }
    return NextResponse.json({
      confirmation_url: url,
      payment_id: payment.id,
    });
  } catch (e) {
    console.error("[billing/checkout]", e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Checkout failed",
      },
      { status: 500 },
    );
  }
}
