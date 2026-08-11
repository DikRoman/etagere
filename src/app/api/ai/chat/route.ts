import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    question?: string;
    bookTitle?: string;
    context?: string;
    locale?: "ru" | "en";
  };
  const q = (body.question ?? "").trim();
  const locale = body.locale ?? "ru";
  const title = body.bookTitle ?? "book";
  const ctx = (body.context ?? "").slice(0, 500);

  await new Promise((r) => setTimeout(r, 400));

  const result =
    locale === "ru"
      ? `Чат (заглушка) по «${title}».\nВопрос: ${q}\n\nОтвет: опираясь на контекст «${ctx || "…"}», кратко: идея связана с этим фрагментом. Подключи модель для настоящего ответа.`
      : `Chat (stub) about “${title}”.\nQ: ${q}\n\nA: Based on “${ctx || "…"}”, the idea relates to that passage. Wire a real model for a proper answer.`;

  return NextResponse.json({ result, stub: true });
}
