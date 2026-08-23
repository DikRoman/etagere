# Вход через Яндекс ID

Как VK: свой OAuth на сайте → сессия PocketBase. Встроенный провайдер PocketBase для Яндекса не обязателен.

## 1. Создай приложение

1. Открой [oauth.yandex.ru](https://oauth.yandex.ru/) → **Создать новое приложение**.
2. Название: `Étagère` / `Этажер`.
3. Платформы: **Веб-сервисы**.
4. **Callback URI #1** (точно):

```
https://etagere.ru/api/auth/yandex/callback
```

5. Доступы (права):
   - `Яндекс.ID` → **Доступ к email адресу**, **Доступ к имени пользователя, имени и фамилии, полу**, **Доступ к портрету пользователя**
   - (или scopes: `login:email`, `login:info`, `login:avatar`)
6. Сохрани → скопируй **ClientID** и **Client secret**.

## 2. Переменные на VPS

В `/etc/default/etagere-web`:

```bash
NEXT_PUBLIC_YANDEX_CLIENT_ID=xxxxxxxxxxxxxxxx
YANDEX_CLIENT_SECRET=xxxxxxxxxxxxxxxx
```

`NEXT_PUBLIC_YANDEX_CLIENT_ID` нужен и при **сборке** (см. `scripts/deploy-vps.sh`).  
После правки env: `systemctl restart etagere-web`.

Локально — в `.env.local` те же ключи.

## 3. PocketBase

Миграция `1740000004_yandex_id.js` добавляет поле `users.yandexId` (подтягивается при деплое + рестарте PB).

## 4. Проверка

https://etagere.ru/login → **Продолжить с Яндекс** → согласие → библиотека `/`.

При первом входе: аватар (если есть), приветственное письмо на email Яндекса.
