"use client";

import { useEffect, useMemo, useState } from "react";
import { useLibraryStore } from "@/store/library";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";
import { isDriveConfigured } from "@/lib/storage/drive";
import {
  CLOUD_PROVIDERS,
  disconnectProvider,
  isProviderConfigured,
  isProviderConnected,
  providerLabel,
  refreshCloudSessions,
  type CloudProvider,
} from "@/lib/cloud/session";
import {
  downloadCloudPick,
  listCloudBooks,
  type CloudPick,
} from "@/lib/cloud/disks";

export function CloudDisks() {
  const locale = useSettingsStore((s) => s.locale);
  const importFromDrive = useLibraryStore((s) => s.importFromDrive);
  const addBookFile = useLibraryStore((s) => s.addBookFile);
  const refreshDriveFlag = useLibraryStore((s) => s.refreshDriveFlag);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<CloudProvider | "pick" | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [picker, setPicker] = useState<{
    provider: CloudProvider;
    items: CloudPick[];
    selected: string[];
  } | null>(null);

  const connected = useMemo(() => {
    void tick;
    return Object.fromEntries(
      CLOUD_PROVIDERS.map((p) => [p, isProviderConnected(p)]),
    ) as Record<CloudProvider, boolean>;
  }, [tick]);

  const ru = locale === "ru";

  useEffect(() => {
    let cancelled = false;
    void refreshCloudSessions().then(() => {
      if (!cancelled) {
        refreshDriveFlag();
        setTick((n) => n + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [refreshDriveFlag]);

  async function connect(provider: CloudProvider) {
    setStatus(null);
    setBusy(provider);
    try {
      window.location.assign(`/api/cloud/${provider}/start`);
      return;
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
      setTick((n) => n + 1);
    }
  }

  function disconnect(provider: CloudProvider) {
    disconnectProvider(provider);
    refreshDriveFlag();
    setTick((n) => n + 1);
  }

  async function importFrom(provider: CloudProvider) {
    setBusy("pick");
    setStatus(null);
    try {
      if (provider === "gdrive") {
        const books = await importFromDrive();
        setStatus(importStatus(books, ru));
        return;
      }
      const items = await listCloudBooks(provider);
      if (!items.length) {
        setStatus(
          ru
            ? "В папке Étagère пока нет PDF/EPUB."
            : "No PDF/EPUB in the Étagère folder yet.",
        );
        return;
      }
      setPicker({ provider, items, selected: [] });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
    }
  }

  function togglePick(id: string) {
    setPicker((cur) => {
      if (!cur) return cur;
      const on = cur.selected.includes(id);
      return {
        ...cur,
        selected: on
          ? cur.selected.filter((x) => x !== id)
          : [...cur.selected, id],
      };
    });
  }

  async function importPicked() {
    if (!picker) return;
    const chosen = picker.items.filter((item) =>
      picker.selected.includes(item.id),
    );
    if (!chosen.length) return;
    setBusy("pick");
    try {
      for (const item of chosen) {
        const file = await downloadCloudPick(picker.provider, item);
        await addBookFile(
          file,
          picker.provider === "gdrive" ? item.id : undefined,
          undefined,
          { provider: picker.provider, fileId: item.id },
        );
      }
      setPicker(null);
      setStatus(importStatus(chosen, ru));
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="cloud-disks">
      <div className="cloud-disks-row">
        {CLOUD_PROVIDERS.map((provider) => {
          const ready = isProviderConfigured(provider) || (provider === "gdrive" && isDriveConfigured());
          const on = connected[provider];
          return (
            <div key={provider} className="cloud-disk-chip">
              <span className={`cloud-disk-dot ${on ? "is-on" : ""}`} />
              <span className="cloud-disk-name">
                {providerLabel(provider, locale)}
              </span>
              {on ? (
                <>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busy !== null}
                    onClick={() => void importFrom(provider)}
                  >
                    {ru ? "Импорт" : "Import"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busy !== null}
                    onClick={() => disconnect(provider)}
                  >
                    {ru ? "Откл." : "Off"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={!ready || busy !== null}
                  onClick={() => void connect(provider)}
                  title={
                    ready
                      ? undefined
                      : ru
                        ? "Не настроено на сервере"
                        : "Not configured on the server"
                  }
                >
                  {busy === provider
                    ? "…"
                    : ru
                      ? "Подключить"
                      : "Connect"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {picker && (
        <div className="cloud-disk-picker">
          <p>
            {ru ? "Отметь книги в" : "Select books in"}{" "}
            {providerLabel(picker.provider, locale)}
          </p>
          <ul>
            {picker.items.map((item) => {
              const on = picker.selected.includes(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`btn-ghost ${on ? "is-on" : ""}`}
                    disabled={busy !== null}
                    onClick={() => togglePick(item.id)}
                  >
                    {item.name}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="cloud-disk-picker-actions">
            <button
              type="button"
              className="btn-primary"
              disabled={busy !== null || picker.selected.length === 0}
              onClick={() => void importPicked()}
            >
              {ru
                ? `Добавить (${picker.selected.length})`
                : `Add (${picker.selected.length})`}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setPicker(null)}
            >
              {t("cancel", locale)}
            </button>
          </div>
        </div>
      )}
      {status && <p className="drive-hint">{status}</p>}
    </div>
  );
}

function importStatus(books: unknown[] | null, ru: boolean): string {
  if (!books?.length) return ru ? "Импорт отменён." : "Import cancelled.";
  if (books.length === 1) {
    return ru ? "Книга добавлена на полку." : "Book added to your shelf.";
  }
  return ru
    ? `Добавлено книг: ${books.length}.`
    : `Added ${books.length} books.`;
}
