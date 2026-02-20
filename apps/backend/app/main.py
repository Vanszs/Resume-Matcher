"""FastAPI application entry point."""

import asyncio
import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

# Fix for Windows: Use ProactorEventLoop for subprocess support (Playwright)
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

logger = logging.getLogger(__name__)

from app import __version__
from app.config import settings
from app.database import db
from app.prisma_db import prisma
from app.pdf import close_pdf_renderer, init_pdf_renderer
from app.routers import (
    admin_router,
    auth_router,
    config_router,
    enrichment_router,
    health_router,
    jobs_router,
    resumes_router,
    user_config_router,
)

# Rate limiter (in-memory, keyed by client IP)
limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    await prisma.connect()
    # Ensure default roles exist (admin + user) for the Add User form and registration
    try:
        for role_name, permissions in [("admin", '["*"]'), ("user", "[]")]:
            existing = await prisma.role.find_unique(where={"name": role_name})
            if not existing:
                await prisma.role.create(data={"name": role_name, "permissions": permissions})
                logger.info("Created default role: %s", role_name)
    except Exception as e:
        logger.warning("Failed to seed default roles: %s", e)
    # PDF renderer uses lazy initialization - will initialize on first use
    # await init_pdf_renderer()
    yield
    # Shutdown - wrap each cleanup in try-except to ensure all resources are released
    try:
        await close_pdf_renderer()
    except Exception as e:
        logger.error(f"Error closing PDF renderer: {e}")

    try:
        db.close()
    except Exception as e:
        logger.error(f"Error closing TinyDB: {e}")

    try:
        await prisma.disconnect()
    except Exception as e:
        logger.error(f"Error closing Prisma: {e}")


app = FastAPI(
    title="Resume Matcher API",
    description="AI-powered resume tailoring for job descriptions",
    version=__version__,
    lifespan=lifespan,
)

# Attach rate limiter state and 429 handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS middleware - origins configurable via CORS_ORIGINS env var
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(user_config_router, prefix="/api/v1")
app.include_router(health_router, prefix="/api/v1")
app.include_router(config_router, prefix="/api/v1")
app.include_router(resumes_router, prefix="/api/v1")
app.include_router(jobs_router, prefix="/api/v1")
app.include_router(enrichment_router, prefix="/api/v1")


@app.get("/")
async def root() -> dict:
    """Root endpoint."""
    return {
        "name": "Resume Matcher API",
        "version": __version__,
        "docs": "/docs",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
    )
