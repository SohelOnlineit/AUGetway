#!/usr/bin/env bash
# Packages for AU-Getway on the AmarPin VPS. Does not install Nginx and does not
# change the amarpin user, ports, or systemd services. aaPanel keeps Nginx and SSL.
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
apt-get install -y ca-certificates curl gnupg openssl

if ! /usr/bin/node -e 'const [M,m]=process.versions.node.split(".").map(Number); process.exit((M>20||(M===20&&m>=19))?0:1)' >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

corepack enable
corepack prepare pnpm@9.15.9 --activate

if ! id "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --home-dir "${APP_ROOT}" --shell /usr/sbin/nologin "${APP_USER}"
fi
install -d -o "${APP_USER}" -g "${APP_USER}" -m 750 "${APP_ROOT}"
# Daily database copies are saved here. Only the app user can read them.
install -d -o "${APP_USER}" -g "${APP_USER}" -m 700 "${APP_ROOT}/backups"

bash "${SCRIPT_DIR}/install-services.sh"

echo "Stack ready. Node $(node -v), pnpm $(pnpm -v)."
echo "AU-Getway listens on 127.0.0.1:${WEB_PORT} and 127.0.0.1:${API_PORT}."
echo "AmarPin stays on 127.0.0.1:3000 and 127.0.0.1:4000."
echo "Next: DATABASE_URL='postgresql://...' sudo -E bash deploy/ubuntu/prepare-env.sh"
