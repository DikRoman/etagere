# Google Drive

## Зачем

Пользователь **импортирует** PDF/EPUB со своего Google Drive в полку Étagère и читает в браузере. Каждый пользователь подключает **свой** Drive — не общий.

Выгрузка книг **на** Drive (бэкап) **отключена** — только импорт.

## Как это работает для пользователя

1. Войти на https://etagere.ru
2. Нажать **«Добавить с Google Drive»**
3. В окне Google выбрать PDF или EPUB
4. Книга появляется на полке

**Или:** вставить ссылку на файл Drive → **«Открыть»** — книга загрузится напрямую, без окна выбора.

Файл должен быть доступен тебе в Drive. Если это чужой файл — нужен доступ «всем, у кого есть ссылка».

Пример ссылки:
```
https://drive.google.com/file/d/FILE_ID/view
```

## Технически

| Компонент | Файл |
|-----------|------|
| OAuth (GIS token) | `src/lib/storage/drive.ts` |
| Google Picker | `src/lib/storage/drive.ts` |
| UI | `src/components/ImportFromDriveButton.tsx` |
| Store | `src/store/library.ts` → `importFromDrive`, `importFromDriveLink` |

**Scope:**
- кнопка **«Добавить с Google Drive»** — только `drive.file` (выбранные файлы) + Google Picker
- вставка ссылки — публичный файл по API key или файл, уже выбранный через Picker. Закрытый чужой файл без «всем по ссылке» не откроется — так мы не просим доступ ко всему диску.

Токен хранится в `localStorage` (`etagere-drive-token`).

## Настройка Google Cloud (один раз)

Проект: **etagere-505417** (номер `1069484265184`).

### 1. APIs

Включить:
- [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com?project=etagere-505417)
- [Google Picker API](https://console.cloud.google.com/apis/library/picker.googleapis.com?project=etagere-505417)

### 2. OAuth consent screen (Branding)

- App name: **Étagère**
- User support email: Gmail владельца проекта (или Workspace-email)
- Authorized domains: `etagere.ru`
- Scopes: **только `…/auth/drive.file`**. Не добавляй `drive.readonly` — это restricted, из‑за него Google показывает «приложение не проверено» и требует дорогой аудит.
- Homepage: `https://etagere.ru`
- Privacy: `https://etagere.ru/privacy`
- Terms: `https://etagere.ru/terms`
- **Publish app** (In production) — чтобы могли все пользователи, не только test users
- Затем **Verification Center → Submit for verification**. Для `drive.file` достаточно brand-проверки: описание, скриншоты и короткое видео «выбрал PDF → книга на полке».

### 3. OAuth Client ID

Credentials → Create → **Web application**

**Authorized JavaScript origins:**
```
https://etagere.ru
http://localhost:3000
```

Redirect URIs — не нужны (GIS token client).

### 4. API key (Browser)

Credentials → Create → **API key**

**Application restrictions:** Websites
```
https://etagere.ru/*
https://*.etagere.ru/*
http://localhost:3000/*
https://docs.google.com/*
```

**API restrictions:** Google Picker API **и** Google Drive API (оба)

### 5. Env и деплой

```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=….apps.googleusercontent.com
NEXT_PUBLIC_GOOGLE_API_KEY=AIza….
NEXT_PUBLIC_GOOGLE_APP_ID=1069484265184
```

Пересборка обязательна:
```bash
npm run build
npm run deploy:vps
```

## Ошибки OAuth

| Ошибка | Решение |
|--------|---------|
| `access_denied` / только тестировщики | Audience → **Publish app** или добавить email в Test users |
| `origin_mismatch` | Добавить `https://etagere.ru` в JavaScript origins |
| Нет API key | Добавить `NEXT_PUBLIC_GOOGLE_API_KEY` и пересобрать |
| 403 на Picker (`docs.google.com/picker`) | API key referrers: добавить `https://docs.google.com/*`; API restrictions — Picker + Drive |
| 403 на скачивание | Файл не выбран через Picker — выбрать в окне Google |

## Client secret

**Не используется** — не добавлять в `.env`. Если создали случайно — можно сбросить в Console.

## Ограничения

- Нельзя импортировать чужой **закрытый** файл по ссылке — нужен доступ или публичная ссылка.
- Google Docs (не PDF) — не поддерживаются; нужен экспортированный PDF/EPUB на Drive.
- Книги после импорта лежат в IndexedDB браузера — на другом устройстве нужен повторный импорт (пока нет облачного sync книг).
