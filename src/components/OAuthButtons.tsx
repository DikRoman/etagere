"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";

type OAuthProvider = "vk" | "yandex" | "telegram";

/** Sign-in / sign-up buttons for external identity providers. */
export function OAuthButtons() {
  const locale = useSettingsStore((s) => s.locale);
  const loginWithOAuth = useAuthStore((s) => s.loginWithOAuth);
  const storeError = useAuthStore((s) => s.error);
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("oauth_error");
    if (!code) return;
    setOauthError(code);
    useAuthStore.setState({ error: code });
    params.delete("oauth_error");
    const next = `${window.location.pathname}${
      params.toString() ? `?${params}` : ""
    }${window.location.hash}`;
    window.history.replaceState({}, "", next);
  }, []);

  function onProvider(provider: OAuthProvider) {
    setBusy(provider);
    setOauthError(null);
    void loginWithOAuth(provider);
  }

  const showError =
    oauthError ||
    (storeError && storeError.startsWith("OAUTH_") ? storeError : null);

  return (
    <div className="oauth-block">
      <div className="oauth-divider" role="presentation">
        <span>{t("orContinueWith", locale)}</span>
      </div>
      <button
        type="button"
        className="oauth-btn oauth-btn--vk"
        disabled={busy !== null}
        onClick={() => onProvider("vk")}
      >
        <span className="oauth-btn-icon" aria-hidden>
          VK
        </span>
        {t("continueWithVk", locale)}
      </button>
      <button
        type="button"
        className="oauth-btn oauth-btn--yandex"
        disabled={busy !== null}
        onClick={() => onProvider("yandex")}
      >
        <span className="oauth-btn-icon" aria-hidden>
          Ya
        </span>
        {t("continueWithYandex", locale)}
      </button>
      <button
        type="button"
        className="oauth-btn oauth-btn--telegram"
        disabled={busy !== null}
        onClick={() => onProvider("telegram")}
      >
        <span className="oauth-btn-icon" aria-hidden>
          TG
        </span>
        {t("continueWithTelegram", locale)}
      </button>
      {showError && (
        <p className="auth-error">{oauthMessage(showError, locale)}</p>
      )}
    </div>
  );
}

function oauthMessage(code: string, locale: "ru" | "en"): string {
  if (code === "OAUTH_CANCELLED") {
    return locale === "ru" ? "Вход отменён." : "Sign-in was cancelled.";
  }
  if (code === "OAUTH_UNAVAILABLE") {
    return locale === "ru"
      ? "Этот способ входа пока не настроен. Попробуй email или другой провайдер."
      : "This sign-in method is not configured yet. Try email or another provider.";
  }
  return locale === "ru"
    ? "Не удалось войти через внешний аккаунт."
    : "Could not sign in with the external account.";
}
