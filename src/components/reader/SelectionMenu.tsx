"use client";

import { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "@/store/settings";
import { useReaderStore } from "@/store/reader";
import { t } from "@/lib/i18n";
import { HIGHLIGHT_COLORS } from "@/lib/types";
import { lookupSelection } from "@/lib/ai";
import { isLookupSelection } from "@/lib/word-lookup";

function IconHighlight() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M17.5 2.5a4.5 4.5 0 0 1 3.2 7.7L10 20.9l-4.9 1 1-4.9L13.8 3.3a4.48 4.48 0 0 1 3.7-0.8Z"
        opacity="0.35"
      />
      <path
        fill="currentColor"
        d="M15.2 4.6 5.4 18.2l-0.6 2.8 2.8-0.6L17.8 10.8a2.5 2.5 0 1 0-2.6-6.2Z"
      />
    </svg>
  );
}

function IconQuote() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M7.17 6.02A4.5 4.5 0 0 0 4 10.5H6a2.5 2.5 0 0 1 2.45-2.5c.2 0 .4.02.59.07A3 3 0 0 0 7.17 6.02Zm9 0A4.5 4.5 0 0 0 13 10.5h1.83a2.5 2.5 0 0 1 2.45-2.5c.2 0 .4.02.59.07A3 3 0 0 0 16.17 6.02ZM4 12h3.5c2.2 0 4 1.8 4 4v1.5H8.5A4.5 4.5 0 0 1 4 13.5V12Zm9 0H16.5c2.2 0 4 1.8 4 4v1.5H17.5A4.5 4.5 0 0 1 13 13.5V12Z"
      />
    </svg>
  );
}

function IconNote() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M19 3H8c-1.1 0-2 .9-2 2v14l3-2 3 2 3-2 3 2 3-2V5c0-1.1-.9-2-2-2Zm-1 12.8-1.2.8-2.8-1.9-2.8 1.9-2.8-1.9L6 15.8V5h12v10.8Z"
      />
      <path fill="currentColor" d="M9 7h6v2H9V7Zm0 3h4v2H9v-2Z" />
    </svg>
  );
}

function IconTranslate() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1 4.5h2v1.2h-1v1.8h1v1.2h-1v2.1h-2v-2.1H9V9.5h1V8.3H9V7h2v-.5ZM16 8l1.2 3.2L18.4 8H20l-2.2 5.6L20 19h-1.6l-1.1-3-1.1 3H14l2.2-5.4L14 8h2Z"
      />
    </svg>
  );
}

function IconAi() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2.4 13.2 8.2 19 9.4 13.2 10.6 12 16.4 10.8 10.6 5 9.4 10.8 8.2 12 2.4Zm6.4 11.2 0.7 3.2 3.2.7-3.2.7-.7 3.2-.7-3.2-3.2-.7 3.2-.7.7-3.2ZM4.6 13.2l.55 2.5 2.5.55-.55.55-2.5.55-.55 2.5-.55-2.5-2.5-.55 2.5-.55.55-2.5Z"
      />
    </svg>
  );
}

export function SelectionMenu() {
  const locale = useSettingsStore((s) => s.locale);
  const selection = useReaderStore((s) => s.selection);
  const activeColor = useReaderStore((s) => s.activeColor);
  const clearSelection = useReaderStore((s) => s.clearSelection);
  const addHighlightFromSelection = useReaderStore(
    (s) => s.addHighlightFromSelection,
  );
  const addQuoteFromSelection = useReaderStore((s) => s.addQuoteFromSelection);
  const addNoteFromSelection = useReaderStore((s) => s.addNoteFromSelection);
  const setAiOpen = useReaderStore((s) => s.setAiOpen);
  const setAiResult = useReaderStore((s) => s.setAiResult);
  const askAiAbout = useReaderStore((s) => s.askAiAbout);

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setNoteOpen(false);
    setNoteText("");
  }, [selection?.text, selection?.page]);

  useEffect(() => {
    if (noteOpen) noteRef.current?.focus();
  }, [noteOpen]);

  if (!selection) return null;

  const bubbleW = noteOpen ? 240 : 248;
  const left = Math.min(
    window.innerWidth - bubbleW / 2 - 12,
    Math.max(bubbleW / 2 + 12, selection.screen.x),
  );
  const top = Math.max(72, selection.screen.y - 14);

  async function translate() {
    const text = selection!.text;
    const sentence = selection!.sentence || text;
    const title = isLookupSelection(text)
      ? t("wordLookup", locale)
      : t("aiTranslateTitle", locale);
    setAiOpen(true);
    setAiResult({
      kind: "lookup",
      title,
      data: null,
      loading: true,
    });
    try {
      const data = await lookupSelection(text, locale, sentence);
      setAiResult({ kind: "lookup", title, data });
    } catch (e) {
      setAiResult({
        kind: "plain",
        title,
        body: e instanceof Error ? e.message : "Error",
      });
    }
    clearSelection();
  }

  async function saveQuote() {
    await addQuoteFromSelection();
    setNoteOpen(false);
    setNoteText("");
  }

  async function saveNote() {
    const text = noteText.trim();
    if (!text) return;
    await addNoteFromSelection(text);
    setNoteOpen(false);
    setNoteText("");
  }

  const actions = [
    {
      id: "highlight",
      label: t("highlight", locale),
      icon: <IconHighlight />,
      accent: HIGHLIGHT_COLORS[activeColor].fill,
      onClick: () => void addHighlightFromSelection(),
    },
    {
      id: "quote",
      label: t("quoteAction", locale),
      icon: <IconQuote />,
      onClick: () => void saveQuote(),
    },
    {
      id: "note",
      label: t("noteAction", locale),
      icon: <IconNote />,
      onClick: () => setNoteOpen(true),
    },
    {
      id: "translate",
      label: t("translate", locale),
      icon: <IconTranslate />,
      onClick: () => void translate(),
    },
    {
      id: "ai",
      label: t("askAi", locale),
      icon: <IconAi />,
      onClick: () => {
        const sel = selection!;
        askAiAbout({
          text: sel.text,
          sentence: sel.sentence,
          page: sel.page,
        });
      },
    },
  ] as const;

  return (
    <div
      className={`selection-bubble ${noteOpen ? "selection-bubble--note" : ""}`}
      style={{ left, top }}
      role="toolbar"
      aria-label={t("selectedText", locale)}
    >
      <div className="selection-bubble-ring">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={`selection-bubble-btn ${noteOpen && action.id === "note" ? "is-on" : ""}`}
            title={action.label}
            aria-label={action.label}
            onClick={action.onClick}
            style={
              "accent" in action
                ? ({ "--bubble-accent": action.accent } as React.CSSProperties)
                : undefined
            }
          >
            <span className="selection-bubble-icon">{action.icon}</span>
            <span className="selection-bubble-label">{action.label}</span>
          </button>
        ))}
      </div>

      {noteOpen && (
        <div className="selection-bubble-note">
          <textarea
            ref={noteRef}
            rows={3}
            value={noteText}
            placeholder={t("notePlaceholder", locale)}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void saveNote();
              }
              if (e.key === "Escape") setNoteOpen(false);
            }}
          />
          <div className="selection-bubble-note-actions">
            <button type="button" className="btn-ghost" onClick={() => setNoteOpen(false)}>
              {t("close", locale)}
            </button>
            <button
              type="button"
              className="btn-primary compact"
              disabled={!noteText.trim()}
              onClick={() => void saveNote()}
            >
              {t("saveNote", locale)}
            </button>
          </div>
        </div>
      )}

      <span className="selection-bubble-tail" aria-hidden />
    </div>
  );
}
