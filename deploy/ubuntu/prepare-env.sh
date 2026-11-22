#!/usr/bin/env bash
# Write production env files. PostgreSQL is Neon. Pass DATABASE_URL in the environment.
# Usage: DATABASE_URL='postgresql://...' sudo -E bash deploy/ubuntu/prepare-env.sh
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

# node-pg does not support channel_binding. The app keeps sslmode=require.
DATABASE_URL="$(node -e 'const u=new URL(process.argv[1]); u.searchParams.delete("channel_binding"); process.stdout.write(u.toString())' "${DATABASE_URL}")"

JWT_SECRET="$(openssl rand -hex 32)"
ADMIN_PASSWORD="$(openssl rand -hex 18)"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@${MAIN}}"

# Every website address of this desk (from site.env.sh), comma separated. The api. address of each is understood
# automatically. A visitor sees the name and logo of the address they came in on (set on the Domains page).
SITE_LIST="$(echo "${SITE_DOMAINS}" | tr -s ' ' ',' | sed 's/^,//; s/,$//')"
if [[ ! ",${SITE_LIST}," == *",${MAIN},"* ]]; then SITE_LIST="${MAIN},${SITE_LIST}"; fi
ORIGINS=""
for domain in ${SITE_LIST//,/ }; do
  ORIGINS="${ORIGINS:+${ORIGINS},}https://${domain},https://api.${domain}"
done

umask 077
cat > "${ENV_FILE}" <<EOF
NODE_ENV=production
PORT=${API_PORT}
WEB_ORIGIN=${ORIGINS}
SITE_DOMAINS=${SITE_LIST}
API_PUBLIC_URL=https://${API_HOST}/api
DATABASE_URL="${DATABASE_URL}"
JWT_SECRET=${JWT_SECRET}
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
EOF

# The website calls the API on its own address (/api), so it needs no API address of its own.
# INTERNAL_API_URL is only where Next.js forwards /api to when nginx did not already.
install -d -o "${APP_USER}" -g "${APP_USER}" "${ROOT}/apps/web"
cat > "${WEB_ENV}" <<EOF
INTERNAL_API_URL=http://127.0.0.1:${API_PORT}
EOF

chown "${APP_USER}:${APP_USER}" "${ENV_FILE}" "${WEB_ENV}"
chmod 600 "${ENV_FILE}" "${WEB_ENV}"

echo "Wrote ${ENV_FILE} and ${WEB_ENV}"
echo "  Sites: ${SITE_LIST}"
echo "  API:   https://${API_HOST}/api (and https://api.<each site>/api)"
echo "  Desk login: ${ADMIN_EMAIL}"
echo "  Desk password: ${ADMIN_PASSWORD}"
echo "Save that password now. It is only in the server .env, not in git."
echo "Next: sudo bash deploy/ubuntu/redeploy.sh"
unset JWT_SECRET ADMIN_PASSWORD DATABASE_URL
