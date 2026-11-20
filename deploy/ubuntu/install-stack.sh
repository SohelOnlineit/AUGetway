#!/usr/bin/env bash
# Ubuntu 22.04 / 24.04 packages only. aaPanel is not installed or configured here.
# aaPanel stays limited to domain + SSL + Nginx vhost snippets.
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/ubuntu/install-stack.sh" >&2
  exit 1
fi

if ! grep -qE 'VERSION_ID="(22\.04|24\.04)"' /etc/os-release; then
  echo "This script is for Ubuntu 22.04 or 24.04." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/site.env.sh"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg openssl redis-server

if ! /usr/bin/node -e 'const [M,m]=process.versions.node.split(".").map(Number); process.exit((M>20||(M===20&&m>=19))?0:1)' >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

corepack enable
corepack prepare pnpm@9.15.9 --activate

if ! id "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "${APP_ROOT}" --shell /usr/sbin/nologin "${APP_USER}"
fi
install -d -o "${APP_USER}" -g "${APP_USER}" -m 750 "${APP_ROOT}" "${APP_ROOT}/uploads"
install -d -o "${APP_USER}" -g "${APP_USER}" -m 700 "${APP_ROOT}/backups"

if redis-cli ping 2>/dev/null | grep -q PONG; then
  echo "Redis is already running. Leaving the existing Redis service in place."
else
  bash "${SCRIPT_DIR}/configure-redis.sh"
fi

install -m 644 "${SCRIPT_DIR}/payuniqbd-api.service" "/etc/systemd/system/${API_SERVICE}.service"
install -m 644 "${SCRIPT_DIR}/payuniqbd-web.service" "/etc/systemd/system/${WEB_SERVICE}.service"
systemctl daemon-reload

echo "Stack ready. Node $(node -v), pnpm $(pnpm -v)."
echo "Next: clone the repo to ${APP_ROOT}, then run prepare-env.sh and redeploy.sh."
