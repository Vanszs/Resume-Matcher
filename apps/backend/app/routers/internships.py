"""Internship data proxy endpoint.

Fetches raw markdown from SimplifyJobs/Summer2026-Internships on GitHub,
caches it in memory for 24 hours, and serves it only to requests that
include the correct X-Internal-Key header (set by the Next.js server).
This ensures GitHub is only called from this backend, never from browsers.
"""

import asyncio
import logging
import time
from typing import TypedDict

import httpx
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import JSONResponse

from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/internships", tags=["internships"])

# ── In-memory cache ────────────────────────────────────────────────────────────
_CACHE_TTL = 86_400  # 24 hours in seconds

class _CacheEntry(TypedDict):
    active: str
    off_season: str
    fetched_at: float  # Unix timestamp


_cache: _CacheEntry | None = None

GITHUB_URLS = {
    "active": "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/refs/heads/dev/README.md",
    "off_season": "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/refs/heads/dev/README-Off-Season.md",
}

HEADERS = {
    "User-Agent": "resume-matcher/1.0 (+https://github.com/resume-matcher)",
}


async def _fetch_all() -> _CacheEntry:
    """Fetch both markdown files from GitHub concurrently."""
    async with httpx.AsyncClient(timeout=30.0, headers=HEADERS) as client:
        active_resp, off_season_resp = await asyncio.gather(
            client.get(GITHUB_URLS["active"]),
            client.get(GITHUB_URLS["off_season"]),
            return_exceptions=True,
        )

    def extract(resp: httpx.Response | Exception) -> str:
        if isinstance(resp, Exception):
            logger.error("GitHub fetch error: %s", resp)
            return ""
        if resp.status_code != 200:
            logger.error("GitHub returned %d", resp.status_code)
            return ""
        return resp.text

    return {
        "active": extract(active_resp),
        "off_season": extract(off_season_resp),
        "fetched_at": time.time(),
    }


# ── Dependency: validate internal key ─────────────────────────────────────────

def _require_internal_key(x_internal_key: str = Header(default="")) -> None:
    """Reject requests that don't carry the correct internal key."""
    expected = settings.internship_api_key
    if not expected:
        # Key not configured — allow all (dev mode)
        return
    if x_internal_key != expected:
        raise HTTPException(status_code=403, detail="Forbidden")


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get("")
async def get_internships(
    _: None = None,
    x_internal_key: str = Header(default=""),
) -> JSONResponse:
    """Return cached internship markdown. Protected by X-Internal-Key header."""
    _require_internal_key(x_internal_key)

    global _cache

    now = time.time()
    if _cache is None or (now - _cache["fetched_at"]) > _CACHE_TTL:
        logger.info("Internship cache miss — fetching from GitHub")
        _cache = await _fetch_all()
    else:
        age = int(now - _cache["fetched_at"])
        logger.debug("Internship cache hit (age %ds)", age)

    return JSONResponse(
        content={
            "active": _cache["active"],
            "off_season": _cache["off_season"],
            "fetched_at": _cache["fetched_at"],
        }
    )


@router.delete("/cache")
async def bust_cache(x_internal_key: str = Header(default="")) -> JSONResponse:
    """Manually bust the internship cache (admin use)."""
    _require_internal_key(x_internal_key)
    global _cache
    _cache = None
    return JSONResponse(content={"message": "Cache cleared"})
