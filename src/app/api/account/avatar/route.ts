import { NextResponse } from "next/server";
import PocketBase from "pocketbase";
import { pbBaseUrl } from "@/lib/pb-admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let incoming: FormData;
  try {
    incoming = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const uploaded = incoming.get("avatar");
  if (!(uploaded instanceof Blob) || uploaded.size === 0) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  const userPb = new PocketBase(pbBaseUrl());
  userPb.authStore.save(auth, null);
  try {
    await userPb.collection("users").authRefresh();
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }
  const user = userPb.authStore.record;
  if (!user) {
    return NextResponse.json({ error: "No user" }, { status: 401 });
  }

  const bytes = new Uint8Array(await uploaded.arrayBuffer());
  const form = new FormData();
  form.append(
    "avatar",
    new Blob([bytes], { type: "image/jpeg" }),
    "avatar.jpg",
  );

  try {
    const res = await fetch(
      `${pbBaseUrl()}/api/collections/users/records/${encodeURIComponent(user.id)}`,
      {
        method: "PATCH",
        headers: { Authorization: userPb.authStore.token },
        body: form,
      },
    );
    const data = (await res.json().catch(() => ({}))) as {
      avatar?: string;
      message?: string;
      data?: { avatar?: { message?: string; code?: string } };
    };
    if (!res.ok) {
      const field = data.data?.avatar;
      const detail = field?.message || data.message || "Upload failed";
      return NextResponse.json(
        { error: detail, code: field?.code },
        { status: res.status },
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Could not upload photo",
      },
      { status: 500 },
    );
  }
}
