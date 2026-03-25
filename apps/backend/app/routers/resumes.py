"""Resume management endpoints."""

import asyncio
import copy
import hashlib
import json
import logging
import time
import unicodedata
from collections.abc import AsyncGenerator, Awaitable
from pathlib import Path
from typing import Any, NoReturn
from urllib.parse import urlencode
from uuid import uuid4

import jwt as pyjwt
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response, StreamingResponse

from app.database import db
from app.dependencies import get_current_user
from app.exceptions import DebugHTTPException
from app.pdf import render_resume_pdf, PDFRenderError
from app.config import settings

logger = logging.getLogger(__name__)
from app.schemas import (
    GenerateContentResponse,
    ImproveResumeConfirmRequest,
    ImproveResumeRequest,
    ImproveResumeResponse,
    ImproveResumeData,
    RefinementStats,
    RemovedEntry,
    ResumeDiffSummary,
    ResumeFieldDiff,
    ResumeData,
    ResumeFetchData,
    ResumeFetchResponse,
    ResumeListResponse,
    ResumePreviewDocument,
    ResumePreviewDocumentResponse,
    ResumeRenderPdfRequest,
    ResumeSummary,
    ResumeTemplateSettings,
    ResumeUploadResponse,
    RawResume,
    TailorTaskStartResponse,
    TailorTaskStatusResponse,
    UpdateCoverLetterRequest,
    UpdateOutreachMessageRequest,
    UpdateTitleRequest,
    normalize_resume_data,
)
import litellm
from app.services.parser import parse_document, parse_resume_to_json
from app.services.improver import (
    extract_job_keywords,
    generate_improvements,
    hash_job_content,
    improve_resume,
)
from app.services.refiner import refine_resume, calculate_keyword_match
from app.schemas.refinement import RefinementConfig
from app.services.cover_letter import (
    generate_cover_letter,
    generate_outreach_message,
    generate_resume_title,
)
from app.services.resume_preview_store import (
    create_resume_preview,
    delete_resume_preview,
    get_resume_preview,
)
from app.prompts import DEFAULT_IMPROVE_PROMPT_ID, IMPROVE_PROMPT_OPTIONS


def _load_config() -> dict:
    """Load configuration from config file."""
    config_path = settings.config_path
    if not config_path.exists():
        return {}
    try:
        return json.loads(config_path.read_text())
    except (json.JSONDecodeError, OSError) as e:
        logger.error("Failed to load config: %s", e)
        return {}


def _load_feature_config() -> dict:
    """Load feature configuration from config file."""
    return _load_config()


def _get_content_language() -> str:
    """Get configured content language from config file."""
    config = _load_config()
    # Use content_language, fall back to legacy 'language' field, then default to 'en'
    return config.get("content_language", config.get("language", "en"))


def _get_default_prompt_id() -> str:
    """Get configured default prompt id from config file."""
    config = _load_config()
    option_ids = {option["id"] for option in IMPROVE_PROMPT_OPTIONS}
    prompt_id = config.get("default_prompt_id", DEFAULT_IMPROVE_PROMPT_ID)
    return prompt_id if prompt_id in option_ids else DEFAULT_IMPROVE_PROMPT_ID


def _normalize_payload(value: Any) -> Any:
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    if isinstance(value, list):
        return [_normalize_payload(item) for item in value]
    if isinstance(value, dict):
        normalized: dict[Any, Any] = {}
        for key, val in value.items():
            normalized_key = (
                unicodedata.normalize("NFC", key) if isinstance(key, str) else key
            )
            normalized[normalized_key] = _normalize_payload(val)
        return normalized
    return value


def _hash_improved_data(data: dict[str, Any]) -> str:
    """Hash canonicalized improved data for preview/confirm validation."""
    normalized = _normalize_payload(data)
    serialized = json.dumps(
        normalized,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,  # Preserve original behavior for hash stability
        default=str,  # Handle non-serializable types gracefully
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _normalize_personal_info_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value).strip()
    if isinstance(value, (int, float, bool)):
        return str(value)
    normalized = _normalize_payload(value)
    return json.dumps(
        normalized, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )


def _raise_improve_error(
    action: str,
    stage: str,
    error: Exception,
    detail: str,
) -> NoReturn:
    # Re-raise HTTPException as-is — do NOT swallow intentional HTTP errors
    # (e.g. ALL_ENTRIES_REMOVED 422, auth failures already converted to HTTPException)
    if isinstance(error, HTTPException):
        raise error

    logger.error("Resume %s failed during %s: %s", action, stage, error)

    # Detect LiteLLM-specific error types for better UX
    try:
        if isinstance(error, litellm.exceptions.RateLimitError):
            raise HTTPException(
                status_code=429,
                detail="AI API rate limit reached. Please wait a moment and try again.",
            )
        if isinstance(error, litellm.exceptions.AuthenticationError):
            raise HTTPException(
                status_code=401,
                detail="AI API authentication failed. Please check your API key in Settings.",
            )
        if isinstance(error, (litellm.exceptions.ServiceUnavailableError, litellm.exceptions.Timeout)):
            raise HTTPException(
                status_code=503,
                detail="AI service is temporarily unavailable. Please try again.",
            )
        if isinstance(error, litellm.exceptions.BadRequestError):
            raise HTTPException(
                status_code=400,
                detail="Invalid request to AI provider. Please check your model configuration in Settings.",
            )
    except HTTPException:
        raise
    except Exception:
        pass  # AttributeError if litellm.exceptions not fully available; fall through

    # Fallback: inspect error message string for common patterns
    error_str = str(error).lower()
    if "rate limit" in error_str or "429" in str(error):
        raise HTTPException(
            status_code=429,
            detail="AI API rate limit reached. Please wait a moment and try again.",
        )
    if "auth" in error_str or "api key" in error_str or "401" in str(error) or "unauthorized" in error_str:
        raise HTTPException(
            status_code=401,
            detail="AI API authentication failed. Please check your API key in Settings.",
        )
    if "timeout" in error_str or "timed out" in error_str or "503" in str(error):
        raise HTTPException(
            status_code=503,
            detail="AI service is temporarily unavailable. Please try again.",
        )

    raise DebugHTTPException(status_code=500, detail=detail, error=error)


def _get_original_resume_data(resume: dict[str, Any]) -> dict[str, Any] | None:
    original_data = resume.get("processed_data")
    if not original_data and resume.get("content_type") == "json":
        try:
            original_data = json.loads(resume["content"])
        except json.JSONDecodeError as e:
            logger.warning("Skipping resume diff due to JSON parse failure: %s", e)
    return original_data


def _get_generation_source_resume(
    resume_id: str,
    user_id: str,
) -> dict[str, Any]:
    """Resolve and validate explicit generation source resume.

    Source must be an active (non-deleted) master resume owned by the caller.
    """
    resume = db.get_active_resume(resume_id, user_id=user_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    if not resume.get("is_master", False):
        raise HTTPException(
            status_code=400,
            detail="Selected resume must be a master resume.",
        )
    return resume


def _preserve_personal_info(
    original_data: dict[str, Any] | None,
    improved_data: dict[str, Any],
) -> tuple[dict[str, Any], list[str]]:
    """Preserve personal info from original, return warnings if unable.

    Uses deep copy to prevent mutation of original data.
    """
    warnings: list[str] = []

    if not original_data:
        warnings.append(
            "Original resume data unavailable - personal info may be AI-generated"
        )
        return improved_data, warnings

    original_info = original_data.get("personalInfo")
    if not isinstance(original_info, dict):
        warnings.append("Original personal info missing or invalid")
        return improved_data, warnings

    # SVC-001: Use deep copy to prevent any mutation of original data
    result = copy.deepcopy(improved_data)
    result["personalInfo"] = copy.deepcopy(original_info)
    return result, warnings


def _calculate_diff_from_resume(
    resume: dict[str, Any],
    improved_data: dict[str, Any],
    removed_entries: list[dict[str, Any]] | None = None,
) -> tuple[ResumeDiffSummary | None, list[ResumeFieldDiff] | None, str | None]:
    """Calculate resume diffs when structured data is available.

    Returns (summary, changes, error_reason). Error reason is None on success,
    or a string describing why diff calculation failed.
    """
    original_data = _get_original_resume_data(resume)
    if not original_data:
        return None, None, "original_data_missing"
    from app.services.improver import calculate_resume_diff

    try:
        summary, changes = calculate_resume_diff(original_data, improved_data, removed_entries)
        return summary, changes, None
    except Exception as e:
        logger.warning("Skipping resume diff due to calculation failure: %s", e)
        return None, None, f"calculation_error: {str(e)}"


def _validate_confirm_payload(
    original_data: dict[str, Any] | None,
    improved_data: dict[str, Any],
) -> None:
    if not original_data:
        logger.warning(
            "Skipping confirm payload validation; structured resume data unavailable."
        )
        return
    original_info = original_data.get("personalInfo")
    improved_info = improved_data.get("personalInfo")
    # JSON-008: Explicit null checks with clear error messages
    if original_info is None:
        raise ValueError("Original resume missing personalInfo")
    if improved_info is None:
        raise ValueError("Improved resume missing personalInfo")
    if not isinstance(original_info, dict):
        raise ValueError(
            f"Original personalInfo is not a dict: {type(original_info).__name__}"
        )
    if not isinstance(improved_info, dict):
        raise ValueError(
            f"Improved personalInfo is not a dict: {type(improved_info).__name__}"
        )
    fields = set(original_info.keys()) | set(improved_info.keys())
    mismatches = [
        field
        for field in sorted(fields)
        if _normalize_personal_info_value(original_info.get(field))
        != _normalize_personal_info_value(improved_info.get(field))
    ]
    if mismatches:
        raise ValueError(f"personalInfo fields changed: {', '.join(mismatches)}")


async def _generate_auxiliary_messages(
    improved_data: dict[str, Any],
    job_content: str,
    language: str,
    enable_cover_letter: bool,
    enable_outreach: bool,
    user_id: str,
) -> tuple[str | None, str | None, str | None, list[str]]:
    """Generate cover letter, outreach message, and resume title.

    Returns (cover_letter, outreach_message, title, warnings).
    """
    cover_letter = None
    outreach_message = None
    title = None
    warnings: list[str] = []
    generation_tasks: list[Awaitable[str]] = []
    task_labels: list[str] = []

    # Title generation is always on (no feature flag)
    generation_tasks.append(generate_resume_title(job_content, language, user_id=user_id))
    task_labels.append("title")

    if enable_cover_letter:
        generation_tasks.append(
            generate_cover_letter(
                improved_data,
                job_content,
                language,
                user_id=user_id,
            )
        )
        task_labels.append("cover_letter")
    if enable_outreach:
        generation_tasks.append(
            generate_outreach_message(
                improved_data,
                job_content,
                language,
                user_id=user_id,
            )
        )
        task_labels.append("outreach")

    results = await asyncio.gather(*generation_tasks, return_exceptions=True)
    for label, result in zip(task_labels, results):
        if isinstance(result, Exception):
            logger.warning(
                "%s generation failed: %s",
                label,
                result,
                exc_info=result,
            )
            if label != "title":
                warnings.append(f"{label.replace('_', ' ').title()} generation failed")
        else:
            if label == "title":
                title = result
            elif label == "cover_letter":
                cover_letter = result
            elif label == "outreach":
                outreach_message = result

    return cover_letter, outreach_message, title, warnings


router = APIRouter(prefix="/resumes", tags=["Resumes"], dependencies=[Depends(get_current_user)])
preview_router = APIRouter(prefix="/resume-preview", tags=["Resume Preview"])


def _build_resume_print_params(
    *,
    template: str,
    page_size: str,
    margins: dict[str, int],
    spacing: dict[str, int],
    font_size: dict[str, Any],
    compact_mode: bool,
    show_contact_icons: bool,
    accent_color: str,
    lang: str | None,
) -> str:
    params: dict[str, str] = {
        "template": template,
        "pageSize": page_size,
        "marginTop": str(margins["top"]),
        "marginBottom": str(margins["bottom"]),
        "marginLeft": str(margins["left"]),
        "marginRight": str(margins["right"]),
        "sectionSpacing": str(spacing["section"]),
        "itemSpacing": str(spacing["item"]),
        "lineHeight": str(spacing["lineHeight"]),
        "fontSize": str(font_size["base"]),
        "headerScale": str(font_size["headerScale"]),
        "headerFont": str(font_size["headerFont"]),
        "bodyFont": str(font_size["bodyFont"]),
        "compactMode": str(compact_mode).lower(),
        "showContactIcons": str(show_contact_icons).lower(),
        "accentColor": accent_color,
    }
    if lang:
        params["lang"] = lang
    return urlencode(params)


def _build_pdf_margin_dict(margins: dict[str, int]) -> dict[str, int]:
    return {
        "top": margins["top"],
        "right": margins["right"],
        "bottom": margins["bottom"],
        "left": margins["left"],
    }


async def _process_resume_background(resume_id: str, markdown_content: str, user_id: str) -> None:
    """Background task: run LLM parse and update DB record."""
    try:
        processed_data = await parse_resume_to_json(markdown_content, user_id=user_id)

        # Treat empty or null LLM output as a failure — don't mark "ready"
        # with no data that would render a blank resume on the frontend.
        has_content = bool(
            processed_data
            and (
                (processed_data.get("personalInfo") or {}).get("name")
                or processed_data.get("workExperience")
                or processed_data.get("education")
                or processed_data.get("sectionMeta")
            )
        )
        if not has_content:
            logger.warning(f"Background processing returned empty data for resume {resume_id}")
            db.update_resume(
                resume_id,
                {
                    "processing_status": "failed",
                    "error_message": "AI returned empty data — no recognizable resume content found.",
                },
                user_id=user_id,
            )
            return

        derived_title = (
            (processed_data or {}).get("personalInfo", {}).get("title")
        ) or None
        resume = db.get_active_resume(resume_id, user_id=user_id)
        title_update = {"title": derived_title} if derived_title and resume and not resume.get("title") else {}
        db.update_resume(
            resume_id,
            {
                "processed_data": processed_data,
                "processing_status": "ready",
                "error_message": None,
                **title_update,
            },
            user_id=user_id,
        )
        logger.info(f"Background processing completed for resume {resume_id}")
    except Exception as e:
        error_detail = str(e)
        logger.warning(f"Background processing failed for resume {resume_id}: {error_detail}")
        db.update_resume(
            resume_id,
            {
                "processing_status": "failed",
                "error_message": error_detail,
            },
            user_id=user_id,
        )


ALLOWED_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_FILE_SIZE = 4 * 1024 * 1024  # 4MB


@router.post("/upload", response_model=ResumeUploadResponse)
async def upload_resume(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    as_master: bool = Query(False),
    user=Depends(get_current_user),
) -> ResumeUploadResponse:
    """Upload and process a resume file (PDF/DOCX).

    Converts the file to Markdown and stores it in the database.
    Optionally parses to structured JSON if LLM is configured.
    """
    # Validate file type
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {file.content_type}. Allowed: PDF, DOC, DOCX",
        )

    # Read and validate size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE // (1024 * 1024)}MB",
        )

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    # Convert to markdown
    try:
        markdown_content = await parse_document(content, file.filename or "resume.pdf")
    except Exception as e:
        logger.error(f"Document parsing failed: {e}")
        raise HTTPException(
            status_code=422,
            detail="Failed to parse document. Please ensure it's a valid PDF or DOCX file.",
        )

    # Store in database first with "processing" status.
    # Legacy bootstrap keeps first-upload atomic master assignment;
    # explicit as_master enables additional master resumes.
    if as_master:
        resume = db.create_resume(
            content=markdown_content,
            content_type="md",
            filename=file.filename,
            is_master=True,
            processed_data=None,
            processing_status="processing",
            user_id=user.id,
        )
    else:
        resume = await db.create_resume_atomic_master(
            content=markdown_content,
            content_type="md",
            filename=file.filename,
            processed_data=None,
            processing_status="processing",
            user_id=user.id,
        )

    # Kick off LLM parsing in the background so the HTTP response returns
    # immediately and is not killed by Cloudflare's edge timeout (524).
    background_tasks.add_task(
        _process_resume_background,
        resume["resume_id"],
        markdown_content,
        user.id,
    )

    return ResumeUploadResponse(
        message=f"File {file.filename} uploaded — AI parsing in progress",
        request_id=str(uuid4()),
        resume_id=resume["resume_id"],
        processing_status="processing",
        is_master=resume.get("is_master", False),
    )


# ---------------------------------------------------------------------------
# SSE: real-time processing status stream
# ---------------------------------------------------------------------------

TERMINAL_STATES = frozenset({"ready", "failed"})
_SSE_POLL_INTERVAL = 1.5  # seconds between DB checks
_SSE_HEARTBEAT = 15.0    # seconds between keep-alive comments
_SSE_MAX_DURATION = 600  # give up after 10 minutes
_SSE_MAX_IDS = 20        # cap to prevent DB abuse


@router.get("/status-stream")
async def resume_status_stream(
    request: Request,
    ids: str = Query(..., description="Comma-separated resume IDs to watch"),
) -> StreamingResponse:
    """Server-Sent Events endpoint that pushes processing-status updates.

    Auth uses the ``auth_token`` cookie.

    Events emitted:
    - ``data: JSON``      — periodic status snapshot for every watched ID.
    - ``event: done``     — all IDs have reached a terminal state; stream closes.
    - ``: heartbeat``     — SSE comment to keep the connection alive through proxies.
    """
    # --- Auth: validate JWT from cookie ---
    from app.config import settings as app_settings  # avoid circular at module level
    from app.prisma_db import prisma

    auth_token = request.cookies.get("auth_token")
    if not auth_token:
        raise HTTPException(status_code=401, detail="Missing authentication token")

    try:
        payload = pyjwt.decode(
            auth_token,
            app_settings.jwt_secret_key,
            algorithms=[app_settings.jwt_algorithm],
        )
        user_id: str | None = payload.get("sub")
        if not user_id:
            raise ValueError("missing sub")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = await prisma.user.find_unique(where={"id": user_id})
    if not user or not user.isActive:
        raise HTTPException(status_code=401, detail="Unauthorized")

    resume_ids = [rid.strip() for rid in ids.split(",") if rid.strip()]
    if not resume_ids:
        raise HTTPException(status_code=400, detail="No resume IDs provided")
    if len(resume_ids) > _SSE_MAX_IDS:
        raise HTTPException(
            status_code=400,
            detail=f"Too many resume IDs (max {_SSE_MAX_IDS})",
        )

    async def event_generator() -> AsyncGenerator[str, None]:
        elapsed = 0.0
        since_heartbeat = 0.0
        pending_ids = set(resume_ids)

        while pending_ids and elapsed < _SSE_MAX_DURATION:
            statuses: dict[str, str | dict] = {}
            for rid in list(pending_ids):
                resume = db.get_resume(rid, user_id=user_id)
                if resume:
                    s = resume.get("processing_status", "pending")
                    err = resume.get("error_message")
                    if s == "failed" and err:
                        statuses[rid] = {"status": s, "error_message": err}
                    else:
                        statuses[rid] = s
                    if s in TERMINAL_STATES:
                        pending_ids.discard(rid)

            payload_str = json.dumps(statuses)
            yield f"data: {payload_str}\n\n"

            if not pending_ids:
                yield "event: done\ndata: {}\n\n"
                return

            await asyncio.sleep(_SSE_POLL_INTERVAL)
            elapsed += _SSE_POLL_INTERVAL
            since_heartbeat += _SSE_POLL_INTERVAL
            if since_heartbeat >= _SSE_HEARTBEAT:
                yield ": heartbeat\n\n"
                since_heartbeat = 0.0

        # Timed out — send a final snapshot and close
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable nginx buffering
        },
    )


@router.get("", response_model=ResumeFetchResponse)
async def get_resume(
    resume_id: str = Query(...),
    user=Depends(get_current_user),
) -> ResumeFetchResponse:
    """Fetch resume details by ID.

    Returns both raw markdown and structured data (if available),
    plus cover letter and outreach message if they exist.
    Applies lazy migration for section metadata if needed.
    """
    resume = db.get_active_resume(resume_id, user_id=user.id)

    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Get processing status (default to "pending" for old records)
    processing_status = resume.get("processing_status", "pending")

    # Build response
    raw_resume = RawResume(
        id=None,  # TinyDB doesn't have numeric IDs like SQL
        content=resume["content"],
        content_type=resume["content_type"],
        created_at=resume["created_at"],
        processing_status=processing_status,
        error_message=resume.get("error_message"),
    )

    # Get processed data if available (no more on-demand parsing)
    processed_data = resume.get("processed_data")

    # Apply lazy migration - add section metadata to old resumes
    if processed_data:
        processed_data = normalize_resume_data(processed_data)

    processed_resume = (
        ResumeData.model_validate(processed_data) if processed_data else None
    )

    # Derive title from personalInfo.title as fallback for records uploaded
    # before title persistence was introduced (old master resumes in DB).
    raw_title = resume.get("title") or (
        (processed_data or {})
        .get("personalInfo", {})
        .get("title")
    ) or None

    # Lazy-persist: if title was just derived (not already in DB), write it now
    # so subsequent calls read it directly without re-deriving. No AI call — pure DB write.
    if raw_title and not resume.get("title"):
        try:
            db.update_resume(resume_id, {"title": raw_title}, user_id=user.id)
        except Exception:
            pass  # Non-critical — next request will re-derive and retry

    return ResumeFetchResponse(
        request_id=str(uuid4()),
        data=ResumeFetchData(
            resume_id=resume_id,
            raw_resume=raw_resume,
            processed_resume=processed_resume,
            cover_letter=resume.get("cover_letter"),
            outreach_message=resume.get("outreach_message"),
            parent_id=resume.get("parent_id"),
            title=raw_title,
        ),
    )


@router.get("/list", response_model=ResumeListResponse)
async def list_resumes(
    include_master: bool = Query(False),
    user=Depends(get_current_user),
) -> ResumeListResponse:
    """List resumes, optionally including the master resume."""
    resumes = db.list_resumes(user_id=user.id)
    if not include_master:
        resumes = [resume for resume in resumes if not resume.get("is_master", False)]

    resumes.sort(key=lambda item: item.get("updated_at", ""), reverse=True)

    summaries = [
        ResumeSummary(
            resume_id=resume["resume_id"],
            filename=resume.get("filename"),
            is_master=resume.get("is_master", False),
            parent_id=resume.get("parent_id"),
            processing_status=resume.get("processing_status", "pending"),
            created_at=resume.get("created_at", ""),
            updated_at=resume.get("updated_at", ""),
            # Title is persisted at upload time from personalInfo.title.
            # This fallback covers old records uploaded before that change.
            # The derived value is also lazy-persisted below so it stabilizes.
            title=resume.get("title") or (
                (resume.get("processed_data") or {})
                .get("personalInfo", {})
                .get("title")
            ) or None,
            error_message=resume.get("error_message"),
        )
        for resume in resumes
    ]

    # Lazy-persist derived titles for old records that have no title in DB yet.
    # One background write per old record — after this they read directly from DB.
    # No AI call — reads only from already-stored processed_data.
    for resume, summary in zip(resumes, summaries):
        if summary.title and not resume.get("title"):
            try:
                db.update_resume(resume["resume_id"], {"title": summary.title}, user_id=user.id)
            except Exception:
                pass  # Non-critical

    return ResumeListResponse(request_id=str(uuid4()), data=summaries)


# ---------------------------------------------------------------------------
# Async tailor helpers (Phase 2 — background-task architecture)
# ---------------------------------------------------------------------------

def _classify_error(error: Exception) -> tuple[str, str]:
    """Map an exception to (error_type, user-facing message).

    Returns a tuple so background tasks can persist error info without raising.
    """
    try:
        if isinstance(error, litellm.exceptions.AuthenticationError):
            return ("auth", "AI API authentication failed. Please check your API key in Settings.")
        if isinstance(error, litellm.exceptions.RateLimitError):
            return ("rate_limit", "AI API rate limit reached. Please wait a moment and try again.")
        if isinstance(error, (litellm.exceptions.ServiceUnavailableError, litellm.exceptions.Timeout)):
            return ("timeout", "AI service is temporarily unavailable or timed out. Please try again.")
        if isinstance(error, litellm.exceptions.BadRequestError):
            return ("general", "Invalid request to AI provider. Please check your model configuration in Settings.")
    except Exception:
        pass  # litellm.exceptions not available — fall through to string check

    if isinstance(error, HTTPException):
        status = error.status_code
        if status == 422 and "ALL_ENTRIES_REMOVED" in str(error.detail):
            return ("general", str(error.detail))
        if status == 401:
            return ("auth", str(error.detail))
        if status == 429:
            return ("rate_limit", str(error.detail))
        if status == 503:
            return ("timeout", str(error.detail))
        return ("general", str(error.detail))

    msg_lower = str(error).lower()
    if "rate limit" in msg_lower or "429" in str(error):
        return ("rate_limit", "AI API rate limit reached. Please wait a moment and try again.")
    if "auth" in msg_lower or "api key" in msg_lower or "401" in str(error) or "unauthorized" in msg_lower:
        return ("auth", "AI API authentication failed. Please check your API key in Settings.")
    if "timeout" in msg_lower or "timed out" in msg_lower or "503" in str(error):
        return ("timeout", "AI service is temporarily unavailable or timed out. Please try again.")

    return ("general", "Failed to preview resume. Please try again.")


async def _run_tailor_task(
    task_id: str,
    resume: dict[str, Any],
    job: dict[str, Any],
    job_id: str,
    language: str,
    prompt_id: str,
    user_id: str,
) -> None:
    """Background worker that runs the full tailor pipeline and persists results."""
    start_time = time.monotonic()

    def elapsed() -> float:
        return time.monotonic() - start_time

    try:
        db.update_tailor_task(task_id, {"status": "processing", "stage": "extract_keywords", "progress": 10}, user_id=user_id)

        job_keywords = job.get("job_keywords")
        job_keywords_hash = job.get("job_keywords_hash")
        content_hash = hash_job_content(job["content"])
        if not job_keywords or job_keywords_hash != content_hash:
            job_keywords = await extract_job_keywords(job["content"], user_id=user_id)
            try:
                updated_job = db.update_job(
                    job_id,
                    {"job_keywords": job_keywords, "job_keywords_hash": content_hash},
                    user_id=user_id,
                )
                if not updated_job:
                    logger.warning("Failed to persist job keywords for job %s.", job_id)
            except Exception as e:
                logger.warning("Failed to persist job keywords for job %s: %s", job_id, e)

        db.update_tailor_task(task_id, {"stage": "improve_resume", "progress": 30}, user_id=user_id)

        improved_data, removed_entries = await improve_resume(
            original_resume=resume["content"],
            job_description=job["content"],
            job_keywords=job_keywords,
            language=language,
            prompt_id=prompt_id,
            user_id=user_id,
        )

        # Focused mode: guard against all entries removed
        if prompt_id == "focused":
            has_work = bool(improved_data.get("workExperience"))
            has_projects = bool(improved_data.get("personalProjects"))
            if not has_work and not has_projects:
                error_msg = (
                    "ALL_ENTRIES_REMOVED: The AI determined that none of your work "
                    "experiences or projects are relevant to this job description."
                )
                db.update_tailor_task(task_id, {
                    "status": "failed",
                    "error": error_msg,
                    "error_type": "general",
                    "stage": "done",
                    "progress": 100,
                }, user_id=user_id)
                return

            # Restore education if the LLM incorrectly removed entries
            original_data_for_edu = _get_original_resume_data(resume)
            if original_data_for_edu:
                orig_edu = original_data_for_edu.get("education", [])
                if orig_edu and len(improved_data.get("education", [])) < len(orig_edu):
                    logger.warning("Focused mode removed education entries; restoring originals")
                    improved_data = dict(improved_data)
                    improved_data["education"] = copy.deepcopy(orig_edu)

        response_warnings: list[str] = []
        improved_data, preserve_warnings = _preserve_personal_info(
            _get_original_resume_data(resume),
            improved_data,
        )
        response_warnings.extend(preserve_warnings)

        db.update_tailor_task(task_id, {"stage": "refine_resume", "progress": 60}, user_id=user_id)

        # Time-budget guard: skip refinement if we are already over 120 s
        refinement_stats: RefinementStats | None = None
        refinement_attempted = False
        refinement_successful = False
        if elapsed() < 120:
            try:
                master_data = _get_original_resume_data(resume)
                if master_data:
                    initial_match = calculate_keyword_match(improved_data, job_keywords)
                    refinement_attempted = True
                    refinement_result = await refine_resume(
                        initial_tailored=improved_data,
                        master_resume=master_data,
                        job_description=job["content"],
                        job_keywords=job_keywords,
                        config=RefinementConfig(),
                        user_id=user_id,
                    )
                    improved_data = refinement_result.refined_data
                    refinement_stats = RefinementStats(
                        passes_completed=refinement_result.passes_completed,
                        keywords_injected=(
                            len(refinement_result.keyword_analysis.injectable_keywords)
                            if refinement_result.keyword_analysis
                            else 0
                        ),
                        ai_phrases_removed=refinement_result.ai_phrases_removed,
                        alignment_violations_fixed=(
                            len(
                                [
                                    v
                                    for v in refinement_result.alignment_report.violations
                                    if v.severity == "critical"
                                ]
                            )
                            if refinement_result.alignment_report
                            else 0
                        ),
                        initial_match_percentage=initial_match,
                        final_match_percentage=refinement_result.final_match_percentage,
                    )
                    refinement_successful = True
                    logger.info(
                        "Refinement completed: %d passes, %d AI phrases removed",
                        refinement_result.passes_completed,
                        len(refinement_result.ai_phrases_removed),
                    )
            except Exception as e:
                logger.warning("Refinement failed, using unrefined result: %s", e)
                if refinement_attempted:
                    response_warnings.append(f"Refinement failed: {str(e)}")
        else:
            logger.warning(
                "Skipping refinement for task %s — elapsed %.1fs exceeds 120s budget",
                task_id,
                elapsed(),
            )
            response_warnings.append("Refinement skipped due to time constraints.")

        db.update_tailor_task(task_id, {"stage": "finalize", "progress": 85}, user_id=user_id)

        improved_text = json.dumps(improved_data, indent=2)
        preview_hash = _hash_improved_data(improved_data)
        preview_hashes = job.get("preview_hashes")
        if not isinstance(preview_hashes, dict):
            preview_hashes = {}
        preview_hashes[prompt_id] = preview_hash
        try:
            updated_job = db.update_job(
                job_id,
                {
                    "preview_hash": preview_hash,
                    "preview_prompt_id": prompt_id,
                    "preview_hashes": preview_hashes,
                },
                user_id=user_id,
            )
            if not updated_job:
                logger.warning("Failed to persist preview hash for job %s.", job_id)
        except Exception as e:
            logger.warning("Failed to persist preview hash for job %s: %s", job_id, e)

        diff_summary, detailed_changes, diff_error = _calculate_diff_from_resume(
            resume,
            improved_data,
            removed_entries=removed_entries if prompt_id == "focused" else None,
        )
        if diff_error:
            response_warnings.append(f"Could not calculate changes: {diff_error}")

        improvements = generate_improvements(job_keywords)

        removed_entry_objects = [
            RemovedEntry(
                type=e.get("type", "workExperience"),  # type: ignore[arg-type]
                label=e.get("label", ""),
                reason=e.get("reason", ""),
            )
            for e in removed_entries
        ]

        request_id = str(uuid4())
        result_data = ImproveResumeData(
            request_id=request_id,
            resume_id=None,
            job_id=job_id,
            resume_preview=ResumeData.model_validate(improved_data),
            improvements=[
                {
                    "suggestion": imp["suggestion"],
                    "lineNumber": imp.get("lineNumber"),
                }
                for imp in improvements
            ],
            markdownOriginal=resume["content"],
            markdownImproved=improved_text,
            cover_letter=None,
            outreach_message=None,
            diff_summary=diff_summary,
            detailed_changes=detailed_changes,
            removed_entries=removed_entry_objects,
            refinement_stats=refinement_stats,
            warnings=response_warnings,
            refinement_attempted=refinement_attempted,
            refinement_successful=refinement_successful,
        )

        db.update_tailor_task(task_id, {
            "status": "completed",
            "stage": "done",
            "progress": 100,
            "result": result_data.model_dump(mode="json"),
        }, user_id=user_id)

    except Exception as e:
        error_type, error_msg = _classify_error(e)
        logger.error("Tailor task %s failed: %s", task_id, e)
        db.update_tailor_task(task_id, {
            "status": "failed",
            "stage": "done",
            "progress": 100,
            "error": error_msg,
            "error_type": error_type,
        }, user_id=user_id)


@router.post("/improve/preview", response_model=TailorTaskStartResponse)
async def improve_resume_preview_endpoint(
    request: ImproveResumeRequest,
    background_tasks: BackgroundTasks,
    user=Depends(get_current_user),
) -> TailorTaskStartResponse:
    """Queue a resume tailoring task and return immediately with a task_id.

    Poll GET /improve/status/{task_id} to track progress and retrieve results.
    """
    resume = _get_generation_source_resume(request.resume_id, user.id)

    job = db.get_job(request.job_id, user_id=user.id)
    if not job:
        raise HTTPException(status_code=404, detail="Job description not found")

    language = _get_content_language()
    prompt_id = request.prompt_id or _get_default_prompt_id()

    task_id = str(uuid4())
    db.create_tailor_task(
        task_id=task_id,
        user_id=user.id,
        resume_id=request.resume_id,
        job_id=request.job_id,
        prompt_id=prompt_id,
    )

    background_tasks.add_task(
        _run_tailor_task,
        task_id=task_id,
        resume=resume,
        job=job,
        job_id=request.job_id,
        language=language,
        prompt_id=prompt_id,
        user_id=user.id,
    )

    return TailorTaskStartResponse(task_id=task_id)


@router.get("/improve/status/{task_id}", response_model=TailorTaskStatusResponse)
async def get_tailor_task_status(
    task_id: str,
    user=Depends(get_current_user),
) -> TailorTaskStatusResponse:
    """Poll the status of an async tailor task."""
    task = db.get_tailor_task(task_id, user_id=user.id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    result_data: ImproveResumeData | None = None
    if task["status"] == "completed" and task.get("result"):
        try:
            result_data = ImproveResumeData.model_validate(task["result"])
        except Exception as e:
            logger.error("Failed to deserialize task result for %s: %s", task_id, e)

    return TailorTaskStatusResponse(
        task_id=task_id,
        status=task["status"],
        stage=task["stage"],
        progress=task["progress"],
        result=result_data,
        error=task.get("error"),
        error_type=task.get("error_type"),
    )


@router.post("/improve/confirm", response_model=ImproveResumeResponse)
async def improve_resume_confirm_endpoint(
    request: ImproveResumeConfirmRequest,
    user=Depends(get_current_user),
) -> ImproveResumeResponse:
    """Confirm and persist a tailored resume."""
    resume = _get_generation_source_resume(request.resume_id, user.id)

    job = db.get_job(request.job_id, user_id=user.id)
    if not job:
        raise HTTPException(status_code=404, detail="Job description not found")

    feature_config = _load_feature_config()
    enable_cover_letter = feature_config.get("enable_cover_letter", False)
    enable_outreach = feature_config.get("enable_outreach_message", False)
    language = _get_content_language()

    stage = "serialize_improved_data"
    detail = "Failed to confirm resume. Please try again."
    try:
        improved_data = request.improved_data.model_dump()
        improved_text = json.dumps(improved_data, indent=2)
        # NOTE: This endpoint relies on preview-hash validation to ensure the payload matches a prior preview.
        # Stronger guarantees would require server-side preview storage or re-running the improvement.
        try:
            _validate_confirm_payload(_get_original_resume_data(resume), improved_data)
        except ValueError as e:
            logger.warning("Resume confirm rejected: %s", e)
            raise HTTPException(
                status_code=400,
                detail="Invalid improved resume data. Please retry preview.",
            )
        preview_hashes = job.get("preview_hashes")
        allowed_hashes: set[str] = set()
        if isinstance(preview_hashes, dict):
            allowed_hashes.update(preview_hashes.values())
        elif isinstance(preview_hashes, list):
            allowed_hashes.update(
                [value for value in preview_hashes if isinstance(value, str)]
            )
        else:
            preview_hash = job.get("preview_hash")
            if isinstance(preview_hash, str):
                allowed_hashes.add(preview_hash)

        if not allowed_hashes:
            logger.warning(
                "Rejecting confirm; preview hash missing for job %s.",
                request.job_id,
            )
            raise HTTPException(
                status_code=400,
                detail="Preview required before confirmation. Please retry preview.",
            )

        request_hash = _hash_improved_data(improved_data)
        if request_hash not in allowed_hashes:
            logger.warning("Resume confirm rejected due to preview hash mismatch.")
            raise HTTPException(
                status_code=400,
                detail="Invalid improved resume data. Please retry preview.",
            )

        stage = "calculate_diff"
        response_warnings: list[str] = []
        diff_summary, detailed_changes, diff_error = _calculate_diff_from_resume(
            resume,
            improved_data,
        )
        if diff_error:
            response_warnings.append(f"Could not calculate changes: {diff_error}")

        stage = "generate_auxiliary_messages"
        (
            cover_letter,
            outreach_message,
            title,
            aux_warnings,
        ) = await _generate_auxiliary_messages(
            improved_data,
            job["content"],
            language,
            enable_cover_letter,
            enable_outreach,
            user.id,
        )
        response_warnings.extend(aux_warnings)

        stage = "create_resume"
        tailored_resume = db.create_resume(
            content=improved_text,
            content_type="json",
            filename=f"tailored_{resume.get('filename', 'resume')}",
            is_master=False,
            parent_id=request.resume_id,
            processed_data=improved_data,
            processing_status="ready",
            cover_letter=cover_letter,
            outreach_message=outreach_message,
            title=title,
            user_id=user.id,
        )

        improvements_payload = [imp.model_dump() for imp in request.improvements]
        stage = "create_improvement"
        request_id = str(uuid4())
        db.create_improvement(
            original_resume_id=request.resume_id,
            tailored_resume_id=tailored_resume["resume_id"],
            job_id=request.job_id,
            improvements=improvements_payload,
            user_id=user.id,
        )

        return ImproveResumeResponse(
            request_id=request_id,
            data=ImproveResumeData(
                request_id=request_id,
                resume_id=tailored_resume["resume_id"],
                job_id=request.job_id,
                resume_preview=request.improved_data,
                improvements=request.improvements,
                markdownOriginal=resume["content"],
                markdownImproved=improved_text,
                cover_letter=cover_letter,
                outreach_message=outreach_message,
                diff_summary=diff_summary,
                detailed_changes=detailed_changes,
                warnings=response_warnings,
            ),
        )
    except HTTPException:
        raise
    except Exception as e:
        _raise_improve_error("confirm", stage, e, detail)


@router.post("/improve", response_model=ImproveResumeResponse)
async def improve_resume_endpoint(
    request: ImproveResumeRequest,
    user=Depends(get_current_user),
) -> ImproveResumeResponse:
    """Improve/tailor a resume for a specific job description.

    Uses LLM to analyze the job and generate an optimized resume version
    with improvement suggestions. Also generates cover letter and outreach
    message if enabled in feature configuration.
    Persists the tailored resume and returns a non-null resume_id.
    """
    # Fetch and validate explicit source resume
    resume = _get_generation_source_resume(request.resume_id, user.id)

    # Fetch job description
    job = db.get_job(request.job_id, user_id=user.id)
    if not job:
        raise HTTPException(status_code=404, detail="Job description not found")

    # Load feature configuration and content language
    feature_config = _load_feature_config()
    enable_cover_letter = feature_config.get("enable_cover_letter", False)
    enable_outreach = feature_config.get("enable_outreach_message", False)
    language = _get_content_language()

    try:
        # Extract keywords from job description
        job_keywords = await extract_job_keywords(job["content"], user_id=user.id)

        # Generate improved resume in the configured language
        prompt_id = request.prompt_id or _get_default_prompt_id()

        improved_data, removed_entries = await improve_resume(
            original_resume=resume["content"],
            job_description=job["content"],
            job_keywords=job_keywords,
            language=language,
            prompt_id=prompt_id,
            user_id=user.id,
        )

        # Focused mode: guard against all entries removed
        if prompt_id == "focused":
            has_work = bool(improved_data.get("workExperience"))
            has_projects = bool(improved_data.get("personalProjects"))
            if not has_work and not has_projects:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        "ALL_ENTRIES_REMOVED: The AI determined that none of your work "
                        "experiences or projects are relevant to this job description."
                    ),
                )
            # Restore education if the LLM incorrectly removed entries from it
            original_data_for_edu = _get_original_resume_data(resume)
            if original_data_for_edu:
                orig_edu = original_data_for_edu.get("education", [])
                if orig_edu and len(improved_data.get("education", [])) < len(orig_edu):
                    logger.warning(
                        "Focused mode removed education entries; restoring originals"
                    )
                    improved_data = dict(improved_data)
                    improved_data["education"] = copy.deepcopy(orig_edu)

        # Collect warnings throughout the process
        response_warnings: list[str] = []

        improved_data, preserve_warnings = _preserve_personal_info(
            _get_original_resume_data(resume),
            improved_data,
        )
        response_warnings.extend(preserve_warnings)

        # Multi-pass refinement: keyword injection, AI phrase removal, alignment validation
        refinement_stats: RefinementStats | None = None
        refinement_attempted = False
        refinement_successful = False
        try:
            # Use the explicit selected source resume for alignment validation.
            master_data = _get_original_resume_data(resume)
            if master_data:
                initial_match = calculate_keyword_match(improved_data, job_keywords)
                refinement_attempted = True
                refinement_result = await refine_resume(
                    initial_tailored=improved_data,
                    master_resume=master_data,
                    job_description=job["content"],
                    job_keywords=job_keywords,
                    config=RefinementConfig(),
                    user_id=user.id,
                )
                improved_data = refinement_result.refined_data
                refinement_stats = RefinementStats(
                    passes_completed=refinement_result.passes_completed,
                    keywords_injected=(
                        len(refinement_result.keyword_analysis.injectable_keywords)
                        if refinement_result.keyword_analysis
                        else 0
                    ),
                    ai_phrases_removed=refinement_result.ai_phrases_removed,
                    alignment_violations_fixed=(
                        len(
                            [
                                v
                                for v in refinement_result.alignment_report.violations
                                if v.severity == "critical"
                            ]
                        )
                        if refinement_result.alignment_report
                        else 0
                    ),
                    initial_match_percentage=initial_match,
                    final_match_percentage=refinement_result.final_match_percentage,
                )
                refinement_successful = True
                logger.info(
                    "Refinement completed: %d passes, %d AI phrases removed",
                    refinement_result.passes_completed,
                    len(refinement_result.ai_phrases_removed),
                )
        except Exception as e:
            logger.warning("Refinement failed, using unrefined result: %s", e)
            if refinement_attempted:
                response_warnings.append(f"Refinement failed: {str(e)}")

        # Convert improved data to JSON string for storage
        improved_text = json.dumps(improved_data, indent=2)

        # Calculate differences between original and improved resume
        diff_summary, detailed_changes, diff_error = _calculate_diff_from_resume(
            resume,
            improved_data,
            removed_entries=removed_entries if prompt_id == "focused" else None,
        )
        if diff_error:
            response_warnings.append(f"Could not calculate changes: {diff_error}")

        # Generate improvement suggestions
        improvements = generate_improvements(job_keywords)

        # Generate cover letter, outreach message, and title in parallel if enabled
        (
            cover_letter,
            outreach_message,
            title,
            aux_warnings,
        ) = await _generate_auxiliary_messages(
            improved_data,
            job["content"],
            language,
            enable_cover_letter,
            enable_outreach,
            user.id,
        )
        response_warnings.extend(aux_warnings)

        # Store the tailored resume with cover letter, outreach message, and title
        tailored_resume = db.create_resume(
            content=improved_text,
            content_type="json",
            filename=f"tailored_{resume.get('filename', 'resume')}",
            is_master=False,
            parent_id=request.resume_id,
            processed_data=improved_data,
            processing_status="ready",
            cover_letter=cover_letter,
            outreach_message=outreach_message,
            title=title,
            user_id=user.id,
        )

        # Store improvement record
        request_id = str(uuid4())
        db.create_improvement(
            original_resume_id=request.resume_id,
            tailored_resume_id=tailored_resume["resume_id"],
            job_id=request.job_id,
            improvements=improvements,
            user_id=user.id,
        )

        return ImproveResumeResponse(
            request_id=request_id,
            data=ImproveResumeData(
                request_id=request_id,
                resume_id=tailored_resume["resume_id"],
                job_id=request.job_id,
                resume_preview=ResumeData.model_validate(improved_data),
                improvements=[
                    {
                        "suggestion": imp["suggestion"],
                        "lineNumber": imp.get("lineNumber"),
                    }
                    for imp in improvements
                ],
                markdownOriginal=resume["content"],
                markdownImproved=improved_text,
                cover_letter=cover_letter,
                outreach_message=outreach_message,
                # Diff metadata
                diff_summary=diff_summary,
                detailed_changes=detailed_changes,
                removed_entries=[
                    RemovedEntry(
                        type=e.get("type", "workExperience"),  # type: ignore[arg-type]
                        label=e.get("label", ""),
                        reason=e.get("reason", ""),
                    )
                    for e in removed_entries
                ],
                refinement_stats=refinement_stats,
                warnings=response_warnings,
                refinement_attempted=refinement_attempted,
                refinement_successful=refinement_successful,
            ),
        )

    except Exception as e:
        logger.error(f"Resume improvement failed: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to improve resume. Please try again.",
        )


@router.patch("/{resume_id}", response_model=ResumeFetchResponse)
async def update_resume_endpoint(
    resume_id: str,
    resume_data: ResumeData,
    user=Depends(get_current_user),
) -> ResumeFetchResponse:
    """Update a resume with new structured data."""
    existing = db.get_active_resume(resume_id, user_id=user.id)
    if not existing:
        raise HTTPException(status_code=404, detail="Resume not found")

    updated_data = resume_data.model_dump()
    updated_content = json.dumps(updated_data, indent=2)

    updated = db.update_resume(
        resume_id,
        {
            "content": updated_content,
            "content_type": "json",
            "processed_data": updated_data,
            "processing_status": "ready",
        },
        user_id=user.id,
    )

    if not updated:
        raise DebugHTTPException(status_code=500, detail="Failed to update resume")

    raw_resume = RawResume(
        id=None,
        content=updated["content"],
        content_type=updated["content_type"],
        created_at=updated["created_at"],
        processing_status=updated.get("processing_status", "pending"),
    )

    processed_resume = (
        ResumeData.model_validate(updated.get("processed_data"))
        if updated.get("processed_data")
        else None
    )

    return ResumeFetchResponse(
        request_id=str(uuid4()),
        data=ResumeFetchData(
            resume_id=resume_id,
            raw_resume=raw_resume,
            processed_resume=processed_resume,
        ),
    )


@router.get("/{resume_id}/pdf")
async def download_resume_pdf(
    resume_id: str,
    template: str = Query("swiss-single"),
    pageSize: str = Query("A4", pattern="^(A4|LETTER)$"),
    marginTop: int = Query(10, ge=5, le=25),
    marginBottom: int = Query(10, ge=5, le=25),
    marginLeft: int = Query(10, ge=5, le=25),
    marginRight: int = Query(10, ge=5, le=25),
    sectionSpacing: int = Query(3, ge=1, le=5),
    itemSpacing: int = Query(2, ge=1, le=5),
    lineHeight: int = Query(3, ge=1, le=5),
    fontSize: int = Query(3, ge=1, le=5),
    headerScale: int = Query(3, ge=1, le=5),
    headerFont: str = Query("serif", pattern="^(serif|sans-serif|mono)$"),
    bodyFont: str = Query("sans-serif", pattern="^(serif|sans-serif|mono)$"),
    compactMode: bool = Query(False),
    showContactIcons: bool = Query(False),
    accentColor: str = Query("blue", pattern="^(blue|green|orange|red)$"),
    lang: str | None = Query(None, pattern="^[a-z]{2}(-[A-Z]{2})?$"),
    request: Request = None,
    user=Depends(get_current_user),
) -> Response:
    """Generate a PDF for a resume using headless Chromium.

    Accepts template settings for customization:
    - template: swiss-single, swiss-two-column, modern, or modern-two-column
    - pageSize: A4 or LETTER
    - marginTop/Bottom/Left/Right: page margins in mm (5-25)
    - sectionSpacing: gap between sections (1-5)
    - itemSpacing: gap between items (1-5)
    - lineHeight: text line height (1-5)
    - fontSize: base font size (1-5)
    - headerScale: header size scale (1-5)
    - headerFont: serif, sans-serif, or mono
    - bodyFont: serif, sans-serif, or mono
    - compactMode: enable tighter spacing
    - showContactIcons: show icons in contact info
    - lang: locale used for print page translations
    """
    resume = db.get_active_resume(resume_id, user_id=user.id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    margins = {
        "top": marginTop,
        "bottom": marginBottom,
        "left": marginLeft,
        "right": marginRight,
    }
    spacing = {
        "section": sectionSpacing,
        "item": itemSpacing,
        "lineHeight": lineHeight,
    }
    font_settings = {
        "base": fontSize,
        "headerScale": headerScale,
        "headerFont": headerFont,
        "bodyFont": bodyFont,
    }
    params = _build_resume_print_params(
        template=template,
        page_size=pageSize,
        margins=margins,
        spacing=spacing,
        font_size=font_settings,
        compact_mode=compactMode,
        show_contact_icons=showContactIcons,
        accent_color=accentColor,
        lang=lang,
    )
    # Pass the user's JWT so the print page can authenticate its backend fetch
    if request:
        raw_token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
        if raw_token:
            params = f"{params}&token={raw_token}"
    url = f"{settings.frontend_base_url}/print/resumes/{resume_id}?{params}"

    # Use the exact margins provided; compact mode only affects spacing.
    pdf_margins = _build_pdf_margin_dict(margins)

    # Render PDF with margins applied to every page
    try:
        pdf_bytes = await render_resume_pdf(url, pageSize, margins=pdf_margins)
    except PDFRenderError as e:
        raise HTTPException(status_code=503, detail=str(e))

    headers = {"Content-Disposition": f'attachment; filename="resume_{resume_id}.pdf"'}
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


@router.post("/render-pdf")
async def render_resume_pdf_from_draft(
    payload: ResumeRenderPdfRequest,
    request: Request,
    user=Depends(get_current_user),
) -> Response:
    """Render the current builder draft using the exact PDF pipeline."""

    settings_payload = payload.settings.model_dump(mode="json")
    preview_id, access_key = await create_resume_preview(
        resume_data=payload.resumeData.model_dump(mode="json"),
        settings=settings_payload,
        lang=payload.lang,
    )

    margins = settings_payload["margins"]
    params = urlencode({"accessKey": access_key})
    raw_token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if raw_token:
        params = f"{params}&token={raw_token}"
    url = f"{settings.frontend_base_url}/print/resumes/preview/{preview_id}?{params}"

    try:
        pdf_bytes = await render_resume_pdf(
            url,
            payload.settings.pageSize,
            margins=_build_pdf_margin_dict(margins),
        )
    except PDFRenderError as error:
        logger.error(
            "Draft PDF render failed for user %s: %s",
            user.id,
            error,
        )
        raise HTTPException(
            status_code=503,
            detail=str(error),
        )
    finally:
        await delete_resume_preview(preview_id)

    return Response(content=pdf_bytes, media_type="application/pdf")


@preview_router.get("/{preview_id}", response_model=ResumePreviewDocumentResponse)
async def get_resume_preview_document(
    preview_id: str,
    accessKey: str = Query(..., min_length=8),
) -> ResumePreviewDocumentResponse:
    """Return draft preview data for the temporary print route."""

    preview = await get_resume_preview(preview_id, accessKey)
    if preview is None:
        raise HTTPException(status_code=404, detail="Resume preview not found or expired.")

    return ResumePreviewDocumentResponse(
        request_id=str(uuid4()),
        data=ResumePreviewDocument(
            resumeData=ResumeData.model_validate(preview.resume_data),
            settings=ResumeTemplateSettings.model_validate(preview.settings),
            lang=preview.lang,
        ),
    )


@router.delete("/{resume_id}")
async def delete_resume(resume_id: str, user=Depends(get_current_user)) -> dict:
    """Delete a resume by ID."""
    resume = db.get_active_resume(resume_id, user_id=user.id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    if resume.get("is_master", False):
        if not db.soft_delete_resume(resume_id, user_id=user.id):
            raise HTTPException(status_code=404, detail="Resume not found")
        return {"message": "Resume deleted successfully"}

    if not db.delete_resume(resume_id, user_id=user.id):
        raise HTTPException(status_code=404, detail="Resume not found")

    return {"message": "Resume deleted successfully"}


@router.post("/{resume_id}/retry-processing", response_model=ResumeUploadResponse)
async def retry_processing(
    resume_id: str,
    user=Depends(get_current_user),
) -> ResumeUploadResponse:
    """Retry AI processing for a failed resume.

    Re-runs parse_resume_to_json() on the stored markdown content.
    Only works for resumes with processing_status == "failed".
    """
    resume = db.get_active_resume(resume_id, user_id=user.id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    if resume.get("processing_status") not in ("failed", "processing"):
        raise HTTPException(
            status_code=400,
            detail="Only resumes with 'failed' or 'processing' status can be retried.",
        )

    markdown_content = resume.get("content", "")
    if not markdown_content:
        raise HTTPException(
            status_code=400,
            detail="Resume has no stored content to re-process.",
        )

    try:
        processed_data = await parse_resume_to_json(markdown_content, user_id=user.id)

        # Treat empty output as a failure rather than saving blank resume data.
        has_content = bool(
            processed_data
            and (
                (processed_data.get("personalInfo") or {}).get("name")
                or processed_data.get("workExperience")
                or processed_data.get("education")
                or processed_data.get("sectionMeta")
            )
        )
        if not has_content:
            empty_msg = "AI returned empty data — no recognizable resume content found."
            db.update_resume(
                resume_id,
                {"processing_status": "failed", "error_message": empty_msg},
                user_id=user.id,
            )
            return ResumeUploadResponse(
                message="Retry processing returned empty data",
                request_id=str(uuid4()),
                resume_id=resume_id,
                processing_status="failed",
                is_master=resume.get("is_master", False),
                error_message=empty_msg,
            )

        derived_title = (
            (processed_data or {}).get("personalInfo", {}).get("title")
        ) or None
        title_update = {"title": derived_title} if derived_title and not resume.get("title") else {}
        db.update_resume(
            resume_id,
            {
                "processed_data": processed_data,
                "processing_status": "ready",
                "error_message": None,
                **title_update,
            },
            user_id=user.id,
        )
        return ResumeUploadResponse(
            message="Resume processing succeeded on retry",
            request_id=str(uuid4()),
            resume_id=resume_id,
            processing_status="ready",
            is_master=resume.get("is_master", False),
        )
    except Exception as e:
        error_detail = str(e)
        logger.warning(f"Retry processing failed for resume {resume_id}: {error_detail}")
        db.update_resume(
            resume_id,
            {"processing_status": "failed", "error_message": error_detail},
            user_id=user.id,
        )
        return ResumeUploadResponse(
            message="Retry processing failed",
            request_id=str(uuid4()),
            resume_id=resume_id,
            processing_status="failed",
            is_master=resume.get("is_master", False),
            error_message=error_detail,
        )


@router.patch("/{resume_id}/cover-letter")
async def update_cover_letter(
    resume_id: str, request: UpdateCoverLetterRequest, user=Depends(get_current_user)
) -> dict:
    """Update the cover letter for a resume."""
    resume = db.get_active_resume(resume_id, user_id=user.id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    db.update_resume(resume_id, {"cover_letter": request.content}, user_id=user.id)
    return {"message": "Cover letter updated successfully"}


@router.patch("/{resume_id}/outreach-message")
async def update_outreach_message(
    resume_id: str, request: UpdateOutreachMessageRequest, user=Depends(get_current_user)
) -> dict:
    """Update the outreach message for a resume."""
    resume = db.get_active_resume(resume_id, user_id=user.id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    db.update_resume(resume_id, {"outreach_message": request.content}, user_id=user.id)
    return {"message": "Outreach message updated successfully"}


@router.patch("/{resume_id}/title")
async def update_title(
    resume_id: str,
    request: UpdateTitleRequest,
    user=Depends(get_current_user),
) -> dict:
    """Update the title for a resume."""
    resume = db.get_active_resume(resume_id, user_id=user.id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    title = request.title.strip()[:80]
    db.update_resume(resume_id, {"title": title}, user_id=user.id)
    return {"message": "Title updated successfully"}


@router.post(
    "/{resume_id}/generate-cover-letter", response_model=GenerateContentResponse
)
async def generate_cover_letter_endpoint(
    resume_id: str,
    user=Depends(get_current_user),
) -> GenerateContentResponse:
    """Generate a cover letter on-demand for an existing tailored resume.

    This endpoint allows users to generate a cover letter after a resume has been
    tailored, without needing to re-tailor the entire resume. It requires:
    - The resume must be a tailored resume (has parent_id)
    - The resume must have an associated job context in the improvements table
    """
    # Get the resume
    resume = db.get_active_resume(resume_id, user_id=user.id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Check if it's a tailored resume (has parent_id)
    if not resume.get("parent_id"):
        raise HTTPException(
            status_code=400,
            detail="Cover letter can only be generated for tailored resumes. "
            "Please tailor this resume to a job description first.",
        )

    # Get improvement record to find the job_id
    improvement = db.get_improvement_by_tailored_resume(resume_id, user_id=user.id)
    if not improvement:
        raise HTTPException(
            status_code=400,
            detail="No job context found for this resume. "
            "The resume may have been created before job tracking was implemented.",
        )

    # Get the job description
    job = db.get_job(improvement["job_id"], user_id=user.id)
    if not job:
        raise HTTPException(
            status_code=404,
            detail="The associated job description was not found.",
        )

    # Get resume data
    resume_data = resume.get("processed_data")
    if not resume_data:
        raise HTTPException(
            status_code=400,
            detail="Resume has no processed data. Please re-upload the resume.",
        )

    # Get language setting
    language = _get_content_language()

    # Generate cover letter
    try:
        cover_letter_content = await generate_cover_letter(
            resume_data,
            job["content"],
            language,
            user_id=user.id,
        )
    except Exception as e:
        logger.error(f"Cover letter generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate cover letter. Please try again.",
        )

    # Save to resume record
    db.update_resume(resume_id, {"cover_letter": cover_letter_content}, user_id=user.id)

    return GenerateContentResponse(
        content=cover_letter_content,
        message="Cover letter generated successfully",
    )


@router.post("/{resume_id}/generate-outreach", response_model=GenerateContentResponse)
async def generate_outreach_endpoint(
    resume_id: str,
    user=Depends(get_current_user),
) -> GenerateContentResponse:
    """Generate an outreach message on-demand for an existing tailored resume.

    This endpoint allows users to generate a cold outreach message after a resume
    has been tailored. It requires:
    - The resume must be a tailored resume (has parent_id)
    - The resume must have an associated job context in the improvements table
    """
    # Get the resume
    resume = db.get_active_resume(resume_id, user_id=user.id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Check if it's a tailored resume (has parent_id)
    if not resume.get("parent_id"):
        raise HTTPException(
            status_code=400,
            detail="Outreach message can only be generated for tailored resumes. "
            "Please tailor this resume to a job description first.",
        )

    # Get improvement record to find the job_id
    improvement = db.get_improvement_by_tailored_resume(resume_id, user_id=user.id)
    if not improvement:
        raise HTTPException(
            status_code=400,
            detail="No job context found for this resume. "
            "The resume may have been created before job tracking was implemented.",
        )

    # Get the job description
    job = db.get_job(improvement["job_id"], user_id=user.id)
    if not job:
        raise HTTPException(
            status_code=404,
            detail="The associated job description was not found.",
        )

    # Get resume data
    resume_data = resume.get("processed_data")
    if not resume_data:
        raise HTTPException(
            status_code=400,
            detail="Resume has no processed data. Please re-upload the resume.",
        )

    # Get language setting
    language = _get_content_language()

    # Generate outreach message
    try:
        outreach_content = await generate_outreach_message(
            resume_data,
            job["content"],
            language,
            user_id=user.id,
        )
    except Exception as e:
        logger.error(f"Outreach message generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate outreach message. Please try again.",
        )

    # Save to resume record
    db.update_resume(resume_id, {"outreach_message": outreach_content}, user_id=user.id)

    return GenerateContentResponse(
        content=outreach_content,
        message="Outreach message generated successfully",
    )


@router.get("/{resume_id}/job-description")
async def get_job_description_for_resume(
    resume_id: str,
    user=Depends(get_current_user),
) -> dict:
    """Get the job description used to tailor this resume.

    This endpoint retrieves the original job description that was used
    to tailor a resume. Only works for tailored resumes (those with parent_id).
    """
    # Get the resume
    resume = db.get_active_resume(resume_id, user_id=user.id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Check if it's a tailored resume (has parent_id)
    if not resume.get("parent_id"):
        raise HTTPException(
            status_code=400,
            detail="Job description is only available for tailored resumes.",
        )

    # Get improvement record to find the job_id
    improvement = db.get_improvement_by_tailored_resume(resume_id, user_id=user.id)
    if not improvement:
        raise HTTPException(
            status_code=400,
            detail="No job context found for this resume. "
            "The resume may have been created before job tracking was implemented.",
        )

    # Get the job description
    job = db.get_job(improvement["job_id"], user_id=user.id)
    if not job:
        raise HTTPException(
            status_code=404,
            detail="The associated job description was not found.",
        )

    return {
        "job_id": job["job_id"],
        "content": job["content"],
    }


@router.get("/{resume_id}/cover-letter/pdf")
async def download_cover_letter_pdf(
    resume_id: str,
    pageSize: str = Query("A4", pattern="^(A4|LETTER)$"),
    lang: str | None = Query(None, pattern="^[a-z]{2}(-[A-Z]{2})?$"),
    request: Request = None,
    user=Depends(get_current_user),
) -> Response:
    """Generate a PDF for a cover letter using headless Chromium.

    Args:
        resume_id: The ID of the resume containing the cover letter
        pageSize: A4 or LETTER
        lang: locale used for print page translations
    """
    resume = db.get_active_resume(resume_id, user_id=user.id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    cover_letter = resume.get("cover_letter")
    if not cover_letter:
        raise HTTPException(
            status_code=404, detail="No cover letter found for this resume"
        )

    # Build print URL (same pattern as resume PDF)
    url = f"{settings.frontend_base_url}/print/cover-letter/{resume_id}?pageSize={pageSize}"
    if lang:
        url = f"{url}&lang={lang}"
    if request:
        raw_token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
        if raw_token:
            url = f"{url}&token={raw_token}"

    # Render PDF with cover letter selector
    try:
        pdf_bytes = await render_resume_pdf(
            url, pageSize, selector=".cover-letter-print"
        )
    except PDFRenderError as e:
        raise HTTPException(status_code=503, detail=str(e))

    headers = {
        "Content-Disposition": f'attachment; filename="cover_letter_{resume_id}.pdf"'
    }
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)
