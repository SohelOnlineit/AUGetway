#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "verify-live: $*" >&2
  exit 1
}

systemctl is-active --quiet uniqpay-api || fail "uniqpay-api is not active (see: journalctl -u uniqpay-api -n 80)"
systemctl is-active --quiet uniqpay-web || fail "uniqpay-web is not active (see: journalctl -u uniqpay-web -n 80)"

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:4100/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS "http://127.0.0.1:4100/api/health" >/dev/null || fail "API health check failed on 127.0.0.1:4100"

for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://127.0.0.1:3100/" 2>/dev/null; then
    break
  fi
  sleep 1
done
curl -fsS -o /dev/null "http://127.0.0.1:3100/" || fail "Web check failed on 127.0.0.1:3100"

echo "verify-live: OK (API :4100, web :3100)"
