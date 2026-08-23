# étagère

Локальная читалка PDF/EPUB + PocketBase (auth, ЛК, подписка ЮKassa) + импорт с облачных дисков.

**Подробная документация:** [docs/README.md](./docs/README.md)

## Быстрый старт

```bash
# 1) PocketBase (нужен Docker ИЛИ нативный бинарник)

# вариант A — Docker
docker compose up -d --build
docker compose exec pocketbase /pb/pocketbase superuser upsert admin@etagere.local changeme123

# вариант B — без Docker (macOS/Linux)
npm run pb:serve
# в другом терминале, один раз:
./pocketbase/pocketbase superuser upsert admin@etagere.local changeme123 --dir=./pocketbase/pb_data

# 2) Next.js
cp .env.example .env.local
npm install
npm run dev
```

- Приложение: http://localhost:3000  
- PocketBase admin: http://127.0.0.1:8090/_/  
- Регистрация / вход / кабинет: `/register`, `/login`, `/account`  
- Тарифы: `/pricing`  

В кабинете кнопка **«Оплатить 100 ₽»** ведёт на ЮKassa (нужны `YOOKASSA_SHOP_ID` и `YOOKASSA_SECRET_KEY`). Пока ключей нет — остаётся 7-дневный пробный период. Подробности: [docs/16-yookassa.md](docs/16-yookassa.md).

## Email и рассылка

- **Подтверждение регистрации** — после `/register` письмо со ссылкой на `/verify-email?token=…`; вход только после подтверждения.
- **Сброс пароля** — `/forgot-password` → письмо → `/reset-password?token=…`.
- **Рассылка в футере** — двойное подтверждение: письмо → `/newsletter/confirm?token=…`.

### SMTP

В `.env.local` / на VPS (`/etc/default/etagere-web`):

```
NEXT_PUBLIC_APP_URL=https://etagere.ru
SMTP_HOST=mail.hosting.reg.ru
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@etagere.ru
SMTP_PASS=...
SMTP_FROM="Étagère <noreply@etagere.ru>"
```

Письма регистрации/сброса пароля идут через **PocketBase** (настройка SMTP в админке или скрипт):

```bash
source /etc/default/etagere-web
bash scripts/configure-pb-mail.sh
```

Рассылка в футере — через Next.js API (`nodemailer`, те же `SMTP_*`).

## Структура PocketBase

Коллекции (миграция `pocketbase/pb_migrations/`):

- `users` — auth (только подтверждённые email)  
- `subscriptions` — plan `free|pro`, status, expires_at  
- `books` — облачные книги (пока UI локальный)  
- `annotations` — JSON заметок  
- `newsletter_subscribers` — рассылка (pending → active)  
## Стек

- Next.js 16 + IndexedDB (офлайн-читалка)  
- PocketBase (API, auth, будущий синк файлов)  
- ЮKassa — следующий шаг для реальной оплаты  
