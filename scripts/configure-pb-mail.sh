#!/usr/bin/env bash
# Configure PocketBase SMTP + auth email templates on the VPS.
# Usage: source /etc/default/etagere-web && bash scripts/configure-pb-mail.sh
set -euo pipefail

PB_URL="${NEXT_PUBLIC_POCKETBASE_URL:-http://127.0.0.1:8090}"
APP_URL="${NEXT_PUBLIC_APP_URL:-https://etagere.ru}"
ADMIN_EMAIL="${POCKETBASE_ADMIN_EMAIL:?}"
ADMIN_PASS="${POCKETBASE_ADMIN_PASSWORD:?}"
SMTP_HOST="${SMTP_HOST:?}"
SMTP_PORT="${SMTP_PORT:-465}"
SMTP_USER="${SMTP_USER:?}"
SMTP_PASS="${SMTP_PASS:?}"
SMTP_FROM="${SMTP_FROM:-noreply@etagere.ru}"
SMTP_SECURE="${SMTP_SECURE:-true}"

TOKEN=$(curl -s -X POST "${PB_URL}/api/collections/_superusers/auth-with-password" \
  -H "Content-Type: application/json" \
  -d "{\"identity\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASS}\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

export PB_URL APP_URL TOKEN SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM SMTP_SECURE
export SETTINGS="$(curl -s "${PB_URL}/api/settings" -H "Authorization: ${TOKEN}")"

python3 - <<'PY'
import json, os, urllib.request

pb_url = os.environ["PB_URL"]
token = os.environ["TOKEN"]
app_url = os.environ["APP_URL"].rstrip("/")
settings = json.loads(os.environ["SETTINGS"])

settings.setdefault("meta", {})
settings["meta"]["appName"] = "Étagère"
settings["meta"]["appUrl"] = app_url
settings["meta"]["senderName"] = "Étagère"
from_addr = os.environ["SMTP_FROM"]
if "<" in from_addr:
    from_addr = from_addr.split("<")[-1].rstrip(">").strip()
settings["meta"]["senderAddress"] = from_addr or os.environ["SMTP_USER"]

settings["smtp"] = {
    "enabled": True,
    "host": os.environ["SMTP_HOST"],
    "port": int(os.environ["SMTP_PORT"]),
    "username": os.environ["SMTP_USER"],
    "password": os.environ["SMTP_PASS"],
    "authMethod": "",
    "tls": os.environ.get("SMTP_SECURE", "true").lower() == "true",
    "localName": "",
}

verify_body = f"""Здравствуйте!

Подтвердите email для Étagère / Этажер:
{app_url}/verify-email?token={{TOKEN}}

Если вы не регистрировались — проигнорируйте письмо."""

reset_body = f"""Здравствуйте!

Сбросьте пароль Étagère:
{app_url}/reset-password?token={{TOKEN}}

Если вы не запрашивали сброс — проигнорируйте письмо."""

settings.setdefault("verificationTemplate", {})
settings["verificationTemplate"]["subject"] = "Подтвердите email — Étagère"
settings["verificationTemplate"]["body"] = verify_body

settings.setdefault("resetPasswordTemplate", {})
settings["resetPasswordTemplate"]["subject"] = "Сброс пароля — Étagère"
settings["resetPasswordTemplate"]["body"] = reset_body

body = json.dumps(settings).encode()
req = urllib.request.Request(
    f"{pb_url}/api/settings",
    data=body,
    method="PATCH",
    headers={"Authorization": token, "Content-Type": "application/json"},
)
res = json.load(urllib.request.urlopen(req))
print("PocketBase mail configured for", res.get("meta", {}).get("appUrl"))
PY

echo "Done."
