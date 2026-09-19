# Étagère для iPad

Нативное приложение (SwiftUI, iPad only): библиотека как в Books, PDF через PDFKit и PencilKit, EPUB через нативный хром и epub.js в WKWebView, вход в тот же PocketBase, что и сайт.

## Открыть

1. Установи [Xcode](https://developer.apple.com/xcode/) (в проекте сейчас только Command Line Tools — `xcodebuild` без полного Xcode не соберёт приложение).
2. Открой `ios/Etagere.xcodeproj`.
3. Signing & Capabilities → выбери свой Team (бесплатного Apple ID хватает для симулятора и своего iPad).
4. Destination: **iPad** (симулятор или устройство).
5. Run.

Bundle ID: `ru.etagere.app`.

## Что умеет v1

- Split view: Reading Now, Все, Хочу прочесть, Законченные, EPUB, PDF, коллекции
- Импорт PDF/EPUB через Files и «Открыть в Étagère»
- PDF: страницы, разворот, свайп/тап по краям, карандаш (PencilKit)
- EPUB: перелистывание, темы День / Бумага / Ночь
- Вход в PocketBase (`https://api.etagere.ru` или локальный `http://127.0.0.1:8090`) и синхронизация метаданных книг (файлы остаются на устройстве)

Сайт etagere.ru не заменяется этим приложением — это отдельный `.app`.
