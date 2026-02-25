"""Internship data proxy endpoint.

Improvements over v1:
- Parses markdown server-side → returns compact structured JSON (~90% smaller)
- asyncio.Lock prevents cache-stampede under concurrent requests
- GitHub raw text is never forwarded to clients
- X-Internal-Key auth (set in INTERNSHIP_API_KEY env var)
"""

import asyncio
import html
import logging
import re
import time
from typing import TypedDict

import httpx
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import JSONResponse

from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/internships", tags=["internships"])

# ── Types ─────────────────────────────────────────────────────────────────────

class InternshipItem(TypedDict):
    company: str
    companyUrl: str
    role: str
    location: str
    applyUrl: str
    simplifyUrl: str
    age: str
    isClosed: bool
    isSubRole: bool
    section: str
    source: str
    noSponsorship: bool
    requiresCitizenship: bool
    isFaang: bool
    requiresAdvancedDegree: bool


class _CacheEntry(TypedDict):
    active: list[InternshipItem]
    off_season: list[InternshipItem]
    fetched_at: float


# ── Cache + lock ──────────────────────────────────────────────────────────────

_CACHE_TTL = 86_400  # 24 h
_cache: _CacheEntry | None = None
_fetch_lock = asyncio.Lock()

GITHUB_URLS = {
    "active": "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/refs/heads/dev/README.md",
    "off_season": "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/refs/heads/dev/README-Off-Season.md",
}

_HTTP_HEADERS = {
    "User-Agent": "resume-matcher/1.0",
    "Accept-Encoding": "gzip",          # ask GitHub to compress
}

# ── Markdown parser (Python port of the TS parser in page.tsx) ────────────────

_TAG_RE = re.compile(r"<[^>]+>")
_MD_LINK_RE = re.compile(r"\[([^\]]*)\]\(([^)]*)\)")
_HTML_ENTITIES = {"&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " "}
_ENTITY_RE = re.compile("|".join(re.escape(k) for k in _HTML_ENTITIES))


def _unescape(text: str) -> str:
    text = _ENTITY_RE.sub(lambda m: _HTML_ENTITIES[m.group()], text)
    return html.unescape(text)


def _strip_tags(s: str) -> str:
    """Remove HTML tags and markdown links [text](url)→text, then unescape."""
    no_tags = _TAG_RE.sub("", s)
    no_md = _MD_LINK_RE.sub(r"\1", no_tags)
    return _unescape(no_md).strip()


_SKIP_HEADING_RE = re.compile(r"Browse\s+\d+|See Full List|😫|😮|^The List", re.I)
_ROLE_SUFFIX_RE = re.compile(r"\s+Internship Roles?$", re.I)
_COUNT_SUFFIX_RE = re.compile(r"\s*\(\d+\)$")
_HTML_H_RE = re.compile(r"<h[23][^>]*>(.*?)</h[23]>", re.I | re.S)
_HREF_RE = re.compile(r'href="([^"]+)"')
_APPLY_RE = re.compile(r'href="([^"]+)"[^>]*>[\s\S]*?alt="Apply"', re.I)
_SIMPLIFY_RE = re.compile(r'href="([^"]+)"[^>]*>[\s\S]*?alt="Simplify"', re.I)
_PIPE_SEP_RE = re.compile(r"^\s*\|?[\s:|-]+\|[\s:|-|]*$")

# Flag emojis
_FLAG_NO_SPONSOR = "🛂"
_FLAG_US_CITIZEN = "🇺🇸"
_FLAG_FAANG = "🔥"
_FLAG_ADV_DEGREE = "🎓"
_FLAG_CLOSED = "🔒"
# Strip all flag emojis from displayed role name
_FLAGS_ALL = {_FLAG_NO_SPONSOR, _FLAG_US_CITIZEN, _FLAG_FAANG, _FLAG_ADV_DEGREE, _FLAG_CLOSED}


def _clean_role(raw: str) -> str:
    """Remove flag emojis from role text."""
    out = raw
    for f in _FLAGS_ALL:
        out = out.replace(f, "")
    # 🇺🇸 is two codepoints — also strip via regex
    out = re.sub(r"[\U0001F1E6-\U0001F1FF]{2}", "", out)
    return out.strip()


def _parse_pipe_cells(line: str) -> list[str]:
    """Split a markdown pipe-table row into cells, preserving inner HTML."""
    # Strip leading/trailing pipes then split on | that are NOT inside <...>
    line = line.strip().strip("|")
    cells: list[str] = []
    depth = 0
    buf: list[str] = []
    for ch in line:
        if ch == "<":
            depth += 1
            buf.append(ch)
        elif ch == ">":
            depth = max(0, depth - 1)
            buf.append(ch)
        elif ch == "|" and depth == 0:
            cells.append("".join(buf).strip())
            buf = []
        else:
            buf.append(ch)
    cells.append("".join(buf).strip())
    return cells


def _cell_href(cell: str) -> str:
    """Return the first href in a cell (handles both markdown links and HTML)."""
    m = _HREF_RE.search(cell)
    if m:
        return m.group(1)
    m = _MD_LINK_RE.search(cell)
    if m:
        return m.group(2)
    return ""


def _cell_apply_url(cell: str) -> str:
    m = _APPLY_RE.search(cell)
    if m:
        return m.group(1)
    # fallback: first href in markdown link
    m2 = _MD_LINK_RE.search(cell)
    return m2.group(2) if m2 else ""


def _cell_simplify_url(cell: str) -> str:
    m = _SIMPLIFY_RE.search(cell)
    return m.group(1) if m else ""


def parse_markdown(text: str, source: str) -> list[InternshipItem]:
    """Parse a GitHub markdown pipe-table internship file into structured records."""
    results: list[InternshipItem] = []
    current_section = "General"
    current_company = ""
    current_company_url = ""
    in_table = False
    has_terms_col = False  # off-season tables have an extra Terms column

    lines = text.splitlines()
    i = 0
    while i < len(lines):
        raw = lines[i]
        stripped = raw.strip()

        # ── Heading detection ──
        if not stripped.startswith("|"):
            in_table = False
            # Markdown heading
            hm = re.match(r"^#{1,3}\s+(.+)$", stripped)
            heading_text: str | None = None
            if hm:
                heading_text = hm.group(1).strip()
            else:
                # HTML heading on same line
                hh = _HTML_H_RE.search(stripped)
                if hh:
                    heading_text = _strip_tags(hh.group(1))
            if heading_text and not _SKIP_HEADING_RE.search(heading_text):
                cleaned = _COUNT_SUFFIX_RE.sub("", _ROLE_SUFFIX_RE.sub("", heading_text)).strip()
                if cleaned:
                    current_section = cleaned
            i += 1
            continue

        # ── Pipe table row ──
        # Skip header separator rows (e.g. |---|---|)
        if _PIPE_SEP_RE.match(stripped):
            in_table = True
            i += 1
            continue

        cells = _parse_pipe_cells(stripped)
        if len(cells) < 4:
            i += 1
            continue

        # Detect header row — determine column layout
        c0_text = _strip_tags(cells[0]).lower()
        if c0_text in ("company", ""):
            in_table = True
            # Off-season tables have "Terms" as the 4th header (index 3)
            has_terms_col = len(cells) > 3 and _strip_tags(cells[3]).lower() == "terms"
            i += 1
            continue

        c0, c1, c2 = cells[0], cells[1], cells[2]
        if has_terms_col:
            # Off-season: Company | Role | Location | Terms | Application | Age
            c3 = cells[4] if len(cells) > 4 else ""
            c4 = cells[5] if len(cells) > 5 else ""
        else:
            # Active:     Company | Role | Location | Application | Age
            c3 = cells[3] if len(cells) > 3 else ""
            c4 = cells[4] if len(cells) > 4 else ""

        raw_company = _strip_tags(c0)
        is_sub = "↳" in raw_company or raw_company.strip() == ""

        if is_sub:
            company = current_company
            company_url = current_company_url
        else:
            company_url = _cell_href(c0) or current_company_url
            current_company_url = company_url
            company = raw_company.replace("↳", "").strip() or current_company
            current_company = company

        # Role cell may be raw text or contain flag emojis
        raw_role_text = _strip_tags(c1)
        no_sponsorship = _FLAG_NO_SPONSOR in raw_role_text
        requires_citizenship = _FLAG_US_CITIZEN in c1
        is_faang = _FLAG_FAANG in raw_role_text
        requires_adv_degree = _FLAG_ADV_DEGREE in raw_role_text
        is_closed = _FLAG_CLOSED in raw_role_text or _FLAG_CLOSED in c3
        role = _clean_role(raw_role_text)

        if not role or role.lower() == "role":
            i += 1
            continue

        location = _strip_tags(c2)
        apply_url = _cell_apply_url(c3)
        simplify_url = _cell_simplify_url(c3)
        age = _strip_tags(c4)

        results.append(InternshipItem(
            company=company or current_company,
            companyUrl=company_url,
            role=role,
            location=location,
            applyUrl=apply_url,
            simplifyUrl=simplify_url,
            age=age,
            isClosed=is_closed,
            isSubRole=is_sub,
            section=current_section,
            source=source,
            noSponsorship=no_sponsorship,
            requiresCitizenship=requires_citizenship,
            isFaang=is_faang,
            requiresAdvancedDegree=requires_adv_degree,
        ))
        i += 1

    return results


# ── GitHub fetch ───────────────────────────────────────────────────────────────

async def _fetch_all() -> _CacheEntry:
    """Fetch + parse both markdown files. Returns structured data, not raw text."""
    logger.info("Fetching internship data from GitHub…")
    async with httpx.AsyncClient(timeout=40.0, headers=_HTTP_HEADERS, follow_redirects=True) as client:
        responses = await asyncio.gather(
            client.get(GITHUB_URLS["active"]),
            client.get(GITHUB_URLS["off_season"]),
            return_exceptions=True,
        )

    def safe_text(resp: object) -> str:
        if isinstance(resp, Exception):
            logger.error("GitHub fetch error: %s", resp)
            return ""
        if not isinstance(resp, httpx.Response) or resp.status_code != 200:
            logger.error("GitHub bad response: %s", resp)
            return ""
        return resp.text

    active_text = safe_text(responses[0])
    off_season_text = safe_text(responses[1])

    active_items = parse_markdown(active_text, "active")
    off_season_items = parse_markdown(off_season_text, "off-season")

    logger.info(
        "Parsed %d active + %d off-season internships",
        len(active_items),
        len(off_season_items),
    )
    return _CacheEntry(
        active=active_items,
        off_season=off_season_items,
        fetched_at=time.time(),
    )


# ── Auth ───────────────────────────────────────────────────────────────────────

def _check_key(x_internal_key: str) -> None:
    expected = settings.internship_api_key
    if not expected:
        return  # dev mode — open
    if x_internal_key != expected:
        raise HTTPException(status_code=403, detail="Forbidden")


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("")
async def get_internships(x_internal_key: str = Header(default="")) -> JSONResponse:
    """Return cached structured internship data. ~90% smaller than raw markdown."""
    _check_key(x_internal_key)

    global _cache

    now = time.time()
    if _cache is not None and (now - _cache["fetched_at"]) <= _CACHE_TTL:
        age = int(now - _cache["fetched_at"])
        logger.debug("Cache hit (age %ds)", age)
        entry = _cache
    else:
        # Lock prevents multiple concurrent GitHub fetches (cache stampede)
        async with _fetch_lock:
            # Re-check after acquiring lock in case another request already refreshed
            now = time.time()
            if _cache is None or (now - _cache["fetched_at"]) > _CACHE_TTL:
                _cache = await _fetch_all()
            entry = _cache

    return JSONResponse(
        content={
            "active": entry["active"],
            "off_season": entry["off_season"],
            "fetched_at": entry["fetched_at"],
            "counts": {
                "active": len(entry["active"]),
                "off_season": len(entry["off_season"]),
            },
        },
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.delete("/cache")
async def bust_cache(x_internal_key: str = Header(default="")) -> JSONResponse:
    """Manually bust the internship cache."""
    _check_key(x_internal_key)
    global _cache
    _cache = None
    return JSONResponse(content={"message": "Cache cleared"})
