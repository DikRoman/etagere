import { NextRequest, NextResponse } from "next/server";
import {
  asDiskProvider,
  exchangeDiskCode,
  REFRESH_COOKIE,
  refreshCookieName,
} from "@/lib/cloud/oauth-server";
import { appOrigin } from "@/lib/vk-id";

export const runtime = "nodejs";

const SESSION = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 120,
};

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ provider: string }> },
) {
  const provider = asDiskProvider((await ctx.params).provider);
  const clearState = (res: NextResponse) => {
    if (provider) {
      res.cookies.set(`cloud_${provider}_state`, "", { path: "/", maxAge: 0 });
    }
    return res;
  };
  if (!provider) {
    return NextResponse.redirect(`${appOrigin()}/?cloud_error=OAUTH_FAILED`);
  }

  const expected = req.cookies.get(`cloud_${provider}_state`)?.value;
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const state = req.nextUrl.searchParams.get("state") ?? "";
  if (!expected || !code || state !== expected) {
    return clearState(
      NextResponse.redirect(`${appOrigin()}/?cloud_error=OAUTH_FAILED`),
    );
  }

  try {
    const tokens = await exchangeDiskCode(provider, code);
    const res = clearState(
      NextResponse.redirect(`${appOrigin()}/cloud/complete?p=${provider}`),
    );
    res.cookies.set(
      `cloud_${provider}_session`,
      JSON.stringify({
        access_token: tokens.access_token,
        expires_in: tokens.expires_in,
        has_refresh: Boolean(tokens.refresh_token),
      }),
      SESSION,
    );
    if (tokens.refresh_token) {
      res.cookies.set(
        refreshCookieName(provider),
        tokens.refresh_token,
        REFRESH_COOKIE,
      );
    }
    return res;
  } catch (e) {
    console.error("[cloud/callback]", provider, e);
    return clearState(
      NextResponse.redirect(`${appOrigin()}/?cloud_error=OAUTH_FAILED`),
    );
  }
}
