import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    snippets?: string[];
    locale?: "ru" | "en";
  };
  const snippets = (body.snippets ?? []).filter(Boolean).slice(0, 12);
  const locale = body.locale ?? "ru";

  await new Promise((r) => setTimeout(r, 350));

  const cards = snippets.map((s, i) => {
    const front = s.slice(0, 80) + (s.length > 80 ? "…" : "");
    const back =
      locale === "ru"
        ? `Смысл (заглушка #${i + 1}): ${s.slice(0, 160)}${s.length > 160 ? "…" : ""}`
        : `Meaning (stub #${i + 1}): ${s.slice(0, 160)}${s.length > 160 ? "…" : ""}`;
    return { front, back };
  });

  return NextResponse.json({ cards, stub: true });
}
