import type { Locale } from "./types";

export async function stubTranslate(
  text: string,
  targetLocale: Locale,
): Promise<string> {
  const res = await fetch("/api/ai/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, targetLocale }),
  });
  const data = (await res.json()) as { result: string };
  return data.result;
}

export async function stubSummarize(
  text: string,
  locale: Locale,
): Promise<string> {
  const res = await fetch("/api/ai/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, locale }),
  });
  const data = (await res.json()) as { result: string };
  return data.result;
}
