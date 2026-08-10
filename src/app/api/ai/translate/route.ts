import { NextResponse } from "next/server";

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

  // Stub: pretend translation. Replace with OpenAI / DeepL later.
  const prefix =
    target === "ru"
      ? "[перевод → RU]\n"
      : "[translation → EN]\n";

  const result = `${prefix}${text}`;

  await new Promise((r) => setTimeout(r, 350));
  return NextResponse.json({ result, stub: true });
}
