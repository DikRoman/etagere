import { NextRequest, NextResponse } from "next/server";
import type { RecordModel } from "pocketbase";
import PocketBase from "pocketbase";
import { getAdminPb, pbBaseUrl } from "@/lib/pb-admin";
import {
  deriveTelegramPassword,
  extractTelegramFields,
  telegramDisplayName,
  verifyTelegramAuth,
} from "@/lib/telegram-id";

export const runtime = "nodejs";

const AVATAR_MAX_BYTES = 2_000_000;

async function applyAvatar(
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

    const form = new FormData();
    form.append(
      "avatar",
      new Blob([buf], { type: "image/jpeg" }),
      "telegram-avatar.jpg",
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
    console.warn("[telegram/callback] avatar skip", e);
    return null;
  }
}

async function mintSession(raw: Record<string, string>): Promise<{
  token: string;
  record: RecordModel;
}> {
  const info = verifyTelegramAuth(raw);
  const telegramId = info.id;
  const password = deriveTelegramPassword(telegramId);
  const email = `tg${telegramId}@users.etagere.ru`;
  const name = telegramDisplayName(info);

  const admin = await getAdminPb();
  let user = await admin
    .collection("users")
    .getFirstListItem(`telegramId="${telegramId}"`)
    .catch(() => null);

  if (!user) {
    user = await admin
      .collection("users")
      .getFirstListItem(`email="${email}"`)
      .catch(() => null);
  }

  const hadAvatar = Boolean(user?.avatar);

  if (user) {
    user = await admin.collection("users").update(user.id, {
      telegramId,
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
      telegramId,
    });
  }

  if (!user) throw new Error("user_upsert_failed");

  if (!hadAvatar && info.photo_url) {
    const withAvatar = await applyAvatar(admin, user.id, info.photo_url);
    if (withAvatar) user = withAvatar;
  }

  const loginEmail = String(user.email || email);
  const authPb = new PocketBase(pbBaseUrl());
  const auth = await authPb
    .collection("users")
    .authWithPassword(loginEmail, password);

  return {
    token: auth.token,
    record: (auth.record?.avatar ? auth.record : user) as RecordModel,
  };
}

/**
 * Browser posts Telegram Login Widget payload (from #tgAuthResult or query).
 * Returns PocketBase token + record JSON (no cookie handoff needed).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const raw = extractTelegramFields(body);
    if (!raw.id || !raw.hash) {
      return NextResponse.json({ error: "OAUTH_CANCELLED" }, { status: 400 });
    }
    const session = await mintSession(raw);
    return NextResponse.json(session);
  } catch (e) {
    console.error("[telegram/callback]", e);
    return NextResponse.json({ error: "OAUTH_FAILED" }, { status: 401 });
  }
}

/** Legacy GET with query params (id, hash, …). */
export async function GET(req: NextRequest) {
  try {
    const raw = extractTelegramFields(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    if (!raw.id || !raw.hash) {
      return NextResponse.redirect(
        new URL("/login?oauth_error=OAUTH_CANCELLED", req.url),
      );
    }
    const session = await mintSession(raw);
    // Redirect via complete page is awkward without cookie; use short-lived cookie.
    const res = NextResponse.redirect(
      new URL("/auth/telegram/complete?via=query", req.url),
    );
    res.cookies.set(
      "tg_pb_session",
      JSON.stringify(session),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 120,
      },
    );
    return res;
  } catch (e) {
    console.error("[telegram/callback GET]", e);
    return NextResponse.redirect(
      new URL("/login?oauth_error=OAUTH_FAILED", req.url),
    );
  }
}
