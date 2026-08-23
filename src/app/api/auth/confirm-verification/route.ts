import { NextResponse } from "next/server";
import { confirmVerificationToken } from "@/lib/auth-mail";

export async function POST(req: Request) {
  let body: { token?: string };
  try {
    body = (await req.json()) as { token?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = body.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  try {
    await confirmVerificationToken(token);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[auth/confirm-verification]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid token" },
      { status: 400 },
    );
  }
}
