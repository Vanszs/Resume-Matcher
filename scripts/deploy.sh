#!/bin/bash
# Deployment script for Resume Matcher on resume.bevansatria.my.id
# This script manages pulling code, installing dependencies, building Next.js, and handling screen sessions.
#
# WARNING: Do NOT run with sudo. All processes must be owned by the deploy user.
# Running with sudo creates root-owned screen sessions that cannot be killed on next deploy.

set -e

# Refuse to run as root/sudo - prevents root-owned screen sessions
if [ "$(id -u)" -eq 0 ]; then
    echo "ERROR: Do NOT run this script as root or with sudo."
    echo "Run as your normal deploy user: bash scripts/deploy.sh"
    exit 1
fi

# Define default ports or use environment variables
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
BACKEND_PORT="${BACKEND_PORT:-8000}"

# Return success when there is a LISTEN socket on the given TCP port.
# Uses actual connection test (nc/curl) first, since lsof often can't see
# sockets from screen daemon processes without elevated permissions.
is_port_in_use() {
    local port=$1

    # Method 1: Try actual TCP connection with nc (most reliable)
    if command -v nc >/dev/null 2>&1; then
        nc -z 127.0.0.1 "$port" >/dev/null 2>&1
        return $?
    fi

    # Method 2: Try curl connection test
    if command -v curl >/dev/null 2>&1; then
        curl -s --connect-timeout 1 "http://127.0.0.1:$port/" -o /dev/null 2>&1
        return $?
    fi

    # Method 3: Fallback to lsof (may not work for screen processes)
    if command -v lsof >/dev/null 2>&1; then
        lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
        return $?
    fi

    # Method 4: Last resort - ss
    ss -ltn 2>/dev/null | grep -qE "[\[\:]$port([[:space:]]|$)"
}

# Wait until a TCP port starts listening, with timeout (seconds).
wait_for_port() {
    local port=$1
    local name=$2
    local timeout_seconds=${3:-30}
    local elapsed=0

    while [ "$elapsed" -lt "$timeout_seconds" ]; do
        if is_port_in_use "$port"; then
            echo "$name is listening on port $port"
            return 0
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done

    echo "ERROR: Timed out waiting for $name on port $port"
    return 1
}

# Wait for an HTTP endpoint to return an expected status code.
wait_for_http_status() {
    local url=$1
    local expected_status=$2
    local label=$3
    local timeout_seconds=${4:-30}
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

# Get listener PIDs for a TCP port (newline-separated).
port_listener_pids() {
    local port=$1

    if command -v lsof >/dev/null 2>&1; then
        lsof -ti -sTCP:LISTEN -iTCP:"$port" 2>/dev/null | sort -u
        return 0
    fi

    ss -ltnp 2>/dev/null \
        | grep -E "[\[\:]$port([[:space:]]|$)" \
        | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' \
        | sort -u
}

# Function to check if a port is free
check_port() {
    local port=$1
    local name=$2
    if is_port_in_use "$port"; then
        echo "Error: Port $port is already in use for $name."
        echo "Please free up the port or set FRONTEND_PORT/BACKEND_PORT appropriately."
        if command -v lsof >/dev/null 2>&1; then
            echo "Port owner info:"
            lsof -nP -iTCP:"$port" -sTCP:LISTEN || true
        else
            ss -ltnp | grep -E "[\[\:]$port([[:space:]]|$)" || true
        fi
        exit 1
    fi
}

# Try to free a TCP port by terminating processes bound to it.
# NOTE: This only kills user-owned processes. If a root-owned process holds the port,
# manual intervention is required (sudo fuser -k <port>/tcp).
free_port() {
    local port=$1
    local name=$2
    local pids
    local attempt

    if ! is_port_in_use "$port"; then
        return 0
    fi

    echo "$name port $port is in use. Attempting to stop existing process..."

    # Try graceful termination first (SIGTERM)
    for attempt in 1 2 3; do
        pids="$(port_listener_pids "$port")"
        if [ -n "$pids" ]; then
            echo "Sending SIGTERM to PIDs: $pids"
            echo "$pids" | xargs -r kill -TERM 2>/dev/null || true
        fi
        # Also try fuser (user-level, no sudo)
        fuser -k "${port}/tcp" 2>/dev/null || true

        sleep 1
        if ! is_port_in_use "$port"; then
            echo "$name port $port is now free."
            return 0
        fi
    done

    # Force kill (SIGKILL) as last resort
    if is_port_in_use "$port"; then
        pids="$(port_listener_pids "$port")"
        if [ -n "$pids" ]; then
            echo "Sending SIGKILL to PIDs: $pids"
            echo "$pids" | xargs -r kill -KILL 2>/dev/null || true
        fi
        fuser -k -9 "${port}/tcp" 2>/dev/null || true
        sleep 1
    fi

    # Final check - if still in use, it's likely a root-owned process
    if is_port_in_use "$port"; then
        echo "ERROR: Port $port is still in use and cannot be freed."
        echo "This usually means a root-owned process is holding the port."
        echo "Run manually on server: sudo fuser -k ${port}/tcp"
        if command -v lsof >/dev/null 2>&1; then
            echo "Port owner info:"
            lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
        fi
        exit 1
    fi

    echo "$name port $port is now free."
}

# Navigate to the repository root directory (assumes script is inside scripts/ folder)
cd "$(dirname "$0")/.."

echo "Pulling latest changes from Git..."
git fetch --all
git reset --hard origin/main

echo "=== Frontend Setup ==="
cd apps/frontend
echo "Installing Node dependencies..."
npm install

# Write production env so NEXT_PUBLIC_API_URL bakes in the real domain,
# not http://localhost:8000 from .env.local (which would fail in user browsers).
echo "NEXT_PUBLIC_API_URL=https://resume.bevansatria.my.id" > .env.production.local
echo "Wrote .env.production.local with production API URL"
echo "Cleaning previous build artifacts..."
if [ -d ".next" ]; then
    rm -rf .next 2>/dev/null || true

    # If rm failed, try moving to quarantine
    if [ -d ".next" ]; then
        stale_next_dir=".next.stale.$(date +%Y%m%d%H%M%S)"
        if mv .next "$stale_next_dir" 2>/dev/null; then
            echo "Moved protected .next to $stale_next_dir"
        fi
    fi

    # If still exists, ownership is wrong - give clear manual fix instruction
    if [ -d ".next" ]; then
        echo "ERROR: Unable to clean apps/frontend/.next due to permissions."
        echo "This happens when .next was created by a different user (e.g., root)."
        echo "Fix ownership once on server:"
        echo "  sudo chown -R \$(id -u):\$(id -g) apps/frontend/.next"
        echo "  rm -rf apps/frontend/.next"
        exit 1
    fi
fi
echo "Building Next.js app..."
npm run build

# Standalone mode requires manual copy of static assets.
# Next.js may produce a flat layout (standalone/server.js) or a monorepo-
# mirrored layout (standalone/apps/frontend/server.js) depending on whether
# it detects a workspace root.  Copy assets into both so either layout works.
echo "Copying static assets to standalone directory..."
mkdir -p .next/standalone/.next
cp -r public .next/standalone/ 2>/dev/null || true
cp -r .next/static .next/standalone/.next/

mkdir -p .next/standalone/apps/frontend/.next
cp -r public .next/standalone/apps/frontend/ 2>/dev/null || true
cp -r .next/static .next/standalone/apps/frontend/.next/

cd ../..

echo "=== Backend Setup ==="
cd apps/backend
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi
echo "Installing Python dependencies..."
source venv/bin/activate
pip install -r requirements.txt
echo "Installing Playwright browsers..."
python -m playwright install chromium --with-deps
cd ../..

# Resolve the full path to node so screen daemon sessions (which run with
# a minimal PATH that may not include nvm-managed binaries) can still
# find it.
NODE_BIN="$(which node 2>/dev/null || echo "")"
if [ -z "$NODE_BIN" ]; then
    # Try common nvm location as a fallback
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    NODE_BIN="$(which node)"
fi
echo "Using node: $NODE_BIN"

echo "=== Screen Session Management ==="

# Restart or Start Frontend Screen
echo "Restarting Frontend (resume-frontend)..."
screen -S resume-frontend -X quit || true
screen -S resume-frontend-prod -X quit || true
cd apps/frontend
# Give it a moment to properly quit
sleep 2

# Check if port is free before starting
free_port $FRONTEND_PORT "Frontend"

FRONTEND_STANDALONE="$(pwd)/.next/standalone"
# Next.js standalone in a monorepo may nest server.js under the full app path.
# Detect which layout was produced by this build.
if [ -f "$FRONTEND_STANDALONE/apps/frontend/server.js" ]; then
    STANDALONE_SERVER_DIR="$FRONTEND_STANDALONE/apps/frontend"
elif [ -f "$FRONTEND_STANDALONE/server.js" ]; then
    STANDALONE_SERVER_DIR="$FRONTEND_STANDALONE"
else
    echo "ERROR: Could not locate standalone server.js under $FRONTEND_STANDALONE"
    exit 1
fi
echo "Starting frontend from: $STANDALONE_SERVER_DIR"
FRONTEND_LOG="$(pwd)/frontend-screen.log"
start_frontend_screen() {
    : > "$FRONTEND_LOG"
    screen -dmS resume-frontend bash -c "cd '$STANDALONE_SERVER_DIR' && HOSTNAME=127.0.0.1 PORT=$FRONTEND_PORT '$NODE_BIN' server.js >> '$FRONTEND_LOG' 2>&1"
}

start_frontend_screen
cd ../..

# Wait for frontend to be up and serving critical SEO endpoints
if ! wait_for_port "$FRONTEND_PORT" "Frontend" 30; then
    echo "Frontend failed to listen on first attempt. Retrying once..."
    if [ -f "apps/frontend/frontend-screen.log" ]; then
        echo "--- Frontend log (first attempt) ---"
        tail -n 120 "apps/frontend/frontend-screen.log" || true
        echo "--- End frontend log ---"
    fi

    screen -S resume-frontend -X quit || true
    cd apps/frontend
    free_port $FRONTEND_PORT "Frontend"
    start_frontend_screen
    cd ../..

    if ! wait_for_port "$FRONTEND_PORT" "Frontend" 30; then
        echo "ERROR: Frontend still failed to listen after retry."
        if [ -f "apps/frontend/frontend-screen.log" ]; then
            echo "--- Frontend log (second attempt) ---"
            tail -n 120 "apps/frontend/frontend-screen.log" || true
            echo "--- End frontend log ---"
        fi
        exit 1
    fi
fi
wait_for_http_status "http://127.0.0.1:$FRONTEND_PORT/sitemap.xml" "200" "Frontend sitemap" 30
wait_for_http_status "http://127.0.0.1:$FRONTEND_PORT/robots.txt" "200" "Frontend robots" 30

# Restart or Start Backend Screen
echo "Restarting Backend (resume-backend)..."
screen -S resume-backend -X quit || true
cd apps/backend
sleep 2

# Check if port is free before starting
free_port $BACKEND_PORT "Backend"

BACKEND_VENV_PYTHON="$(pwd)/venv/bin/python"
BACKEND_ENV_FILE="$(cd ../.. && pwd)/.env"
BACKEND_LOG="$(pwd)/backend-screen.log"
: > "$BACKEND_LOG"
# Screen daemon has a minimal PATH - 'python' is not found. Use absolute path to venv python.
# Also source .env so RESEND_API_KEY and other secrets reach the backend process.
screen -dmS resume-backend bash -c "
  cd '$(pwd)' && \
  if [ -f '$BACKEND_ENV_FILE' ]; then set -a; source '$BACKEND_ENV_FILE'; set +a; fi && \
  '$BACKEND_VENV_PYTHON' -m uvicorn app.main:app --host 127.0.0.1 --port $BACKEND_PORT \
  >> '$BACKEND_LOG' 2>&1
"
cd ../..

# Wait for backend port to be up
if ! wait_for_port "$BACKEND_PORT" "Backend" 30; then
    echo "--- Backend startup log ---"
    cat "$BACKEND_LOG" 2>/dev/null || echo "(no backend log found)"
    echo "--- End backend log ---"
    exit 1
fi

echo "Deployment completed successfully! Both apps are running in background screen sessions."