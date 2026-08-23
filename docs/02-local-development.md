# Локальная разработка

## Требования

- Node.js 20+
- npm
- Docker **или** нативный бинарник PocketBase (для auth)

## 1. PocketBase

### Вариант A — Docker

```bash
docker compose up -d --build
docker compose exec pocketbase /pb/pocketbase superuser upsert admin@etagere.local changeme123
```

Админка: http://127.0.0.1:8090/_/

### Вариант B — без Docker

```bash
npm run pb:serve
# в другом терминале:
./pocketbase/pocketbase superuser upsert admin@etagere.local changeme123 --dir=./pocketbase/pb_data
```

## 2. Переменные окружения

```bash
cp .env.example .env.local
```

Минимум для локальной работы:

```env
NEXT_PUBLIC_POCKETBASE_URL=http://127.0.0.1:8090
POCKETBASE_INTERNAL_URL=http://127.0.0.1:8090
NEXT_PUBLIC_APP_URL=http://localhost:3000
POCKETBASE_ADMIN_EMAIL=admin@etagere.local
POCKETBASE_ADMIN_PASSWORD=changeme123
```

Для Google Drive локально добавь Client ID, API key и origins `http://localhost:3000` в Google Cloud. См. [04-google-drive.md](./04-google-drive.md).

## 3. Запуск Next.js

```bash
npm install
npm run dev
```

- Приложение: http://localhost:3000
- Регистрация: `/register`
- Вход: `/login`
- Кабинет: `/account`
- Тарифы: `/pricing`

## 4. Сборка production локально

```bash
npm run build
node .next/standalone/server.js
```

Скрипт `scripts/prepare-standalone.sh` копирует `public/` и static в standalone-артефакт.

## 5. Полезные npm-скрипты

| Команда | Действие |
|---------|----------|
| `npm run dev` | Dev-сервер |
| `npm run build` | Production-сборка |
| `npm run lint` | ESLint |
| `npm run pb:up` | Docker PocketBase |
| `npm run pb:serve` | PocketBase без Docker |
| `npm run deploy:vps` | Деплой на VPS |

## 6. Правила для агентов / AI

В корне есть `AGENTS.md` с заметками по Next.js 16 — читай перед изменениями в App Router.
