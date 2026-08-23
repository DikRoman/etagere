import type { Locale } from "./types";

export type WordLookupMode = "lookup" | "passage";

export interface WordLookupSentence {
  original: string;
  translation: string;
}

export interface WordLookupExample {
  /** Example in the source language of the book. */
  en: string;
  /** Translation into the UI/target locale. */
  ru: string;
}

/** Structured dictionary card from /api/ai/lookup */
export interface WordLookupCard {
  mode: "lookup";
  word: string;
  lemma?: string;
  /** Detected source language code: en, de, fr, es, it, pt, nl, pl, … */
  sourceLang?: string;
  /** Human label in the UI locale, e.g. «немецкий». */
  sourceLangLabel?: string;
  ipa?: string;
  pos?: string;
  grammar?: string;
  primary: string;
  variants: string[];
  related?: string[];
  sentence?: WordLookupSentence;
  definitions?: string[];
  examples?: WordLookupExample[];
}

export interface PassageTranslation {
  mode: "passage";
  original: string;
  translation: string;
}

export type WordLookupResult = WordLookupCard | PassageTranslation;

export type AiPanelResult =
  | { kind: "plain"; title: string; body: string }
  | {
      kind: "lookup";
      title: string;
      data: WordLookupResult | null;
      loading?: boolean;
    };

const WORD_SPLIT = /[\s\u00a0]+/;

/** Short selection → dictionary card; longer → literary passage. */
export function isLookupSelection(text: string): boolean {
  const words = text
    .trim()
    .split(WORD_SPLIT)
    .filter((w) => w.replace(/[^\p{L}\p{N}'’-]/gu, "").length > 0);
  return words.length > 0 && words.length <= 4;
}

export function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

export function parseLookupJson(raw: string): WordLookupResult | null {
  try {
    const data = JSON.parse(stripJsonFence(raw)) as Record<string, unknown>;
    if (data.mode === "passage") {
      const translation =
        typeof data.translation === "string" ? data.translation.trim() : "";
      const original =
        typeof data.original === "string" ? data.original.trim() : "";
      if (!translation) return null;
      return { mode: "passage", original, translation };
    }

    const word = typeof data.word === "string" ? data.word.trim() : "";
    const primary = typeof data.primary === "string" ? data.primary.trim() : "";
    if (!word || !primary) return null;

    const variants = Array.isArray(data.variants)
      ? data.variants.filter((v): v is string => typeof v === "string" && !!v.trim())
      : [];
    const related = Array.isArray(data.related)
      ? data.related.filter((v): v is string => typeof v === "string" && !!v.trim())
      : undefined;
    const definitions = Array.isArray(data.definitions)
      ? data.definitions.filter(
          (v): v is string => typeof v === "string" && !!v.trim(),
        )
      : undefined;

    let sentence: WordLookupSentence | undefined;
    if (data.sentence && typeof data.sentence === "object") {
      const s = data.sentence as Record<string, unknown>;
      const original = typeof s.original === "string" ? s.original.trim() : "";
      const translation =
        typeof s.translation === "string" ? s.translation.trim() : "";
      if (original && translation) sentence = { original, translation };
    }

    let examples: WordLookupExample[] | undefined;
    if (Array.isArray(data.examples)) {
      examples = data.examples
        .map((ex) => {
          if (!ex || typeof ex !== "object") return null;
          const e = ex as Record<string, unknown>;
          const src =
            (typeof e.src === "string" && e.src.trim()) ||
            (typeof e.en === "string" && e.en.trim()) ||
            (typeof e.original === "string" && e.original.trim()) ||
            "";
          const tr =
            (typeof e.tr === "string" && e.tr.trim()) ||
            (typeof e.ru === "string" && e.ru.trim()) ||
            (typeof e.translation === "string" && e.translation.trim()) ||
            "";
          return src && tr ? { en: src, ru: tr } : null;
        })
        .filter((x): x is WordLookupExample => !!x);
      if (!examples.length) examples = undefined;
    }

    return {
      mode: "lookup",
      word,
      lemma: typeof data.lemma === "string" ? data.lemma.trim() : undefined,
      sourceLang:
        typeof data.sourceLang === "string"
          ? data.sourceLang.trim().toLowerCase()
          : undefined,
      sourceLangLabel:
        typeof data.sourceLangLabel === "string"
          ? data.sourceLangLabel.trim()
          : undefined,
      ipa: typeof data.ipa === "string" ? data.ipa.trim() : undefined,
      pos: typeof data.pos === "string" ? data.pos.trim() : undefined,
      grammar: typeof data.grammar === "string" ? data.grammar.trim() : undefined,
      primary,
      variants,
      related,
      sentence,
      definitions,
      examples,
    };
  } catch {
    return null;
  }
}

export function stubLookupCard(
  text: string,
  targetLocale: Locale,
  sentence?: string,
): WordLookupCard {
  const word = text.trim().split(WORD_SPLIT)[0] || text.trim();
  const prefix =
    targetLocale === "ru" ? "[перевод → RU]" : "[translation → EN]";
  return {
    mode: "lookup",
    word,
    lemma: word.toLowerCase().replace(/[^a-zа-яё'-]/gi, "") || word,
    primary: `${prefix} ${word}`,
    variants: [],
    sentence: sentence
      ? {
          original: sentence,
          translation: `${prefix} ${sentence}`,
        }
      : undefined,
    definitions: [
      targetLocale === "ru"
        ? "Подключите GIGACHAT_AUTH_KEY для полного словаря."
        : "Set GIGACHAT_AUTH_KEY for a full dictionary card.",
    ],
  };
}

export function stubPassage(
  text: string,
  targetLocale: Locale,
): PassageTranslation {
  const prefix =
    targetLocale === "ru" ? "[перевод → RU]\n" : "[translation → EN]\n";
  return {
    mode: "passage",
    original: text,
    translation: `${prefix}${text}`,
  };
}
