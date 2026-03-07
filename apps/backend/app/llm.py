"""LiteLLM wrapper for multi-provider AI support."""

import json
import logging
import re
from typing import Any

import litellm
from pydantic import BaseModel

from app.config import settings

# Drop unsupported params (e.g. reasoning_effort) instead of raising
# UnsupportedParamsError — lets the same config work across model families.
litellm.drop_params = True

# LLM timeout configuration (seconds) - base values
LLM_TIMEOUT_HEALTH_CHECK = 30
LLM_TIMEOUT_COMPLETION = 120
LLM_TIMEOUT_JSON = 180  # JSON completions may take longer

# LLM-004: OpenRouter JSON-capable models (explicit allowlist)
OPENROUTER_JSON_CAPABLE_MODELS = {
    # Anthropic models
    "anthropic/claude-3-opus",
    "anthropic/claude-3-sonnet",
    "anthropic/claude-3-haiku",
    "anthropic/claude-3.5-sonnet",
    "anthropic/claude-3.5-haiku",
    "anthropic/claude-haiku-4-5-20251001",
    "anthropic/claude-sonnet-4-20250514",
    "anthropic/claude-opus-4-20250514",
    # OpenAI models
    "openai/gpt-4-turbo",
    "openai/gpt-4",
    "openai/gpt-4o",
    "openai/gpt-4o-mini",
    "openai/gpt-3.5-turbo",
    "openai/gpt-5-nano-2025-08-07",
    # Google models
    "google/gemini-pro",
    "google/gemini-1.5-pro",
    "google/gemini-1.5-flash",
    "google/gemini-2.0-flash",
    "google/gemini-3-flash-preview",
    # DeepSeek models
    "deepseek/deepseek-chat",
    "deepseek/deepseek-reasoner",
    # Mistral models
    "mistralai/mistral-large",
    "mistralai/mistral-medium",
}

# JSON-010: JSON extraction safety limits
MAX_JSON_EXTRACTION_RECURSION = 10
MAX_JSON_CONTENT_SIZE = 1024 * 1024  # 1MB


class LLMConfig(BaseModel):
    """LLM configuration model."""

    provider: str
    model: str
    api_key: str
    api_base: str | None = None


def _normalize_api_base(provider: str, api_base: str | None) -> str | None:
    """Normalize api_base for LiteLLM provider-specific expectations.

    When using proxies/aggregators, users often paste a base URL that already
    includes a version segment (e.g., `/v1`). Some LiteLLM provider handlers
    append those segments internally, which can lead to duplicated paths like
    `/v1/v1/...` and cause 404s.
    """
    if not api_base:
        return None

    base = api_base.strip()
    if not base:
        return None

    base = base.rstrip("/")

    # Anthropic handler appends '/v1/messages'. If base already ends with '/v1',
    # strip it to avoid '/v1/v1/messages'.
    if provider == "anthropic" and base.endswith("/v1"):
        base = base[: -len("/v1")].rstrip("/")

    # Gemini handler appends '/v1/models/...'. If base already ends with '/v1',
    # strip it to avoid '/v1/v1/models/...'.
    if provider == "gemini" and base.endswith("/v1"):
        base = base[: -len("/v1")].rstrip("/")

    return base or None


def _extract_text_parts(value: Any, depth: int = 0, max_depth: int = 10) -> list[str]:
    """Recursively extract text segments from nested response structures.

    Handles strings, lists, dicts with 'text'/'content'/'value' keys, and objects
    with text/content attributes. Limits recursion depth to avoid cycles.

    Args:
        value: Input value that may contain text in strings, lists, dicts, or objects.
        depth: Current recursion depth.
        max_depth: Maximum recursion depth before returning no content.

    Returns:
        A list of extracted text segments.
    """
    if depth >= max_depth:
        return []

    if value is None:
        return []

    if isinstance(value, str):
        return [value]

    if isinstance(value, list):
        parts: list[str] = []
        next_depth = depth + 1
        for item in value:
            parts.extend(_extract_text_parts(item, next_depth, max_depth))
        return parts

    if isinstance(value, dict):
        next_depth = depth + 1
        if "text" in value:
            return _extract_text_parts(value.get("text"), next_depth, max_depth)
        if "content" in value:
            return _extract_text_parts(value.get("content"), next_depth, max_depth)
        if "value" in value:
            return _extract_text_parts(value.get("value"), next_depth, max_depth)
        return []

    next_depth = depth + 1
    if hasattr(value, "text"):
        return _extract_text_parts(getattr(value, "text"), next_depth, max_depth)
    if hasattr(value, "content"):
        return _extract_text_parts(getattr(value, "content"), next_depth, max_depth)

    return []


def _join_text_parts(parts: list[str]) -> str | None:
    """Join text parts with newlines, filtering empty strings.

    Args:
        parts: Candidate text segments.

    Returns:
        Joined string or None if the result is empty.
    """
    joined = "\n".join(part for part in parts if part).strip()
    return joined or None


def _extract_message_text(message: Any, model: str = "") -> str | None:
    """Extract plain text from a LiteLLM message object across providers.

    Fix 2: model-aware fallback — Harmony models (GPT-OSS) must NOT fall back
    to reasoning_content because that channel contains CoT analysis text, not
    the final answer.  For standard reasoning models (DeepSeek-R1, etc.) the
    fallback is still valid and intentionally preserved.

    Args:
        message: LiteLLM message object or dict.
        model: Full model name as used by LiteLLM (used for Harmony detection).

    Returns:
        Extracted text or None if no usable content is found.
    """
    content: Any = None

    # 1. Try regular content first — works for all model types
    if hasattr(message, "content"):
        content = message.content
    elif isinstance(message, dict):
        content = message.get("content")

    # 2. Conditional fallback to reasoning_content when content is empty
    if not content:
        if _is_harmony_model(model):
            # Harmony models (GPT-OSS): reasoning_content = analysis channel CoT.
            # Using it as the answer would cause reasoning-text leaks.
            logging.warning(
                "Harmony model returned empty content — reasoning_content ignored "
                "to prevent CoT leak. Model: %s",
                model,
            )
            return None

        # Other reasoning models (DeepSeek-R1, GLM, etc.): reasoning_content may
        # legitimately carry the final answer.
        reasoning: Any = None
        if hasattr(message, "reasoning_content"):
            reasoning = message.reasoning_content
        elif isinstance(message, dict):
            reasoning = message.get("reasoning_content")

        if reasoning:
            logging.info("Using reasoning_content fallback for model: %s", model)
            content = reasoning

    return _join_text_parts(_extract_text_parts(content))


def _extract_choice_text(choice: Any, model: str = "") -> str | None:
    """Extract plain text from a LiteLLM choice object.

    Fix 2: accepts model name so _extract_message_text can apply Harmony-aware
    fallback logic.

    Args:
        choice: LiteLLM choice object or dict.
        model: Full model name (passed through to _extract_message_text).

    Returns:
        Extracted text or None if no content is found.
    """
    message: Any = None
    if hasattr(choice, "message"):
        message = choice.message
    elif isinstance(choice, dict):
        message = choice.get("message")

    content = _extract_message_text(message, model=model)
    if content:
        return content

    if hasattr(choice, "text"):
        content = _join_text_parts(_extract_text_parts(getattr(choice, "text")))
        if content:
            return content
    if isinstance(choice, dict) and "text" in choice:
        content = _join_text_parts(_extract_text_parts(choice.get("text")))
        if content:
            return content

    if hasattr(choice, "delta"):
        content = _join_text_parts(_extract_text_parts(getattr(choice, "delta")))
        if content:
            return content
    if isinstance(choice, dict) and "delta" in choice:
        content = _join_text_parts(_extract_text_parts(choice.get("delta")))
        if content:
            return content

    return None


def _to_code_block(content: str | None, language: str = "text") -> str:
    """Wrap content in a markdown code block for client display."""
    text = (content or "").strip()
    if not text:
        text = "<empty>"
    return f"```{language}\n{text}\n```"


def _load_stored_config(user_id: str | None = None) -> dict:
    """Load config from storage.

    If user_id is provided, loads per-user config first and falls back to
    global config for defaults/backward compatibility.
    """
    if user_id:
        user_config_path = settings.config_path.parent / "user_configs" / f"{user_id}.json"
        if user_config_path.exists():
            try:
                return json.loads(user_config_path.read_text())
            except (json.JSONDecodeError, OSError):
                return {}

    config_path = settings.config_path
    if config_path.exists():
        try:
            return json.loads(config_path.read_text())
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def get_llm_config(user_id: str | None = None) -> LLMConfig:
    """Get current LLM configuration.

    Priority: config.json file > environment variables/settings
    """
    stored = _load_stored_config(user_id)

    return LLMConfig(
        provider=stored.get("provider", settings.llm_provider),
        model=stored.get("model", settings.llm_model),
        api_key=stored.get("api_key", settings.llm_api_key),
        api_base=stored.get("api_base", settings.llm_api_base),
    )


def get_model_name(config: LLMConfig) -> str:
    """Convert provider/model to LiteLLM format.

    For most providers, adds the provider prefix if not already present.
    For OpenRouter, always adds 'openrouter/' prefix since OpenRouter models
    use nested prefixes like 'openrouter/anthropic/claude-3.5-sonnet'.
    For OpenAI with custom api_base (e.g., Novita AI, Together AI), adds 'openai/'
    prefix so LiteLLM knows to use OpenAI-compatible protocol.
    """
    provider_prefixes = {
        "openai": "",  # OpenAI models don't need prefix (unless custom api_base)
        "anthropic": "anthropic/",
        "openrouter": "openrouter/",
        "gemini": "gemini/",
        "deepseek": "deepseek/",
        "ollama": "ollama/",
        "novita": "novita/",  # LiteLLM has native Novita AI support
    }

    prefix = provider_prefixes.get(config.provider, "")

    # OpenRouter is special: always add openrouter/ prefix unless already present
    # OpenRouter models use nested format: openrouter/anthropic/claude-3.5-sonnet
    if config.provider == "openrouter":
        if config.model.startswith("openrouter/"):
            return config.model
        return f"openrouter/{config.model}"

    # OpenAI with custom api_base needs explicit prefix for LiteLLM to recognize
    # the protocol (e.g., Novita AI, Together AI, local proxies)
    if config.provider == "openai" and config.api_base:
        if config.model.startswith("openai/"):
            return config.model
        return f"openai/{config.model}"

    # For other providers, don't add prefix if model already has a known prefix
    known_prefixes = ["openrouter/", "anthropic/", "gemini/", "deepseek/", "ollama/", "openai/", "novita/"]
    if any(config.model.startswith(p) for p in known_prefixes):
        return config.model

    # Add provider prefix for models that need it
    return f"{prefix}{config.model}" if prefix else config.model


def _supports_temperature(provider: str, model: str) -> bool:
    """Return whether passing `temperature` is supported for this model/provider combo.

    Some models (e.g., OpenAI gpt-5 family) reject temperature values other than 1,
    and LiteLLM may error when temperature is passed.
    """
    _ = provider
    model_lower = model.lower()
    if "gpt-5" in model_lower:
        return False
    return True


def _get_reasoning_effort(
    provider: str,
    model: str,
    *,
    override: str | None = None,
) -> str | None:
    """Return reasoning_effort value for the given model.

    Fix 3: supports per-call override and GPT-OSS default of 'low'.

    Args:
        provider: LLM provider name (unused — kept for API stability).
        model: Full model name/identifier as used by LiteLLM.
        override: Explicit effort level from the caller (takes priority).

    Returns:
        "low", "medium", "high", "minimal", or None if not applicable.
    """
    # Explicit caller override takes priority over all defaults
    if override:
        return override

    _ = provider
    model_lower = model.lower()

    # GPT-5: needs "minimal" to avoid returning empty content
    if "gpt-5" in model_lower:
        return "minimal"

    # GPT-OSS (Harmony format): default to "low" to reduce CoT verbosity and
    # reasoning_content leak.  Callers that need deeper reasoning can pass
    # override="medium" or override="high".
    if "gpt-oss" in model_lower:
        return "low"

    return None


async def check_llm_health(
    config: LLMConfig | None = None,
    *,
    include_details: bool = False,
    test_prompt: str | None = None,
) -> dict[str, Any]:
    """Check if the LLM provider is accessible and working."""
    if config is None:
        config = get_llm_config()

    # Check if API key is configured (except for Ollama)
    if config.provider != "ollama" and not config.api_key:
        return {
            "healthy": False,
            "provider": config.provider,
            "model": config.model,
            "error_code": "api_key_missing",
        }

    model_name = get_model_name(config)

    prompt = test_prompt or "Hi"

    try:
        # Make a minimal test call with timeout
        # Pass API key directly to avoid race conditions with global os.environ
        kwargs: dict[str, Any] = {
            "model": model_name,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 1000,  # 16 was too small for reasoning models (o1, o3-mini)
            "api_key": config.api_key,
            "api_base": _normalize_api_base(config.provider, config.api_base),
            "timeout": LLM_TIMEOUT_HEALTH_CHECK,
        }
        reasoning_effort = _get_reasoning_effort(config.provider, model_name, override="low")
        if reasoning_effort:
            kwargs["reasoning_effort"] = reasoning_effort

        response = await litellm.acompletion(**kwargs)
        content = _extract_choice_text(response.choices[0], model=model_name)
        if not content:
            # LLM-003: Empty response should mark health check as unhealthy
            logging.warning(
                "LLM health check returned empty content",
                extra={"provider": config.provider, "model": config.model},
            )
            result: dict[str, Any] = {
                "healthy": False,  # Fixed: empty content means unhealthy
                "provider": config.provider,
                "model": config.model,
                "response_model": response.model if response else None,
                "error_code": "empty_content",  # Changed from warning_code
                "message": "LLM returned empty response",
            }
            if include_details:
                result["test_prompt"] = _to_code_block(prompt)
                result["model_output"] = _to_code_block(None)
            return result

        result = {
            "healthy": True,
            "provider": config.provider,
            "model": config.model,
            "response_model": response.model if response else None,
        }
        if include_details:
            result["test_prompt"] = _to_code_block(prompt)
            result["model_output"] = _to_code_block(content)
        return result
    except Exception as e:
        # Log full exception details server-side, but do not expose them to clients
        logging.exception(
            "LLM health check failed",
            extra={"provider": config.provider, "model": config.model},
        )

        # Provide a minimal, actionable client-facing hint without leaking secrets.
        error_code = "health_check_failed"
        message = str(e)
        if "404" in message and "/v1/v1/" in message:
            error_code = "duplicate_v1_path"
        elif "404" in message:
            error_code = "not_found_404"
        elif "<!doctype html" in message.lower() or "<html" in message.lower():
            error_code = "html_response"
        result = {
            "healthy": False,
            "provider": config.provider,
            "model": config.model,
            "error_code": error_code,
        }
        if include_details:
            result["test_prompt"] = _to_code_block(prompt)
            result["model_output"] = _to_code_block(None)
            result["error_detail"] = _to_code_block(message)
        return result


async def complete(
    prompt: str,
    system_prompt: str | None = None,
    config: LLMConfig | None = None,
    user_id: str | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.7,
    reasoning_effort: str | None = None,
) -> str:
    """Make a completion request to the LLM.

    Fix 3: accepts reasoning_effort override so callers can tune CoT verbosity
    per task (e.g., "low" for trivial title extraction).
    Fix 5: logs a warning when a reasoning model returns reasoning-style prose.
    """
    if config is None:
        config = get_llm_config(user_id)

    model_name = get_model_name(config)

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    try:
        # Pass API key directly to avoid race conditions with global os.environ
        kwargs: dict[str, Any] = {
            "model": model_name,
            "messages": messages,
            "max_tokens": max_tokens,
            "api_key": config.api_key,
            "api_base": _normalize_api_base(config.provider, config.api_base),
            "timeout": LLM_TIMEOUT_COMPLETION,
        }
        if _supports_temperature(config.provider, model_name):
            kwargs["temperature"] = temperature
        effort = _get_reasoning_effort(config.provider, model_name, override=reasoning_effort)
        if effort:
            kwargs["reasoning_effort"] = effort

        response = await litellm.acompletion(**kwargs)

        content = _extract_choice_text(response.choices[0], model=model_name)
        if not content:
            raise ValueError("Empty response from LLM")

        # Fix 5: log a warning when reasoning model leaks CoT into plain-text output
        if _is_reasoning_model(model_name) and _is_reasoning_response(content):
            logging.warning(
                "complete() received reasoning-style response from %s. "
                "Content preview: %s",
                model_name,
                content[:200],
            )

        return content
    except (
        litellm.exceptions.RateLimitError,
        litellm.exceptions.AuthenticationError,
        litellm.exceptions.ServiceUnavailableError,
        litellm.exceptions.Timeout,
        litellm.exceptions.BadRequestError,
    ):
        # Re-raise known LiteLLM exceptions so callers can detect their type.
        # _raise_improve_error() handles each of these with a specific HTTP status.
        raise
    except Exception as e:
        # Log the actual error server-side for debugging
        logging.error(f"LLM completion failed: {e}", extra={"model": model_name})
        raise ValueError(
            "LLM completion failed. Please check your API configuration and try again."
        ) from e


def _supports_json_mode(provider: str, model: str) -> bool:
    """Check if the model supports JSON mode."""
    # Models that support response_format={"type": "json_object"}
    json_mode_providers = ["openai", "anthropic", "gemini", "deepseek", "novita"]
    if provider in json_mode_providers:
        return True
    # LLM-004: OpenRouter models - use explicit allowlist instead of substring matching
    if provider == "openrouter":
        return model in OPENROUTER_JSON_CAPABLE_MODELS
    return False


# LLM-FIX-005: Known single-key envelope names some models wrap their response in
_JSON_ENVELOPE_KEYS = frozenset({
    "final", "final_resume", "resume", "result", "output",
    "response", "json", "data", "content", "answer",
})


def _unwrap_json_envelope(data: dict[str, Any]) -> dict[str, Any]:
    """Unwrap single-key envelope dicts returned by some models.

    Some models respond with {"final_resume": {<actual resume>}} instead of the
    resume dict directly.  Only unwrap when ALL conditions hold:
      1. Exactly one top-level key.
      2. Key name is a known envelope word.
      3. The value is a dict that contains 'personalInfo' (resume fingerprint).

    This is intentionally narrow to avoid unwrapping legitimate resume keys.
    """
    if not isinstance(data, dict) or len(data) != 1:
        return data

    (key, value) = next(iter(data.items()))
    if key.lower() not in _JSON_ENVELOPE_KEYS:
        return data
    if not isinstance(value, dict):
        return data
    if "personalInfo" not in value:
        return data

    logging.info("Unwrapped JSON envelope key '%s'", key)
    return value


def _appears_truncated(data: dict) -> bool:
    """LLM-001: Heuristic check for truncated JSON responses.

    Only applies to resume-shaped dicts. The authoritative truncation check
    lives in improver._check_for_truncation() which raises on missing sections.
    """
    if not isinstance(data, dict):
        return False

    # Only check resume-shaped responses (must have at least one resume key)
    _RESUME_KEYS = {"personalInfo", "workExperience", "summary", "sectionMeta"}
    if not _RESUME_KEYS.intersection(data.keys()):
        return False

    # Missing personalInfo is the strongest truncation signal
    if "personalInfo" not in data:
        logging.warning(
            "Possible truncation detected: missing required section 'personalInfo'",
        )

# --- Model classification helpers (Fix 1) ---

# Known reasoning model name fragments (case-insensitive substring match)
_REASONING_MODEL_PATTERNS: tuple[str, ...] = (
    "gpt-oss",      # GPT-OSS-120B, GPT-OSS-20B (Harmony format)
    "o1",           # OpenAI o1 family
    "o3",           # OpenAI o3 family
    "deepseek-r1",  # DeepSeek R1 (CoT in reasoning_content)
    "gpt-5",        # GPT-5 family (needs reasoning_effort)
)

# Models that use Harmony multi-channel format specifically
_HARMONY_MODEL_PATTERNS: tuple[str, ...] = (
    "gpt-oss",
)


def _is_reasoning_model(model: str) -> bool:
    """Return True if model is a known reasoning/CoT model."""
    model_lower = model.lower()
    return any(p in model_lower for p in _REASONING_MODEL_PATTERNS)


def _is_harmony_model(model: str) -> bool:
    """Return True if model uses Harmony multi-channel format (e.g. GPT-OSS).

    In Harmony format, reasoning_content contains the *analysis channel* (CoT
    thinking text), NOT the final answer.  We must NOT fall back to it.
    """
    model_lower = model.lower()
    return any(p in model_lower for p in _HARMONY_MODEL_PATTERNS)


# --- Reasoning-pattern detection (Fix 6 — expanded) ---

# Patterns indicating a reasoning model is "thinking" instead of outputting JSON
_REASONING_PATTERNS = (
    # Original patterns
    "1.  **Analyze",
    "1. **Analyze",
    "**Analyze the Request",
    "*   **Goal",
    "* **Goal",
    "Let me analyze",
    "Let me parse",
    "Sure, here",
    "Certainly!",
    # GPT-OSS-120B specific patterns
    "We need to",
    "I need to",
    "I will ",
    "I'll ",
    "First,",
    "First ",
    "The description",
    "The job description",
    "Looking at",
    "Analyzing ",
    "Based on ",
    "Let me extract",
    "Let me identify",
    "Let me read",
    "To extract",
    "To answer",
    "Here's my",
    "Here is my",
    "Okay,",
    "OK,",
    "Alright,",
    # Generic reasoning starters
    "Step 1",
    "**Step 1",
    "So,",
    "Now,",
    "Think",
)


def _is_reasoning_response(content: str) -> bool:
    """Detect if LLM response is reasoning/thinking text instead of JSON.

    Fix 6: expanded checks — also catches mid-text reasoning and clear prose.
    """
    stripped = content.strip()

    # Check 1: starts with a known reasoning pattern
    if any(stripped.startswith(p) for p in _REASONING_PATTERNS):
        return True

    # Check 2: doesn't start with JSON/code-block but contains reasoning early on
    if not stripped.startswith(("{", "[", "```")):
        if "json" not in stripped[:50].lower():
            if any(p in stripped[:300] for p in _REASONING_PATTERNS):
                return True

    # Check 3: clearly prose — multiple sentence terminators and no JSON structure
    first_200 = stripped[:200]
    if first_200.count(". ") >= 3 and "{" not in first_200:
        return True

    return False


def _extract_json(content: str, _depth: int = 0) -> str:
    """Extract JSON from LLM response, handling various formats.

    LLM-001: Improved to detect and reject likely truncated JSON.
    LLM-007: Improved error messages for debugging.
    JSON-010: Added recursion depth and size limits.
    B1: Handle reasoning model responses that wrap JSON in prose.
    """
    # JSON-010: Safety limits
    if _depth > MAX_JSON_EXTRACTION_RECURSION:
        raise ValueError(f"JSON extraction exceeded max recursion depth: {_depth}")
    if len(content) > MAX_JSON_CONTENT_SIZE:
        raise ValueError(f"Content too large for JSON extraction: {len(content)} bytes")

    original = content

    # Remove markdown code blocks
    if "```json" in content:
        content = content.split("```json")[1].split("```")[0]
    elif "```" in content:
        parts = content.split("```")
        if len(parts) >= 2:
            content = parts[1]
            # Remove language identifier if present (e.g., "json\n{...")
            if content.startswith(("json", "JSON")):
                content = content[4:]

    content = content.strip()

    # If content starts with {, find the matching }
    if content.startswith("{"):
        depth = 0
        end_idx = -1
        in_string = False
        escape_next = False

        for i, char in enumerate(content):
            if escape_next:
                escape_next = False
                continue
            if char == "\\":
                escape_next = True
                continue
            if char == '"' and not escape_next:
                in_string = not in_string
                continue
            if in_string:
                continue
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    end_idx = i
                    break

        # LLM-001: Check for unbalanced braces - loop ended without depth reaching 0
        if end_idx == -1 and depth != 0:
            logging.warning(
                "JSON extraction found unbalanced braces (depth=%d), possible truncation",
                depth,
            )

        if end_idx != -1:
            return content[: end_idx + 1]

    # Try to find JSON object in the content (only if not already at start)
    start_idx = content.find("{")
    if start_idx > 0:
        # Only recurse if { is found after position 0 to avoid infinite recursion
        return _extract_json(content[start_idx:], _depth + 1)

    # LLM-007: Log unrecognized format for debugging
    logging.error(
        "Could not extract JSON from response format. Content preview: %s",
        content[:200] if content else "<empty>",
    )
    raise ValueError(f"No JSON found in response: {original[:200]}")


async def complete_json(
    prompt: str,
    system_prompt: str | None = None,
    config: LLMConfig | None = None,
    user_id: str | None = None,
    max_tokens: int = 15000,
    retries: int = 2,
    reasoning_effort: str | None = None,
) -> dict[str, Any]:
    """Make a completion request expecting JSON response.

    Uses JSON mode when available, with retry logic for reliability.
    Fix 3: accepts reasoning_effort override for per-call CoT control.
    """
    if config is None:
        config = get_llm_config(user_id)

    model_name = get_model_name(config)

    # Build messages
    json_system = (
        system_prompt or ""
    ) + "\n\nYou must respond with valid JSON only. No explanations, no markdown."
    messages = [
        {"role": "system", "content": json_system},
        {"role": "user", "content": prompt},
    ]

    # Check if we can use JSON mode
    use_json_mode = _supports_json_mode(config.provider, config.model)

    last_error = None
    for attempt in range(retries + 1):
        content: str | None = None  # reset per attempt; used in retry hint detection
        try:
            # Build request kwargs
            # Pass API key directly to avoid race conditions with global os.environ
            kwargs: dict[str, Any] = {
                "model": model_name,
                "messages": messages,
                "max_tokens": max_tokens,
                "api_key": config.api_key,
                "api_base": _normalize_api_base(config.provider, config.api_base),
                "timeout": _calculate_timeout("json", max_tokens, config.provider),
            }
            if _supports_temperature(config.provider, model_name):
                # LLM-002: Increase temperature on retry for variation
                kwargs["temperature"] = _get_retry_temperature(attempt)
            effort = _get_reasoning_effort(config.provider, model_name, override=reasoning_effort)
            if effort:
                kwargs["reasoning_effort"] = effort

            # Add JSON mode if supported
            if use_json_mode:
                kwargs["response_format"] = {"type": "json_object"}

            response = await litellm.acompletion(**kwargs)
            content = _extract_choice_text(response.choices[0], model=model_name)

            if not content:
                raise ValueError("Empty response from LLM")

            logging.debug(f"LLM response (attempt {attempt + 1}): {content[:300]}")

            # Extract and parse JSON
            json_str = _extract_json(content)
            result = json.loads(json_str)

            # LLM-FIX-005: Unwrap single-key envelope before truncation check
            if isinstance(result, dict):
                result = _unwrap_json_envelope(result)

            # LLM-001: Check if parsed result appears truncated
            if isinstance(result, dict) and _appears_truncated(result):
                logging.warning(
                    "Parsed JSON appears truncated, but proceeding with result"
                )

            return result

        except (json.JSONDecodeError, ValueError) as e:
            last_error = e
            logging.warning(f"JSON parse failed (attempt {attempt + 1}): {e}")
            if attempt < retries:
                # B2: Detect reasoning patterns and use stronger retry hint
                # content is always assigned before any JSONDecodeError/ValueError is raised
                prev_content: str = content if isinstance(content, str) else ""
                is_reasoning = _is_reasoning_response(prev_content) if prev_content else False
                if is_reasoning:
                    logging.warning(
                        "Reasoning model detected: upgrading retry hint to critical JSON-only prompt"
                    )
                    messages[-1]["content"] = (
                        prompt
                        + "\n\nCRITICAL: You MUST output ONLY raw JSON. "
                        + "Do NOT include any analysis, thinking, explanation, or prose. "
                        + "Your ENTIRE response must start with { and end with }. "
                        + "Nothing before {, nothing after }."
                    )
                else:
                    messages[-1]["content"] = (
                        prompt
                        + "\n\nIMPORTANT: Output ONLY a valid JSON object. Start with { and end with }."
                    )
                continue
            raise ValueError(
                f"Failed to parse JSON after {retries + 1} attempts: {e}. "
                "This can happen with reasoning-focused models. "
                "Try switching to a standard model (e.g., gpt-4o, claude-3.5-sonnet) in Settings."
            )

        except Exception as e:
            last_error = e
            logging.warning(f"LLM call failed (attempt {attempt + 1}): {e}")
            # Never retry: authentication failures, timeouts (already over budget),
            # or rate-limit errors (no built-in delay means immediate retry is pointless).
            if isinstance(
                e,
                (
                    litellm.exceptions.AuthenticationError,
                    litellm.exceptions.Timeout,
                    litellm.exceptions.RateLimitError,
                ),
            ):
                raise
            if attempt < retries:
                continue
            raise

    raise ValueError(f"Failed after {retries + 1} attempts: {last_error}")
