#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test:coverage
if [ "$(id -u)" = 0 ] || { command -v sudo >/dev/null && sudo -n true 2>/dev/null; }; then
  pnpm exec playwright install --with-deps chromium
else
  echo "No passwordless sudo; using existing browser system libraries."
  pnpm exec playwright install chromium
fi
pnpm e2e
pnpm build
