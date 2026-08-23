"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";
import { fetchAiQuota } from "@/lib/ai";
import type { QuotaSnapshot } from "@/lib/ai-quota";
import type { SubStatus } from "@/lib/pb";

type BillingConfig = {
  enabled: boolean;
  stub: boolean;
  amountRub: number;
};

function statusLabel(status: SubStatus | undefined, locale: "ru" | "en"): string {
  if (status === "trialing") return t("statusTrialing", locale);
  if (status === "past_due") return t("statusPastDue", locale);
  if (status === "canceled") return t("statusCanceled", locale);
  if (status === "active") return t("planActive", locale);
  return t("planActive", locale);
}

export function BillingPanel() {
  const locale = useSettingsStore((s) => s.locale);
  const router = useRouter();
  const searchParams = useSearchParams();
  const subscription = useAuthStore((s) => s.subscription);
  const hasPro = useAuthStore((s) => s.hasPro);
  const activateProStub = useAuthStore((s) => s.activateProStub);
  const startYookassaCheckout = useAuthStore((s) => s.startYookassaCheckout);
  const cancelYookassaRenew = useAuthStore((s) => s.cancelYookassaRenew);
  const resumeYookassaRenew = useAuthStore((s) => s.resumeYookassaRenew);
  const refreshSubscription = useAuthStore((s) => s.refreshSubscription);

  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/billing/config")
      .then((r) => r.json())
      .then((data: BillingConfig) => setConfig(data))
      .catch(() => setConfig({ enabled: false, stub: false, amountRub: 100 }));
    void fetchAiQuota().then(setQuota).catch(() => setQuota(null));
  }, []);

  useEffect(() => {
    if (searchParams.get("billing") !== "return") return;
    setMsg(t("billingReturnOk", locale));
    let n = 0;
    const tick = async () => {
      await refreshSubscription();
      n += 1;
      if (n < 5) window.setTimeout(() => void tick(), 1500);
    };
    void tick();
    router.replace("/account");
  }, [searchParams, locale, refreshSubscription, router]);

  const yoo = subscription?.provider === "yookassa";
  const canPay =
    Boolean(config?.enabled) &&
    (!hasPro() || subscription?.status === "trialing" || subscription?.status === "past_due");
  const canCancel =
    Boolean(config?.enabled) &&
    yoo &&
    hasPro() &&
    Boolean(subscription?.provider_method_id) &&
    !subscription?.cancel_at_period_end;
  const canResume =
    Boolean(config?.enabled) && yoo && hasPro() && Boolean(subscription?.cancel_at_period_end);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      await action();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="account-card">
      <h2>{t("subscription", locale)}</h2>
      <p className="account-sub-line">
        <strong>
          {hasPro() ? t("planPro", locale) : t("planFree", locale)}
        </strong>
        {` · ${statusLabel(subscription?.status, locale)}`}
        {subscription?.expires_at
          ? ` · ${t("expires", locale)} ${new Date(
              subscription.expires_at,
            ).toLocaleDateString(locale === "ru" ? "ru" : "en")}`
          : ""}
      </p>
      {subscription?.cancel_at_period_end && hasPro() && (
        <p className="muted tiny">{t("renewOffHint", locale)}</p>
      )}
      {yoo && subscription?.provider_method_id && !subscription.cancel_at_period_end && hasPro() && (
        <p className="muted tiny">{t("autoRenewOn", locale)}</p>
      )}
      {(msg || err) && (
        <p className={err ? "auth-error" : "drive-hint"}>{err || msg}</p>
      )}
      <div className="account-actions">
        <Link href="/pricing" className="btn-ghost">
          {t("pricing", locale)}
        </Link>
        {canPay && (
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                setMsg(t("payRedirect", locale));
                await startYookassaCheckout();
              })
            }
          >
            {t("payPro", locale)}
          </button>
        )}
        {canCancel && (
          <button
            type="button"
            className="btn-ghost"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await cancelYookassaRenew();
                setMsg(t("renewOffHint", locale));
              })
            }
          >
            {t("cancelRenew", locale)}
          </button>
        )}
        {canResume && (
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await resumeYookassaRenew();
                setMsg(t("autoRenewOn", locale));
              })
            }
          >
            {t("resumeRenew", locale)}
          </button>
        )}
        {config && !config.enabled && !hasPro() && (
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await activateProStub({ trialDays: 7 });
                setMsg(
                  locale === "ru"
                    ? "Пробный период на 7 дней включён."
                    : "7-day free trial started.",
                );
              })
            }
          >
            {t("activateProStub", locale)}
          </button>
        )}
        {config?.stub && !hasPro() && (
          <button
            type="button"
            className="btn-ghost"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await activateProStub({ months: 1 });
                setMsg(
                  locale === "ru"
                    ? "Подписка на месяц включена (заглушка)."
                    : "One-month stub active.",
                );
              })
            }
          >
            {t("activatePaidStub", locale)}
          </button>
        )}
      </div>
      {config && !config.enabled && (
        <p className="muted tiny">{t("billingNotConfigured", locale)}</p>
      )}
      {hasPro() && subscription?.status === "trialing" && (
        <p className="muted tiny">
          {locale === "ru"
            ? "Сейчас пробный период. После него — 100 ₽ в месяц через ЮKassa."
            : "You are on the free trial. Then 100 ₽ per month via YooKassa."}
        </p>
      )}
      {quota && (
        <p className="muted tiny" style={{ marginTop: "0.75rem" }}>
          {t("aiQuotaChat", locale)}: {quota.chat.used} / {quota.chat.limit}
          {" · "}
          {t("aiQuotaMonth", locale)} {quota.period}
        </p>
      )}
    </section>
  );
}
