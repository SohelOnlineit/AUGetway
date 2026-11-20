#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "verify-live: $*" >&2
  exit 1
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/site.env.sh"

systemctl is-active --quiet redis-server || fail "redis-server is not active"
systemctl is-active --quiet "${API_SERVICE}" || fail "${API_SERVICE} is not active (see: journalctl -u ${API_SERVICE} -n 80)"
systemctl is-active --quiet "${WEB_SERVICE}" || fail "${WEB_SERVICE} is not active (see: journalctl -u ${WEB_SERVICE} -n 80)"

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${API_PORT}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS "http://127.0.0.1:${API_PORT}/api/health" >/dev/null || fail "API health check failed on 127.0.0.1:${API_PORT} (journalctl -u ${API_SERVICE} -n 80)"

for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://127.0.0.1:${WEB_PORT}/" 2>/dev/null; then
    break
  fi
  sleep 1
done
curl -fsS -o /dev/null "http://127.0.0.1:${WEB_PORT}/" || fail "Web check failed on 127.0.0.1:${WEB_PORT} (journalctl -u ${WEB_SERVICE} -n 80)"

echo "verify-live: OK (API :${API_PORT}, web :${WEB_PORT})"
