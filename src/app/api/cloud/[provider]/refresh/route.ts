import { NextRequest, NextResponse } from "next/server";
import type { CloudProvider } from "@/lib/cloud/session";
import {
  REFRESH_COOKIE,
  refreshCookieName,
  refreshDiskToken,
} from "@/lib/cloud/oauth-server";

export const runtime = "nodejs";

function asDisk(
  raw: string,
): Exclude<CloudProvider, "gdrive"> | null {
  if (raw === "yandex" || raw === "dropbox" || raw === "onedrive") return raw;
  return null;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ provider: string }> },
) {
  const provider = asDisk((await ctx.params).provider);
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
