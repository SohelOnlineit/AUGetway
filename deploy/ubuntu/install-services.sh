#!/usr/bin/env bash
# Writes the two systemd units (API and web) with the real folder of this repository, then reloads systemd.
# Safe to run again. It does not restart anything unless you pass --restart.
# Usage: sudo bash deploy/ubuntu/install-services.sh [--restart]
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/ubuntu/install-services.sh" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/site.env.sh"

for unit in uniqpay-api uniqpay-web; do
  sed "s#__APP_ROOT__#${APP_ROOT}#g" "${SCRIPT_DIR}/${unit}.service" > "/etc/systemd/system/${unit}.service"
  chmod 644 "/etc/systemd/system/${unit}.service"
  if grep -q '__APP_ROOT__' "/etc/systemd/system/${unit}.service"; then
    echo "Unit ${unit} still has a placeholder. Not reloading." >&2
    exit 1
  fi
  echo "Installed ${unit}.service for ${APP_ROOT}"
done

systemctl daemon-reload

if [[ "${1:-}" == "--restart" ]]; then
  systemctl restart uniqpay-api uniqpay-web
  echo "Restarted uniqpay-api and uniqpay-web."
else
  echo "Units reloaded. Restart when you are ready: sudo systemctl restart uniqpay-api uniqpay-web"
fi
