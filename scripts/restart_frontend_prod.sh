#!/bin/bash
# Restart frontend in production without full deploy.
# Use this for quick restarts after manual changes.
#
# WARNING: Do NOT run with sudo. Running as root creates a root-owned
# screen session that the deploy user cannot kill, causing EADDRINUSE on next deploy.
#
# Correct usage: bash scripts/restart_frontend_prod.sh

set -euo pipefail

# Refuse to run as root/sudo
if [ "$(id -u)" -eq 0 ]; then
    echo "ERROR: Do NOT run this script as root or with sudo."
    echo "Run as your normal deploy user: bash scripts/restart_frontend_prod.sh"
    exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_DIR="$REPO_ROOT/apps/frontend"
PORT="${FRONTEND_PORT:-3000}"

cd "$FRONTEND_DIR"

wait_for_http_status() {
  local url="$1"
  local expected_status="$2"
  local label="$3"
  local timeout_seconds="${4:-30}"
  local elapsed=0
  local status=""

  while [ "$elapsed" -lt "$timeout_seconds" ]; do
    status="$(curl -s -o /dev/null -w "%{http_code}" "$url" || true)"
    if [ "$status" = "$expected_status" ]; then
      echo "$label is ready ($status)"
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  echo "ERROR: Timed out waiting for $label (last status: ${status:-n/a})"
  return 1
}

echo "[1/5] Building frontend..."
npm run build

echo "[2/5] Preparing standalone assets..."
mkdir -p .next/standalone/.next
cp -r public .next/standalone/ 2>/dev/null || true
cp -r .next/static .next/standalone/.next/

mkdir -p .next/standalone/apps/frontend/.next
cp -r public .next/standalone/apps/frontend/ 2>/dev/null || true
cp -r .next/static .next/standalone/apps/frontend/.next/

STANDALONE_ROOT="$FRONTEND_DIR/.next/standalone"
if [ -f "$STANDALONE_ROOT/apps/frontend/server.js" ]; then
  SERVER_DIR="$STANDALONE_ROOT/apps/frontend"
elif [ -f "$STANDALONE_ROOT/server.js" ]; then
  SERVER_DIR="$STANDALONE_ROOT"
else
  echo "ERROR: standalone server.js not found under $STANDALONE_ROOT"
  exit 1
fi

NODE_BIN="$(command -v node)"

echo "[3/5] Stopping previous frontend screen sessions..."
# Kill both session names for legacy cleanup
screen -S resume-frontend -X quit 2>/dev/null || true
screen -S resume-frontend-prod -X quit 2>/dev/null || true
sleep 1

echo "[4/5] Freeing port $PORT..."
# Try to free port (user-level only, no sudo)
fuser -k "$PORT"/tcp 2>/dev/null || true
sleep 1

# Verify port is free
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "ERROR: Port $PORT is still in use and cannot be freed."
    echo "This usually means a root-owned process is holding the port."
    echo "Run manually: sudo fuser -k ${PORT}/tcp"
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true
    exit 1
fi

echo "[5/5] Starting frontend from $SERVER_DIR on port $PORT..."
# Use unified session name 'resume-frontend' to match deploy.sh
screen -dmS resume-frontend bash -lc "cd '$SERVER_DIR' && PORT=$PORT HOSTNAME=127.0.0.1 '$NODE_BIN' server.js"

echo "Done. Verifying endpoints..."
wait_for_http_status "http://127.0.0.1:$PORT/sitemap.xml" "200" "sitemap" 30
wait_for_http_status "http://127.0.0.1:$PORT/robots.txt" "200" "robots" 30
