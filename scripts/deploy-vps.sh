#!/usr/bin/env bash
# Build and deploy Étagère to the production VPS.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

HOST="${ETAGERE_VPS_HOST:-root@200.165.230.151}"
APP_DIR="${ETAGERE_APP_DIR:-/opt/etagere/app}"

export NEXT_PUBLIC_POCKETBASE_URL="${NEXT_PUBLIC_POCKETBASE_URL:-https://api.etagere.ru}"
export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-https://etagere.ru}"
# VK ID app (build-time public id). Secret stays on the VPS .env at runtime.
export NEXT_PUBLIC_VK_CLIENT_ID="${NEXT_PUBLIC_VK_CLIENT_ID:-54722382}"
# Yandex ID — set NEXT_PUBLIC_YANDEX_CLIENT_ID before deploy once you have the app.
if [[ -n "${NEXT_PUBLIC_YANDEX_CLIENT_ID:-}" ]]; then
  export NEXT_PUBLIC_YANDEX_CLIENT_ID
fi
if [[ -n "${NEXT_PUBLIC_DROPBOX_APP_KEY:-}" ]]; then
  export NEXT_PUBLIC_DROPBOX_APP_KEY
fi
if [[ -n "${NEXT_PUBLIC_ONEDRIVE_CLIENT_ID:-}" ]]; then
  export NEXT_PUBLIC_ONEDRIVE_CLIENT_ID
fi

npm run build

ssh "$HOST" "install -d -m 755 /opt/etagere/bin"
rsync -az --delete --exclude '.env' .next/standalone/ "${HOST}:${APP_DIR}/"
rsync -az pocketbase/pb_migrations/ "${HOST}:/mnt/etagere-data/pb_migrations/"
rsync -az scripts/yookassa-renew.sh "${HOST}:/opt/etagere/bin/yookassa-renew.sh"
rsync -az deploy/systemd/etagere-billing.service "${HOST}:/etc/systemd/system/etagere-billing.service"
rsync -az deploy/systemd/etagere-billing.timer "${HOST}:/etc/systemd/system/etagere-billing.timer"

# Ensure runtime appDir matches deploy path (prepare-standalone sets ".").
ssh "$HOST" "python3 - <<'PY'
import json
from pathlib import Path
p = Path('${APP_DIR}/.next/required-server-files.json')
data = json.loads(p.read_text())
data['appDir'] = '${APP_DIR}'
p.write_text(json.dumps(data))
print('appDir', data['appDir'])
PY
chmod 755 /opt/etagere/bin/yookassa-renew.sh
if ! grep -q '^YOOKASSA_RENEW_SECRET=' /etc/default/etagere-web; then
  printf '\\nYOOKASSA_RENEW_SECRET=%s\\n' \"\$(openssl rand -hex 32)\" >> /etc/default/etagere-web
  echo 'Wrote YOOKASSA_RENEW_SECRET'
fi
systemctl daemon-reload
systemctl enable --now etagere-billing.timer
chown -R etagere:etagere '${APP_DIR}'
systemctl restart etagere-web
sleep 2
systemctl is-active etagere-web
systemctl list-timers etagere-billing.timer --no-pager
curl -sI -o /dev/null -w 'pdf.worker %{http_code}\\n' http://127.0.0.1:3000/pdf.worker.min.mjs
curl -sI -o /dev/null -w 'pdfjs wasm %{http_code}\\n' http://127.0.0.1:3000/pdfjs/wasm/openjpeg.wasm
curl -sI -o /dev/null -w 'mark.svg %{http_code}\\n' http://127.0.0.1:3000/brand/mark.svg
"

echo "Deployed to ${HOST}:${APP_DIR}"
