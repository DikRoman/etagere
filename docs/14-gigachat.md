# GigaChat API для перевода и чата в читалке

1. Зайди на https://developers.sber.ru/ → войти (Сбер ID).
2. Создай проект **GigaChat API** (для физлиц — Pers / физлицо).
3. Скопируй **Authorization key** (уже Base64).
4. На VPS:

```bash
# /etc/default/etagere-web
GIGACHAT_AUTH_KEY=вставь_ключ_сюда
GIGACHAT_SCOPE=GIGACHAT_API_PERS
# по умолчанию GigaChat-2-Max (оплаченные/бесплатные токены Max);
# варианты: GigaChat-2, GigaChat-2-Pro, GigaChat-3-Ultra
GIGACHAT_MODEL=GigaChat-2-Max
# Max иногда думает дольше 30с; по умолчанию в коде 90с
# GIGACHAT_TIMEOUT_MS=90000
```

5. `systemctl restart etagere-web`

Проверка: в читалке выдели текст → Перевод. Короткое выделение (до 4 слов) открывает словарную карточку; длинное — перевод пассажа. Если ключа нет — будет заглушка.

Для ИП/ООО scope обычно `GIGACHAT_API_B2B` или `GIGACHAT_API_CORP` — как в кабинете.
