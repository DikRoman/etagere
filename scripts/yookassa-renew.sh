#!/usr/bin/env bash
# Daily YooKassa renew. Called by systemd on the VPS.
# Hits the local Next.js process — public HTTPS from the box may hairpin-fail.
set -euo pipefail

SECRET="${YOOKASSA_RENEW_SECRET:-}"
PORT="${PORT:-3000}"
URL="http://127.0.0.1:${PORT}/api/billing/yookassa/renew"

if [[ -z "$SECRET" ]]; then
  echo "YOOKASSA_RENEW_SECRET is empty" >&2
  exit 1
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

code="$(
  curl -sS -o "$tmp" -w "%{http_code}" -X POST "$URL" \
    -H "Authorization: Bearer ${SECRET}" \
    --max-time 60 || true
)"
body="$(head -c 180 "$tmp" | tr '\n' ' ')"
echo "HTTP ${code} ${body}"

# Shop keys missing, or the route is not on this build yet.
if [[ "$code" == "503" || "$code" == "404" ]]; then
  exit 0
fi
if [[ "$code" != "200" ]]; then
  exit 1
fi
