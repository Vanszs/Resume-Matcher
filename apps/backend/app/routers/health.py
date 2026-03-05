"""Health check and status endpoints."""

import json
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings
from app.database import db
from app.llm import check_llm_health, get_llm_config, LLMConfig
from app.schemas import HealthResponse, StatusResponse

router = APIRouter(tags=["Health"])

_optional_bearer = HTTPBearer(auto_error=False)


def _get_user_llm_config(user_id: str) -> LLMConfig:
    """Load per-user LLM config, fallback to global config file then env vars."""
    user_config_path = settings.config_path.parent / "user_configs" / f"{user_id}.json"
    if user_config_path.exists():
        try:
            stored = json.loads(user_config_path.read_text())
        except (json.JSONDecodeError, OSError):
            stored = {}
    else:
        # Fall back to global config as baseline
        global_path = settings.config_path
        if global_path.exists():
            try:
                stored = json.loads(global_path.read_text())
            except (json.JSONDecodeError, OSError):
                stored = {}
        else:
            stored = {}

    return LLMConfig(
        provider=stored.get("provider", settings.llm_provider),
        model=stored.get("model", settings.llm_model),
        api_key=stored.get("api_key", settings.llm_api_key),
        api_base=stored.get("api_base", settings.llm_api_base),
    )


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Basic health check endpoint."""
    llm_status = await check_llm_health()

    return HealthResponse(
        status="healthy" if llm_status["healthy"] else "degraded",
        llm=llm_status,
    )


@router.get("/status", response_model=StatusResponse)
async def get_status(
    include_llm_health: bool = Query(
        False,
        description=(
            "When False (default), skip the actual LLM API call and derive health from "
            "configuration only. Use True for a full live health check."
        ),
    ),
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_optional_bearer)] = None,
) -> StatusResponse:
    """Get comprehensive application status.

    When a valid JWT is included, returns LLM status scoped to that user's
    configuration.  Without a token it falls back to the global config so
    the endpoint remains usable for unauthenticated health probes.

    By default the LLM health check is skipped (fast path).  Pass
    ``include_llm_health=true`` to perform a live connectivity test.
    """
    import jwt as pyjwt
    from app.config import settings as app_settings

    config = get_llm_config()  # global default
    user_id: str | None = None

    if credentials:
        try:
            payload = pyjwt.decode(
                credentials.credentials,
                app_settings.jwt_secret_key,
                algorithms=[app_settings.jwt_algorithm],
            )
            user_id = payload.get("sub")
            if user_id:
                config = _get_user_llm_config(user_id)
        except Exception:
            pass  # Invalid/expired token → fall back to global config

    is_configured = bool(config.api_key) or config.provider == "ollama"
    scoped_user_id = user_id if credentials else None
    db_stats = db.get_stats(user_id=scoped_user_id)
    resumes = db.list_resumes(user_id=scoped_user_id)
    db_stats["total_resumes"] = sum(
        1 for resume in resumes if not resume.get("is_master", False)
    )

    if include_llm_health:
        # Full path: live LLM connectivity test (may take several seconds)
        llm_status = await check_llm_health(config)
        llm_healthy = llm_status["healthy"]
        llm_error_code = llm_status.get("error_code") if not llm_healthy else None
    else:
        # Fast path: assume healthy when configured, skip the API round-trip
        llm_healthy = is_configured
        llm_error_code = None

    return StatusResponse(
        status="ready" if llm_healthy and db_stats["has_master_resume"] else "setup_required",
        llm_configured=is_configured,
        llm_healthy=llm_healthy,
        llm_error_code=llm_error_code,
        has_master_resume=db_stats["has_master_resume"],
        database_stats=db_stats,
    )
