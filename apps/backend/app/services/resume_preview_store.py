"""Ephemeral storage for draft resume preview payloads."""

from __future__ import annotations

import asyncio
import copy
import time
from dataclasses import dataclass
from typing import Any
from uuid import uuid4


_PREVIEW_TTL_SECONDS = 300
_preview_lock = asyncio.Lock()


@dataclass
class ResumePreviewRecord:
    """Temporary draft payload used by the print preview route."""

    resume_data: dict[str, Any]
    settings: dict[str, Any]
    lang: str | None
    access_key: str
    created_at: float


_preview_store: dict[str, ResumePreviewRecord] = {}


def _prune_expired_locked(now: float) -> None:
    expired_ids = [
        preview_id
        for preview_id, record in _preview_store.items()
        if now - record.created_at >= _PREVIEW_TTL_SECONDS
    ]
    for preview_id in expired_ids:
        _preview_store.pop(preview_id, None)


async def create_resume_preview(
    resume_data: dict[str, Any],
    settings: dict[str, Any],
    lang: str | None,
) -> tuple[str, str]:
    """Store a draft preview payload and return its public identifiers."""

    preview_id = str(uuid4())
    access_key = str(uuid4())
    now = time.time()

    async with _preview_lock:
        _prune_expired_locked(now)
        _preview_store[preview_id] = ResumePreviewRecord(
            resume_data=copy.deepcopy(resume_data),
            settings=copy.deepcopy(settings),
            lang=lang,
            access_key=access_key,
            created_at=now,
        )

    return preview_id, access_key


async def get_resume_preview(
    preview_id: str,
    access_key: str,
) -> ResumePreviewRecord | None:
    """Return a draft preview payload when the access key matches."""

    now = time.time()
    async with _preview_lock:
        _prune_expired_locked(now)
        record = _preview_store.get(preview_id)
        if record is None or record.access_key != access_key:
            return None
        return ResumePreviewRecord(
            resume_data=copy.deepcopy(record.resume_data),
            settings=copy.deepcopy(record.settings),
            lang=record.lang,
            access_key=record.access_key,
            created_at=record.created_at,
        )


async def delete_resume_preview(preview_id: str) -> None:
    """Remove a preview payload once rendering finishes."""

    async with _preview_lock:
        _preview_store.pop(preview_id, None)
