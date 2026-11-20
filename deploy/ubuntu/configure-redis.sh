#!/usr/bin/env bash
# Install AuGetway Redis systemd unit + kernel tuning. Run from install-stack.sh as root.
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

install -m 644 "${SCRIPT_DIR}/redis-server.service" /etc/systemd/system/redis-server.service

if [[ -d /etc/systemd/system/redis-server.service.d ]]; then
  rm -rf /etc/systemd/system/redis-server.service.d
fi

cat > /etc/sysctl.d/99-amarpin-redis.conf <<'EOF'
# Redis + jemalloc on low-memory VPS (see deploy/ubuntu/README.md)
vm.overcommit_memory = 1
EOF
chmod 644 /etc/sysctl.d/99-amarpin-redis.conf
sysctl --system >/dev/null 2>&1 || sysctl -p /etc/sysctl.d/99-amarpin-redis.conf

systemctl daemon-reload
systemctl enable redis-server
systemctl reset-failed redis-server.service 2>/dev/null || true

rm -f /run/redis/redis-server.pid
systemctl stop redis-server.service 2>/dev/null || true

if ! systemctl start redis-server.service; then
  echo "redis-server failed to start. On VPS with under 2 GiB RAM, add swap then rerun:" >&2
  echo "  sudo bash ${SCRIPT_DIR}/configure-redis.sh" >&2
  systemctl status redis-server.service --no-pager -l >&2 || true
  exit 1
fi

for _ in $(seq 1 15); do
  if redis-cli ping 2>/dev/null | grep -q PONG; then
    echo "Redis OK (systemd + 127.0.0.1:6379)."
    exit 0
  fi
  sleep 1
done

echo "redis-cli ping failed after start." >&2
systemctl status redis-server.service --no-pager -l >&2 || true
exit 1
