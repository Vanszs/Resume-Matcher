#!/bin/bash
# Local development script for Resume Matcher
# Starts both backend (FastAPI) and frontend (Next.js) with live reload.
#
# Usage:
#   bash scripts/dev.sh          # Start both servers
#   bash scripts/dev.sh backend  # Start backend only
#   bash scripts/dev.sh frontend # Start frontend only
#   bash scripts/dev.sh setup    # First-time setup (install deps, create DB, seed admin)
#   bash scripts/dev.sh stop     # Stop all dev servers

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/apps/backend"
FRONTEND_DIR="$ROOT_DIR/apps/frontend"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
DB_PATH="$ROOT_DIR/prisma/dev.db"
DATABASE_URL="file:$DB_PATH"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; }

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

is_port_in_use() {
    local port=$1
    if command -v nc >/dev/null 2>&1; then
        nc -z 127.0.0.1 "$port" >/dev/null 2>&1; return $?
    fi
    if command -v lsof >/dev/null 2>&1; then
        lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; return $?
    fi
    ss -ltn 2>/dev/null | grep -qE "[\[\:]$port([[:space:]]|$)"
}

kill_port() {
    local port=$1
    local name=$2
    if ! is_port_in_use "$port"; then return 0; fi
    warn "Port $port ($name) in use — stopping..."
    if command -v fuser >/dev/null 2>&1; then
        fuser -k "$port/tcp" 2>/dev/null || true
    elif command -v lsof >/dev/null 2>&1; then
        lsof -ti -sTCP:LISTEN -iTCP:"$port" 2>/dev/null | xargs -r kill 2>/dev/null || true
    fi
    sleep 1
    if is_port_in_use "$port"; then
        err "Could not free port $port. Kill the process manually."
        exit 1
    fi
    ok "Port $port freed."
}

ensure_venv() {
    if [ ! -d "$BACKEND_DIR/.venv" ]; then
        info "Creating Python virtual environment..."
        cd "$BACKEND_DIR"
        python3 -m venv .venv
    fi
    # shellcheck disable=SC1091
    source "$BACKEND_DIR/.venv/bin/activate"
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

do_setup() {
    info "=== First-time local setup ==="

    # Backend venv + deps
    info "Setting up backend..."
    ensure_venv
    cd "$BACKEND_DIR"
    pip install -e ".[dev]" --quiet
    ok "Backend dependencies installed."

    # Playwright chromium (for PDF rendering)
    info "Installing Playwright Chromium..."
    python -m playwright install chromium 2>/dev/null || warn "Playwright install skipped (optional for PDF)."

    # Prisma
    info "Generating Prisma client..."
    cd "$ROOT_DIR"
    python -m prisma generate
    ok "Prisma client generated."

    if [ ! -f "$DB_PATH" ]; then
        info "Creating SQLite database..."
        python -m prisma db push
        ok "Database created at prisma/dev.db"
    else
        ok "Database already exists at prisma/dev.db"
    fi

    # Backend .env
    if [ ! -f "$BACKEND_DIR/.env" ]; then
        info "Creating backend .env with local defaults..."
        cat > "$BACKEND_DIR/.env" <<ENVEOF
DATABASE_URL="file:$DB_PATH"
JWT_SECRET_KEY="local-dev-secret-key-not-for-production"
JWT_EXPIRATION_MINUTES=1440
DEFAULT_ADMIN_EMAIL="admin@local.dev"
DEFAULT_ADMIN_PASSWORD="admin"
DEFAULT_ADMIN_USERNAME="admin"
HOST=0.0.0.0
PORT=8000
FRONTEND_BASE_URL=http://localhost:3000
CORS_ORIGINS=["http://localhost:3000","http://localhost:3002","http://127.0.0.1:3000"]
ENVEOF
        ok "Created apps/backend/.env"
    else
        ok "Backend .env already exists."
    fi

    # Seed admin user
    info "Seeding admin user (admin@local.dev / admin)..."
    cd "$BACKEND_DIR"
    DATABASE_URL="$DATABASE_URL" python scripts/seed_admin.py 2>&1 || true

    # Auto-verify the admin user so login works without email
    DATABASE_URL="$DATABASE_URL" python -c "
import asyncio
from prisma import Prisma
async def main():
    p = Prisma()
    await p.connect()
    user = await p.user.find_unique(where={'email': 'admin@local.dev'})
    if user and not user.isVerified:
        await p.user.update(where={'id': user.id}, data={'isVerified': True})
        print('Admin user verified.')
    elif user:
        print('Admin user already verified.')
    await p.disconnect()
asyncio.run(main())
" 2>&1

    # Frontend deps
    info "Setting up frontend..."
    cd "$FRONTEND_DIR"
    npm install --silent 2>/dev/null || npm install
    ok "Frontend dependencies installed."

    echo ""
    ok "=== Setup complete! ==="
    echo -e "  Login: ${GREEN}admin@local.dev${NC} / ${GREEN}admin${NC}"
    echo -e "  Run:   ${CYAN}bash scripts/dev.sh${NC}"
}

do_stop() {
    info "Stopping dev servers..."
    kill_port "$BACKEND_PORT" "Backend"
    kill_port "$FRONTEND_PORT" "Frontend"
    ok "All dev servers stopped."
}

start_backend() {
    kill_port "$BACKEND_PORT" "Backend"
    ensure_venv
    cd "$BACKEND_DIR"

    BACKEND_LOG="$BACKEND_DIR/backend-screen.log"
    : > "$BACKEND_LOG"
    info "Starting backend on :$BACKEND_PORT (log → $BACKEND_LOG)..."
    DATABASE_URL="$DATABASE_URL" \
        uvicorn app.main:app \
        --host 0.0.0.0 \
        --port "$BACKEND_PORT" \
        --reload \
        --log-level info >> "$BACKEND_LOG" 2>&1 &
    BACKEND_PID=$!

    # Wait for backend to be ready
    for i in $(seq 1 20); do
        if is_port_in_use "$BACKEND_PORT"; then
            ok "Backend ready at http://localhost:$BACKEND_PORT"
            return 0
        fi
        sleep 1
    done
    err "Backend failed to start. Check logs above."
    exit 1
}

start_frontend() {
    kill_port "$FRONTEND_PORT" "Frontend"
    cd "$FRONTEND_DIR"

    # Leave NEXT_PUBLIC_API_URL empty so the browser uses relative /api/v1/...
    # requests that Next.js proxies server-side to the backend.
    # This is required for WSL2 where "localhost" in the Windows browser
    # points to Windows, not the WSL instance.
    echo "NEXT_PUBLIC_API_URL=" > .env.local

    info "Building frontend (next build)..."
    npm run build

    info "Starting frontend on :$FRONTEND_PORT (next start)..."
    npx next start --hostname 0.0.0.0 --port "$FRONTEND_PORT" &
    FRONTEND_PID=$!

    for i in $(seq 1 30); do
        if is_port_in_use "$FRONTEND_PORT"; then
            ok "Frontend ready at http://localhost:$FRONTEND_PORT"
            return 0
        fi
        sleep 1
    done
    err "Frontend failed to start. Check logs above."
    exit 1
}

do_both() {
    start_backend
    echo ""
    start_frontend
    echo ""
    ok "=== Both servers running ==="
    echo -e "  Backend:  ${CYAN}http://localhost:$BACKEND_PORT${NC}"
    echo -e "  Frontend: ${CYAN}http://localhost:$FRONTEND_PORT${NC}"
    echo -e "  API docs: ${CYAN}http://localhost:$BACKEND_PORT/docs${NC}"
    echo -e "  Login:    ${GREEN}admin@local.dev${NC} / ${GREEN}admin${NC}"
    echo ""
    info "Press Ctrl+C to stop both servers."

    # Trap Ctrl+C to kill both
    trap 'echo ""; info "Shutting down..."; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; wait 2>/dev/null; ok "Stopped."; exit 0' INT TERM
    wait
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

cd "$ROOT_DIR"

case "${1:-both}" in
    setup)    do_setup ;;
    backend)  start_backend; trap 'kill $BACKEND_PID 2>/dev/null; wait 2>/dev/null' INT TERM; wait ;;
    frontend) start_frontend; trap 'kill $FRONTEND_PID 2>/dev/null; wait 2>/dev/null' INT TERM; wait ;;
    stop)     do_stop ;;
    both|"")  do_both ;;
    *)
        echo "Usage: bash scripts/dev.sh [setup|backend|frontend|stop]"
        exit 1
        ;;
esac
