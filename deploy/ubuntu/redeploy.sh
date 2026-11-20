#!/usr/bin/env bash
# Build and restart the Ubuntu systemd services. Does not touch aaPanel or SSL.
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
if [[ "${PAYMENT_SANDBOX_ENABLED}" == "true" ]]; then
  echo "PAYMENT_SANDBOX_ENABLED must be false in production." >&2
  exit 1
fi
if [[ "${MAIL_PROVIDER}" != "noop" ]]; then
  echo "MAIL_PROVIDER must be noop until a real mail provider is configured." >&2
  exit 1
fi

echo "==> Install"
# .env sets NODE_ENV=production; devDependencies (prisma, nest, tsc) are required to migrate and build.
CI=true corepack pnpm install --frozen-lockfile --prod=false

echo "==> Migrate"
# The Neon pooler cannot hold Prisma's session lock. Migrations use the direct host.
MIGRATE_URL="${DATABASE_URL//-pooler/}"
(
  cd "${ROOT}/apps/api"
  DATABASE_URL="${MIGRATE_URL}" node <<'JS'
const { Client } = require("pg");
(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 30000,
  });
  await client.connect();
  const result = await client.query(
    "SELECT pg_terminate_backend(l.pid) AS terminated FROM pg_locks l WHERE l.locktype = 'advisory' AND l.objid = 72707369 AND l.pid <> pg_backend_pid()",
  );
  console.log("cleared migrate locks:", result.rowCount);
  await client.end();
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
JS
)
migrate_ok=0
for attempt in 1 2 3; do
  if DATABASE_URL="${MIGRATE_URL}" corepack pnpm --filter @amarpin/api prisma:deploy; then
    migrate_ok=1
    break
  fi
  if [[ "${attempt}" -eq 3 ]]; then
    exit 1
  fi
  echo "==> Migrate retry ${attempt}"
  sleep 8
done
if [[ "${migrate_ok}" -ne 1 ]]; then
  exit 1
fi

echo "==> Build"
# Next.js asks Upgrade/Skip on a terminal when a security release exists. CI skips that prompt.
export CI=true
corepack pnpm build

chown -R "${APP_USER}:${APP_USER}" "${ROOT}"

echo "==> Restart"
systemctl enable "${API_SERVICE}" "${WEB_SERVICE}"
systemctl restart "${API_SERVICE}"
systemctl restart "${WEB_SERVICE}"

bash "${ROOT}/deploy/ubuntu/verify-live.sh"
echo "==> Redeploy complete"
