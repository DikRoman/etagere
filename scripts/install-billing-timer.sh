#!/usr/bin/env bash
# Install / refresh the YooKassa renew systemd timer on the VPS.
# Run on the server (as root) or via: ssh root@HOST bash -s < scripts/install-billing-timer.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="${ETAGERE_BIN_DIR:-/opt/etagere/bin}"
ENV_FILE="${ETAGERE_ENV_FILE:-/etc/default/etagere-web}"
UNIT_DIR="${ETAGERE_UNIT_DIR:-/etc/systemd/system}"

install -d -m 755 "$BIN_DIR"
install -m 755 "$ROOT/scripts/yookassa-renew.sh" "$BIN_DIR/yookassa-renew.sh"
install -m 644 "$ROOT/deploy/systemd/etagere-billing.service" \
  "$UNIT_DIR/etagere-billing.service"
install -m 644 "$ROOT/deploy/systemd/etagere-billing.timer" \
  "$UNIT_DIR/etagere-billing.timer"

if [[ -f "$ENV_FILE" ]] && ! grep -q '^YOOKASSA_RENEW_SECRET=' "$ENV_FILE"; then
  secret="$(openssl rand -hex 32)"
  printf '\nYOOKASSA_RENEW_SECRET=%s\n' "$secret" >> "$ENV_FILE"
  echo "Wrote YOOKASSA_RENEW_SECRET to $ENV_FILE"
fi

systemctl daemon-reload
systemctl enable --now etagere-billing.timer
systemctl restart etagere-web || true
systemctl list-timers etagere-billing.timer --no-pager
echo "Installed etagere-billing.timer"
