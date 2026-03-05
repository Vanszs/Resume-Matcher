"""Document parsing service using markitdown and LLM."""

import logging
import tempfile
from pathlib import Path
from typing import Any

from markitdown import MarkItDown
from pydantic import ValidationError

from app.llm import complete_json
from app.prompts import PARSE_RESUME_PROMPT
from app.prompts.templates import RESUME_SCHEMA_EXAMPLE
from app.schemas import ResumeData

logger = logging.getLogger(__name__)

# Fields the LLM must not return as null (LLM sometimes does for missing dates etc.)
_SANITIZE_STRING_FIELDS = frozenset({
    "title", "company", "years", "institution", "degree",
    "name", "role", "summary",
})


def _sanitize_resume_dict(data: Any) -> Any:
    """Recursively coerce null → '' on known str-typed fields before Pydantic validation.

    Safety net: even if a field_validator is missing, an LLM-returned null won't
    crash the pipeline.  Covers LinkedIn PDFs where publications have no dates.
    """
    if isinstance(data, dict):
        for key, val in list(data.items()):
            if key in _SANITIZE_STRING_FIELDS and val is None:
                data[key] = ""
            else:
                data[key] = _sanitize_resume_dict(val)
    elif isinstance(data, list):
        data = [_sanitize_resume_dict(item) for item in data]
    return data


async def parse_document(content: bytes, filename: str) -> str:
    """Convert PDF/DOCX to Markdown using markitdown.

    Args:
        content: Raw file bytes
        filename: Original filename for extension detection

    Returns:
        Markdown text content
    """
    suffix = Path(filename).suffix.lower()

    # Write to temp file for markitdown
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        md = MarkItDown()
        result = md.convert(str(tmp_path))
        return result.text_content
    finally:
        tmp_path.unlink(missing_ok=True)


async def parse_resume_to_json(
    markdown_text: str,
    user_id: str | None = None,
) -> dict[str, Any]:
    """Parse resume markdown to structured JSON using LLM.

    Args:
        markdown_text: Resume content in markdown format

    Returns:
        Structured resume data matching ResumeData schema
    """
    prompt = PARSE_RESUME_PROMPT.format(
        schema=RESUME_SCHEMA_EXAMPLE,
        resume_text=markdown_text,
    )

    result = await complete_json(
        prompt=prompt,
        system_prompt="You are a JSON extraction engine. Output only valid JSON, no explanations.",
        user_id=user_id,
    )

    # Coerce null → "" on known string fields (e.g. LinkedIn publications have no dates)
    result = _sanitize_resume_dict(result)

    # Validate against schema
    try:
        validated = ResumeData.model_validate(result)
    except ValidationError as exc:
        logger.warning(
            "ResumeData validation failed (%d error(s)). Top-level keys: %s",
            exc.error_count(),
            list(result.keys()) if isinstance(result, dict) else type(result).__name__,
        )
        raise
    return validated.model_dump()
