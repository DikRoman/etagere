# ЮKassa — подписка Pro 100 ₽/мес

Оплата картой / СБП / SberPay. Файлы книг по-прежнему на диске пользователя; ЮKassa только списывает деньги за Pro.

## Что уже в коде

| URL | Зачем |
|-----|--------|
| `POST /api/billing/yookassa/checkout` | Создать платёж, вернуть ссылку ЮKassa |
| `POST /api/billing/yookassa/webhook` | Уведомление `payment.succeeded` / `canceled` |
| `POST /api/billing/yookassa/cancel` | Выключить автопродление (доступ до `expires_at`) |
| `POST /api/billing/yookassa/resume` | Снова включить автопродление |
| `POST /api/billing/yookassa/renew` | Суточный проход: списать у кого кончается месяц |
| `GET /api/billing/config` | `{ enabled, stub, amountRub }` для UI |

Первый платёж с `save_payment_method`. Если пользователь сохранит карту, дальше cron списывает 100 ₽ сам.

Пробные 7 дней по-прежнему создаются при первом входе (`ensure-free`). Кнопка «заглушка на месяц» работает только при `BILLING_ALLOW_STUB=1`.

## Подключение магазина

1. Самозанятый, ИП или ООО — [регистрация ЮKassa](https://yookassa.ru/). Без статуса физлицо не подключат.
2. В кабинете: **Интеграция → Ключи API** — `shopId` и секретный ключ.
3. **HTTP-уведомления** → URL:

   `https://etagere.ru/api/billing/yookassa/webhook`

   События: `payment.succeeded`, `payment.canceled`.

4. Для отладки создай **тестовый магазин** — те же переменные, другие ключи. [Карты для теста](https://yookassa.ru/developers/payment-acceptance/testing-and-going-live/testing).

5. На VPS в `/etc/default/etagere-web`:

```env
YOOKASSA_SHOP_ID=…
YOOKASSA_SECRET_KEY=…
YOOKASSA_RENEW_SECRET=длинная_случайная_строка
# Чек. Включать, когда касса / чеки ЮKassa уже настроены. vat_code 1 = без НДС
# YOOKASSA_RECEIPT=1
# YOOKASSA_VAT_CODE=1
```

6. Перезапуск приложения: `systemctl restart etagere-web`
7. Миграция PocketBase `1740000010_yookassa.js` — после `rsync` миграций **перезапусти PocketBase**:

```bash
systemctl restart etagere-pb
```

Эти переменные **runtime**, в билд `NEXT_PUBLIC_*` тащить не нужно. Кнопка «Оплатить» появится, как только на сервере есть shop id и секрет.

## Автопродление

На VPS — systemd timer `etagere-billing.timer` каждый день около 06:15. Он дергает локально

`POST http://127.0.0.1:3000/api/billing/yookassa/renew`

(не публичный HTTPS: с самой машины он может не открыться). Юниты лежат в `deploy/systemd/`, скрипт — `/opt/etagere/bin/yookassa-renew.sh`. Ставится вместе с `npm run deploy:vps`.

Проверка:

```bash
systemctl list-timers etagere-billing.timer
systemctl start etagere-billing.service
journalctl -u etagere-billing.service -n 20
```

Пока нет ключей ЮKassa, ответ 503 — для таймера это нормально. Когда ключи появятся, начнёт списывать у тех, у кого кончается месяц.

## Чеки

По умолчанию чек в платёж **не** кладётся (магазин без кассы иначе падает). Когда ЮKassa/касса готовы:

```env
YOOKASSA_RECEIPT=1
YOOKASSA_VAT_CODE=1
```

Самозанятому чек всё равно нужен в «Мой налог».

## Безопасность

- Секретный ключ только на сервере.
- Вебхук не доверяет телу: по `object.id` платёж **перечитывается** из API ЮKassa.
- Сумма строго `100.00 RUB`. Повтор того же `payment.id` не продлевает срок второй раз.
- Заглушка «включить Pro без оплаты» на проде выключена.

## Проверка

1. Тестовый магазин, ключи в env, PB перезапущен.
2. Кабинет → **Оплатить 100 ₽** → тестовая карта `5555 5555 5555 4444`.
3. Вернуться на `/account?billing=return` — статус Pro, дата +1 месяц.
4. Вебхук: в кабинете ЮKassa должно быть 200 на URL уведомлений.
