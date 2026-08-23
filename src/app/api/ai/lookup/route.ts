import { NextResponse } from "next/server";
import { gigachatConfigured, gigachatText } from "@/lib/gigachat";
import {
  isLookupSelection,
  parseLookupJson,
  stubLookupCard,
  stubPassage,
  type WordLookupResult,
} from "@/lib/word-lookup";

export const runtime = "nodejs";

function langName(locale: "ru" | "en"): string {
  return locale === "ru" ? "русский" : "английский";
}

async function lookupCard(
  text: string,
  target: "ru" | "en",
  sentence?: string,
): Promise<WordLookupResult> {
  const lang = langName(target);
  const system =
    `Ты многоязычный европейский словарь для чтения книг (PDF/EPUB). ` +
    `Сначала ОПРЕДЕЛИ язык выделенного текста по слову и предложению ` +
    `(en, de, fr, es, it, pt, nl, pl, cs, sv, da, no, fi, el, hu, ro, uk, …). ` +
    `Основные приоритеты: английский, немецкий, французский, испанский, итальянский, португальский. ` +
    `Перевод, определения и грамматика — на ${lang}. ` +
    `Ответь ТОЛЬКО валидным JSON без markdown. ` +
    `Схема: {"mode":"lookup","word":"форма как в тексте",` +
    `"sourceLang":"ISO 639-1 код (en|de|fr|es|it|…)",` +
    `"sourceLangLabel":"название языка на ${lang}",` +
    `"lemma":"словарная форма НА ЯЗЫКЕ ОРИГИНАЛА",` +
    `"ipa":"IPA для этого языка или пустая строка",` +
    `"pos":"часть речи на ${lang}",` +
    `"grammar":"кратко морфология на ${lang} (род/число/время/падеж) или пустая строка",` +
    `"primary":"лучший перевод смысла в ЭТОМ контексте на ${lang}",` +
    `"variants":["3-6 других значений/синонимов на ${lang}"],` +
    `"related":["1-4 родственных слова НА ЯЗЫКЕ ОРИГИНАЛА"],` +
    `"sentence":{"original":"предложение на языке оригинала","translation":"перевод на ${lang}"},` +
    `"definitions":["1-3 определения на ${lang}"],` +
    `"examples":[{"src":"пример на языке оригинала","tr":"перевод на ${lang}"}]}. ` +
    `Правила: ` +
    `1) Значение выбирай по контексту предложения, не «самое известное имя». ` +
    `2) Не считай слово фамилией/брендом, если обычное словарное чтение нормально. ` +
    `3) lemma — каноническая форма исходного языка (fahren←fährt, persona←personas, person←Person). ` +
    `4) Если язык неуверенный — укажи наиболее вероятный и опирайся на предложение. ` +
    `5) Не переводи «сквозь» на английский: держи lemma/related на исходном языке.`;

  const user = [
    `Выделенное слово/фраза: ${text.slice(0, 200)}`,
    sentence
      ? `Предложение из книги (определи язык и смысл по нему): ${sentence.slice(0, 500)}`
      : "Предложения нет — определи язык по самому слову и возьми самое частое значение.",
    `Язык ответа пользователя (pos/grammar/primary/definitions/sourceLangLabel): ${lang}`,
  ].join("\n");

  const raw = await gigachatText({ system, user, maxTokens: 1400 });
  const parsed = parseLookupJson(raw);
  if (parsed?.mode === "lookup") return parsed;
  if (parsed?.mode === "passage") {
    return {
      mode: "lookup",
      word: text.trim().split(/\s+/)[0] || text.trim(),
      primary: parsed.translation,
      variants: [],
      sentence: {
        original: sentence || text,
        translation: parsed.translation,
      },
    };
  }
  return {
    mode: "lookup",
    word: text.trim().split(/\s+/)[0] || text.trim(),
    primary: raw.slice(0, 400),
    variants: [],
    sentence: sentence
      ? { original: sentence, translation: raw.slice(0, 600) }
      : undefined,
  };
}

async function translatePassage(
  text: string,
  target: "ru" | "en",
): Promise<WordLookupResult> {
  const lang = langName(target);
  const system =
    `Ты точный литературный переводчик европейских языков → ${lang} для чтения книг. ` +
    `Сначала определи язык оригинала (en/de/fr/es/it/pt/…), затем переведи. ` +
    `Ответь ТОЛЬКО валидным JSON без markdown. ` +
    `Схема: {"mode":"passage","original":"исходный текст","translation":"перевод на ${lang}"}. ` +
    `Сохрани смысл и тон. Имена собственные — по смыслу контекста.`;

  const raw = await gigachatText({
    system,
    user: text.slice(0, 8000),
    maxTokens: 2048,
  });
  const parsed = parseLookupJson(raw);
  if (parsed?.mode === "passage") {
    return {
      ...parsed,
      original: parsed.original || text,
    };
  }
  return { mode: "passage", original: text, translation: raw };
}

async function etymologyNote(
  word: string,
  lemma: string | undefined,
  target: "ru" | "en",
  sourceLang?: string,
): Promise<string> {
  const lang = langName(target);
  const langHint = sourceLang
    ? `Исходный язык слова: ${sourceLang}.`
    : "Определи язык слова сам (европейские языки).";
  return gigachatText({
    system:
      `Кратко объясни этимологию слова на ${lang} (3–6 предложений). ` +
      `${langHint} ` +
      `Не путай с однокоренными фамилиями, если контекст словарный. Без markdown.`,
    user: `Слово: ${word}${lemma ? ` (lemma: ${lemma})` : ""}`,
    maxTokens: 600,
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    text?: string;
    targetLocale?: "ru" | "en";
    sentence?: string;
    section?: "card" | "etymology";
    word?: string;
    lemma?: string;
    sourceLang?: string;
  };

  const target = body.targetLocale ?? "ru";
  const section = body.section ?? "card";

  if (section === "etymology") {
    const word = (body.word ?? body.text ?? "").trim();
    if (!word) {
      return NextResponse.json({ error: "word required" }, { status: 400 });
    }
    if (!gigachatConfigured()) {
      return NextResponse.json({
        etymology:
          target === "ru"
            ? "Подключите GIGACHAT_AUTH_KEY для этимологии."
            : "Set GIGACHAT_AUTH_KEY for etymology.",
        stub: true,
      });
    }
    try {
      const etymology = await etymologyNote(
        word,
        body.lemma,
        target,
        body.sourceLang,
      );
      return NextResponse.json({ etymology });
    } catch (e) {
      console.error("[ai/lookup etymology]", e);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Etymology failed" },
        { status: 502 },
      );
    }
  }

  const text = (body.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  const sentence = body.sentence?.trim() || undefined;
  const short = isLookupSelection(text);

  if (!gigachatConfigured()) {
    const data = short
      ? stubLookupCard(text, target, sentence)
      : stubPassage(text, target);
    return NextResponse.json({ data, stub: true });
  }

  try {
    const data = short
      ? await lookupCard(text, target, sentence)
      : await translatePassage(text, target);
    return NextResponse.json({ data });
  } catch (e) {
    console.error("[ai/lookup]", e);
    // Degrade instead of hard 502 — sheet still opens with a minimal card.
    const data = short
      ? stubLookupCard(text, target, sentence)
      : stubPassage(text, target);
    return NextResponse.json({
      data: {
        ...data,
        ...(short && data.mode === "lookup"
          ? {
              primary:
                target === "ru"
                  ? `Не удалось получить ответ модели. Исходное: ${text}`
                  : `Model unavailable. Source: ${text}`,
              definitions: [
                e instanceof Error ? e.message : "Lookup failed",
              ],
            }
          : data.mode === "passage"
            ? {
                translation:
                  target === "ru"
                    ? `Не удалось перевести.\n\n${text}`
                    : `Translation failed.\n\n${text}`,
              }
            : {}),
      },
      degraded: true,
    });
  }
}
