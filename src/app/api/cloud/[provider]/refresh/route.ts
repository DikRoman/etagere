import { NextRequest, NextResponse } from "next/server";
import {
  asDiskProvider,
  REFRESH_COOKIE,
  refreshCookieName,
  refreshDiskToken,
} from "@/lib/cloud/oauth-server";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ provider: string }> },
) {
  const provider = asDiskProvider((await ctx.params).provider);
  if (!provider) {
    return NextResponse.json({ error: "NO_SESSION" }, { status: 400 });
  }
  const refreshToken = req.cookies.get(refreshCookieName(provider))?.value;
  if (!refreshToken) {
    return NextResponse.json({ error: "NO_REFRESH" }, { status: 401 });
  }
  try {
    const tokens = await refreshDiskToken(provider, refreshToken);
    const res = NextResponse.json({
      access_token: tokens.access_token,
      expires_in: tokens.expires_in,
    });
    if (tokens.refresh_token) {
      res.cookies.set(
        refreshCookieName(provider),
        tokens.refresh_token,
        REFRESH_COOKIE,
      );
    }
    return res;
  } catch (e) {
    console.error("[cloud/refresh]", provider, e);
    const res = NextResponse.json({ error: "REFRESH_FAILED" }, { status: 401 });
    res.cookies.set(refreshCookieName(provider), "", { path: "/", maxAge: 0 });
    return res;
  }
}
