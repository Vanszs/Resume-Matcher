"""API routers."""

from app.routers.admin import router as admin_router
from app.routers.auth import router as auth_router
from app.routers.config import router as config_router
from app.routers.enrichment import router as enrichment_router
from app.routers.health import router as health_router
from app.routers.internships import router as internships_router
from app.routers.jobs import router as jobs_router
from app.routers.resumes import router as resumes_router
from app.routers.user_config import router as user_config_router

__all__ = [
    "admin_router",
    "auth_router",
    "config_router",
    "enrichment_router",
    "health_router",
    "internships_router",
    "jobs_router",
    "resumes_router",
    "user_config_router",
]
