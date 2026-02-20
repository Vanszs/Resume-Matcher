#!/bin/bash
# Deployment script for Resume Matcher on resume.bevansatria.my.id
# This script manages pulling code, installing dependencies, building Next.js, and handling screen sessions.

set -e

# Define default ports or use environment variables
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
BACKEND_PORT="${BACKEND_PORT:-8000}"

# Function to check if a port is free
check_port() {
    local port=$1
    local name=$2
    if ss -tuln | grep -q ":$port "; then
        echo "Error: Port $port is already in use for $name."
        echo "Please free up the port or set FRONTEND_PORT/BACKEND_PORT appropriately."
        exit 1
    fi
}

# Try to free a TCP port by terminating processes bound to it.
free_port() {
    local port=$1
    local name=$2

    if ! ss -tuln | grep -q ":$port "; then
        return 0
    fi

    echo "$name port $port is in use. Attempting to stop existing process..."

    if command -v fuser >/dev/null 2>&1; then
        fuser -k "${port}/tcp" >/dev/null 2>&1 || true
    elif command -v lsof >/dev/null 2>&1; then
        lsof -ti tcp:"$port" | xargs -r kill -TERM >/dev/null 2>&1 || true
    else
        # Fallback: parse PID from ss output
        local pids
        pids=$(ss -ltnp 2>/dev/null | grep ":$port " | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u)
        if [ -n "$pids" ]; then
            echo "$pids" | xargs -r kill -TERM >/dev/null 2>&1 || true
        fi
    fi

    sleep 2

    # Escalate only if still occupied
    if ss -tuln | grep -q ":$port "; then
        if command -v fuser >/dev/null 2>&1; then
            fuser -k -9 "${port}/tcp" >/dev/null 2>&1 || true
        elif command -v lsof >/dev/null 2>&1; then
            lsof -ti tcp:"$port" | xargs -r kill -KILL >/dev/null 2>&1 || true
        else
            local pids
            pids=$(ss -ltnp 2>/dev/null | grep ":$port " | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u)
            if [ -n "$pids" ]; then
                echo "$pids" | xargs -r kill -KILL >/dev/null 2>&1 || true
            fi
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
screen -dmS resume-frontend bash -c "cd '$STANDALONE_SERVER_DIR' && PORT=$FRONTEND_PORT '$NODE_BIN' server.js"
cd ../..

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

echo "Deployment completed successfully! Both apps are running in background screen sessions."
