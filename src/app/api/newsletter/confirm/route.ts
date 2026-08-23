import { NextResponse } from "next/server";
import { getAdminPb } from "@/lib/pb-admin";
import { sendAppMail } from "@/lib/auth-mail";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  try {
    const pb = await getAdminPb();
    const sub = await pb
      .collection("newsletter_subscribers")
      .getFirstListItem(`token = "${token}"`);

    if (sub.status === "active") {
      return NextResponse.json({ ok: true, already: true });
    }

    await pb.collection("newsletter_subscribers").update(sub.id, {
      status: "active",
      confirmed_at: new Date().toISOString(),
    });

    const ru = sub.locale !== "en";
    await sendAppMail({
      to: sub.email as string,
      subject: ru ? "Вы подписаны на рассылку Étagère" : "You are subscribed to Étagère",
      text: ru
        ? "Спасибо! Вы подписаны на новости Étagère / Этажер. Мы пишем редко — только о важных обновлениях."
        : "Thanks! You are subscribed to Étagère updates. We email rarely — only about important news.",
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[newsletter/confirm]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid token" },
      { status: 400 },
    );
  }
}
