# Деплой на VPS

## Production

| | |
|--|--|
| Сервер | `200.165.230.151` |
| Приложение | https://etagere.ru |
| PocketBase | https://api.etagere.ru |
| App dir | `/opt/etagere/app` |
| Env | `/etc/default/etagere-web` |
| Systemd | `etagere-web.service`, `etagere-pb.service`, `etagere-billing.timer` |

## Быстрый деплой

```bash
export NEXT_PUBLIC_POCKETBASE_URL=https://api.etagere.ru
export NEXT_PUBLIC_APP_URL=https://etagere.ru
export NEXT_PUBLIC_GOOGLE_CLIENT_ID='….apps.googleusercontent.com'
export NEXT_PUBLIC_GOOGLE_API_KEY='AIza…'

npm run deploy:vps
```

Скрипт `scripts/deploy-vps.sh`:
1. `npm run build` (standalone)
2. `rsync` в `/opt/etagere/app/`
3. rsync миграций PocketBase
4. Патч `appDir` в `required-server-files.json`
5. `systemctl restart etagere-web` и включает `etagere-billing.timer`

## Ручной деплой

```bash
npm run build

rsync -az --delete --exclude '.env' \
  .next/standalone/ root@HOST:/opt/etagere/app/

ssh root@HOST 'python3 - <<PY
import json
from pathlib import Path
p = Path("/opt/etagere/app/.next/required-server-files.json")
d = json.loads(p.read_text())
d["appDir"] = "/opt/etagere/app"
p.write_text(json.dumps(d))
PY
chown -R etagere:etagere /opt/etagere/app
systemctl restart etagere-web'
```

## Env на сервере

Файл `/etc/default/etagere-web` — пример:

```env
HOSTNAME=127.0.0.1
PORT=3000
NEXT_PUBLIC_POCKETBASE_URL=https://api.etagere.ru
POCKETBASE_INTERNAL_URL=http://127.0.0.1:8090
NEXT_PUBLIC_APP_URL=https://etagere.ru
NEXT_PUBLIC_GOOGLE_CLIENT_ID=….
NEXT_PUBLIC_GOOGLE_API_KEY=….
YOOKASSA_SHOP_ID=….
YOOKASSA_SECRET_KEY=***
YOOKASSA_RENEW_SECRET=***
NEXT_PUBLIC_SUPPORT_EMAIL=hello@etagere.ru
POCKETBASE_ADMIN_EMAIL=admin@etagere.ru
POCKETBASE_ADMIN_PASSWORD=***
MAIL_RELAY_URL=http://31.31.198.123/etagere-mail.php
MAIL_RELAY_HOST=etagere.online
MAIL_RELAY_SECRET=***
```

`NEXT_PUBLIC_*` должны быть **на момент build** — они вшиваются в JS. Env на сервере для runtime Next server routes — отдельно.

## HTTPS

- Сайт и API — Let's Encrypt / nginx (или ISPmanager)
- HSTS рекомендуется для `etagere.ru`
- В билде обязательно `https://api.etagere.ru`, не IP

## Проверка после деплоя

```bash
systemctl is-active etagere-web
curl -sI https://etagere.ru | head -5
curl -sI http://127.0.0.1:3000/pdf.worker.min.mjs
```

## PocketBase миграции

```bash
rsync -az pocketbase/pb_migrations/ HOST:/mnt/etagere-data/pb_migrations/
# перезапуск pb при необходимости
```

## Standalone

Next.js собирается в `.next/standalone/`. Скрипт `scripts/prepare-standalone.sh` добавляет `public/` и static — иначе не работают pdf.worker и иконки.
