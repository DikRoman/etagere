"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { useAuthStore } from "@/store/auth";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";
import { pluralRu } from "@/lib/plural-ru";
import {
  dueVocabEntries,
  listVocabEntries,
  studyVocabDeck,
  type VocabEntry,
} from "@/lib/vocab";
import { syncVocab } from "@/lib/sync/vocab-sync";
import { VocabDashboard } from "@/components/vocab/VocabDashboard";
import { VocabList } from "@/components/vocab/VocabList";
import { VocabStudy } from "@/components/vocab/VocabStudy";

type Mode = { kind: "home" } | { kind: "study"; deck: VocabEntry[] };

export default function VocabPage() {
  const locale = useSettingsStore((s) => s.locale);
  const ru = locale === "ru";
  const ready = useAuthStore((s) => s.ready);
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [rows, setRows] = useState<VocabEntry[]>([]);
  const [mode, setMode] = useState<Mode>({ kind: "home" });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const reload = useCallback(async () => {
    setRows(await listVocabEntries());
  }, []);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  // Show what this browser has at once, then merge in the server's copy.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const first = await listVocabEntries();
      if (cancelled) return;
      setRows(first);
      setLoading(false);
      setSyncing(true);
      await syncVocab();
      if (cancelled) return;
      setRows(await listVocabEntries());
      setSyncing(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const due = useMemo(() => dueVocabEntries(rows), [rows]);

  if (!ready || !user) {
    return (
      <div className="auth-page">
        <p className="muted">{ru ? "Загрузка…" : "Loading…"}</p>
      </div>
    );
  }

  const leaveStudy = async () => {
    await reload();
    setMode({ kind: "home" });
    void syncVocab();
  };

  return (
    <div className="account-page vocab-page">
      <header className="account-header">
        <BrandMark />
        <div className="shelf-actions">
          <Link href="/" className="btn-ghost">
            {t("backToShelf", locale)}
          </Link>
        </div>
      </header>

      <main className="vocab-main">
        {mode.kind === "study" ? (
          <VocabStudy
            deck={mode.deck}
            locale={locale}
            onExit={() => void leaveStudy()}
            onChange={reload}
          />
        ) : (
          <>
            <div className="vocab-title">
              <h1>{ru ? "Словарь" : "Vocabulary"}</h1>
              <span className={`vocab-sync ${syncing ? "is-on" : ""}`}>
                {syncing
                  ? ru
                    ? "Синхронизирую…"
                    : "Syncing…"
                  : ru
                    ? `${rows.length} ${pluralRu(rows.length, "слово", "слова", "слов")} · сохранено в облаке`
                    : `${rows.length} ${rows.length === 1 ? "word" : "words"} · saved to the cloud`}
              </span>
            </div>
            {loading ? (
              <p className="muted">{ru ? "Загрузка…" : "Loading…"}</p>
            ) : (
              <>
                <VocabDashboard
                  rows={rows}
                  dueCount={due.length}
                  locale={locale}
                  onStudy={() => setMode({ kind: "study", deck: studyVocabDeck(rows) })}
                  onCram={() => setMode({ kind: "study", deck: rows })}
                />
                <VocabList rows={rows} locale={locale} onChange={reload} />
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
