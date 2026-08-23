# Читалка (Reader)

## Маршрут

`/reader/[bookId]` — `src/app/reader/[bookId]/page.tsx`

Формат определяется из `BookMeta.format`: `pdf` | `epub`.

## PDF

| Компонент | Назначение |
|-----------|------------|
| `PdfViewer` | Скролл, масштаб, filmstrip |
| `PdfPage` | Рендер страницы + text layer |
| `PageFilmstrip` | Превью страниц (canvas thumbs) |
| `SelectionMenu` | Меню при выделении текста |
| `ReaderSidebar` | Закладки, highlights, цитаты, заметки |
| `InkLayer` | Рисование карандашом |

### Выделение текста

- Меню появляется **только при drag-select** (не по клику)
- Действия: highlight, цитата, заметка, перевод (stub AI)

### Заметки

- **Цитаты** — фрагмент текста + маркер на странице
- **Заметки** — пользовательский текст + excerpt + маркер

Хранение: IndexedDB через `src/lib/storage/local.ts`, store `src/store/reader.ts`.

## EPUB

`EpubViewer` opens the stored `.epub` blob with **epub.js**: links, footnotes and images come from the book’s own resources instead of a rewritten HTML copy.

Поиск по книге (PDF и EPUB) строится на клиенте: текст извлекается один раз, индекс — MiniSearch.

## Toolbar

`ReaderToolbar` — навигация, масштаб, инструменты, тема, sidebar, AI stubs.

## Локальное хранилище

```
IndexedDB (etagere)
  books/          — метаданные
  blobs/          — PDF/EPUB файлы
  annotations/    — highlights, quotes, notes, ink, bookmarks
  epub-chapters/  — оглавление EPUB (HTML глав больше не хранится)
```

## Офлайн

После импорта книга доступна без сети (кроме AI и Drive).

## AI

Эндпоинты:
- `/api/ai/translate` — перевод выделения
- `/api/ai/chat` — чат по контексту книги

Провайдер: **GigaChat** (Сбер). Без ключа — заглушка.

1. [developers.sber.ru](https://developers.sber.ru/) → GigaChat API → создать проект  
2. Скопировать **Authorization key** (Base64)  
3. На VPS в `/etc/default/etagere-web`:

```bash
GIGACHAT_AUTH_KEY=...base64...
# физлицо (по умолчанию):
GIGACHAT_SCOPE=GIGACHAT_API_PERS
# юрлицо: GIGACHAT_API_B2B или GIGACHAT_API_CORP
# модель (опционально):
# GIGACHAT_MODEL=GigaChat
```

4. `systemctl restart etagere-web`

Саммари и карточки убраны из UI.

## Themes

`paper` | `night` — `src/store/settings.ts`, CSS в `globals.css`.

## i18n

RU / EN — `src/lib/i18n.ts`, переключатель `LanguageSwitcher`.
