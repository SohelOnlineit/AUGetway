#!/usr/bin/env bash
# Write production env files. PostgreSQL is Neon; pass DATABASE_URL in the environment.
# Usage: sudo bash deploy/ubuntu/prepare-env.sh [main-domain] [api-domain]
# Defaults: amarpin.com and api.amarpin.com from site.env.sh
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/ubuntu/prepare-env.sh" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/site.env.sh"

MAIN="${1:-${MAIN_DOMAIN}}"
API_HOST="${2:-${API_DOMAIN}}"
if [[ ! "${MAIN}" =~ ^[A-Za-z0-9.-]+$ || ! "${API_HOST}" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo "Usage: sudo bash deploy/ubuntu/prepare-env.sh [${MAIN_DOMAIN}] [${API_DOMAIN}]" >&2
  exit 1
fi

ROOT="${APP_ROOT}"
if [[ ! -f "${ROOT}/package.json" ]]; then
  echo "Clone the repo to ${ROOT} before running this script." >&2
  exit 1
fi

ENV_FILE="${ROOT}/.env"
WEB_ENV="${ROOT}/apps/web/.env.production.local"

if [[ -f "${ENV_FILE}" || -f "${WEB_ENV}" ]]; then
  echo "Env file already exists. Refusing to overwrite ${ENV_FILE} or ${WEB_ENV}." >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Set DATABASE_URL to the Neon pooled connection string, then re-run." >&2
  echo "Example: DATABASE_URL='postgresql://...' sudo -E bash deploy/ubuntu/prepare-env.sh" >&2
  exit 1
fi

ACCESS="$(openssl rand -base64 48 | tr -d '\n')"
REFRESH="$(openssl rand -base64 48 | tr -d '\n')"
DATA_KEY="$(openssl rand -base64 48 | tr -d '\n')"

umask 077
cat > "${ENV_FILE}" <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=${API_PORT}
LOG_LEVEL=info
CORS_ORIGIN=https://${MAIN},https://www.${MAIN}
API_PUBLIC_URL=https://${API_HOST}/api
APP_PUBLIC_URL=https://${MAIN}
DATABASE_URL="${DATABASE_URL}"
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_KEY_PREFIX=${REDIS_PREFIX}
JWT_ACCESS_SECRET=${ACCESS}
JWT_REFRESH_SECRET=${REFRESH}
DATA_ENCRYPTION_KEY=${DATA_KEY}
THROTTLE_TTL_MS=60000
THROTTLE_LIMIT=120
UPLOADS_DIR=../../uploads
MAIL_PROVIDER=noop
PAYMENT_SANDBOX_ENABLED=false
ALLOW_ADMIN_SEED=false
EOF

install -d -o "${APP_USER}" -g "${APP_USER}" "${ROOT}/apps/web"
cat > "${WEB_ENV}" <<EOF
NEXT_PUBLIC_API_URL=https://${API_HOST}/api
NEXT_PUBLIC_WS_URL=https://${API_HOST}
NEXT_PUBLIC_SITE_URL=https://${MAIN}
INTERNAL_API_URL=http://127.0.0.1:${API_PORT}/api
AUTH_JWT_ACCESS_SECRET=${ACCESS}
EOF

chown "${APP_USER}:${APP_USER}" "${ENV_FILE}" "${WEB_ENV}"
chmod 600 "${ENV_FILE}" "${WEB_ENV}"
unset ACCESS REFRESH DATA_KEY DATABASE_URL

echo "Wrote ${ENV_FILE} and ${WEB_ENV}"
echo "  Site:  https://${MAIN}"
echo "  API:   https://${API_HOST}/api"
echo "Next: sudo bash deploy/ubuntu/redeploy.sh"
