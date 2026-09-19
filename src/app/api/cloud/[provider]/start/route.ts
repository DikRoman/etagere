import { NextResponse } from "next/server";
import {
  asDiskProvider,
  diskAuthUrl,
  providerConfigured,
  randomState,
} from "@/lib/cloud/oauth-server";
import { appOrigin } from "@/lib/vk-id";

export const runtime = "nodejs";

const COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 600,
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  const provider = asDiskProvider((await ctx.params).provider);
  if (!provider || !providerConfigured(provider)) {
    return NextResponse.redirect(
      `${appOrigin()}/?cloud_error=OAUTH_UNAVAILABLE`,
    );
  }
  const state = randomState();
  const res = NextResponse.redirect(diskAuthUrl(provider, state));
  res.cookies.set(`cloud_${provider}_state`, state, COOKIE);
  return res;
}
