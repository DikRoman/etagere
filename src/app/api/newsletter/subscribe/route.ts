import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getAdminPb } from "@/lib/pb-admin";
import { sendAppMail } from "@/lib/auth-mail";
import { newsletterConfirmUrl } from "@/lib/mail";

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export async function POST(req: Request) {
  let body: { email?: string; locale?: string };
  try {
    body = (await req.json()) as { email?: string; locale?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const locale = body.locale === "en" ? "en" : "ru";
  if (!isEmail(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const token = randomBytes(24).toString("hex");
  const ru = locale === "ru";

  try {
    const pb = await getAdminPb();
    let existing;
    try {
      existing = await pb
        .collection("newsletter_subscribers")
        .getFirstListItem(`email = "${email}"`);
    } catch {
      existing = null;
    }

    if (existing?.status === "active") {
      return NextResponse.json({
        ok: true,
        already: true,
        message: ru
          ? "Вы уже подписаны на рассылку."
          : "You are already subscribed.",
      });
    }

    if (existing) {
      await pb.collection("newsletter_subscribers").update(existing.id, {
        status: "pending",
        token,
        locale,
      });
    } else {
      await pb.collection("newsletter_subscribers").create({
        email,
        status: "pending",
        token,
        locale,
      });
    }

    const confirmUrl = newsletterConfirmUrl(token);
    const subject = ru
      ? "Подтвердите подписку на рассылку Étagère"
      : "Confirm your Étagère newsletter subscription";
    const text = ru
      ? `Здравствуйте!\n\nПодтвердите подписку на новости Étagère / Этажер:\n${confirmUrl}\n\nЕсли вы не подписывались — просто проигнорируйте письмо.`
      : `Hello!\n\nConfirm your Étagère newsletter subscription:\n${confirmUrl}\n\nIf you did not subscribe, you can ignore this email.`;

    await sendAppMail({ to: email, subject, text });

    return NextResponse.json({
      ok: true,
      message: ru
        ? "Письмо с подтверждением отправлено — проверьте почту."
        : "Confirmation email sent — check your inbox.",
    });
  } catch (e) {
    console.error("[newsletter/subscribe]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Subscribe failed" },
      { status: 500 },
    );
  }
}
