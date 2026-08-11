#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
PB_VERSION="${PB_VERSION:-0.25.9}"

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) ARCH=amd64 ;;
  arm64|aarch64) ARCH=arm64 ;;
esac

BIN="$ROOT/pocketbase"
if [[ ! -x "$BIN" ]]; then
  ZIP="pocketbase_${PB_VERSION}_${OS}_${ARCH}.zip"
  curl -fsSL -o /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/${ZIP}"
  unzip -o /tmp/pb.zip pocketbase -d "$ROOT"
  chmod +x "$BIN"
fi

exec "$BIN" serve --http=127.0.0.1:8090 --dir="$ROOT/pb_data" --migrationsDir="$ROOT/pb_migrations"
