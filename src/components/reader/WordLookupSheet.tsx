"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useSettingsStore } from "@/store/settings";
import { useReaderStore } from "@/store/reader";
import { t } from "@/lib/i18n";
import { fetchEtymology } from "@/lib/ai";
import { speakText } from "@/lib/tts";
import { addVocabEntry, findVocabEntry } from "@/lib/vocab";
import type {
  PassageTranslation,
  WordLookupCard,
  WordLookupResult,
} from "@/lib/word-lookup";

function highlightWord(sentence: string, word: string) {
  if (!word.trim()) return sentence;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${escaped})`, "gi");
  const parts = sentence.split(re);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="lookup-mark">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function Accordion({
  title,
  open,
  onToggle,
  children,
  badge,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  badge?: string;
}) {
  return (
    <div className={`lookup-acc ${open ? "is-open" : ""}`}>
      <button type="button" className="lookup-acc-head" onClick={onToggle}>
        <span>
          {badge ? <span className="lookup-ai-star" aria-hidden>✦</span> : null}
          {title}
        </span>
        <span className="lookup-chevron" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open ? <div className="lookup-acc-body">{children}</div> : null}
    </div>
  );
}

function LookupCardView({
  data,
  onClose,
}: {
  data: WordLookupCard;
  onClose: () => void;
}) {
  const locale = useSettingsStore((s) => s.locale);
  const bookId = useReaderStore((s) => s.bookId);
  const page = useReaderStore((s) => s.page);
  const askAiAbout = useReaderStore((s) => s.askAiAbout);

  const [openSentence, setOpenSentence] = useState(true);
  const [openTranslations, setOpenTranslations] = useState(false);
  const [openDefs, setOpenDefs] = useState(false);
  const [openExamples, setOpenExamples] = useState(false);
  const [openEtym, setOpenEtym] = useState(false);
  const [etym, setEtym] = useState<string | null>(null);
  const [etymLoading, setEtymLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>(() => {
    const init = [data.primary, ...data.variants.slice(0, 2)];
    return [...new Set(init.filter(Boolean))];
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSelected([data.primary, ...data.variants.slice(0, 2)].filter(Boolean));
    setEtym(null);
    setOpenEtym(false);
    setSaved(false);
    let cancelled = false;
    void findVocabEntry(data.word, data.lemma).then((row) => {
      if (!cancelled) setSaved(Boolean(row));
    });
    return () => {
      cancelled = true;
    };
  }, [data.word, data.primary, data.lemma]);

  function toggleChip(v: string) {
    setSelected((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );
  }

  async function loadEtymology() {
    const next = !openEtym;
    setOpenEtym(next);
    if (!next || etym || etymLoading) return;
    setEtymLoading(true);
    try {
      const text = await fetchEtymology(
        data.word,
        locale,
        data.lemma,
        data.sourceLang,
      );
      setEtym(text);
    } catch (e) {
      setEtym(e instanceof Error ? e.message : "Error");
    } finally {
      setEtymLoading(false);
    }
  }

  async function saveToVocab() {
    const translations = selected.length ? selected : [data.primary];
    await addVocabEntry({
      word: data.word,
      lemma: data.lemma,
      translations,
      context: data.sentence?.original,
      ipa: data.ipa,
      pos: data.pos,
      sourceLang: data.sourceLang,
      bookId: bookId ?? undefined,
      page,
    });
    setSaved(true);
  }

  const grammarLine = [data.pos, data.grammar].filter(Boolean).join(" · ");
  const allVariants = [
    data.primary,
    ...data.variants.filter((v) => v !== data.primary),
  ];

  return (
    <div className="lookup-sheet" role="dialog" aria-label={t("wordLookup", locale)}>
      <div className="lookup-handle" aria-hidden />
      <div className="lookup-toolbar">
        <button
          type="button"
          className="icon-btn lookup-speak"
          aria-label={t("speakWord", locale)}
          onClick={() => void speakText(data.word, data.sourceLang)}
        >
          <SpeakerIcon />
        </button>
        {data.sourceLangLabel || data.sourceLang ? (
          <span className="lookup-lang-badge">
            {data.sourceLangLabel || data.sourceLang}
          </span>
        ) : null}
        <div className="lookup-toolbar-spacer" />
        <button
          type="button"
          className="icon-btn"
          aria-label={t("close", locale)}
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <div className="lookup-headword">{data.word}</div>
      {data.lemma && data.lemma.toLowerCase() !== data.word.toLowerCase() ? (
        <button
          type="button"
          className="lookup-lemma"
          onClick={() => void speakText(data.lemma!, data.sourceLang)}
        >
          {data.lemma}
        </button>
      ) : null}
      {data.ipa ? <div className="lookup-ipa">{data.ipa}</div> : null}
      {grammarLine ? <div className="lookup-grammar">{grammarLine}</div> : null}

      <div className="lookup-primary">{data.primary}</div>
      {data.variants.length > 0 ? (
        <p className="lookup-variants-line">{data.variants.join(", ")}</p>
      ) : null}
      {data.related && data.related.length > 0 ? (
        <p className="lookup-related">
          {t("relatedWords", locale)}:{" "}
          {data.related.map((r, i) => (
            <span key={r}>
              {i > 0 ? ", " : null}
              <button
                type="button"
                className="lookup-lemma"
                onClick={() => void speakText(r, data.sourceLang)}
              >
                {r}
              </button>
            </span>
          ))}
        </p>
      ) : null}

      {data.sentence ? (
        <Accordion
          title={t("lookupSentence", locale)}
          open={openSentence}
          onToggle={() => setOpenSentence((v) => !v)}
        >
          <div className="lookup-sent-block">
            <div className="lookup-sent-label">
              {t("lookupOriginal", locale)}
              <button
                type="button"
                className="icon-btn compact"
                aria-label={t("speakSentence", locale)}
                onClick={() =>
                  void speakText(data.sentence!.original, data.sourceLang)
                }
              >
                <SpeakerIcon />
              </button>
            </div>
            <p className="lookup-sent-text">
              {highlightWord(data.sentence.original, data.word)}
            </p>
            <div className="lookup-sent-label">{t("lookupTranslation", locale)}</div>
            <p className="lookup-sent-text">{data.sentence.translation}</p>
          </div>
        </Accordion>
      ) : null}

      <Accordion
        title={t("lookupTranslations", locale)}
        open={openTranslations}
        onToggle={() => setOpenTranslations((v) => !v)}
      >
        <div className="lookup-chips">
          {allVariants.map((v) => (
            <button
              key={v}
              type="button"
              className={`lookup-chip ${selected.includes(v) ? "is-on" : ""}`}
              onClick={() => toggleChip(v)}
            >
              {v}
            </button>
          ))}
        </div>
      </Accordion>

      {data.definitions && data.definitions.length > 0 ? (
        <Accordion
          title={t("lookupDefinitions", locale)}
          open={openDefs}
          onToggle={() => setOpenDefs((v) => !v)}
        >
          <ul className="lookup-list">
            {data.definitions.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </Accordion>
      ) : null}

      {data.examples && data.examples.length > 0 ? (
        <Accordion
          title={t("lookupExamples", locale)}
          open={openExamples}
          onToggle={() => setOpenExamples((v) => !v)}
        >
          <ul className="lookup-examples">
            {data.examples.map((ex) => (
              <li key={ex.en}>
                <div>{ex.en}</div>
                <div className="lookup-ex-tr">{ex.ru}</div>
              </li>
            ))}
          </ul>
        </Accordion>
      ) : null}

      <Accordion
        title={t("lookupEtymology", locale)}
        open={openEtym}
        onToggle={() => void loadEtymology()}
        badge="ai"
      >
        {etymLoading ? (
          <p className="lookup-muted">{t("loadingLookup", locale)}</p>
        ) : (
          <p className="lookup-etym">{etym}</p>
        )}
      </Accordion>

      <div className="lookup-footer">
        <button
          type="button"
          className="lookup-add"
          onClick={() => {
            askAiAbout({
              text: data.word,
              sentence: data.sentence?.original || data.word,
              page,
            });
            onClose();
          }}
        >
          ✦ {t("askAi", locale)}
        </button>
        <button
          type="button"
          className={`lookup-add${saved ? " is-saved" : ""}`}
          onClick={() => void saveToVocab()}
        >
          {saved ? `✓ ${t("vocabAdded", locale)}` : `+ ${t("addToVocab", locale)}`}
        </button>
        {saved ? (
          <Link href="/vocab" className="lookup-add">
            {t("openVocab", locale)}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function PassageView({
  data,
  onClose,
}: {
  data: PassageTranslation;
  onClose: () => void;
}) {
  const locale = useSettingsStore((s) => s.locale);
  const page = useReaderStore((s) => s.page);
  const askAiAbout = useReaderStore((s) => s.askAiAbout);
  return (
    <div className="lookup-sheet" role="dialog" aria-label={t("aiTranslateTitle", locale)}>
      <div className="lookup-handle" aria-hidden />
      <div className="lookup-toolbar">
        <button
          type="button"
          className="icon-btn lookup-speak"
          aria-label={t("speakSentence", locale)}
          onClick={() => void speakText(data.translation, locale)}
        >
          <SpeakerIcon />
        </button>
        <div className="lookup-toolbar-spacer" />
        <button
          type="button"
          className="icon-btn"
          aria-label={t("close", locale)}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <h2 className="lookup-passage-title">{t("aiTranslateTitle", locale)}</h2>
      {data.original ? (
        <>
          <div className="lookup-sent-label">{t("lookupOriginal", locale)}</div>
          <p className="lookup-sent-text lookup-passage-orig">{data.original}</p>
        </>
      ) : null}
      <div className="lookup-sent-label">{t("lookupTranslation", locale)}</div>
      <p className="lookup-sent-text lookup-passage-tr">{data.translation}</p>
      <div className="lookup-footer">
        <button
          type="button"
          className="lookup-add"
          onClick={() => {
            askAiAbout({
              text: data.original || data.translation,
              sentence: data.original || data.translation,
              page,
            });
            onClose();
          }}
        >
          ✦ {t("askAi", locale)}
        </button>
      </div>
    </div>
  );
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="currentColor"
        d="M3 10v4h3l4 3V7L6 10H3Zm11.5 2a2.5 2.5 0 0 0-1.5-2.3v4.6a2.5 2.5 0 0 0 1.5-2.3Zm-1.5-6.1v1.6a5 5 0 0 1 0 9v1.6a6.5 6.5 0 0 0 0-12.2Z"
      />
    </svg>
  );
}

export function WordLookupSheet({
  data,
  loading,
  title,
  onClose,
}: {
  data: WordLookupResult | null;
  loading?: boolean;
  title: string;
  onClose: () => void;
}) {
  const locale = useSettingsStore((s) => s.locale);

  if (loading || !data) {
    return (
      <div className="lookup-sheet is-loading" role="dialog" aria-label={title}>
        <div className="lookup-handle" aria-hidden />
        <div className="lookup-toolbar">
          <div className="lookup-toolbar-spacer" />
          <button
            type="button"
            className="icon-btn"
            aria-label={t("close", locale)}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p className="lookup-muted">{t("loadingLookup", locale)}</p>
      </div>
    );
  }

  if (data.mode === "passage") {
    return <PassageView data={data} onClose={onClose} />;
  }
  return <LookupCardView data={data} onClose={onClose} />;
}
