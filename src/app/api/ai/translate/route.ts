import { NextResponse } from "next/server";
import { gigachatConfigured, gigachatText } from "@/lib/gigachat";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    text?: string;
    targetLocale?: "ru" | "en";
  };
  const text = (body.text ?? "").trim();
  const target = body.targetLocale ?? "ru";

  if (!text) {
    return NextResponse.json({ result: "" });
  }

  if (!gigachatConfigured()) {
    const prefix =
      target === "ru" ? "[перевод → RU]\n" : "[translation → EN]\n";
    return NextResponse.json({ result: `${prefix}${text}`, stub: true });
  }

  try {
    const lang = target === "ru" ? "русский" : "английский";
    const result = await gigachatText({
      system:
        `Ты точный литературный переводчик. Переведи текст пользователя на ${lang}. ` +
        "Сохрани смысл и тон. В ответе только перевод, без пояснений.",
      user: text.slice(0, 8000),
      maxTokens: 2048,
    });
    return NextResponse.json({ result });
  } catch (e) {
    console.error("[ai/translate]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Translate failed" },
      { status: 502 },
    );
  }
}
