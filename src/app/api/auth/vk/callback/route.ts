import { NextRequest, NextResponse } from "next/server";
import type { RecordModel } from "pocketbase";
import PocketBase from "pocketbase";
import { getAdminPb, pbBaseUrl } from "@/lib/pb-admin";
import {
  appOrigin,
  deriveVkPassword,
  exchangeVkCode,
  fetchVkUserInfo,
  parseVkCallbackParams,
  vkRedirectUri,
} from "@/lib/vk-id";
import { sendVkWelcomeEmail } from "@/lib/auth-mail";

export const runtime = "nodejs";

const SESSION_COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 120,
};

const AVATAR_MAX_BYTES = 2_000_000;

function loginRedirect(error?: string): NextResponse {
  const base = appOrigin();
  const url = error
    ? `${base}/login?oauth_error=${encodeURIComponent(error)}`
    : `${base}/login`;
  return NextResponse.redirect(url);
}

/** Download VK photo and attach as PocketBase file field (best-effort). */
async function applyVkAvatar(
  admin: PocketBase,
  userId: string,
  avatarUrl: string | undefined,
): Promise<RecordModel | null> {
  if (!avatarUrl || !/^https?:\/\//i.test(avatarUrl)) return null;
  try {
    const imgRes = await fetch(avatarUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "image/*" },
    });
    if (!imgRes.ok) return null;
    const buf = new Uint8Array(await imgRes.arrayBuffer());
    if (!buf.length || buf.length > AVATAR_MAX_BYTES) return null;

    const contentType = (imgRes.headers.get("content-type") || "").toLowerCase();
    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";
    const mime =
      ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "image/jpeg";

    const form = new FormData();
    form.append("avatar", new Blob([buf], { type: mime }), `vk-avatar.${ext}`);

    const res = await fetch(
      `${pbBaseUrl()}/api/collections/users/records/${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: { Authorization: admin.authStore.token },
        body: form,
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as RecordModel;
  } catch (e) {
    console.warn("[vk/callback] avatar skip", e);
    return null;
  }
}

/** VK ID redirect target — exchange code, mint PocketBase session. */
export async function GET(req: NextRequest) {
  const expectedState = req.cookies.get("vk_oauth_state")?.value;
  const codeVerifier = req.cookies.get("vk_oauth_verifier")?.value;

  const clear = (res: NextResponse) => {
    res.cookies.set("vk_oauth_state", "", { path: "/", maxAge: 0 });
    res.cookies.set("vk_oauth_verifier", "", { path: "/", maxAge: 0 });
    return res;
  };

  if (!expectedState || !codeVerifier) {
    return clear(loginRedirect("OAUTH_FAILED"));
  }

  const payload = parseVkCallbackParams(req.nextUrl.searchParams);
  if (!payload || payload.state !== expectedState) {
    return clear(loginRedirect("OAUTH_FAILED"));
  }

  try {
    const tokens = await exchangeVkCode({
      code: payload.code,
      codeVerifier,
      deviceId: payload.device_id,
      state: payload.state,
    });
    const info = await fetchVkUserInfo(tokens.access_token);
    const vkId = String(info.user_id);
    const password = deriveVkPassword(vkId);
    const email =
      (info.email && info.email.includes("@") && info.email) ||
      `vk${vkId}@users.etagere.ru`;
    const name =
      [info.first_name, info.last_name].filter(Boolean).join(" ").trim() ||
      `VK ${vkId}`;

    const admin = await getAdminPb();
    let user = await admin
      .collection("users")
      .getFirstListItem(`vkId="${vkId}"`)
      .catch(() => null);

    if (!user) {
      user = await admin
        .collection("users")
        .getFirstListItem(`email="${email.replace(/"/g, "")}"`)
        .catch(() => null);
    }

    const hadAvatar = Boolean(user?.avatar);
    const isNewUser = !user;

    if (user) {
      user = await admin.collection("users").update(user.id, {
        vkId,
        verified: true,
        password,
        passwordConfirm: password,
        ...(name && !user.name ? { name } : {}),
      });
    } else {
      user = await admin.collection("users").create({
        email,
        emailVisibility: false,
        password,
        passwordConfirm: password,
        name,
        verified: true,
        vkId,
      });
    }

    if (!user) throw new Error("user_upsert_failed");

    // Pull VK photo on first login / if profile has no avatar yet.
    if (!hadAvatar && info.avatar) {
      const withAvatar = await applyVkAvatar(admin, user.id, info.avatar);
      if (withAvatar) user = withAvatar;
    }

    // Welcome mail only for brand-new accounts with a real VK email
    // (not the synthetic vk{id}@users.etagere.ru fallback).
    const realEmail =
      info.email &&
      info.email.includes("@") &&
      !info.email.endsWith("@users.etagere.ru")
        ? info.email
        : null;
    if (isNewUser && realEmail) {
      try {
        await sendVkWelcomeEmail({ email: realEmail, name });
      } catch (mailErr) {
        console.warn("[vk/callback] welcome mail", mailErr);
      }
    }

    const loginEmail = String(user.email || email);
    const authPb = new PocketBase(pbBaseUrl());
    const auth = await authPb
      .collection("users")
      .authWithPassword(loginEmail, password);

    const res = clear(
      NextResponse.redirect(`${appOrigin()}/auth/vk/complete`),
    );
    res.cookies.set(
      "vk_pb_session",
      JSON.stringify({
        token: auth.token,
        // Prefer record after avatar upload so UI shows photo immediately.
        record: auth.record?.avatar ? auth.record : user,
      }),
      SESSION_COOKIE,
    );
    return res;
  } catch (e) {
    console.error("[vk/callback]", e, { redirect: vkRedirectUri() });
    return clear(loginRedirect("OAUTH_FAILED"));
  }
}
