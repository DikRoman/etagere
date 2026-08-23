/** YooKassa Payments API v3. Secrets stay on the server. */

export const YOOKASSA_API = "https://api.yookassa.ru/v3";

export const PRO_PRICE = { value: "100.00", currency: "RUB" } as const;
export const PRO_PRICE_RUB = 100;

export type YooPaymentStatus =
  | "pending"
  | "waiting_for_capture"
  | "succeeded"
  | "canceled";

export interface YooAmount {
  value: string;
  currency: string;
}

export interface YooPayment {
  id: string;
  status: YooPaymentStatus;
  paid: boolean;
  amount: YooAmount;
  description?: string;
  metadata?: Record<string, string>;
  confirmation?: {
    type: string;
    confirmation_url?: string;
  };
  payment_method?: {
    type: string;
    id?: string;
    saved?: boolean;
    title?: string;
  };
}

export interface YooNotification {
  type: string;
  event: string;
  object: YooPayment;
}

export function yookassaConfigured(): boolean {
  return Boolean(shopId() && secretKey());
}

export function stubBillingAllowed(): boolean {
  return process.env.BILLING_ALLOW_STUB === "1";
}

function shopId(): string {
  return process.env.YOOKASSA_SHOP_ID?.trim() || "";
}

function secretKey(): string {
  return process.env.YOOKASSA_SECRET_KEY?.trim() || "";
}

export function appPublicUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://etagere.ru"
  );
}

function authHeader(): string {
  return `Basic ${Buffer.from(`${shopId()}:${secretKey()}`).toString("base64")}`;
}

async function yooFetch<T>(
  path: string,
  init: RequestInit & { idempotenceKey?: string } = {},
): Promise<T> {
  if (!yookassaConfigured()) {
    throw new Error("YooKassa is not configured");
  }
  const { idempotenceKey, headers, ...rest } = init;
  const res = await fetch(`${YOOKASSA_API}${path}`, {
    ...rest,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...(idempotenceKey ? { "Idempotence-Key": idempotenceKey } : {}),
      ...headers,
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & {
    type?: string;
    description?: string;
    code?: string;
  };
  if (!res.ok) {
    const msg =
      data.description || data.code || `YooKassa HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function receiptFor(email: string | undefined): Record<string, unknown> | undefined {
  if (process.env.YOOKASSA_RECEIPT !== "1") return undefined;
  if (!email) return undefined;
  const vat = Number(process.env.YOOKASSA_VAT_CODE || 1);
  return {
    customer: { email },
    items: [
      {
        description: "Étagère Pro — 1 месяц",
        quantity: "1.00",
        amount: { value: PRO_PRICE.value, currency: PRO_PRICE.currency },
        vat_code: Number.isFinite(vat) ? vat : 1,
        payment_subject: "service",
        payment_mode: "full_payment",
        measure: "piece",
      },
    ],
  };
}

export async function createCheckoutPayment(opts: {
  userId: string;
  email?: string;
  returnUrl: string;
  idempotenceKey: string;
}): Promise<YooPayment> {
  const receipt = receiptFor(opts.email);
  return yooFetch<YooPayment>("/payments", {
    method: "POST",
    idempotenceKey: opts.idempotenceKey,
    body: JSON.stringify({
      amount: PRO_PRICE,
      capture: true,
      confirmation: {
        type: "redirect",
        return_url: opts.returnUrl,
      },
      description: "Étagère Pro — 1 месяц",
      save_payment_method: true,
      merchant_customer_id: opts.userId,
      metadata: {
        user_id: opts.userId,
        kind: "checkout",
      },
      ...(receipt ? { receipt } : {}),
    }),
  });
}

export async function createRenewalPayment(opts: {
  userId: string;
  email?: string;
  paymentMethodId: string;
  idempotenceKey: string;
}): Promise<YooPayment> {
  const receipt = receiptFor(opts.email);
  return yooFetch<YooPayment>("/payments", {
    method: "POST",
    idempotenceKey: opts.idempotenceKey,
    body: JSON.stringify({
      amount: PRO_PRICE,
      capture: true,
      payment_method_id: opts.paymentMethodId,
      description: "Étagère Pro — продление",
      merchant_customer_id: opts.userId,
      metadata: {
        user_id: opts.userId,
        kind: "renew",
      },
      ...(receipt ? { receipt } : {}),
    }),
  });
}

export async function getPayment(id: string): Promise<YooPayment> {
  return yooFetch<YooPayment>(`/payments/${encodeURIComponent(id)}`);
}
