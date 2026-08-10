import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    text?: string;
    locale?: "ru" | "en";
  };
  const text = (body.text ?? "").trim();
  const locale = body.locale ?? "ru";

  if (!text) {
    return NextResponse.json({ result: "" });
  }

  const words = text.split(/\s+/).filter(Boolean).length;
  const snippet = text.slice(0, 180).replace(/\s+/g, " ");

  const result =
    locale === "ru"
      ? `Кратко (заглушка): фрагмент ~${words} слов. Суть: «${snippet}${text.length > 180 ? "…" : ""}». Здесь появится настоящее саммари, когда подключим модель.`
      : `Summary (stub): ~${words} words. Gist: “${snippet}${text.length > 180 ? "…" : ""}”. Real model output will replace this once AI is wired.`;

  await new Promise((r) => setTimeout(r, 400));
  return NextResponse.json({ result, stub: true });
}
