import { randomBytes } from "crypto";
import http from "node:http";
import https from "node:https";
import { appPublicUrl, sendMail as sendSmtpMail } from "@/lib/mail";
import { getAdminPb } from "@/lib/pb-admin";
import { transactionalEmailHtml } from "@/lib/email-template";
import { SUPPORT_EMAIL } from "@/lib/site";

const RELAY_URL =
  process.env.MAIL_RELAY_URL?.replace(/\/$/, "") ||
  "http://31.31.198.123/etagere-mail.php";
const RELAY_HOST = process.env.MAIL_RELAY_HOST || "etagere.online";
const RELAY_SECRET = process.env.MAIL_RELAY_SECRET || "etagere-mail-relay-2026";

async function postMailRelay(body: Record<string, string>): Promise<{
  ok?: boolean;
  error?: string;
}> {
  const parsed = new URL(RELAY_URL);
  const payload = JSON.stringify(body);
  const transport = parsed.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          Host: RELAY_HOST,
        },
      },
      (res) => {
        let text = "";
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(text) as { ok?: boolean; error?: string });
          } catch {
            reject(new Error(text || `Mail relay failed (${res.statusCode})`));
          }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(15_000, () => {
      req.destroy(new Error("Mail relay timeout"));
    });
    req.write(payload);
    req.end();
  });
}

export async function sendAppMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  if (process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.SMTP_FROM || "Etagere <noreply@etagere.ru>",
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend failed: ${body}`);
    }
    return;
  }

  if (RELAY_URL && RELAY_SECRET) {
    const payload: Record<string, string> = {
      secret: RELAY_SECRET,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
    };
    if (opts.html) payload.html = opts.html;
    const data = await postMailRelay(payload);
    if (!data.ok) {
      throw new Error(data.error || "Mail relay failed");
    }
    return;
  }

  await sendSmtpMail(opts);
}

export function newToken(): string {
  return randomBytes(24).toString("hex");
}

export async function issueVerificationToken(email: string): Promise<string> {
  const pb = await getAdminPb();
  const user = await pb
    .collection("users")
    .getFirstListItem(`email = "${email.replace(/"/g, '\\"')}"`);

  const token = newToken();
  const expires = new Date();
  expires.setHours(expires.getHours() + 24);

  try {
    const existing = await pb
      .collection("email_tokens")
      .getFirstListItem(`email = "${email.replace(/"/g, '\\"')}" && type = "verification"`);
    await pb.collection("email_tokens").update(existing.id, {
      user: user.id,
      token,
      expires_at: expires.toISOString(),
    });
  } catch {
    await pb.collection("email_tokens").create({
      user: user.id,
      email,
      token,
      type: "verification",
      expires_at: expires.toISOString(),
    });
  }

  return token;
}

export async function sendVerificationEmail(email: string): Promise<void> {
  const token = await issueVerificationToken(email);
  const url = `${appPublicUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  const text = `Здравствуйте!

Подтвердите email для Etagere / Этажер:
${url}

Ссылка действует 24 часа. Если вы не регистрировались — проигнорируйте письмо.`;
  await sendAppMail({
    to: email,
    subject: "Подтвердите email — Etagere",
    text,
    html: transactionalEmailHtml({
      title: "Подтвердите email",
      intro: "Нажмите кнопку ниже, чтобы завершить регистрацию в Etagere / Этажер. Ссылка действует 24 часа.",
      actionLabel: "Подтвердить email",
      actionUrl: url,
    }),
  });
}

export async function confirmVerificationToken(token: string): Promise<void> {
  const pb = await getAdminPb();
  const row = await pb
    .collection("email_tokens")
    .getFirstListItem(`token = "${token.replace(/"/g, '\\"')}" && type = "verification"`);

  if (row.expires_at && new Date(row.expires_at as string).getTime() < Date.now()) {
    throw new Error("Token expired");
  }

  await pb.collection("users").update(row.user as string, { verified: true });
  await pb.collection("email_tokens").delete(row.id);
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  const pb = await getAdminPb();
  let user;
  try {
    user = await pb
      .collection("users")
      .getFirstListItem(`email = "${email.replace(/"/g, '\\"')}"`);
  } catch {
    return;
  }

  const token = newToken();
  const expires = new Date();
  expires.setHours(expires.getHours() + 2);

  try {
    const existing = await pb
      .collection("email_tokens")
      .getFirstListItem(`email = "${email.replace(/"/g, '\\"')}" && type = "password_reset"`);
    await pb.collection("email_tokens").update(existing.id, {
      user: user.id,
      token,
      expires_at: expires.toISOString(),
    });
  } catch {
    await pb.collection("email_tokens").create({
      user: user.id,
      email,
      token,
      type: "password_reset",
      expires_at: expires.toISOString(),
    });
  }

  const url = `${appPublicUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const text = `Здравствуйте!

Сбросьте пароль Etagere:
${url}

Ссылка действует 2 часа. Если вы не запрашивали сброс — проигнорируйте письмо.`;
  await sendAppMail({
    to: email,
    subject: "Сброс пароля — Etagere",
    text,
    html: transactionalEmailHtml({
      title: "Сброс пароля",
      intro: "Вы запросили сброс пароля для Etagere / Этажер. Ссылка действует 2 часа.",
      actionLabel: "Сбросить пароль",
      actionUrl: url,
    }),
  });
}

/** Welcome mail after first OAuth sign-in (VK / Yandex). */
export async function sendOAuthWelcomeEmail(opts: {
  email: string;
  name?: string;
  provider: "vk" | "yandex";
}): Promise<void> {
  const libraryUrl = `${appPublicUrl()}/`;
  const hello = opts.name?.trim() ? opts.name.trim() : "Здравствуйте";
  const via =
    opts.provider === "yandex" ? "Яндекс ID" : "VK ID";
  const text = `${hello}!

Вы вошли в Etagere / Этажер через ${via}. Аккаунт создан и уже активен — подтверждать email не нужно.

Библиотека: ${libraryUrl}

Если это были не вы — напишите нам.`;
  await sendAppMail({
    to: opts.email,
    subject: "Добро пожаловать в Etagere",
    text,
    html: transactionalEmailHtml({
      title: "Добро пожаловать",
      intro: `Вы вошли через ${via}. Аккаунт создан и уже активен — подтверждать email не нужно.`,
      actionLabel: "Открыть библиотеку",
      actionUrl: libraryUrl,
      footer: `Вопросы: ${SUPPORT_EMAIL}`,
    }),
  });
}

/** @deprecated use sendOAuthWelcomeEmail */
export async function sendVkWelcomeEmail(opts: {
  email: string;
  name?: string;
}): Promise<void> {
  await sendOAuthWelcomeEmail({ ...opts, provider: "vk" });
}

export async function confirmPasswordResetToken(
  token: string,
  password: string,
): Promise<void> {
  const pb = await getAdminPb();
  const row = await pb
    .collection("email_tokens")
    .getFirstListItem(`token = "${token.replace(/"/g, '\\"')}" && type = "password_reset"`);

  if (row.expires_at && new Date(row.expires_at as string).getTime() < Date.now()) {
    throw new Error("Token expired");
  }

  await pb.collection("users").update(row.user as string, {
    password,
    passwordConfirm: password,
  });
  await pb.collection("email_tokens").delete(row.id);
}
