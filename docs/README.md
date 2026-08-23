# Документация Étagère

Подробные инструкции по проекту **Étagère / Этажер** — читалка PDF/EPUB с полкой, заметками и импортом из Google Drive.

## Содержание

| Документ | О чём |
|----------|--------|
| [01-overview.md](./01-overview.md) | Архитектура, стек, как устроено приложение |
| [02-local-development.md](./02-local-development.md) | Локальный запуск для разработки |
| [03-environment.md](./03-environment.md) | Все переменные окружения |
| [04-google-drive.md](./04-google-drive.md) | Google Drive: OAuth, Picker, импорт книг |
| [05-email.md](./05-email.md) | Почта: SMTP, relay, регистрация, рассылка |
| [06-deployment.md](./06-deployment.md) | Деплой на VPS (production) |
| [07-pocketbase.md](./07-pocketbase.md) | PocketBase: коллекции, миграции, auth |
| [08-reader.md](./08-reader.md) | Читалка: PDF, EPUB, заметки, инструменты |
| [09-troubleshooting.md](./09-troubleshooting.md) | Частые проблемы и решения |
| [10-vk-oauth.md](./10-vk-oauth.md) | Вход через VK |
| [11-yandex-oauth.md](./11-yandex-oauth.md) | Вход через Яндекс |
| [12-telegram-oauth.md](./12-telegram-oauth.md) | Вход через Telegram |
| [13-library-sync.md](./13-library-sync.md) | Синхронизация полки (метаданные) |
| [14-gigachat.md](./14-gigachat.md) | GigaChat: перевод и чат |
| [15-tts.md](./15-tts.md) | Озвучка: Piper и ElevenLabs |
| [16-yookassa.md](./16-yookassa.md) | ЮKassa: Pro 100 ₽/мес |

## Production

| Сервис | URL |
|--------|-----|
| Сайт | https://etagere.ru |
| PocketBase API | https://api.etagere.ru |
| Google Cloud project | `etagere-505417` |

## Быстрые команды

```bash
cp .env.example .env.local   # настроить переменные
npm install
npm run dev                  # http://localhost:3000

npm run build                # production-сборка
npm run deploy:vps           # деплой на VPS (нужен SSH)
```

Подробности — в соответствующих файлах выше.
