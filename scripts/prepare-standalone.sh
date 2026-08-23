#!/usr/bin/env bash
# Prepare Next.js standalone output for deployment (public + static assets).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d .next/standalone ]]; then
  echo "Missing .next/standalone — run next build first" >&2
  exit 1
fi

rm -rf .next/standalone/public
cp -R public .next/standalone/public
mkdir -p .next/standalone/.next
rm -rf .next/standalone/.next/static
cp -R .next/static .next/standalone/.next/static

# Standalone required-server-files bakes the build-machine absolute path;
# rewrite to the process cwd so public/ is resolved on the VPS.
python3 - <<'PY'
import json
from pathlib import Path
p = Path(".next/standalone/.next/required-server-files.json")
data = json.loads(p.read_text())
data["appDir"] = "."
p.write_text(json.dumps(data))
print("patched appDir ->", data["appDir"])
PY

echo "Standalone ready: public + static copied"
