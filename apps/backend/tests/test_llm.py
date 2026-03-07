"""Tests for multi-architecture LLM support.

Covers the fixes from docs/plan-robust-reasoning-model-support.md:
  Fix 1  — _is_reasoning_model() / _is_harmony_model()
  Fix 2  — _extract_message_text() Harmony-aware fallback
  Fix 3  — _get_reasoning_effort() with override support
  Fix 4  — generate_resume_title() validation helpers
  Fix 6  — expanded _REASONING_PATTERNS / _is_reasoning_response()
  Fix 7  — frontend sanitizeTitle (tested separately in TS)
"""

import types
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.llm import (
    _extract_message_text,
    _get_reasoning_effort,
    _is_harmony_model,
    _is_reasoning_model,
    _is_reasoning_response,
)
from app.services.cover_letter import (
    _extract_fallback_title,
    _is_valid_title,
)


# ---------------------------------------------------------------------------
# Fix 1 — Model classification
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "model",
    [
        "gpt-oss-120b",
        "gpt-oss-20b",
        "openai/gpt-oss-120b",
        "o1-preview",
        "o3-mini",
        "deepseek-r1",
        "deepseek/deepseek-r1",
        "gpt-5",
        "gpt-5-nano-2025-08-07",
    ],
)
def test_is_reasoning_model_detects_known_models(model: str) -> None:
    assert _is_reasoning_model(model) is True


@pytest.mark.parametrize(
    "model",
    [
        "gpt-4o",
        "gpt-4o-mini",
        "claude-3.5-sonnet",
        "anthropic/claude-3-haiku",
        "gemini-1.5-flash",
        "deepseek-chat",
        "openai/gpt-4-turbo",
        "llama-3",
    ],
)
def test_is_reasoning_model_ignores_standard_models(model: str) -> None:
    assert _is_reasoning_model(model) is False


@pytest.mark.parametrize(
    "model",
    [
        "gpt-oss-120b",
        "gpt-oss-20b",
        "openai/gpt-oss-120b",
    ],
)
def test_is_harmony_model_detects_gptoss(model: str) -> None:
    assert _is_harmony_model(model) is True


@pytest.mark.parametrize(
    "model",
    [
        "deepseek-r1",
        "gpt-5",
        "o1-preview",
        "gpt-4o",
        "claude-3.5-sonnet",
    ],
)
def test_is_harmony_model_ignores_non_harmony(model: str) -> None:
    assert _is_harmony_model(model) is False


# ---------------------------------------------------------------------------
# Fix 2 — _extract_message_text() Harmony-aware fallback
# ---------------------------------------------------------------------------


def _make_message(content: str | None, reasoning_content: str | None = None) -> MagicMock:
    """Build a minimal message mock."""
    msg = MagicMock()
    msg.content = content
    if reasoning_content is not None:
        msg.reasoning_content = reasoning_content
    elif hasattr(msg, "reasoning_content"):
        del msg.reasoning_content
    return msg


def test_extract_message_text_standard_uses_content() -> None:
    msg = _make_message("Hello from standard model")
    result = _extract_message_text(msg, model="gpt-4o")
    assert result == "Hello from standard model"


def test_extract_message_text_harmony_empty_content_returns_none(caplog: pytest.LogCaptureFixture) -> None:
    """Harmony model with empty content must NOT fall back to reasoning_content."""
    msg = _make_message(content=None, reasoning_content="This is CoT analysis text")
    with caplog.at_level("WARNING"):
        result = _extract_message_text(msg, model="gpt-oss-120b")
    assert result is None
    assert "Harmony model" in caplog.text


def test_extract_message_text_deepseek_fallback_to_reasoning_content() -> None:
    """DeepSeek-R1 may legitimately put the answer in reasoning_content."""
    msg = _make_message(content=None, reasoning_content='{"personalInfo": {"name": "Alice"}}')
    result = _extract_message_text(msg, model="deepseek-r1")
    assert result is not None
    assert "Alice" in result


def test_extract_message_text_standard_with_reasoning_content_fallback() -> None:
    """Standard model with empty content but reasoning_content — fallback is used."""
    msg = _make_message(content=None, reasoning_content="fallback text")
    result = _extract_message_text(msg, model="claude-3.5-sonnet")
    assert result == "fallback text"


def test_extract_message_text_harmony_non_empty_content_used() -> None:
    """Harmony model with non-empty content uses it directly, no leak."""
    msg = _make_message(content="Senior Engineer @ Acme")
    result = _extract_message_text(msg, model="gpt-oss-20b")
    assert result == "Senior Engineer @ Acme"


# ---------------------------------------------------------------------------
# Fix 3 — _get_reasoning_effort()
# ---------------------------------------------------------------------------


def test_get_reasoning_effort_gptoss_default_low() -> None:
    assert _get_reasoning_effort("openai", "gpt-oss-120b") == "low"


def test_get_reasoning_effort_gpt5_minimal() -> None:
    assert _get_reasoning_effort("openai", "gpt-5-nano-2025-08-07") == "minimal"


def test_get_reasoning_effort_override_takes_priority() -> None:
    # GPT-OSS default is "low", but override wins
    assert _get_reasoning_effort("openai", "gpt-oss-120b", override="high") == "high"
    assert _get_reasoning_effort("openai", "gpt-5", override="medium") == "medium"


def test_get_reasoning_effort_standard_model_returns_none() -> None:
    assert _get_reasoning_effort("openai", "gpt-4o") is None
    assert _get_reasoning_effort("anthropic", "claude-3.5-sonnet") is None
    assert _get_reasoning_effort("deepseek", "deepseek-chat") is None


def test_get_reasoning_effort_none_override_uses_default() -> None:
    # Explicit None override → falls through to model default
    assert _get_reasoning_effort("openai", "gpt-oss-120b", override=None) == "low"


# ---------------------------------------------------------------------------
# Fix 4 — Title validation helpers
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "title",
    [
        "Senior Frontend Engineer @ Stripe",
        "Software Engineer, ML Platform",
        "Product Manager",
        "Data Scientist - Remote",
        "Full Stack Developer | Fintech",
    ],
)
def test_is_valid_title_accepts_real_titles(title: str) -> None:
    assert _is_valid_title(title) is True


@pytest.mark.parametrize(
    "bad",
    [
        "We need to extract the job title from this description...",
        "Let me analyze the job posting carefully.",
        "I will now extract the position and company.",
        "First, let me read the description to identify the role.",
        "The description mentions the role of Senior Engineer at Acme Corp.",
        "Analyzing the job description to find the title.",
        "Based on the description, the title is Software Engineer.",
        # Too long
        "A" * 81,
        # Multi-line
        "Senior Engineer\n@ Stripe",
        # Multi-sentence
        "This is a job. It is at Stripe. Great company.",
    ],
)
def test_is_valid_title_rejects_bad_input(bad: str) -> None:
    assert _is_valid_title(bad) is False


def test_is_valid_title_rejects_empty() -> None:
    assert _is_valid_title("") is False


def test_extract_fallback_title_returns_first_short_line() -> None:
    jd = "Senior Software Engineer\n\nWe are looking for a talented engineer..."
    result = _extract_fallback_title(jd)
    assert result == "Senior Software Engineer"


def test_extract_fallback_title_skips_long_lines() -> None:
    jd = "We are looking for a talented engineer to join our growing team.\nBackend Engineer @ Acme"
    result = _extract_fallback_title(jd)
    assert result == "Backend Engineer @ Acme"


def test_extract_fallback_title_ultimate_fallback() -> None:
    long_jd = "A" * 200
    result = _extract_fallback_title(long_jd)
    assert len(result) <= 60


# ---------------------------------------------------------------------------
# Fix 6 — _is_reasoning_response() expanded patterns
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "content",
    [
        "We need to extract the title from this job posting.",
        "I need to look at the description carefully.",
        "I will analyze this job description now.",
        "I'll start by reading the job description.",
        "First, let me identify the key requirements.",
        "The description says the position is Software Engineer.",
        "The job description mentions Python and FastAPI.",
        "Looking at the job posting, I can see...",
        "Analyzing the requirements listed in the description.",
        "Based on the job description provided.",
        "Let me extract the relevant information.",
        "Let me identify the company name first.",
        "Let me read the description carefully.",
        "Okay, looking at this posting.",
        "OK, here is what I found.",
        "Alright, let me process this.",
        "Step 1: Read the job description.",
        "**Step 1: Analyze the requirements.**",
        "Sure, here is the title.",
        "Certainly! The position is...",
        "1. **Analyze the job description**",
        "Let me analyze the requirements.",
        "Let me parse the description.",
        # Prose check (3+ sentence terminators, no JSON)
        "This is a job. It requires Python. The company is Acme. Apply now.",
    ],
)
def test_is_reasoning_response_detects_reasoning_text(content: str) -> None:
    assert _is_reasoning_response(content) is True


@pytest.mark.parametrize(
    "content",
    [
        '{"personalInfo": {"name": "Alice"}}',
        '```json\n{"result": "ok"}\n```',
        "Senior Engineer @ Stripe",
        "Product Manager",
    ],
)
def test_is_reasoning_response_passes_valid_content(content: str) -> None:
    assert _is_reasoning_response(content) is False
