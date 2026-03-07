# Plan: Robust Multi-Architecture LLM Support

> **Date**: 2026-03-07
> **Status**: Plan — no code changes
> **Scope**: Make all LLM calls (`complete()`, `complete_json()`) work reliably across 3 model archetypes: standard, reasoning (Harmony/CoT), and JSON-native models — without regressions.

---

## Table of Contents

1. [Problem Summary](#1-problem-summary)
2. [Model Architecture Matrix](#2-model-architecture-matrix)
3. [Current Code Gaps](#3-current-code-gaps)
4. [Fix Plan Overview](#4-fix-plan-overview)
5. [Fix 1: Reasoning Model Detection](#fix-1-reasoning-model-detection)
6. [Fix 2: Content Extraction — Reasoning Leak Prevention](#fix-2-content-extraction--reasoning-leak-prevention)
7. [Fix 3: Reasoning Effort Routing](#fix-3-reasoning-effort-routing)
8. [Fix 4: Title Generation Hardening](#fix-4-title-generation-hardening)
9. [Fix 5: complete() Reasoning Awareness](#fix-5-complete-reasoning-awareness)
10. [Fix 6: complete_json() Reasoning Patterns Expansion](#fix-6-complete_json-reasoning-patterns-expansion)
11. [Fix 7: Frontend Title Sanitization](#fix-7-frontend-title-sanitization)
12. [Compatibility Matrix](#compatibility-matrix)
13. [Testing Plan](#testing-plan)
14. [Risk Assessment](#risk-assessment)
15. [Implementation Order](#implementation-order)

---

## 1. Problem Summary

### Observed Bug
Tailored resume title shows raw LLM reasoning text:
> *"We need to extract job title and company name. The description mentions 'Collabo..."*

### Root Cause Chain
GPT-OSS-120B is a **reasoning model with Harmony format**. It frequently puts its actual answer inside `reasoning_content` instead of `content`, or leaks Chain-of-Thought text into the output. The current codebase:

1. Falls back to `reasoning_content` when `content` is empty — intended for DeepSeek-R1 but causes reasoning leak on GPT-OSS
2. Does not send `reasoning_effort` for GPT-OSS models — only handles `gpt-5`
3. Has no output validation on `generate_resume_title()` — reasoning text stored as-is
4. Has no model-class awareness — treats all models identically

### Affected LLM Callers

| Caller | Function | Risk |
|--------|----------|------|
| `services/cover_letter.py` | `generate_resume_title()` | **HIGH** — reasoning text displayed as title |
| `services/cover_letter.py` | `generate_cover_letter()` | MEDIUM — reasoning text in cover letter |
| `services/cover_letter.py` | `generate_outreach_message()` | MEDIUM — reasoning text in outreach |
| `services/parser.py` | `parse_resume_to_json()` | LOW — `complete_json()` has retry logic |
| `services/improver.py` | `improve_resume()` | LOW — `complete_json()` has retry logic |
| `services/refiner.py` | `inject_keywords()` etc. | LOW — `complete_json()` has retry logic |
| `routers/enrichment.py` | various | LOW — `complete_json()` has retry logic |

---

## 2. Model Architecture Matrix

Three archetypes the system must support simultaneously:

### Type A: Standard Models (non-reasoning)
- **Examples**: GPT-4o, GPT-4o-mini, Claude 3.5 Sonnet/Haiku, Gemini Flash, DeepSeek-Chat
- **Behavior**: Response in `message.content`, no reasoning channel
- **JSON mode**: Usually supported natively
- **Temperature**: Supported
- **Current support**: ✅ Works well

### Type B: Reasoning Models with Harmony Format
- **Examples**: GPT-OSS-120B, GPT-OSS-20B
- **Behavior**: Multi-channel output (analysis + final). Often puts answer in `reasoning_content` instead of `content`. Leaks CoT text. `max_tokens=60` not sufficient guard.
- **JSON mode**: Partially supported — wraps in envelope keys, may truncate
- **Temperature**: Supported
- **reasoning_effort**: `low`/`medium`/`high` — controls CoT verbosity
- **Current support**: ❌ Broken — reasoning leaks, no effort control

### Type C: Reasoning Models with CoT Format
- **Examples**: DeepSeek-R1, GPT-5 family, o1/o3-mini
- **Behavior**: `content` may be empty, answer in `reasoning_content`. Some reject temperature.
- **JSON mode**: Not reliable
- **Temperature**: GPT-5 rejects non-1 values. DeepSeek may ignore.
- **reasoning_effort**: GPT-5 needs `"minimal"` to avoid empty content
- **Current support**: ⚠️ Partially handled — DeepSeek-R1 fallback works, GPT-5 temp handled

---

## 3. Current Code Gaps

### Gap 1: `_get_reasoning_effort()` — Only handles GPT-5
**File**: `apps/backend/app/llm.py` line 326-336

```python
def _get_reasoning_effort(provider: str, model: str) -> str | None:
    model_lower = model.lower()
    if "gpt-5" in model_lower:
        return "minimal"
    return None  # ← GPT-OSS returns None!
```

**Impact**: GPT-OSS-120B runs at default `medium` reasoning effort for ALL calls, including simple title extraction. More reasoning = more leak risk.

### Gap 2: `_extract_message_text()` — Blind reasoning_content fallback
**File**: `apps/backend/app/llm.py` line 155-176

```python
# If content is empty, check reasoning_content (for reasoning models)
if not content:
    if hasattr(message, "reasoning_content"):
        content = message.reasoning_content
```

**Impact**: When GPT-OSS puts answer in `reasoning_content`, this fallback grabs it — but the "answer" is raw CoT reasoning text, not the actual final output. No way to distinguish legitimate `reasoning_content` answer (DeepSeek-R1) from leaked CoT (GPT-OSS).

### Gap 3: `generate_resume_title()` — No output validation
**File**: `apps/backend/app/services/cover_letter.py` line 83-115

```python
title = result.strip().strip("\"'")
return title[:80]
```

**Impact**: Any text up to 80 chars is accepted as a valid title. Reasoning text like *"We need to extract job title..."* passes through.

### Gap 4: `_is_reasoning_response()` — Only covers `complete_json()`
**File**: `apps/backend/app/llm.py` line 639-651

**Impact**: Reasoning detection only triggers inside `complete_json()`. The `complete()` function (used by title/cover letter/outreach) has zero reasoning detection.

### Gap 5: `_REASONING_PATTERNS` — Incomplete pattern list
**File**: `apps/backend/app/llm.py` line 625-637

**Impact**: Patterns like `"We need to"`, `"First,"`, `"The description"`, `"I will"` are not in the list. GPT-OSS-120B uses these frequently.

### Gap 6: No per-call reasoning effort control
**Impact**: The reasoning effort is determined globally by model name. Title generation (trivial task) and resume improvement (complex task) get the same reasoning effort.

### Gap 7: Frontend displays title without sanitization
**File**: `apps/frontend/app/(default)/resumes/[id]/page.tsx` line 510-540

**Impact**: Raw reasoning text rendered as `<h2>` heading.

---

## 4. Fix Plan Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     FIX ARCHITECTURE                        │
│                                                             │
│  Fix 1: _is_reasoning_model() detector                     │
│    └─ Identifies Type B/C models from model name            │
│                                                             │
│  Fix 2: _extract_message_text() smart fallback              │
│    └─ Uses model-class info to decide reasoning_content     │
│       extraction strategy                                   │
│                                                             │
│  Fix 3: _get_reasoning_effort() expanded                    │
│    └─ Supports per-call effort override + GPT-OSS detection │
│                                                             │
│  Fix 4: generate_resume_title() validation                  │
│    └─ Output validation + fallback title extraction         │
│                                                             │
│  Fix 5: complete() gets reasoning awareness                 │
│    └─ Logs warnings, strips CoT markers from plain text     │
│                                                             │
│  Fix 6: _REASONING_PATTERNS expansion                       │
│    └─ Broader pattern set for GPT-OSS-style CoT             │
│                                                             │
│  Fix 7: Frontend title sanitization                         │
│    └─ Max display length + format validation                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Fix 1: Reasoning Model Detection

### Goal
Create a single source of truth for identifying reasoning models, so all downstream code can branch behavior.

### File: `apps/backend/app/llm.py`

### Design

```python
# --- Model classification ---

# Known reasoning model name fragments (case-insensitive substring match)
_REASONING_MODEL_PATTERNS = (
    "gpt-oss",       # GPT-OSS-120B, GPT-OSS-20B (Harmony format)
    "o1",            # OpenAI o1 family
    "o3",            # OpenAI o3 family
    "deepseek-r1",   # DeepSeek R1 (CoT in reasoning_content)
    "gpt-5",         # GPT-5 family (may need reasoning_effort)
)

# Models that use Harmony multi-channel format specifically
_HARMONY_MODEL_PATTERNS = (
    "gpt-oss",
)


def _is_reasoning_model(model: str) -> bool:
    """Check if the model is a known reasoning model."""
    model_lower = model.lower()
    return any(p in model_lower for p in _REASONING_MODEL_PATTERNS)


def _is_harmony_model(model: str) -> bool:
    """Check if the model uses Harmony multi-channel format (GPT-OSS)."""
    model_lower = model.lower()
    return any(p in model_lower for p in _HARMONY_MODEL_PATTERNS)
```

### Why Two Functions
- `_is_reasoning_model()` — broad detection: any model that may produce CoT
- `_is_harmony_model()` — specific to Harmony format: GPT-OSS models that split output into analysis/final channels

### Regression Risk: NONE
Pure addition — no existing code paths changed. New functions used only by subsequent fixes.

---

## Fix 2: Content Extraction — Reasoning Leak Prevention

### Goal
Prevent `_extract_message_text()` from returning raw CoT reasoning text when `content` is empty. For Harmony models, `reasoning_content` contains the analysis channel CoT — not the answer.

### File: `apps/backend/app/llm.py`, function `_extract_message_text()`

### Current Code (Problem)

```python
def _extract_message_text(message: Any) -> str | None:
    content: Any = None
    if hasattr(message, "content"):
        content = message.content
    elif isinstance(message, dict):
        content = message.get("content")

    # ← PROBLEM: blindly falls back to reasoning_content
    if not content:
        if hasattr(message, "reasoning_content"):
            content = message.reasoning_content
        elif isinstance(message, dict):
            content = message.get("reasoning_content")

    return _join_text_parts(_extract_text_parts(content))
```

### Proposed Change

Refactor `_extract_message_text` to accept an optional `model` parameter. When model is a Harmony model, **do NOT fall back to `reasoning_content`** — that channel contains CoT, not the answer. For other reasoning models (DeepSeek-R1), keep the fallback.

```python
def _extract_message_text(message: Any, model: str = "") -> str | None:
    content: Any = None

    # 1. Try regular content first (works for all model types)
    if hasattr(message, "content"):
        content = message.content
    elif isinstance(message, dict):
        content = message.get("content")

    # 2. If content is empty, conditional fallback to reasoning_content
    if not content:
        # Harmony models (GPT-OSS): reasoning_content = analysis channel CoT
        # Do NOT use it as the answer — it's thinking text, not output.
        if _is_harmony_model(model):
            logging.warning(
                "Harmony model returned empty content — reasoning_content ignored "
                "to prevent CoT leak. Model: %s",
                model,
            )
            # Return None → caller should treat as empty/failed response
            return None

        # Other reasoning models (DeepSeek-R1, etc.): reasoning_content
        # may legitimately contain the answer
        if hasattr(message, "reasoning_content"):
            reasoning = message.reasoning_content
        elif isinstance(message, dict):
            reasoning = message.get("reasoning_content")
        else:
            reasoning = None

        if reasoning:
            logging.info(
                "Using reasoning_content fallback for model: %s", model
            )
            content = reasoning

    return _join_text_parts(_extract_text_parts(content))
```

### Threading `model` Through the Call Chain

`_extract_message_text()` is called by `_extract_choice_text()` which is called in:
- `complete()` — has `model_name` in scope
- `complete_json()` — has `model_name` in scope
- `check_llm_health()` — has `model_name` in scope

**Change `_extract_choice_text` signature**:

```python
def _extract_choice_text(choice: Any, model: str = "") -> str | None:
    # ... existing logic ...
    content = _extract_message_text(message, model=model)
    # ...
```

**Update all 3 callers**:

```python
# In complete():
content = _extract_choice_text(response.choices[0], model=model_name)

# In complete_json():
content = _extract_choice_text(response.choices[0], model=model_name)

# In check_llm_health():
content = _extract_choice_text(response.choices[0], model=model_name)
```

### Regression Risk: LOW
- DeepSeek-R1, GLM: unchanged — not Harmony models, still get `reasoning_content` fallback
- GPT-5: unchanged — not Harmony model
- Standard models: unchanged — never have `reasoning_content`
- GPT-OSS: **FIXED** — empty content now returns `None` instead of CoT text
  - `complete()` will raise `ValueError("Empty response from LLM")` → caller handles gracefully
  - `complete_json()` will retry with stronger prompt hint

### Edge Case: What if GPT-OSS returns empty content AND the Harmony final channel is in reasoning_content?
Per documented behavior (HuggingFace issue #133, Groq bug reports), GPT-OSS's `reasoning_content` contains the **analysis channel** (thinking), not the final channel. The final answer either goes in `content` or gets lost. If the final channel is truly empty, retrying is the correct behavior — not salvaging CoT text.

---

## Fix 3: Reasoning Effort Routing

### Goal
Send appropriate `reasoning_effort` for reasoning models, with per-call override support.

### File: `apps/backend/app/llm.py`

### Current Code (Problem)

```python
def _get_reasoning_effort(provider: str, model: str) -> str | None:
    _ = provider
    model_lower = model.lower()
    if "gpt-5" in model_lower:
        return "minimal"
    return None
```

### Proposed Change

```python
def _get_reasoning_effort(
    provider: str,
    model: str,
    *,
    override: str | None = None,
) -> str | None:
    """Return reasoning_effort for the model.

    Args:
        provider: LLM provider name
        model: Model name/identifier
        override: Explicit effort level from caller (takes priority)

    Returns:
        "low", "medium", "high", "minimal", or None
    """
    # Explicit caller override takes priority
    if override:
        return override

    _ = provider
    model_lower = model.lower()

    # GPT-5: needs "minimal" to avoid empty content
    if "gpt-5" in model_lower:
        return "minimal"

    # GPT-OSS (Harmony): default to "low" to reduce CoT verbosity
    # and reasoning_content leak. Callers needing deeper reasoning
    # can pass override="medium" or override="high".
    if "gpt-oss" in model_lower:
        return "low"

    return None
```

### Add `reasoning_effort` parameter to `complete()` and `complete_json()`

```python
async def complete(
    prompt: str,
    system_prompt: str | None = None,
    config: LLMConfig | None = None,
    user_id: str | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.7,
    reasoning_effort: str | None = None,  # ← NEW
) -> str:
```

```python
async def complete_json(
    prompt: str,
    system_prompt: str | None = None,
    config: LLMConfig | None = None,
    user_id: str | None = None,
    max_tokens: int = 15000,
    retries: int = 2,
    reasoning_effort: str | None = None,  # ← NEW
) -> dict[str, Any]:
```

Inside both functions, pass `override` to `_get_reasoning_effort()`:

```python
effort = _get_reasoning_effort(config.provider, model_name, override=reasoning_effort)
if effort:
    kwargs["reasoning_effort"] = effort
```

### Caller-Specific Effort Levels

| Caller | Task Complexity | reasoning_effort |
|--------|----------------|------------------|
| `generate_resume_title()` | Trivial | `"low"` (default for GPT-OSS, explicit for safety) |
| `generate_cover_letter()` | Medium | `None` (use model default) |
| `generate_outreach_message()` | Medium | `None` (use model default) |
| `parse_resume_to_json()` | Medium | `None` (use model default) |
| `improve_resume()` | Complex | `None` (use model default, could pass `"medium"`) |
| `inject_keywords()` | Medium | `None` (use model default) |
| `check_llm_health()` | Trivial | `"low"` (explicit) |

### Regression Risk: LOW
- New parameter defaults to `None` → no change for existing callers
- GPT-OSS now gets `"low"` by default → reduces CoT, less reasoning leak
- GPT-5 unchanged → still gets `"minimal"`
- Standard models unchanged → `None` → no `reasoning_effort` sent
- If a provider rejects `reasoning_effort`, LiteLLM already handles unsupported params gracefully

---

## Fix 4: Title Generation Hardening

### Goal
Ensure `generate_resume_title()` never returns CoT/reasoning text as a title. Add validation and fallback.

### File: `apps/backend/app/services/cover_letter.py`

### Current Code (Problem)

```python
result = await complete(
    prompt=prompt,
    system_prompt="You extract job titles and company names from job descriptions.",
    user_id=user_id,
    max_tokens=60,
    temperature=0.3,
)
title = result.strip().strip("\"'")
return title[:80]
```

### Proposed Change

```python
import re

# Patterns indicating CoT/reasoning text, not a title
_TITLE_REJECTION_PATTERNS = re.compile(
    r"(?i)^(we need to|let me|i will|i need to|first|the description|"
    r"analyzing|looking at|based on|here is|sure|okay|the job)"
)

def _extract_fallback_title(job_description: str, max_len: int = 60) -> str:
    """Extract a basic fallback title from raw job description text.

    Takes the first meaningful line that looks like a job title
    (short, no full sentences).
    """
    for line in job_description.strip().splitlines():
        cleaned = line.strip().strip("#").strip("*").strip()
        if not cleaned:
            continue
        # Skip lines that look like sentences (have periods, very long)
        if len(cleaned) > max_len or ". " in cleaned:
            continue
        # First short-ish line is likely the title/header
        return cleaned[:max_len]
    # Ultimate fallback: first N chars
    return job_description.strip()[:max_len].rstrip()


def _is_valid_title(text: str) -> bool:
    """Check if text looks like a valid job title, not reasoning output."""
    if not text:
        return False
    # Too long for a title
    if len(text) > 80:
        return False
    # Contains sentence-like patterns (multiple sentences)
    if text.count(". ") >= 2:
        return False
    # Starts with reasoning patterns
    if _TITLE_REJECTION_PATTERNS.match(text):
        return False
    # Contains newlines (multi-line = not a title)
    if "\n" in text:
        return False
    return True


async def generate_resume_title(
    job_description: str,
    language: str = "en",
    user_id: str | None = None,
) -> str:
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
            reasoning_effort="low",  # ← NEW: minimize CoT for this trivial task
        )

        title = result.strip().strip("\"'")

        # Validate: is this actually a title or reasoning text?
        if _is_valid_title(title):
            return title[:80]

        # LLM returned reasoning text instead of a title
        logging.warning(
            "Title generation returned non-title text, using fallback. Got: %s",
            title[:100],
        )

    except (ValueError, Exception) as e:
        logging.warning("Title generation failed: %s — using fallback", e)

    # Fallback: extract title from job description text directly
    return _extract_fallback_title(job_description)
```

### Regression Risk: NONE
- Valid titles pass `_is_valid_title()` without change
- Only invalid outputs (reasoning text, multi-line, too long) trigger fallback
- Fallback is deterministic: first short line from JD — always reasonable

---

## Fix 5: `complete()` Reasoning Awareness

### Goal
Add reasoning detection to `complete()` (currently only `complete_json()` has it).

### File: `apps/backend/app/llm.py`, function `complete()`

### Proposed Change

After extracting content, check for reasoning patterns and strip common CoT markers:

```python
async def complete(
    prompt: str,
    system_prompt: str | None = None,
    config: LLMConfig | None = None,
    user_id: str | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.7,
    reasoning_effort: str | None = None,
) -> str:
    if config is None:
        config = get_llm_config(user_id)
    model_name = get_model_name(config)

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    try:
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
        effort = _get_reasoning_effort(
            config.provider, model_name, override=reasoning_effort
        )
        if effort:
            kwargs["reasoning_effort"] = effort

        response = await litellm.acompletion(**kwargs)
        content = _extract_choice_text(response.choices[0], model=model_name)

        if not content:
            raise ValueError("Empty response from LLM")

        # NEW: Log warning if response looks like reasoning text
        if _is_reasoning_model(model_name) and _is_reasoning_response(content):
            logging.warning(
                "complete() received reasoning-style response from %s. "
                "Content preview: %s",
                model_name,
                content[:200],
            )

        return content
    except (...):
        ...
```

### Why Only Log, Not Retry
`complete()` is used for free-text generation (cover letters, titles, outreach). Unlike JSON, we can't automatically retry — the caller must decide what to do with the output. Title generation handles this via Fix 4's validation. Cover letter/outreach can tolerate some extra text.

### Regression Risk: NONE
Pure addition — logging only. No behavioral change for standard models.

---

## Fix 6: `_REASONING_PATTERNS` Expansion

### Goal
Expand reasoning pattern detection to catch GPT-OSS-120B's specific CoT patterns.

### File: `apps/backend/app/llm.py`

### Current Patterns

```python
_REASONING_PATTERNS = (
    "1.  **Analyze",
    "1. **Analyze",
    "**Analyze the Request",
    "*   **Goal",
    "* **Goal",
    "Let me analyze",
    "Let me parse",
    "Sure, here",
    "Certainly!",
)
```

### Proposed Expansion

```python
_REASONING_PATTERNS = (
    # Existing patterns
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
```

### Also update `_is_reasoning_response()` to catch mid-text reasoning

Current detection only checks prefix. GPT-OSS sometimes starts with a short valid-looking token then devolves into reasoning. Add a secondary check:

```python
def _is_reasoning_response(content: str) -> bool:
    """Detect if LLM response is reasoning/thinking text instead of JSON."""
    stripped = content.strip()

    # Check 1: starts with known reasoning pattern
    if any(stripped.startswith(p) for p in _REASONING_PATTERNS):
        return True

    # Check 2: doesn't start with JSON but contains reasoning patterns early
    if not stripped.startswith(("{", "[", "```")):
        if "json" not in stripped[:50].lower():
            if any(p in stripped[:300] for p in _REASONING_PATTERNS):
                return True

    # Check 3 (NEW): Response is clearly prose, not structured output
    # Multiple sentences in first 200 chars + no JSON-like content
    first_200 = stripped[:200]
    if first_200.count(". ") >= 3 and "{" not in first_200:
        return True

    return False
```

### Regression Risk: LOW
- Pattern-only change — if a valid JSON response accidentally starts with "First," it still gets parsed correctly (the patterns only trigger a retry with a stronger hint, they don't reject the response)
- False positive: a cover letter starting with "Certainly!" would be flagged — but this is a log warning only in `complete()`, no behavioral change

---

## Fix 7: Frontend Title Sanitization

### Goal
Display a sanitized title even if backend returns reasoning text (defense in depth).

### File: `apps/frontend/app/(default)/resumes/[id]/page.tsx`

### Current Code

```tsx
<h2 className={`font-serif text-2xl font-bold ...`}>
  {resumeTitle || t('resumeViewer.titlePlaceholder')}
</h2>
```

### Proposed Change

Add a utility function to sanitize displayed titles:

```typescript
// In lib/utils/title.ts (new utility)

const REASONING_PREFIXES = [
  'we need to', 'i need to', 'let me', 'first,', 'the description',
  'analyzing', 'looking at', 'based on', 'i will', "i'll",
  'to extract', 'sure,', 'certainly', 'okay,', 'ok,',
];

export function sanitizeTitle(title: string | null | undefined): string | null {
  if (!title) return null;

  const trimmed = title.trim();
  if (!trimmed) return null;

  // Check if title looks like reasoning text
  const lower = trimmed.toLowerCase();
  const isReasoning = REASONING_PREFIXES.some(p => lower.startsWith(p));

  if (isReasoning) return null;  // Will show placeholder instead

  // Truncate display to reasonable length
  if (trimmed.length > 80) {
    return trimmed.slice(0, 77) + '...';
  }

  return trimmed;
}
```

Usage in the page:

```tsx
import { sanitizeTitle } from '@/lib/utils/title';

// In render:
const displayTitle = sanitizeTitle(resumeTitle);

<h2 className={`font-serif text-2xl font-bold ...`}>
  {displayTitle || t('resumeViewer.titlePlaceholder')}
</h2>
```

### Regression Risk: NONE
- Valid titles pass through unchanged
- Only reasoning text gets replaced with placeholder
- User can still click to edit and set a manual title

---

## Compatibility Matrix

After all fixes, expected behavior per model archetype:

### `complete()` (plain text generation)

| Scenario | Type A (Standard) | Type B (Harmony/GPT-OSS) | Type C (DeepSeek-R1, GPT-5) |
|----------|-------------------|--------------------------|------------------------------|
| Content extraction | `message.content` ✅ | `message.content` ✅ | `message.content` → fallback `reasoning_content` ✅ |
| Empty content | Raise ValueError ✅ | Raise ValueError (no CoT fallback) ✅ | Fallback to `reasoning_content` ✅ |
| reasoning_effort sent | No ✅ | `"low"` (default) ✅ | `"minimal"` (GPT-5) / No (DeepSeek) ✅ |
| Temperature | Sent ✅ | Sent ✅ | Not sent for GPT-5 ✅ |
| Reasoning leak | N/A | Prevented by no-fallback ✅ | Allowed (intentional) ✅ |

### `complete_json()` (JSON generation)

| Scenario | Type A (Standard) | Type B (Harmony/GPT-OSS) | Type C (DeepSeek-R1, GPT-5) |
|----------|-------------------|--------------------------|------------------------------|
| JSON mode | Native ✅ | Native via provider ✅ | Not used ✅ |
| Content extraction | `message.content` ✅ | `message.content` ✅ | Fallback `reasoning_content` ✅ |
| Empty content → retry | N/A (rare) | Retry with stronger hint ✅ | Retry with stronger hint ✅ |
| Reasoning response → retry | N/A | Detected → "CRITICAL JSON" hint ✅ | Detected → "CRITICAL JSON" hint ✅ |
| JSON envelope unwrap | Yes ✅ | Yes (GPT-OSS wraps in `final_resume`) ✅ | Yes ✅ |

### `generate_resume_title()` (title generation)

| Scenario | Type A (Standard) | Type B (Harmony/GPT-OSS) | Type C (DeepSeek-R1, GPT-5) |
|----------|-------------------|--------------------------|------------------------------|
| Valid title returned | Use as-is ✅ | Use as-is ✅ | Use as-is ✅ |
| Reasoning text returned | Rejected → fallback ✅ | Rejected → fallback ✅ | Rejected → fallback ✅ |
| Complete failure | Fallback from JD ✅ | Fallback from JD ✅ | Fallback from JD ✅ |
| Frontend display | Sanitized ✅ | Sanitized ✅ | Sanitized ✅ |

---

## Testing Plan

### Unit Tests

| Test | File | Validates |
|------|------|-----------|
| `test_is_reasoning_model` | `tests/test_llm.py` | GPT-OSS, DeepSeek-R1, GPT-5 detected; GPT-4o, Claude not |
| `test_is_harmony_model` | `tests/test_llm.py` | Only GPT-OSS variants match |
| `test_extract_message_text_harmony_no_leak` | `tests/test_llm.py` | Harmony model with empty content returns None |
| `test_extract_message_text_deepseek_fallback` | `tests/test_llm.py` | DeepSeek-R1 still falls back to reasoning_content |
| `test_extract_message_text_standard` | `tests/test_llm.py` | Standard model uses content normally |
| `test_get_reasoning_effort_gptoss` | `tests/test_llm.py` | Returns "low" for GPT-OSS |
| `test_get_reasoning_effort_gpt5` | `tests/test_llm.py` | Returns "minimal" for GPT-5 |
| `test_get_reasoning_effort_override` | `tests/test_llm.py` | Override takes priority |
| `test_get_reasoning_effort_standard` | `tests/test_llm.py` | Returns None for standard models |
| `test_is_valid_title` | `tests/test_cover_letter.py` | Valid titles pass, reasoning text fails |
| `test_extract_fallback_title` | `tests/test_cover_letter.py` | Extracts first line from JD |
| `test_reasoning_patterns_expanded` | `tests/test_llm.py` | New patterns detected by `_is_reasoning_response` |
| `test_sanitize_title_frontend` | `tests/title.test.ts` | Frontend sanitization works |

### Integration Tests (Manual)

| Test | Model | Expected Result |
|------|-------|-----------------|
| Upload + Tailor with GPT-OSS-120B | GPT-OSS-120B | Title shows "Role @ Company" or fallback from JD, NOT reasoning text |
| Upload + Tailor with GPT-4o | GPT-4o | No regression — title works as before |
| Upload + Tailor with DeepSeek-R1 | DeepSeek-R1 | No regression — JSON parsing + reasoning_content fallback works |
| Health check with GPT-OSS-120B | GPT-OSS-120B | Returns healthy if model responds |
| Health check with GPT-5 | GPT-5 | No regression — minimal reasoning_effort still sent |

---

## Risk Assessment

| Fix | Risk Level | Mitigation |
|-----|-----------|------------|
| Fix 1: Model detection | NONE | Pure addition, no existing code changed |
| Fix 2: Content extraction | **LOW-MEDIUM** | Could cause GPT-OSS to return empty → ValueError. Mitigated by: callers already handle ValueError; retries in complete_json(); fallback in title generation |
| Fix 3: Reasoning effort | LOW | New param defaults to None → no change for existing callers. GPT-OSS gets "low" default → reduces CoT but may slightly reduce output quality on complex tasks |
| Fix 4: Title validation | NONE | Only adds validation + fallback. Valid titles unchanged |
| Fix 5: complete() awareness | NONE | Log-only change for reasoning detection |
| Fix 6: Pattern expansion | LOW | More patterns = more false positives in reasoning detection. Mitigated by: patterns only trigger retry hint in complete_json(), only trigger logging in complete() |
| Fix 7: Frontend sanitization | NONE | Defense-in-depth. Valid titles pass through |

### Breaking Change Risk: ZERO
All changes are backward-compatible:
- New function parameters have defaults
- New functions don't replace existing ones
- Validation adds fallbacks, not rejections
- Frontend adds sanitization, not blocking

---

## Implementation Order

Execute in this order to minimize risk and allow incremental testing:

```
Phase 1: Detection Layer (no behavioral change)
  ├── Fix 1: _is_reasoning_model() + _is_harmony_model()
  └── Fix 6: Expand _REASONING_PATTERNS

Phase 2: Core LLM Layer (behavioral change for GPT-OSS only)
  ├── Fix 3: _get_reasoning_effort() expansion + per-call override
  └── Fix 2: _extract_message_text() smart fallback

Phase 3: Caller Hardening
  ├── Fix 4: generate_resume_title() validation + fallback
  └── Fix 5: complete() reasoning awareness (logging)

Phase 4: Frontend Defense
  └── Fix 7: Title sanitization utility + page integration
```

### Estimated File Changes

| File | Changes |
|------|---------|
| `apps/backend/app/llm.py` | Fix 1, 2, 3, 5, 6 — ~80 lines added/modified |
| `apps/backend/app/services/cover_letter.py` | Fix 4 — ~50 lines added/modified |
| `apps/frontend/lib/utils/title.ts` | Fix 7 — ~25 lines (new file) |
| `apps/frontend/app/(default)/resumes/[id]/page.tsx` | Fix 7 — ~5 lines modified |
| `apps/backend/tests/test_llm.py` | Tests — ~60 lines (new or expanded) |

**Total**: ~220 lines of changes across 5 files + tests

---

## Appendix: GPT-OSS-120B Architecture Reference

| Spec | Value |
|------|-------|
| Architecture | Mixture-of-Experts (MoE), 128 experts, top-4 active |
| Total params | 117B (5.1B active per token) |
| Layers | 36 transformer layers, SwiGLU activation |
| Context | 128K tokens (RoPE) |
| Output format | Harmony multi-channel (analysis, final) |
| Reasoning | Built-in CoT with configurable effort (low/medium/high) |
| Known issues | Response in reasoning_content instead of content (HF #133); reasoning tokens leak (Groq bug); instruction following degradation (Groq #916); vLLM Harmony parsing issues (#22403) |
| Instruction following | ReasonIF benchmark: <25% compliance on reasoning traces; 75% on final response for JSON formatting |
