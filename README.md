# étagère

Локальная читалка PDF/EPUB + PocketBase (auth, ЛК, подписка-заглушка).

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

В кабинете кнопка **«Включить Pro (заглушка)»** пишет план в коллекцию `subscriptions` (нужны admin email/password в `.env.local`). Позже сюда встанет ЮKassa.

## Структура PocketBase

Коллекции (миграция `pocketbase/pb_migrations/`):

- `users` — auth  
- `subscriptions` — plan `free|pro`, status, expires_at  
- `books` — облачные книги (пока UI локальный)  
- `annotations` — JSON заметок  

## Стек

- Next.js 16 + IndexedDB (офлайн-читалка)  
- PocketBase (API, auth, будущий синк файлов)  
- ЮKassa — следующий шаг для реальной оплаты  
