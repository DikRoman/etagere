# Вход через Telegram

Telegram Login Widget после входа часто возвращает данные в **hash** (`#tgAuthResult=…`), который сервер не видит. Сайт ловит hash в браузере и подтверждает вход через `POST /api/auth/telegram/callback`.

Email у Telegram нет — аккаунт `tg{id}@users.etagere.ru`, письмо не шлётся. Аватар подтягивается, если есть.

## 1. Создай бота

1. [@BotFather](https://t.me/BotFather) → `/newbot`
2. Сохрани токен `123456789:AAH...`
3. **Обязательно** `/setdomain` → бот → `etagere.ru` (без https)
4. Желательно аватар бота с логотипом Этажера

## 2. Env на VPS

```bash
TELEGRAM_BOT_TOKEN=123456789:AAH...
```

`systemctl restart etagere-web`

## 3. Проверка

https://etagere.ru/login → **Продолжить с Telegram** → подтвердить → библиотека.
