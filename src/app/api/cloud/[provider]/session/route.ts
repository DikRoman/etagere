import { NextRequest, NextResponse } from "next/server";
import type { CloudProvider } from "@/lib/cloud/session";

export const runtime = "nodejs";

function asDisk(
  raw: string,
): Exclude<CloudProvider, "gdrive"> | null {
  if (raw === "yandex" || raw === "dropbox" || raw === "onedrive") return raw;
  return null;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ provider: string }> },
) {
  const provider = asDisk((await ctx.params).provider);
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
    };
    const res = NextResponse.json(data);
    res.cookies.set(name, "", { path: "/", maxAge: 0 });
    return res;
  } catch {
    const res = NextResponse.json({ error: "BAD_SESSION" }, { status: 400 });
    res.cookies.set(name, "", { path: "/", maxAge: 0 });
    return res;
  }
}
