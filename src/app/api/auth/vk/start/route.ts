import { NextResponse } from "next/server";
import {
  buildVkAuthorizeUrl,
  pkceChallenge,
  randomOAuthString,
  vkClientId,
} from "@/lib/vk-id";

export const runtime = "nodejs";

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 600,
};

/** Start VK ID authorization (PKCE + redirect). */
export async function GET() {
  try {
    vkClientId();
  } catch {
    return NextResponse.redirect(
      new URL("/login?oauth_error=OAUTH_UNAVAILABLE", originFallback()),
    );
  }

  const state = randomOAuthString(24);
  const codeVerifier = randomOAuthString(48);
  const url = buildVkAuthorizeUrl({
    state,
    codeChallenge: pkceChallenge(codeVerifier),
  });

  const res = NextResponse.redirect(url);
  res.cookies.set("vk_oauth_state", state, COOKIE_OPTS);
  res.cookies.set("vk_oauth_verifier", codeVerifier, COOKIE_OPTS);
  return res;
}

function originFallback(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://etagere.ru"
  );
}
