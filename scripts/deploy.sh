#!/bin/bash
# Deployment script for Resume Matcher on resume.bevansatria.my.id
# This script manages pulling code, installing dependencies, building Next.js, and handling screen sessions.

set -e

# Define default ports or use environment variables
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
BACKEND_PORT="${BACKEND_PORT:-8000}"

# Return success when there is a LISTEN socket on the given TCP port.
is_port_in_use() {
    local port=$1

    if command -v lsof >/dev/null 2>&1; then
        lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
        return $?
    fi

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
free_port() {
    local port=$1
    local name=$2
    local pids
    local attempt

    if ! is_port_in_use "$port"; then
        return 0
    fi

    echo "$name port $port is in use. Attempting to stop existing process..."

    for attempt in 1 2 3; do
        pids="$(port_listener_pids "$port")"
        if [ -n "$pids" ]; then
            echo "$pids" | xargs -r kill -TERM >/dev/null 2>&1 || true
        fi
        # Always try sudo fuser as fallback to handle root-owned processes
        if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
            sudo -n fuser -k "${port}/tcp" >/dev/null 2>&1 || true
        fi

        sleep 1
        if ! is_port_in_use "$port"; then
            break
        fi
    done

    if is_port_in_use "$port"; then
        pids="$(port_listener_pids "$port")"
        if [ -n "$pids" ]; then
            echo "$pids" | xargs -r kill -KILL >/dev/null 2>&1 || true
        fi

        if is_port_in_use "$port" && command -v sudo >/dev/null 2>&1; then
            sudo -n fuser -k -9 "${port}/tcp" >/dev/null 2>&1 || true
        fi

        sleep 1
    fi

    check_port "$port" "$name"
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
echo "Cleaning previous build artifacts..."
if [ -d ".next" ]; then
    rm -rf .next 2>/dev/null || true

    if [ -d ".next" ]; then
        stale_next_dir=".next.stale.$(date +%Y%m%d%H%M%S)"
        if mv .next "$stale_next_dir" 2>/dev/null; then
            echo "Moved protected .next to $stale_next_dir"
        fi
    fi

    if [ -d ".next" ] && command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
        echo "Detected protected .next files; removing with sudo..."
        sudo -n rm -rf .next || true
    fi

    if [ -d ".next" ]; then
        echo "ERROR: Unable to clean apps/frontend/.next due to permissions."
        echo "Fix ownership once on server: sudo chown -R \"$(id -u):$(id -g)\" apps/frontend/.next"
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

source venv/bin/activate
screen -dmS resume-backend python -m uvicorn app.main:app --host 127.0.0.1 --port $BACKEND_PORT
cd ../..

# Wait for backend port to be up
wait_for_port "$BACKEND_PORT" "Backend" 30

echo "Deployment completed successfully! Both apps are running in background screen sessions."
