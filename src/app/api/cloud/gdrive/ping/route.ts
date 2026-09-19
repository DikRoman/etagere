import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = (req.headers.get("authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) {
    return NextResponse.json({ error: "NO_TOKEN" }, { status: 400 });
  }
  const res = await fetch(
    "https://www.googleapis.com/drive/v3/about?fields=user",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    return NextResponse.json({ error: "DRIVE" }, { status: res.status });
  }
  return NextResponse.json({ ok: true });
}
