#!/usr/bin/env bash
# Pull the latest code from GitHub onto the live server, then rebuild and restart.
# Usage: sudo bash deploy/ubuntu/update.sh
# It never touches .env, the database, or the backups folder.
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/ubuntu/update.sh" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/site.env.sh"

REPO_URL="https://github.com/SohelOnlineit/AUGetway.git"
git_app() { git -c safe.directory="${APP_ROOT}" -C "${APP_ROOT}" "$@"; }

if [[ ! -f "${APP_ROOT}/.env" ]]; then
  echo "${APP_ROOT}/.env is missing. Run prepare-env.sh first (see deploy/ubuntu/README.md)." >&2
  exit 1
fi

# The API now refuses to start in production with a missing, default, or short JWT_SECRET.
# Check before pulling, so a bad .env never takes the live site down.
secret="$(grep -E '^JWT_SECRET=' "${APP_ROOT}/.env" | head -1 | cut -d= -f2- | tr -d '"' || true)"
if [[ ${#secret} -lt 32 || "${secret}" == "dev-only-secret-change-me-32-characters" ]]; then
  echo "JWT_SECRET in ${APP_ROOT}/.env is missing, a default value, or shorter than 32 characters." >&2
  echo "Set a long random one first (note: this signs everyone out):" >&2
  echo "  openssl rand -hex 32" >&2
  exit 1
fi

current="$(git_app remote get-url origin 2>/dev/null || true)"
if [[ "${current}" != "${REPO_URL}" ]]; then
  echo "==> Point origin at ${REPO_URL} (was: ${current:-none})"
  if [[ -n "${current}" ]]; then git_app remote set-url origin "${REPO_URL}"; else git_app remote add origin "${REPO_URL}"; fi
fi

before="$(git_app rev-parse --short HEAD)"
echo "==> Fetch (GitHub may ask for the username and a token)"
git_app fetch origin main

if ! git_app merge-base --is-ancestor HEAD origin/main; then
  echo "This server's code history differs from GitHub (this happens once, after the repository moved)." >&2
  echo "Nothing was changed. If the server has no edits you want to keep, run this once, then run update.sh again:" >&2
  echo "  sudo git -c safe.directory=${APP_ROOT} -C ${APP_ROOT} reset --hard origin/main" >&2
  exit 1
fi

git_app merge --ff-only origin/main
after="$(git_app rev-parse --short HEAD)"
echo "==> Code ${before} -> ${after}"

bash "${SCRIPT_DIR}/redeploy.sh"
echo "==> Update complete (${after})"
