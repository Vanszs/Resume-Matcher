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

echo "=== Screen Session Management ==="

# Restart or Start Frontend Screen
echo "Restarting Frontend (resume-frontend)..."
screen -S resume-frontend -X quit || true
cd apps/frontend
# Give it a moment to properly quit
sleep 2

# Check if port is free before starting
check_port $FRONTEND_PORT "Frontend"

screen -dmS resume-frontend PORT=$FRONTEND_PORT npm start
cd ../..

# Restart or Start Backend Screen
echo "Restarting Backend (resume-backend)..."
screen -S resume-backend -X quit || true
cd apps/backend
sleep 2

# Check if port is free before starting
check_port $BACKEND_PORT "Backend"

source venv/bin/activate
screen -dmS resume-backend python -m uvicorn app.main:app --host 127.0.0.1 --port $BACKEND_PORT
cd ../..

echo "Deployment completed successfully! Both apps are running in background screen sessions."
