#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_DIR="$REPO_ROOT/apps/frontend"
PORT="${FRONTEND_PORT:-3000}"

cd "$FRONTEND_DIR"

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
curl -sS -o /dev/null -w "sitemap: %{http_code}\n" "http://127.0.0.1:$PORT/sitemap.xml"
curl -sS -o /dev/null -w "robots: %{http_code}\n" "http://127.0.0.1:$PORT/robots.txt"
