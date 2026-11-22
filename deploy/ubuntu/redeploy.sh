#!/usr/bin/env bash
# Build and restart AU-Getway. Does not touch aaPanel, SSL, or AmarPin services.
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/ubuntu/redeploy.sh" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/site.env.sh"

ROOT="${APP_ROOT}"
cd "${ROOT}"

set -a
# shellcheck disable=SC1091
source "${ROOT}/.env"
set +a

if [[ "${NODE_ENV}" != "production" ]]; then
  echo "NODE_ENV must be production." >&2
  exit 1
fi

echo "==> Install"
CI=true corepack pnpm install --frozen-lockfile --prod=false

echo "==> Schema"
# The Neon pooler cannot hold a session lock. Schema push uses the direct host.
DIRECT_URL="${DATABASE_URL//-pooler/}"
(
  cd "${ROOT}/apps/api"
  DATABASE_URL="${DIRECT_URL}" corepack pnpm exec prisma db execute --file "${SCRIPT_DIR}/ensure-sms.sql"
  DATABASE_URL="${DIRECT_URL}" corepack pnpm exec prisma db push --schema prisma/schema.prisma
)

echo "==> Build"
corepack pnpm build

chown -R "${APP_USER}:${APP_USER}" "${ROOT}"

echo "==> Restart"
systemctl enable uniqpay-api uniqpay-web
systemctl restart uniqpay-api
systemctl restart uniqpay-web

bash "${ROOT}/deploy/ubuntu/verify-live.sh"
echo "==> Redeploy complete"
