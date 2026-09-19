# Étagère для iPad — контекст для агентов

**Корневой `AGENTS.md` к этой папке не относится.** Он описывает Next.js-приложение
и переписывается командой `next dev`. Здесь нет ни Next.js, ни npm, ни TypeScript.

## Что это

Нативное приложение на SwiftUI (iPad), отдельный `.app` с бандлом `ru.etagere.app`.
Оно **не заменяет** сайт etagere.ru и не собирается вместе с ним: Xcode-проект
самодостаточен и ничего не импортирует из `src/`.

- iOS 17.0+, Swift 5
- **Внешних зависимостей нет** — ни SPM, ни CocoaPods. Не добавляйте их без веской
  причины; epub.js и jszip лежат вендорно в `Etagere/Reader/EPUBReader/`.
- PDF — PDFKit + PencilKit, EPUB — epub.js в `WKWebView` с нативным хромом.

## Структура

| Папка | Что внутри |
|-------|------------|
| `Etagere/Auth/` | `PocketBaseClient` (REST + Keychain), `AuthStore`, экран входа |
| `Etagere/Library/` | полка, сайдбар, Reading Now, обложки |
| `Etagere/Reader/` | `ReaderView` и два движка: `PDFKitView`, `EPUBWebView` |
| `Etagere/Storage/` | файлы книг на устройстве, распаковка ZIP, извлечение обложек |
| `Etagere/Models/` | `Book`, `BookCollection`, `ReadingStatus` |

## Связь с вебом

Единственная общая точка — **PocketBase**: схема в `pocketbase/pb_migrations/`
и её REST API. Файлы книг остаются на устройстве, синхронизируются только
метаданные.

`PBBookRecord` в `Auth/PocketBaseClient.swift` повторяет поля коллекции `books`
вручную — компилятор эту связь не проверяет. Правила контракта и чеклист —
в `docs/17-sync-contract.md`. **Меняете схему — правьте оба клиента в одном
коммите с префиксом `pb:`.**

## Конвенции

- Локализация — самописный хелпер `L.t("рус", "eng")` в `L10n.swift`,
  а не `.strings`-файлы. Новые строки добавляйте туда же.
- Логику не шарим с вебом. Фильтры полки в `LibraryStore.swift` и
  `src/lib/library-filters.ts` решают похожую задачу независимо — это сознательно:
  общий слой для Swift и TypeScript обойдётся дороже дубликата.
- Коммиты, затрагивающие эту папку, — с префиксом `ios:`, и **без** веб-файлов
  в том же коммите.

## Сборка

Нужен полноценный Xcode (одних Command Line Tools не хватит — `xcodebuild`
не соберёт приложение). Открыть `ios/Etagere.xcodeproj`, в Signing & Capabilities
выбрать свой Team, destination — iPad. Подробнее — в `ios/README.md`.
