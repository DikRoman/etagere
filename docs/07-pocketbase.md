# PocketBase

## Роль

- Регистрация / вход / сессии
- Подписка (free / pro stub)
- Admin API для server routes (verify email, newsletter)
- Будущий sync метаданных книг в облако

**Файлы книг** сейчас в IndexedDB браузера, не в PocketBase.

## URL

| Среда | Browser | Server (Next API) |
|-------|---------|-------------------|
| Local | http://127.0.0.1:8090 | http://127.0.0.1:8090 |
| Production | https://api.etagere.ru | http://127.0.0.1:8090 |

Server routes: `src/lib/pb-admin.ts` использует `POCKETBASE_INTERNAL_URL`.

## Миграции

`pocketbase/pb_migrations/`:

| Файл | Содержание |
|------|------------|
| `1740000000_etagere_collections.js` | users, subscriptions, books, annotations |
| `1740000001_email_and_newsletter.js` | newsletter_subscribers |
| `1740000002_email_tokens.js` | токены verify / reset |

Применяются автоматически при старте PocketBase.

## Коллекции

### users (auth)
- Email + password
- Вход только после verify (настраивается в auth rules)

### subscriptions
- `plan`: `free` | `pro`
- `status`, `expires_at`
- Stub-активация Pro из кабинета

### books / annotations
- Зарезервированы под облачный sync (UI пока локальный)

### newsletter_subscribers
- `email`, `status` (pending → active), токен подтверждения

## Admin

Production admin: https://api.etagere.ru/_/

Superuser создаётся:
```bash
./pocketbase/pocketbase superuser upsert EMAIL PASS --dir=./pocketbase/pb_data
```

## Auth store (frontend)

`src/store/auth.ts`:
- hydrate с mutex (нет гонки refresh)
- PocketBase SDK auto-cancel не сбрасывает сессию
- Friendly errors: `EMAIL_TAKEN`, `PASSWORD_TOO_SHORT`

## Server auth routes

```
src/app/api/auth/
  confirm-verification/
  confirm-password-reset/
  request-password-reset/
  resend-verification/
  send-verification/
```

## Billing stub

```
src/app/api/billing/ensure-free/
src/app/api/billing/activate-stub/
```

Заглушка до интеграции ЮKassa.
