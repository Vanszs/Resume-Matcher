#!/bin/bash
set -euo pipefail

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
    status="$(curl -sS -o /dev/null -w "%{http_code}" "$url" || true)"
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
screen -S resume-frontend-prod -X quit || true
screen -S resume-frontend -X quit || true
sleep 1

echo "[4/5] Freeing port $PORT..."
fuser -k "$PORT"/tcp 2>/dev/null || true
sleep 1

echo "[5/5] Starting frontend from $SERVER_DIR on port $PORT..."
screen -dmS resume-frontend-prod bash -lc "cd '$SERVER_DIR' && PORT=$PORT '$NODE_BIN' server.js"

echo "Done. Verifying endpoints..."
wait_for_http_status "http://127.0.0.1:$PORT/sitemap.xml" "200" "sitemap" 30
wait_for_http_status "http://127.0.0.1:$PORT/robots.txt" "200" "robots" 30
