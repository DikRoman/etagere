# étagère

Локальная PDF-читалка в духе Apple Books: полка с обложками, закладки, выделения, цитаты, карандаш, заглушка ИИ (перевод / саммари). Хранение — IndexedDB сейчас, синхронизация с Google Drive — через адаптер (OAuth stub).

## Запуск

```bash
npm install
npm run dev
```

Открой [http://localhost:3000](http://localhost:3000).

## Возможности

- Полка с обложками (первый кадр PDF)
- Вертикальный скролл страниц
- Закладки, цветные выделения, цитаты, рукописные заметки
- Поддержка Apple Pencil / стилуса (нажим) и трекпада
- RU / EN интерфейс
- ИИ: `/api/ai/translate` и `/api/ai/summarize` — заглушки
- Google Drive: кнопка «Подключить», реальный OAuth после `NEXT_PUBLIC_GOOGLE_CLIENT_ID`

## Google Drive

1. Создай OAuth Client ID в Google Cloud Console (тип Web)
2. Скопируй `.env.example` → `.env.local` и вставь `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
3. Сейчас connect/sync — stub; PDF и заметки уже пишутся в IndexedDB и готовы к upload в папку `étagère` на Drive

## Структура

- `src/components/Shelf.tsx` — полка
- `src/components/reader/*` — читалка
- `src/lib/storage/local.ts` — IndexedDB
- `src/lib/storage/drive.ts` — Drive adapter
- `src/app/api/ai/*` — AI stubs
