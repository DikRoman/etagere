import { NextRequest, NextResponse } from "next/server";
import type { RecordModel } from "pocketbase";
import PocketBase from "pocketbase";
import { getAdminPb, pbBaseUrl } from "@/lib/pb-admin";
import { sendOAuthWelcomeEmail } from "@/lib/auth-mail";
import { appOrigin } from "@/lib/vk-id";
import {
  deriveYandexPassword,
  exchangeYandexCode,
  fetchYandexUserInfo,
  yandexAvatarUrl,
  yandexDisplayName,
  yandexEmail,
  yandexRedirectUri,
} from "@/lib/yandex-id";

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

async function applyAvatar(
  admin: PocketBase,
  userId: string,
  avatarUrl: string | null,
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

    const form = new FormData();
    form.append(
      "avatar",
      new Blob([buf], { type: "image/jpeg" }),
      "yandex-avatar.jpg",
    );

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
    console.warn("[yandex/callback] avatar skip", e);
    return null;
  }
}

/** Yandex OAuth redirect — exchange code, mint PocketBase session. */
export async function GET(req: NextRequest) {
  const expectedState = req.cookies.get("ya_oauth_state")?.value;
  const clear = (res: NextResponse) => {
    res.cookies.set("ya_oauth_state", "", { path: "/", maxAge: 0 });
    return res;
  };

  if (!expectedState) {
    return clear(loginRedirect("OAUTH_FAILED"));
  }

  const code = req.nextUrl.searchParams.get("code") ?? "";
  const state = req.nextUrl.searchParams.get("state") ?? "";
  if (!code || state !== expectedState) {
    return clear(loginRedirect("OAUTH_FAILED"));
  }

  try {
    const tokens = await exchangeYandexCode(code);
    const info = await fetchYandexUserInfo(tokens.access_token);
    const yandexId = String(info.id);
    const password = deriveYandexPassword(yandexId);
    const realEmail = yandexEmail(info);
    const email = realEmail || `ya${yandexId}@users.etagere.ru`;
    const name = yandexDisplayName(info);
    const avatarUrl = yandexAvatarUrl(info);

    const admin = await getAdminPb();
    let user = await admin
      .collection("users")
      .getFirstListItem(`yandexId="${yandexId}"`)
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
        yandexId,
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
        yandexId,
      });
    }

    if (!user) throw new Error("user_upsert_failed");

    if (!hadAvatar && avatarUrl) {
      const withAvatar = await applyAvatar(admin, user.id, avatarUrl);
      if (withAvatar) user = withAvatar;
    }

    if (isNewUser && realEmail) {
      try {
        await sendOAuthWelcomeEmail({
          email: realEmail,
          name,
          provider: "yandex",
        });
      } catch (mailErr) {
        console.warn("[yandex/callback] welcome mail", mailErr);
      }
    }

    const loginEmail = String(user.email || email);
    const authPb = new PocketBase(pbBaseUrl());
    const auth = await authPb
      .collection("users")
      .authWithPassword(loginEmail, password);

    const res = clear(
      NextResponse.redirect(`${appOrigin()}/auth/yandex/complete`),
    );
    res.cookies.set(
      "ya_pb_session",
      JSON.stringify({
        token: auth.token,
        record: auth.record?.avatar ? auth.record : user,
      }),
      SESSION_COOKIE,
    );
    return res;
  } catch (e) {
    console.error("[yandex/callback]", e, { redirect: yandexRedirectUri() });
    return clear(loginRedirect("OAUTH_FAILED"));
  }
}
