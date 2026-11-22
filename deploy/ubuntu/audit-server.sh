#!/usr/bin/env bash
# Read-only security check of the live server. It changes nothing: no files, no settings, no restarts.
# Usage: sudo bash deploy/ubuntu/audit-server.sh
# Prints OK / WARN / INFO lines. Fix every WARN, then run it again. A few checks need root; without it they say SKIP.
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/site.env.sh"

warns=0
ok()   { printf 'OK    %s\n' "$*"; }
warn() { printf 'WARN  %s\n' "$*"; warns=$((warns + 1)); }
info() { printf 'INFO  %s\n' "$*"; }
skip() { printf 'SKIP  %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
is_root=0
[[ "${EUID}" -eq 0 ]] && is_root=1

echo "== AU-Getway server check ($(date -u +%Y-%m-%dT%H:%MZ)) =="

echo
echo "-- Secrets in ${APP_ROOT}/.env"
ENV_FILE="${APP_ROOT}/.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  warn ".env not found at ${ENV_FILE}"
elif [[ ! -r "${ENV_FILE}" ]]; then
  skip ".env is not readable by this user (run with sudo)"
else
  mode="$(stat -c '%a' "${ENV_FILE}")"
  owner="$(stat -c '%U' "${ENV_FILE}")"
  if [[ "${mode}" == "600" || "${mode}" == "400" ]]; then ok ".env permissions are ${mode}"; else warn ".env permissions are ${mode}. Run: sudo chmod 600 ${ENV_FILE}"; fi
  if [[ "${owner}" == "${APP_USER}" || "${owner}" == "root" ]]; then ok ".env owner is ${owner}"; else warn ".env is owned by ${owner}, expected ${APP_USER} or root"; fi
  value() { grep -E "^$1=" "${ENV_FILE}" | head -1 | cut -d= -f2- | tr -d '"'; }
  jwt="$(value JWT_SECRET)"
  if [[ ${#jwt} -ge 32 && "${jwt}" != "dev-only-secret-change-me-32-characters" ]]; then ok "JWT_SECRET is set (${#jwt} characters)"; else warn "JWT_SECRET is missing, short or the default"; fi
  if [[ "$(value NODE_ENV)" == "production" ]]; then ok "NODE_ENV=production"; else warn "NODE_ENV is not production in .env"; fi
  if [[ -n "$(value TURNSTILE_OFF)" ]]; then warn "TURNSTILE_OFF is set. Remove it when the Cloudflare check works again"; fi
  if [[ "$(value TWO_FACTOR_OFF)" == "1" ]]; then warn "TWO_FACTOR_OFF=1 is set, so the authenticator code is not asked. Remove it after you are back in"; fi
  admin_pw="$(value ADMIN_PASSWORD)"
  if [[ -n "${admin_pw}" ]]; then info "ADMIN_PASSWORD is still in .env. It is only used the first time. After the desk password is changed it can be removed"; fi
  if [[ -z "$(value DATA_KEY)" ]]; then info "DATA_KEY is not set, so stored secrets are sealed with a key made from JWT_SECRET. Changing JWT_SECRET later means typing the mail/Telegram/gateway secrets again"; fi
  case "$(value DATABASE_URL)" in
    *sslmode=require*|*sslmode=verify-full*|*127.0.0.1*|*localhost*) ok "DATABASE_URL uses SSL or a local database" ;;
    *) warn "DATABASE_URL has no sslmode=require and is not local" ;;
  esac
fi

echo
echo "-- Who the services run as"
for unit in uniqpay-api uniqpay-web; do
  if have systemctl; then
    user="$(systemctl show -p User --value "${unit}" 2>/dev/null)"
    if [[ -z "${user}" || "${user}" == "root" ]]; then warn "${unit} runs as root"; else ok "${unit} runs as ${user}"; fi
    protect="$(systemctl show -p ProtectSystem --value "${unit}" 2>/dev/null)"
    if [[ "${protect}" == "full" || "${protect}" == "strict" ]]; then ok "${unit} has the systemd sandbox on"; else warn "${unit} has no systemd sandbox. Install the new unit files (see the security notes in README.md)"; fi
  fi
done

echo
echo "-- Open ports"
if have ss; then
  public="$(ss -H -tln 2>/dev/null | awk '{print $4}' | grep -Ev '^(127\.|\[::1\]|::1)' | sed 's/.*://' | sort -un | tr '\n' ' ')"
  info "ports open to the network: ${public:-none}"
  for port in "${API_PORT}" "${WEB_PORT}" 5432 5433 6379 27017 3306; do
    if ss -H -tln 2>/dev/null | awk '{print $4}' | grep -Ev '^(127\.|\[::1\]|::1)' | grep -Eq ":${port}$"; then
      warn "port ${port} is open to the network. It must listen on 127.0.0.1 only"
    fi
  done
  ok "checked that the API (${API_PORT}), web (${WEB_PORT}) and common database ports are not public"
else
  skip "ss is not installed"
fi

echo
echo "-- Firewall"
if have ufw; then
  if ufw status 2>/dev/null | grep -qi '^Status: active'; then ok "ufw is active"; else info "ufw is not active. If aaPanel or the cloud provider has a firewall on, that is fine. Otherwise allow only 22, 80 and 443"; fi
elif have iptables && [[ ${is_root} -eq 1 ]]; then
  rules="$(iptables -S 2>/dev/null | wc -l)"
  if [[ "${rules}" -gt 4 ]]; then ok "iptables has rules (${rules} lines)"; else warn "no firewall rules found. Allow only 22, 80 and 443"; fi
else
  skip "no firewall tool found or not root"
fi

echo
echo "-- SSH"
if have sshd && [[ ${is_root} -eq 1 ]]; then
  cfg="$(sshd -T 2>/dev/null)"
  echo "${cfg}" | grep -qi '^permitrootlogin yes' && warn "SSH allows root login with a password. Set PermitRootLogin prohibit-password or no" || ok "SSH root login is not open to passwords"
  echo "${cfg}" | grep -qi '^passwordauthentication yes' && warn "SSH accepts passwords. Use keys and set PasswordAuthentication no (keep a working key first)" || ok "SSH password login is off"
else
  skip "sshd settings need root"
fi
if have fail2ban-client; then
  systemctl is-active --quiet fail2ban 2>/dev/null && ok "fail2ban is running" || warn "fail2ban is installed but not running"
else
  warn "fail2ban is not installed. It blocks addresses that keep guessing SSH passwords (apt install fail2ban)"
fi

echo
echo "-- Updates"
if dpkg -s unattended-upgrades >/dev/null 2>&1; then ok "unattended-upgrades is installed"; else warn "unattended-upgrades is not installed. Install it so security fixes arrive by themselves"; fi
if have apt; then
  pending="$(apt list --upgradable 2>/dev/null | grep -ci security || true)"
  if [[ "${pending}" -gt 0 ]]; then warn "${pending} security updates are waiting (sudo apt update && sudo apt upgrade)"; else ok "no security updates waiting"; fi
fi
[[ -f /var/run/reboot-required ]] && warn "the server needs a reboot to finish an update"
if have node; then
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)"
  if [[ "${major}" -ge 20 ]]; then ok "Node.js $(node -v)"; else warn "Node.js $(node -v) is old"; fi
fi

echo
echo "-- Backups"
BACKUPS="${APP_ROOT}/backups"
if [[ -d "${BACKUPS}" ]]; then
  dmode="$(stat -c '%a' "${BACKUPS}")"
  if [[ "${dmode}" == "700" ]]; then ok "backups folder permissions are 700"; else warn "backups folder permissions are ${dmode}. Run: sudo chmod 700 ${BACKUPS}"; fi
  loose="$(find "${BACKUPS}" -type f ! -perm 600 2>/dev/null | wc -l)"
  if [[ "${loose}" -eq 0 ]]; then ok "every backup file is 600"; else warn "${loose} backup file(s) are readable by others. Run: sudo chmod 600 ${BACKUPS}/*"; fi
  newest="$(find "${BACKUPS}" -type f -name '*.sql' -printf '%T@\n' 2>/dev/null | sort -n | tail -1 | cut -d. -f1)"
  if [[ -n "${newest}" ]]; then
    age=$(( ( $(date +%s) - newest ) / 86400 ))
    if [[ "${age}" -le 2 ]]; then ok "newest backup is ${age} day(s) old"; else warn "newest backup is ${age} days old"; fi
  else
    warn "no backup file found"
  fi
  info "copy a backup to another place sometimes (download from the desk). A backup on the same server is lost with the server"
else
  warn "backups folder does not exist yet"
fi

echo
echo "-- Website over HTTPS"
for host in "${MAIN_DOMAIN}" "${API_DOMAIN}"; do
  if have curl; then
    # The API answers on the main domain under /api (the phone app and the website use that). The api. host is optional.
    headers="$(curl -sS -m 10 -D - -o /dev/null "https://${host}/$([[ "${host}" == "${API_DOMAIN}" ]] && echo api/health)" 2>/dev/null)"
    if [[ -z "${headers}" ]]; then warn "https://${host} did not answer"; continue; fi
    if [[ "${host}" == "${API_DOMAIN}" ]] && ! echo "${headers}" | head -1 | grep -q ' 200'; then
      info "${host}: /api/health is not served here. That is fine when everything uses https://${MAIN_DOMAIN}/api"
    else
      echo "${headers}" | grep -qi '^strict-transport-security' && ok "${host}: HSTS header is sent" || warn "${host}: no Strict-Transport-Security header"
      echo "${headers}" | grep -qi '^x-content-type-options: nosniff' && ok "${host}: nosniff header is sent" || warn "${host}: no X-Content-Type-Options header"
      echo "${headers}" | grep -qi '^x-powered-by' && warn "${host}: X-Powered-By header shows the software" || ok "${host}: no X-Powered-By header"
      echo "${headers}" | grep -qi '^server: nginx/' && warn "${host}: nginx version is shown. Add server_tokens off;" || ok "${host}: server version is hidden"
    fi
  fi
  if have openssl; then
    end="$(echo | openssl s_client -servername "${host}" -connect "${host}:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
    if [[ -n "${end}" ]]; then
      days=$(( ( $(date -d "${end}" +%s) - $(date +%s) ) / 86400 ))
      if [[ "${days}" -ge 14 ]]; then ok "${host}: certificate valid for ${days} more days"; else warn "${host}: certificate ends in ${days} days"; fi
    fi
  fi
  if have curl; then
    code="$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "http://${host}/" 2>/dev/null)"
    if [[ "${code}" == "301" || "${code}" == "302" || "${code}" == "308" ]]; then ok "${host}: plain http redirects to https"; elif [[ "${host}" == "${API_DOMAIN}" && "${code}" == "404" ]]; then info "${host}: not served"; else warn "${host}: plain http answered ${code}, expected a redirect to https. In aaPanel open the site, then SSL, and turn on Force HTTPS"; fi
  fi
done

echo
echo "-- API headers on ${MAIN_DOMAIN}/api (shows whether the latest update is running)"
if have curl; then
  api_headers="$(curl -sS -m 10 -D - -o /dev/null "https://${MAIN_DOMAIN}/api/health" 2>/dev/null)"
  if echo "${api_headers}" | grep -qi '^cache-control: no-store'; then ok "API answers with Cache-Control: no-store"; else warn "API does not send Cache-Control: no-store. The latest update is probably not running yet (sudo bash ${APP_ROOT}/deploy/ubuntu/update.sh)"; fi
  if echo "${api_headers}" | grep -qi "^content-security-policy: default-src 'none'"; then ok "API sends its locked-down Content-Security-Policy"; else warn "API has no locked-down Content-Security-Policy yet"; fi
fi

echo
echo "-- Things that must NOT be reachable from the internet"
if have curl; then
  for path in "/.env" "/.git/config" "/backups/" "/apps/api/.env"; do
    code="$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "https://${MAIN_DOMAIN}${path}" 2>/dev/null)"
    if [[ "${code}" == "200" ]]; then warn "https://${MAIN_DOMAIN}${path} answered 200. This must never be public"; else ok "${path} is not served (${code})"; fi
  done
fi

echo
if [[ "${warns}" -eq 0 ]]; then
  echo "Result: no warnings."
else
  echo "Result: ${warns} warning(s). Fix them and run this again."
fi
exit 0
