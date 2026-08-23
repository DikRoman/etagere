import { NextResponse } from "next/server";
import {
  buildYandexAuthorizeUrl,
  randomOAuthState,
  yandexClientId,
  yandexClientSecret,
} from "@/lib/yandex-id";

export const runtime = "nodejs";

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 600,
};

function originFallback(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://etagere.ru"
  );
}

/** Start Yandex ID authorization. */
export async function GET() {
  try {
    yandexClientId();
    yandexClientSecret();
  } catch {
    return NextResponse.redirect(
      new URL("/login?oauth_error=OAUTH_UNAVAILABLE", originFallback()),
    );
  }

  const state = randomOAuthState();
  const res = NextResponse.redirect(buildYandexAuthorizeUrl(state));
  res.cookies.set("ya_oauth_state", state, COOKIE_OPTS);
  return res;
}
