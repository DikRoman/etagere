import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/** One-shot handoff of PocketBase auth after Yandex callback. */
export async function GET(req: NextRequest) {
  const raw = req.cookies.get("ya_pb_session")?.value;
  if (!raw) {
    return NextResponse.json({ error: "NO_SESSION" }, { status: 401 });
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    const res = NextResponse.json({ error: "BAD_SESSION" }, { status: 400 });
    res.cookies.set("ya_pb_session", "", { path: "/", maxAge: 0 });
    return res;
  }

  const res = NextResponse.json(data);
  res.cookies.set("ya_pb_session", "", { path: "/", maxAge: 0 });
  return res;
}
