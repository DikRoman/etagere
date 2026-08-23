import { NextResponse } from "next/server";
import { PRO_PRICE_RUB, stubBillingAllowed, yookassaConfigured } from "@/lib/yookassa";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    enabled: yookassaConfigured(),
    stub: stubBillingAllowed(),
    amountRub: PRO_PRICE_RUB,
  });
}
