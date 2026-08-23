import { NextResponse } from "next/server";
import { gigachatConfigured, gigachatText } from "@/lib/gigachat";
import {
  consumeQuota,
  QuotaError,
  quotaJson,
  readQuota,
  userIdFromRequest,
} from "@/lib/ai-quota";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const userId = await userIdFromRequest(req);
  if (!userId) {
    return NextResponse.json(
      { error: "Login required", code: "LOGIN_REQUIRED" },
      { status: 401 },
    );
  }

  const body = (await req.json()) as {
    question?: string;
    bookTitle?: string;
    context?: string;
    locale?: "ru" | "en";
  };
  const q = (body.question ?? "").trim();
  const locale = body.locale ?? "ru";
  const title = body.bookTitle ?? "book";
  const ctx = (body.context ?? "").slice(0, 5000);

  if (!q) {
    return NextResponse.json({ result: "" });
  }

  let quota;
  try {
    quota = await readQuota(userId);
    if (quota.chat.remaining <= 0) {
      throw new QuotaError(
        "QUOTA_EXCEEDED",
        "chat",
        quota.chat.used,
        quota.chat.limit,
        quota.period,
        "Monthly AI limit reached",
      );
    }
  } catch (e) {
    if (e instanceof QuotaError) {
      return NextResponse.json(quotaJson(e), { status: 429 });
    }
    throw e;
  }

  const lang = locale === "ru" ? "русском" : "английском";

  if (!gigachatConfigured()) {
    return NextResponse.json({
      result:
        locale === "ru"
          ? `Чат (заглушка) по «${title}».\n${q}`
          : `Chat (stub) about “${title}”.\n${q}`,
      stub: true,
      quota,
    });
  }

  try {
    const result = await gigachatText({
      system:
        `Ты помощник в читалке. Отвечай на ${lang} языке. ` +
        "Человек читает книгу и ведёт диалог: может прислать несколько фрагментов подряд и задавать уточнения. " +
        "Опирайся на переданную историю чата и фрагменты. Если фрагмента мало — скажи об этом и ответь осторожно. " +
        "Кратко, по делу, без воды. Не выдумывай сюжет за пределами текста. " +
        "Таблицы давай только markdown: строка заголовков, строка |---|---|, затем ряды. Не рисуй таблицы пробелами и «палочками» без разделителя.",
      user: `Книга: ${title}\n\nДиалог и фрагменты из читалки:\n${ctx || "(пусто)"}\n\nНовое сообщение читателя:\n${q}`,
      maxTokens: 1200,
    });
    quota = await consumeQuota(userId);
    return NextResponse.json({ result, quota });
  } catch (e) {
    console.error("[ai/chat]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Chat failed" },
      { status: 502 },
    );
  }
}
