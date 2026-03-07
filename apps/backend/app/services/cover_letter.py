"""Cover letter, outreach message, and resume title generation service."""

import json
import logging
import re
from typing import Any

from app.llm import complete
from app.prompts.templates import (
    COVER_LETTER_PROMPT,
    GENERATE_TITLE_PROMPT,
    OUTREACH_MESSAGE_PROMPT,
)
from app.prompts import get_language_name


# ---------------------------------------------------------------------------
# Fix 4: Title validation helpers
# ---------------------------------------------------------------------------

# Regex that matches strings starting with known CoT/reasoning phrases
_TITLE_REJECTION_PATTERN = re.compile(
    r"(?i)^(we need to|let me|i will|i need to|first[,\s]|the description|"
    r"analyzing|looking at|based on|i'll|to extract|sure[,\s]|certainly|okay[,\s]|ok[,\s]|"
    r"the job|here's|here is|alright)"
)


def _is_valid_title(text: str) -> bool:
    """Return True if *text* looks like a genuine job title, not reasoning output.

    Rejects strings that are too long, multi-line, multi-sentence, or that
    start with known CoT/reasoning phrases.
    """
    if not text:
        return False
    if len(text) > 80:
        return False
    # Multi-line → not a title
    if "\n" in text:
        return False
    # Multiple sentence terminators → looks like prose
    if text.count(". ") >= 2:
        return False
    # Starts with a reasoning prefix
    if _TITLE_REJECTION_PATTERN.match(text):
        return False
    return True


def _extract_fallback_title(job_description: str, max_len: int = 60) -> str:
    """Extract a basic fallback title from the raw job description text.

    Iterates lines and returns the first short line that does not look like a
    full sentence — which is typically the position/role header.
    """
    for line in job_description.strip().splitlines():
        cleaned = line.strip().strip("#").strip("*").strip()
        if not cleaned:
            continue
        # Skip lines that look like full sentences (too long or contain period+space)
        if len(cleaned) > max_len or ". " in cleaned:
            continue
        return cleaned[:max_len]
    # Ultimate fallback: first N characters of the description
    return job_description.strip()[:max_len].rstrip()


async def generate_cover_letter(
    resume_data: dict[str, Any],
    job_description: str,
    language: str = "en",
    user_id: str | None = None,
) -> str:
    """Generate a cover letter based on resume and job description.

    Args:
        resume_data: Structured resume data (ResumeData format)
        job_description: Target job description text
        language: Output language code (en, es, zh, ja)

    Returns:
        Generated cover letter as plain text
    """
    output_language = get_language_name(language)

    prompt = COVER_LETTER_PROMPT.format(
        job_description=job_description,
        resume_data=json.dumps(resume_data, indent=2),
        output_language=output_language,
    )

    result = await complete(
        prompt=prompt,
        system_prompt="You are a professional career coach and resume writer. Write compelling, personalized cover letters.",
        user_id=user_id,
        max_tokens=2048,
    )

    return result.strip()


async def generate_outreach_message(
    resume_data: dict[str, Any],
    job_description: str,
    language: str = "en",
    user_id: str | None = None,
) -> str:
    """Generate a cold outreach message for networking.

    Args:
        resume_data: Structured resume data (ResumeData format)
        job_description: Target job description text
        language: Output language code (en, es, zh, ja)

    Returns:
        Generated outreach message as plain text
    """
    output_language = get_language_name(language)

    prompt = OUTREACH_MESSAGE_PROMPT.format(
        job_description=job_description,
        resume_data=json.dumps(resume_data, indent=2),
        output_language=output_language,
    )

    result = await complete(
        prompt=prompt,
        system_prompt="You are a professional networking coach. Write genuine, engaging cold outreach messages.",
        user_id=user_id,
        max_tokens=1024,
    )

    return result.strip()


async def generate_resume_title(
    job_description: str,
    language: str = "en",
    user_id: str | None = None,
) -> str:
    """Generate a short descriptive title from a job description.

    Fix 4: validates the LLM output and falls back to extracting a title
    directly from the job description when the model returns reasoning text.

    Args:
        job_description: Target job description text
        language: Output language code (en, es, zh, ja)

    Returns:
        Generated or extracted title like "Senior Frontend Engineer @ Stripe"
    """
    output_language = get_language_name(language)

    prompt = GENERATE_TITLE_PROMPT.format(
        job_description=job_description,
        output_language=output_language,
    )

    try:
        result = await complete(
            prompt=prompt,
            system_prompt="You extract job titles and company names from job descriptions.",
            user_id=user_id,
            max_tokens=60,
            temperature=0.3,
            reasoning_effort="low",  # Fix 3: minimize CoT for this trivial task
        )

        title = result.strip().strip("\"'")

        if _is_valid_title(title):
            return title[:80]

        # LLM returned reasoning text instead of a title
        logging.warning(
            "Title generation returned non-title text (reasoning leak?), using fallback. "
            "Got: %.100s",
            title,
        )

    except Exception as e:
        logging.warning("Title generation failed: %s — using fallback", e)

    # Fallback: deterministically extract the most title-like line from the JD
    return _extract_fallback_title(job_description)
