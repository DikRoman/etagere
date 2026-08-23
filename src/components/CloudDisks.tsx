"use client";

import { useMemo, useState } from "react";
import { useLibraryStore } from "@/store/library";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";
import { connectDrive, isDriveConfigured } from "@/lib/storage/drive";
import {
  CLOUD_PROVIDERS,
  disconnectProvider,
  isProviderConfigured,
  isProviderConnected,
  providerLabel,
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
  } | null>(null);

  const connected = useMemo(() => {
    void tick;
    return Object.fromEntries(
      CLOUD_PROVIDERS.map((p) => [p, isProviderConnected(p)]),
    ) as Record<CloudProvider, boolean>;
  }, [tick]);

  const ru = locale === "ru";

  async function connect(provider: CloudProvider) {
    setStatus(null);
    setBusy(provider);
    try {
      if (provider === "gdrive") {
        const result = await connectDrive();
        refreshDriveFlag();
        setStatus(result.message);
      } else {
        window.location.href = `/api/cloud/${provider}/start`;
        return;
      }
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
        const book = await importFromDrive();
        setStatus(
          book
            ? ru
              ? "Книга добавлена на полку."
              : "Book added to your shelf."
            : ru
              ? "Импорт отменён."
              : "Import cancelled.",
        );
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
      setPicker({ provider, items });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
    }
  }

  async function pickItem(item: CloudPick) {
    if (!picker) return;
    setBusy("pick");
    try {
      const file = await downloadCloudPick(picker.provider, item);
      await addBookFile(file, picker.provider === "gdrive" ? item.id : undefined, undefined, {
        provider: picker.provider,
        fileId: item.id,
      });
      setPicker(null);
      setStatus(ru ? "Книга добавлена на полку." : "Book added to your shelf.");
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
            {ru ? "Выбери файл в" : "Pick a file in"}{" "}
            {providerLabel(picker.provider, locale)}
          </p>
          <ul>
            {picker.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={busy !== null}
                  onClick={() => void pickItem(item)}
                >
                  {item.name}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setPicker(null)}
          >
            {t("cancel", locale)}
          </button>
        </div>
      )}
      {status && <p className="drive-hint">{status}</p>}
    </div>
  );
}
