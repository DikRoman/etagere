# Переменные окружения

Файлы: `.env.local` (локально), `/etc/default/etagere-web` (VPS).

Переменные `NEXT_PUBLIC_*` попадают в **JS-бандл при сборке** — после изменения нужен `npm run build` и redeploy.

## Приложение

| Переменная | Пример | Назначение |
|------------|--------|------------|
| `NEXT_PUBLIC_APP_URL` | `https://etagere.ru` | Публичный URL сайта (ссылки в письмах) |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | `hello@etagere.ru` | Email поддержки в футере и письмах |

## PocketBase

| Переменная | Пример | Назначение |
|------------|--------|------------|
| `NEXT_PUBLIC_POCKETBASE_URL` | `https://api.etagere.ru` | URL для **браузера** |
| `POCKETBASE_INTERNAL_URL` | `http://127.0.0.1:8090` | URL для **server routes** на VPS |
| `POCKETBASE_ADMIN_EMAIL` | `admin@etagere.ru` | Admin для server-side API |
| `POCKETBASE_ADMIN_PASSWORD` | `***` | Пароль admin |

На VPS публичный HTTPS на `api.etagere.ru` может не резолвиться изнутри — поэтому server routes используют `POCKETBASE_INTERNAL_URL`.

## Google Drive

| Переменная | Пример | Назначение |
|------------|--------|------------|
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | `….apps.googleusercontent.com` | OAuth Web client |
| `NEXT_PUBLIC_GOOGLE_API_KEY` | `AIza…` | Browser API key для Picker |
| `NEXT_PUBLIC_GOOGLE_APP_ID` | `1069484265184` | Номер проекта Google Cloud |

Без Client ID и API key импорт с Drive не работает.

## SMTP (рассылка в футере, Next.js API)

| Переменная | Пример |
|------------|--------|
| `SMTP_HOST` | `mail.hosting.reg.ru` |
| `SMTP_PORT` | `465` |
| `SMTP_SECURE` | `true` |
| `SMTP_USER` | `noreply@etagere.ru` |
| `SMTP_PASS` | `***` |
| `SMTP_FROM` | `"Étagère <noreply@etagere.ru>"` |

## Mail relay (письма регистрации с VPS)

VPS не может достучаться до Reg.ru по HTTPS — используется HTTP relay:

| Переменная | Пример |
|------------|--------|
| `MAIL_RELAY_URL` | `http://31.31.198.123/etagere-mail.php` |
| `MAIL_RELAY_HOST` | `etagere.online` |
| `MAIL_RELAY_SECRET` | `***` |

PHP-скрипт: `scripts/etagere-mail.php` → копируется на хостинг Reg.ru.

## ЮKassa (Pro 100 ₽/мес)

| Переменная | Назначение |
|------------|------------|
| `YOOKASSA_SHOP_ID` | shopId из кабинета ЮKassa |
| `YOOKASSA_SECRET_KEY` | секретный ключ API (только сервер) |
| `YOOKASSA_RENEW_SECRET` | пароль для суточного `/api/billing/yookassa/renew` |
| `YOOKASSA_RECEIPT` | `0` — не слать чек в платёж |
| `YOOKASSA_VAT_CODE` | код НДС для чека, обычно `1` (без НДС) |
| `BILLING_ALLOW_STUB` | `1` — dev-кнопка «включить месяц без оплаты» |

Подробности: [16-yookassa.md](./16-yookassa.md). Webhook: `https://etagere.ru/api/billing/yookassa/webhook`.

## Пример `.env.local`

См. `.env.example` в корне репозитория.

## Безопасность

- **Не коммить** `.env.local`, пароли, API secrets.
- `NEXT_PUBLIC_*` видны в браузере — туда только публичные ключи (Client ID, API key с referrer restrictions).
- **Client secret** Google OAuth для этого приложения **не нужен** (используется GIS token client в браузере).
