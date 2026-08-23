import { NextResponse } from "next/server";
import { sendVerificationEmail } from "@/lib/auth-mail";

export async function POST(req: Request) {
  let body: { email?: string };
  try {
    body = (await req.json()) as { email?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  try {
    await sendVerificationEmail(email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[auth/send-verification]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not send email" },
      { status: 500 },
    );
  }
}
