import { NextResponse } from "next/server";
import { confirmPasswordResetToken } from "@/lib/auth-mail";

export async function POST(req: Request) {
  let body: { token?: string; password?: string; passwordConfirm?: string };
  try {
    body = (await req.json()) as {
      token?: string;
      password?: string;
      passwordConfirm?: string;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = body.token?.trim();
  const password = body.password ?? "";
  const passwordConfirm = body.passwordConfirm ?? "";

  if (!token || !password) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (password !== passwordConfirm) {
    return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password too short" }, { status: 400 });
  }

  try {
    await confirmPasswordResetToken(token, password);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[auth/confirm-password-reset]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid token" },
      { status: 400 },
    );
  }
}
