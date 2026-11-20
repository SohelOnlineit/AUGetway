#!/usr/bin/env bash
# Health verification after deploy/reload. Uses localhost (no public domain required).
set -euo pipefail

API_LIVE="${API_LIVE_URL:-http://127.0.0.1:4000/api/health/live}"
API_READY="${API_READY_URL:-http://127.0.0.1:4000/api/health/ready}"
API_INFO="${API_INFO_URL:-http://127.0.0.1:4000/api/health/deploy-info}"
WEB_HEALTH="${WEB_HEALTH_URL:-http://127.0.0.1:3000/api/health}"

fail() { echo "VERIFY FAIL: $*" >&2; exit 1; }

echo "Checking API live: ${API_LIVE}"
curl -fsS "$API_LIVE" | grep -q '"status":"ok"' || fail "api live"

echo "Checking API ready: ${API_READY}"
curl -fsS "$API_READY" | grep -q '"status":"ok"' || fail "api ready"

echo "Checking API deploy-info: ${API_INFO}"
curl -fsS "$API_INFO" >/dev/null || fail "api deploy-info"

echo "Checking web health: ${WEB_HEALTH}"
curl -fsS "$WEB_HEALTH" | grep -q '"status":"ok"' || fail "web health"

echo "Checking systemd services"
systemctl is-active --quiet amarpin-api || fail "amarpin-api is not active"
systemctl is-active --quiet amarpin-web || fail "amarpin-web is not active"

echo "VERIFY OK"
