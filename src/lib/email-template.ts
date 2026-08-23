import { appPublicUrl } from "@/lib/mail";
import { SUPPORT_EMAIL } from "@/lib/site";

export function transactionalEmailHtml(opts: {
  title: string;
  intro: string;
  actionLabel: string;
  actionUrl: string;
  footer?: string;
}): string {
  const site = appPublicUrl();
  const footer =
    opts.footer ??
    `Если вы не запрашивали это письмо — просто проигнорируйте его. Вопросы: ${SUPPORT_EMAIL}`;

  return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f5f3ef;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #e8e4dc;border-radius:12px;padding:32px;">
      <tr><td>
        <p style="margin:0 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#666;">Etagere / Этажер</p>
        <h1 style="margin:0 0 16px;font-size:24px;font-weight:600;">${escapeHtml(opts.title)}</h1>
        <p style="margin:0 0 24px;line-height:1.6;font-size:16px;">${escapeHtml(opts.intro)}</p>
        <p style="margin:0 0 24px;">
          <a href="${escapeHtml(opts.actionUrl)}" style="display:inline-block;padding:12px 20px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:999px;font-size:15px;">${escapeHtml(opts.actionLabel)}</a>
        </p>
        <p style="margin:0 0 16px;line-height:1.5;font-size:13px;color:#666;word-break:break-all;">${escapeHtml(opts.actionUrl)}</p>
        <p style="margin:0;line-height:1.5;font-size:13px;color:#888;">${escapeHtml(footer)}</p>
        <p style="margin:24px 0 0;font-size:12px;color:#aaa;"><a href="${escapeHtml(site)}" style="color:#888;">${escapeHtml(site)}</a></p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
