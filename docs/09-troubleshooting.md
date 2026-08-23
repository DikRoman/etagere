# Troubleshooting

## Google Drive

### «access_denied» / только тестировщики
→ Google Cloud → Audience → **Publish app** (In production).

### «Нужен NEXT_PUBLIC_GOOGLE_API_KEY»
→ Создать Browser API key, ограничить Websites + Picker API, пересобрать и задеплоить.

### «origin_mismatch»
→ OAuth client → Authorized JavaScript origins → `https://etagere.ru`.

### Picker открывается, но 403 (`docs.google.com/picker`)
→ API key → HTTP referrers: `https://etagere.ru/*` **и** `https://docs.google.com/*`
→ API restrictions: Google Picker API + Google Drive API

### «Импорт отменён» / пустой Picker при вставке ссылки
→ Импорт по ссылке больше не открывает Picker. Если файл закрытый — дай доступ по ссылке или выбери его через кнопку Drive.

### 403 при скачивании
→ Google Docs нужно **скачать как PDF** и положить на Drive, либо загрузить .pdf/.epub.

---

## Auth / сессия

### Выкидывает после refresh
→ Исправлено в `auth.ts` (hydrate mutex). Убедиться в актуальном деплое.

### Регистрация 400
→ Часто duplicate email или короткий пароль — смотреть текст ошибки в UI.

### Письмо не приходит
→ Проверить relay (`MAIL_RELAY_*`), `mail-config.php` на Reg.ru, spam folder.
→ DKIM/DMARC на домене.

---

## HTTPS / «Не защищено»

→ Сайт должен открываться по `https://etagere.ru`.
→ В билде: `NEXT_PUBLIC_POCKETBASE_URL=https://api.etagere.ru` (не http, не IP).

---

## PocketBase на VPS

### Server routes 500 / timeout
→ `POCKETBASE_INTERNAL_URL=http://127.0.0.1:8090`
→ `systemctl status etagere-pb`

---

## Читалка

### Нет превью страниц (filmstrip)
→ Filmstrip внутри `PdfViewer`, нужен `pdfDoc` в store.

### Меню выделения на каждый клик
→ Должно быть только при drag-select (`PdfPage.tsx`).

### Книга не на полке после Drive
→ Смотреть консоль браузера, проверить API key и OAuth.

---

## Деплой

### 404 на static / pdf.worker
→ Запустить `scripts/prepare-standalone.sh` (входит в `npm run build`).
→ Проверить `appDir` в `required-server-files.json` = `/opt/etagere/app`.

### Изменения NEXT_PUBLIC_* не видны
→ Нужен **rebuild**, не только restart systemd.

---

## Почта Reg.ru

### Не знаю пароль от hello@
→ ISPmanager → Почтовые ящики → создать/сбросить пароль для `hello@etagere.ru`.
→ Webmail: https://webmail.hosting.reg.ru

### «Неверное доменное имя hello_support»
→ Это экран **почтового домена** — в поле «Имя» нужно `etagere.ru`, не имя ящика.

---

## Логи

```bash
# VPS
journalctl -u etagere-web -f
journalctl -u etagere-pb -f
```

Браузер: DevTools → Console / Network при проблемах с Drive и auth.
