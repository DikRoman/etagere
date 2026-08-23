import { NextResponse } from "next/server";
import type { CloudProvider } from "@/lib/cloud/session";
import {
  dropboxAuthUrl,
  onedriveAuthUrl,
  providerConfigured,
  randomState,
  yandexDiskAuthUrl,
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

function asDisk(
  raw: string,
): Exclude<CloudProvider, "gdrive"> | null {
  if (raw === "yandex" || raw === "dropbox" || raw === "onedrive") return raw;
  return null;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  const provider = asDisk((await ctx.params).provider);
  if (!provider || !providerConfigured(provider)) {
    return NextResponse.redirect(
      `${appOrigin()}/?cloud_error=OAUTH_UNAVAILABLE`,
    );
  }
  const state = randomState();
  const url =
    provider === "yandex"
      ? yandexDiskAuthUrl(state)
      : provider === "dropbox"
        ? dropboxAuthUrl(state)
        : onedriveAuthUrl(state);
  const res = NextResponse.redirect(url);
  res.cookies.set(`cloud_${provider}_state`, state, COOKIE);
  return res;
}
