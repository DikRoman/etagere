# Email и рассылка

## Типы писем

| Тип | Как отправляется |
|-----|------------------|
| Подтверждение регистрации | PocketBase / relay → `src/lib/auth-mail.ts` |
| Сброс пароля | то же |
| Повторная отправка verify | API routes + auth-mail |
| Рассылка (футер) | Next.js API + nodemailer |

## Поток регистрации

1. Пользователь → `/register`
2. PocketBase создаёт user (email не verified)
3. Сервер отправляет письмо со ссылкой `/verify-email?token=…`
4. После перехода по ссылке — вход разрешён

## Mail relay (production)

VPS **не может** ходить на Reg.ru по HTTPS. Решение — HTTP relay на хостинге:

```
VPS (etagere-web) → HTTP → etagere.online/etagere-mail.php → SMTP Reg.ru
```

Переменные:
```env
MAIL_RELAY_URL=http://31.31.198.123/etagere-mail.php
MAIL_RELAY_HOST=etagere.online
MAIL_RELAY_SECRET=***
```

### Установка relay на Reg.ru

1. Скопировать `scripts/etagere-mail.php` на хостинг (например `/www/etagere.online/`)
2. Создать `mail-config.php` по образцу `scripts/mail-config.example.php` (не в git)
3. Указать SMTP Reg.ru, пароль ящика `noreply@etagere.ru`

## SMTP Reg.ru

```env
SMTP_HOST=mail.hosting.reg.ru
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@etagere.ru
SMTP_PASS=***
SMTP_FROM="Étagère <noreply@etagere.ru>"
```

### PocketBase SMTP

```bash
source /etc/default/etagere-web
bash scripts/configure-pb-mail.sh
```

Или вручную: PocketBase Admin → Settings → Mail.

## Поддержка hello@etagere.ru

- Создать ящик в ISPmanager / Reg.ru: `hello@etagere.ru`
- Веб-почта: https://webmail.hosting.reg.ru
- Используется в футере и письмах (`NEXT_PUBLIC_SUPPORT_EMAIL`)
- **noreply@** — только для исходящих системных писем

## Доставляемость (spam)

Рекомендуется на Reg.ru:
- **DKIM** — включить для домена `etagere.ru`
- **DMARC** — политика для домена
- SPF — записи Reg.ru для MX

Без DKIM/DMARC письма могут попадать в спам.

## HTML-шаблоны

`src/lib/email-template.ts` — общий layout transactional-писем.

## Рассылка

- Подписка: POST `/api/newsletter/subscribe`
- Подтверждение: GET `/api/newsletter/confirm?token=…`
- Коллекция PocketBase: `newsletter_subscribers`
