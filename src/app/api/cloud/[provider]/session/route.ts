import { NextRequest, NextResponse } from "next/server";
import {
  asDiskProvider,
  refreshCookieName,
} from "@/lib/cloud/oauth-server";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ provider: string }> },
) {
  const provider = asDiskProvider((await ctx.params).provider);
  if (!provider) {
    return NextResponse.json({ error: "NO_SESSION" }, { status: 400 });
  }
  const name = `cloud_${provider}_session`;
  const raw = req.cookies.get(name)?.value;
  if (!raw) {
    return NextResponse.json({ error: "NO_SESSION" }, { status: 401 });
  }
  try {
    const data = JSON.parse(raw) as {
      access_token?: string;
      expires_in?: number;
      has_refresh?: boolean;
    };
    const res = NextResponse.json({
      access_token: data.access_token,
      expires_in: data.expires_in,
      has_refresh:
        Boolean(data.has_refresh) ||
        Boolean(req.cookies.get(refreshCookieName(provider))?.value),
    });
    res.cookies.set(name, "", { path: "/", maxAge: 0 });
    return res;
  } catch {
    const res = NextResponse.json({ error: "BAD_SESSION" }, { status: 400 });
    res.cookies.set(name, "", { path: "/", maxAge: 0 });
    return res;
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ provider: string }> },
) {
  const provider = asDiskProvider((await ctx.params).provider);
  if (!provider) {
    return NextResponse.json({ error: "NO_SESSION" }, { status: 400 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(`cloud_${provider}_session`, "", { path: "/", maxAge: 0 });
  res.cookies.set(refreshCookieName(provider), "", { path: "/", maxAge: 0 });
  return res;
}
