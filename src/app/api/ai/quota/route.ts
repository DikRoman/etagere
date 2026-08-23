import { NextResponse } from "next/server";
import { readQuota, userIdFromRequest } from "@/lib/ai-quota";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const userId = await userIdFromRequest(req);
  if (!userId) {
    return NextResponse.json(
      { error: "Login required", code: "LOGIN_REQUIRED" },
      { status: 401 },
    );
  }
  try {
    const quota = await readQuota(userId);
    return NextResponse.json(quota);
  } catch (e) {
    console.error("[ai/quota]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Quota failed" },
      { status: 500 },
    );
  }
}
