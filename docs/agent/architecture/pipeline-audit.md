# Resume Matcher — Full Architecture & Pipeline Audit

> **Date**: 2025-07-03  
> **Scope**: Complete backend pipeline analysis — upload, tailor, retry, schema validation, LLM integration, upstream comparison  
> **Constraint**: Analysis only — no code changes

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Upload Pipeline Analysis](#2-upload-pipeline-analysis)
3. [Retry/Reprocess Master Resume Flow](#3-retryreprocess-master-resume-flow)
4. [Create Resume from Master (Tailor) Flow](#4-create-resume-from-master-tailor-flow)
5. [Parsing System Audit](#5-parsing-system-audit)
6. [Schema Validation Audit](#6-schema-validation-audit)
7. [AI Model Behavior Analysis](#7-ai-model-behavior-analysis)
8. [Upstream vs Fork Differences](#8-upstream-vs-fork-differences)
9. [LinkedIn Export PDF Failure Analysis](#9-linkedin-export-pdf-failure-analysis)
10. [Likely Root Causes (Composite)](#10-likely-root-causes-composite)
11. [Risk Areas in the Current Architecture](#11-risk-areas-in-the-current-architecture)
12. [Overall System Health Assessment](#12-overall-system-health-assessment)

---

## 1. Architecture Overview

### Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| HTTP server | FastAPI + Uvicorn | CORS via middleware; rate-limit via slowapi |
| Auth | JWT (PyJWT) + Prisma (PostgreSQL) | Bearer token in header; cookie for SSE |
| Database (app data) | TinyDB (JSON file) | Per-user scoping via `user_id` field |
| AI abstraction | LiteLLM | Multi-provider: OpenAI, Anthropic, Gemini, DeepSeek, Novita, OpenRouter, Ollama |
| File parsing | markitdown 0.1.4 | PDF/DOCX → Markdown |
| PDF generation | Playwright (headless Chromium) | Renders frontend print page |
| Frontend | Next.js 16 + React 19 + Tailwind v4 | Swiss International Style |

### Request Flow (high-level)

```
Client → Next.js (SSR/CSR) → FastAPI API (/api/v1/*)
                                  ├── Auth dependency (JWT → Prisma)
                                  ├── TinyDB (JSON storage)
                                  └── LiteLLM → AI Provider
```

### Key Modules

| Module | Responsibility |
|--------|---------------|
| `routers/resumes.py` (1879 lines) | All resume CRUD, upload, tailor, preview, confirm, PDF, SSE |
| `services/parser.py` (66 lines) | markitdown conversion + LLM JSON extraction |
| `services/improver.py` (639 lines) | Resume tailoring + diff calculation |
| `services/refiner.py` (599 lines) | Multi-pass post-processing: keyword injection, AI phrase removal, alignment check |
| `llm.py` (785 lines) | LiteLLM wrapper, JSON extraction, health check, retry logic |
| `schemas/models.py` (712 lines) | All Pydantic v2 models |
| `prompts/templates.py` (412 lines) | All LLM prompt templates |
| `database.py` (430 lines) | TinyDB wrapper with CRUD operations |

---

## 2. Upload Pipeline Analysis

### Flow

```
POST /resumes/upload
  ├── Validate: file type ∈ {PDF, DOC, DOCX}, size ≤ 4MB, non-empty
  ├── parse_document(content, filename)
  │     └── markitdown.convert() → markdown text
  ├── db.create_resume() or db.create_resume_atomic_master()
  │     └── processing_status = "processing"
  ├── background_tasks.add_task(_process_resume_background, ...)
  │     └── parse_resume_to_json(markdown, user_id)
  │           ├── Format prompt: PARSE_RESUME_PROMPT + RESUME_SCHEMA_EXAMPLE
  │           ├── complete_json(prompt) → raw dict from LLM
  │           └── ResumeData.model_validate(result) ← CRASH POINT
  │     └── On success: processing_status = "ready", store processed_data
  │     └── On failure: processing_status = "failed", store error_message
  └── Return 200 immediately (processing_status = "processing")
```

### Key Observations

1. **Background processing**: The upload returns immediately; parsing happens asynchronously via `BackgroundTasks`. Frontend monitors via SSE (`/resumes/status-stream`).

2. **Master assignment**: First upload becomes master automatically via `create_resume_atomic_master()` (asyncio.Lock). Subsequent uploads with `as_master=true` param create additional masters.

3. **No sanitization between LLM and Pydantic**: The raw dict from `complete_json()` is passed directly to `ResumeData.model_validate()`. There is no intermediate step to coerce `null` values on `years` fields (or any other `str` fields with defaults).

4. **Error granularity in background task**: The exception message is stored verbatim as `error_message`. This includes Pydantic `ValidationError` messages which contain field-level details — useful for debugging but potentially noisy for users.

5. **Startup sweep**: `main.py` lifespan resets any `processing`/`pending` resumes to `failed` with `[RESTART]` prefix. This correctly handles the case where the server dies mid-processing.

### Risk Points

- **R1**: `ResumeData.model_validate(result)` is the single point of failure. If the LLM returns `{"years": null}` for any entry, Pydantic v2 rejects it (see §6).
- **R2**: No retry at the upload level — the background task fails once and stays failed. User must manually hit "retry".
- **R3**: markitdown 0.1.4 has known limitations with LinkedIn PDF exports (see §9).

---

## 3. Retry/Reprocess Master Resume Flow

### Flow

```
POST /resumes/{resume_id}/retry-processing
  ├── Validate: resume exists, status ∈ {"failed", "processing"}
  ├── Read stored markdown from resume["content"]
  ├── parse_resume_to_json(markdown, user_id)
  │     └── Same pipeline as upload (PARSE_RESUME_PROMPT → complete_json → model_validate)
  ├── Empty check: if no name/workExperience/education/sectionMeta → "failed"
  └── On success: processing_status = "ready", store processed_data
```

### Key Observations

1. **Synchronous, not background**: Unlike upload, retry runs synchronously in the request handler. This means it can timeout under Cloudflare's 100s limit if the LLM is slow.

2. **Same vulnerability**: Uses the exact same `parse_resume_to_json()` pipeline, so the `years: null` validation crash applies equally.

3. **No "recreate from scratch" endpoint**: There is no endpoint that re-extracts markdown from the original file. The original PDF/DOCX bytes are NOT stored — only the markdown conversion output. This means if markitdown produced bad markdown, retrying won't help.

4. **Original file not preserved**: The raw file bytes are discarded after `parse_document()`. Only the markdown text is stored. This is a design decision that saves storage but prevents re-parsing with a better converter.

### Risk Points

- **R4**: If markitdown produces poor markdown (e.g., from a LinkedIn PDF), retrying with the same markdown and same LLM will likely produce the same failure.
- **R5**: No circuit breaker — user can hammer retry repeatedly, burning LLM tokens with identical failing inputs.

---

## 4. Create Resume from Master (Tailor) Flow

### Flow

```
POST /resumes/improve/preview  (or /resumes/improve, or /resumes/improve/confirm)
  ├── _get_generation_source_resume(resume_id)
  │     └── Must be active, non-deleted, is_master=True
  ├── Fetch job description from DB
  ├── extract_job_keywords(job_description) → structured keywords
  ├── improve_resume(original_resume_markdown, job_desc, keywords, language, prompt_id)
  │     ├── Select prompt template by prompt_id: nudge|keywords|full|focused
  │     ├── Sanitize JD (_sanitize_user_input: strips injection patterns)
  │     ├── Format prompt with: JD + keywords + original resume markdown + schema
  │     ├── complete_json(prompt, max_tokens=8192) → raw dict
  │     ├── _check_for_truncation(result) — warns if personalInfo missing
  │     ├── [focused mode] Extract removed_entries before validation
  │     └── ResumeData.model_validate(result) ← CRASH POINT #2
  ├── [focused mode] Guard: ALL_ENTRIES_REMOVED → 422
  ├── [focused mode] Restore education if LLM removed it
  ├── _preserve_personal_info(original, improved) — deep-copy original PI
  ├── refine_resume() — multi-pass post-processing
  │     ├── Pass 1: Keyword injection (LLM call)
  │     ├── Pass 2: AI phrase removal (regex-based)
  │     └── Pass 3: Alignment validation (master vs tailored)
  ├── _calculate_diff_from_resume() — SequenceMatcher-based diff
  ├── [preview only] Store preview_hash on job for confirm validation
  ├── [confirm only] Validate hash match + personalInfo unchanged
  ├── [confirm/improve] Generate auxiliary messages (cover letter, outreach, title)
  └── [confirm/improve] Store tailored resume in DB (is_master=False, parent_id)
```

### Key Observations

1. **Source is always markdown**: The improve pipeline receives the master's raw markdown content (`resume["content"]`), NOT the structured `processed_data`. The LLM re-parses the entire resume from markdown. This means any markdown quality issues from upload persist into tailoring.

2. **Personal info is force-preserved**: After the LLM returns improved data, `_preserve_personal_info()` deep-copies the original `personalInfo` into the result. This correctly prevents AI hallucination in contact details.

3. **Three-phase tailoring**: Preview → Confirm is the canonical flow. Preview generates + caches; Confirm validates hash + stores. Legacy `/improve` does both in one call.

4. **Prompt injection sanitization**: Job descriptions are sanitized against common injection patterns before inclusion in prompts.

5. **Refinement is best-effort**: If `refine_resume()` fails, the unrefined result is used with a warning. This is resilient but means refinement quality varies.

6. **Diff calculation**: Uses `SequenceMatcher` for description bullet diffs and set operations for skill/cert changes. Diff is computed between the master's `processed_data` (if available) and the new improved data.

### Risk Points

- **R6**: The `ResumeData.model_validate(result)` at `improver.py:178` is vulnerable to the same `years: null` crash as the upload pipeline.
- **R7**: Three `model_validate()` calls happen per tailor: one in `improver.py:178`, one in the preview response construction (`resumes.py:947/1297`), and potentially one in confirm de-serialization. If the first passes, the others should too (same data), but it's redundant validation.
- **R8**: `max_tokens=8192` in `improve_resume()` — if the resume is large, this may not be enough. The `_appears_truncated()` check logs a warning but does NOT fail the request. Truncated JSON with missing `years` fields then crashes at validation.

---

## 5. Parsing System Audit

### markitdown (PDF → Markdown)

**Version**: 0.1.4 (pinned in `pyproject.toml`)

**Mechanism**: Uses `pdfminer.six` under the hood for PDF text extraction. Writes to temp file → `MarkItDown().convert()` → returns `text_content` string.

**Strengths**:
- Simple, deterministic conversion
- Handles both PDF and DOCX
- No external API dependencies

**Weaknesses**:
- **No OCR**: If the PDF uses images or complex layouts, text extraction may be incomplete
- **Layout loss**: Multi-column layouts (common in resumes) are flattened. Order of extracted text may not match visual reading order
- **LinkedIn PDFs**: LinkedIn exports use specific formatting that markitdown may not parse well (see §9)
- **No table support**: Tabular resume data (skills grids, etc.) becomes flat text
- **pdfminer warnings**: Suppressed in `main.py` via `logging.getLogger("pdfminer").setLevel(logging.ERROR)` — cosmetic font warnings are hidden

### LLM JSON Extraction (complete_json)

**Mechanism**: 
1. Prompt includes the markdown text + schema example
2. If provider supports JSON mode, `response_format={"type": "json_object"}` is set
3. Response text goes through `_extract_json()`:
   - Strips markdown code fences
   - Finds matching `{` / `}` with brace-depth tracking (handles nested strings correctly)
   - Tracks `in_string` state to avoid counting braces inside JSON strings
4. Parsed via `json.loads()`
5. Truncation check via `_appears_truncated()`

**Retry Logic**:
- 2 retries (3 total attempts)
- Temperature escalation: 0.1 → 0.3 → 0.5
- On retry, appends "IMPORTANT: Output ONLY a valid JSON object" hint
- Reasoning model detection (`_is_reasoning_response`): upgrades hint to "CRITICAL: You MUST output ONLY raw JSON"

**Strengths**:
- JSON mode when provider supports it (OpenAI, Anthropic, Gemini, DeepSeek, Novita)
- Multi-format extraction: handles ```json blocks, bare JSON, JSON embedded in prose
- Truncation detection with warning
- Reasoning-model-aware retry prompts
- Safety limits: max recursion depth (10), max content size (1MB)

**Weaknesses**:
- **No semantic validation**: Parsed JSON is not checked for schema conformance until `model_validate()`. By that point, the LLM tokens are spent.
- **_appears_truncated() is non-blocking**: Even when truncation is detected, processing continues. The truncated data then hits `model_validate()` and may crash or silently have missing fields.
- **No JSON repair**: If the LLM returns `{"years": null}` (valid JSON but invalid for the schema), there's no repair step. A simple `null → ""` sweep before validation would prevent most crashes.

---

## 6. Schema Validation Audit

### ResumeData Model Structure

```
ResumeData
  ├── personalInfo: PersonalInfo
  │     ├── name: str = ""     ← has coerce_none_to_empty_string validator
  │     ├── title: str = ""    ← has coerce_none_to_empty_string validator
  │     ├── email: str = ""    ← has coerce_none_to_empty_string validator
  │     ├── phone: str = ""    ← has coerce_none_to_empty_string validator
  │     ├── location: str = "" ← has coerce_none_to_empty_string validator
  │     ├── website: str | None = None
  │     ├── linkedin: str | None = None
  │     └── github: str | None = None
  ├── summary: str = ""
  ├── workExperience: list[Experience]
  │     ├── title: str = ""           ← NO None coercion
  │     ├── company: str = ""         ← NO None coercion
  │     ├── location: str | None      
  │     ├── years: str = ""           ← ⚠️ NO None coercion — CRASH POINT
  │     └── description: list[str]    ← has _normalize_description validator
  ├── education: list[Education]
  │     ├── institution: str = ""     ← NO None coercion
  │     ├── degree: str = ""          ← NO None coercion
  │     ├── years: str = ""           ← ⚠️ NO None coercion — CRASH POINT
  │     └── description: str | None   ← has _normalize_description validator
  ├── personalProjects: list[Project]
  │     ├── name: str = ""            ← NO None coercion
  │     ├── role: str = ""            ← NO None coercion
  │     ├── years: str = ""           ← ⚠️ NO None coercion — CRASH POINT
  │     └── description: list[str]    ← has _normalize_description validator
  ├── additional: AdditionalInfo
  │     └── All fields: list[str]     ← has _normalize_string_fields validator
  ├── sectionMeta: list[SectionMeta]
  └── customSections: dict[str, CustomSection]
        └── items: list[CustomSectionItem]
              ├── title: str = ""         ← NO None coercion
              ├── subtitle: str | None
              ├── years: str = ""         ← ⚠️ NO None coercion — CRASH POINT
              └── description: list[str]  ← has _normalize_description validator
```

### The None Coercion Gap

**Pattern PRESENT on `PersonalInfo`** (fork addition):
```python
@field_validator("name", "title", "email", "phone", "location", mode="before")
@classmethod
def coerce_none_to_empty_string(cls, v: str | None) -> str:
    return v if v is not None else ""
```

**Pattern ABSENT on**:
- `Experience.years`, `Experience.title`, `Experience.company`
- `Education.years`, `Education.institution`, `Education.degree`
- `Project.years`, `Project.name`, `Project.role`
- `CustomSectionItem.years`, `CustomSectionItem.title`

### Pydantic v2 Behavior

In Pydantic v2 (strict mode is off by default):
- **Omitting a field** with `str = ""` → uses default `""` ✅
- **Passing `None`** to `str = ""` → **REJECTED** ❌ `ValidationError: Input should be a valid string`

This means any time the LLM explicitly returns `"years": null`, Pydantic crashes. With Pydantic v1, `None` was silently accepted for `str` fields. This is a breaking behavioral change in v2.

### `model_validate()` Call Sites

| Location | Context | Failure Impact |
|----------|---------|----------------|
| `parser.py:64` | Upload background task | Resume stuck as "failed" |
| `improver.py:178` | Tailor LLM response | 500 error on tailor endpoint |
| `resumes.py:672` | GET /resumes (fetch) | 500 on any resume view |
| `resumes.py:947` | Preview response | 500 on preview |
| `resumes.py:1297` | Legacy improve response | 500 on improve |
| `resumes.py:1372` | PATCH update | 500 on manual edit |

The call at `resumes.py:672` (fetch endpoint) is particularly dangerous: if a resume was somehow stored with `null` years (e.g., via manual DB edit or a bug in an older version), viewing it would crash.

### Summary ↔ description Validators

- `summary` has `_normalize_summary` → `_coerce_text()`: handles nested dicts/lists, extracts text fragments intelligently. This is robust.
- `description` fields have `_normalize_description` → `_coerce_string_list()`: handles `None` (returns `[]`), strings, nested objects. Also robust.
- `text` fields (CustomSection) have `_normalize_text` → `_coerce_optional_text()`: handles `None` correctly.

The gap is specifically on **plain `str` fields without validators** — `years`, `title`, `company`, `institution`, `degree`, `name`, `role`.

---

## 7. AI Model Behavior Analysis

### Provider-Specific Behavior

| Provider | JSON Mode | Null Tendency | `years` Risk |
|----------|-----------|--------------|--------------|
| OpenAI (gpt-4o) | ✅ native | Low — tends to use `""` | Low |
| Anthropic (Claude) | ✅ native | Medium — sometimes uses `null` | Medium |
| Gemini | ✅ native | Medium | Medium |
| DeepSeek | ✅ native | Medium — reasoning modes may return prose first | Medium |
| Novita AI (via OpenAI compat) | ✅ (via `openai` provider) | **High** — reasoning models prefer `null` for "no data" | **High** |
| OpenRouter | Allowlist-based | Varies by underlying model | Varies |
| Ollama | ❌ | High — local models often ignore schema | High |

### The Prompt Ambiguity

From `PARSE_RESUME_PROMPT`:
```
Rules:
- Use "" for missing text fields, [] for missing arrays, null for optional fields
```

This rule is **ambiguous**: the LLM must decide whether `years` is a "missing text field" (→ `""`) or an "optional field" (→ `null`). The schema example shows `years` with actual values (`"2020 - Present"`, `"2014 - 2018"`), NOT with `""` or `null` — so the LLM has no explicit fallback example.

For Novita AI / reasoning models that think step-by-step:
1. The model determines that `years` data is not present in the resume text
2. It classifies `years` as "optional" (no data = optional absence)
3. It returns `null` per the prompt rule for optional fields
4. Pydantic rejects `null` for `str = ""`

### gpt-5 Special Handling

The fork adds `_supports_temperature()` and `_get_reasoning_effort()` specifically for gpt-5 models:
- Temperature is not passed (gpt-5 rejects non-1 temperature)
- `reasoning_effort: "minimal"` is set to avoid empty `message.content`

### Reasoning Model Content Extraction

Fork adds `reasoning_content` fallback in `_extract_message_text()`:
```python
if not content:
    if hasattr(message, "reasoning_content"):
        content = message.reasoning_content
```

This handles DeepSeek-R1 and GLM models that put their output in `reasoning_content` rather than `content`.

### Retry Behavior

- **3 total attempts** (2 retries)
- Temperature escalation: 0.1 → 0.3 → 0.5
- On failure, the prompt is extended with a JSON-only instruction
- Reasoning model detection triggers a stronger "CRITICAL: respond with raw JSON only" hint

**Risk**: The retry logic operates at the JSON extraction level, NOT at the schema validation level. If the LLM returns valid JSON with `null` years, the JSON extraction succeeds, and the retry logic does not fire. The validation error happens AFTER all retry attempts are exhausted.

---

## 8. Upstream vs Fork Differences

### Summary of Fork Changes (1,095 lines added, 243 removed)

| Area | Changes | Impact |
|------|---------|--------|
| **Auth system** | JWT + Prisma user management | Major: all endpoints now require auth |
| **Per-user LLM config** | `user_id` parameter threading | Medium: each user can have their own API keys |
| **Novita AI support** | Provider prefix, JSON mode flag | Medium: enables third-party AI provider |
| **PersonalInfo validator** | `coerce_none_to_empty_string` on 5 fields | Critical: **partially** fixes null-coercion gap |
| **Reasoning model support** | `reasoning_content` extraction, gpt-5 temp handling | Medium: handles DeepSeek-R1, gpt-5 |
| **Focused tailor mode** | New prompt, removed_entries tracking, education restoration | Major: new tailoring strategy |
| **Error visibility** | `error_message` on upload/list/fetch responses | Medium: surfaces failures to frontend |
| **Startup sweep** | Resets stuck resumes to "failed" on restart | Medium: prevents ghost processing |
| **Health check max_tokens** | 16 → 1000 | Minor: fixes false-negative health checks with reasoning models |
| **SSE auth** | Cookie-based JWT validation | Medium: fixes SSE 401 errors |
| **LiteLLM logging** | Removed `_configure_litellm_logging()` | Minor: simplification |
| **pdfminer logging** | Suppressed at ERROR level | Minor: reduces log noise |

### Schema Differences (models.py)

**Fork adds** (upstream does NOT have):
- `PersonalInfo.coerce_none_to_empty_string` validator
- `RemovedEntry` model
- `error_message` fields on `ResumeUploadResponse`, `RawResume`, `ResumeSummary`
- `reason` field on `ResumeFieldDiff`
- `entries_removed` on `ResumeDiffSummary`
- `removed_entries` and refinement fields on `ImproveResumeData`

**Both upstream and fork LACK**:
- None coercion on `years` (in Experience, Education, Project, CustomSectionItem)
- None coercion on `title`, `company`, `institution`, `degree`, `name`, `role`

### Prompt Differences (templates.py)

Fork adds:
- `"id": "Indonesian"` in `LANGUAGE_NAMES`
- `IMPROVE_RESUME_PROMPT_FOCUSED` (entirely new)
- `focused` entry in `CRITICAL_TRUTHFULNESS_RULES`
- `focused` entry in `IMPROVE_PROMPT_OPTIONS`

The ambiguous `PARSE_RESUME_PROMPT` rule (`null for optional fields`) is **identical in both upstream and fork**.

---

## 9. LinkedIn Export PDF Failure Analysis

### Problem Statement

LinkedIn-exported PDF resumes contain valid date information (e.g., "Jan 2020 - Present"), yet the parsed result sometimes has `years: null` in `personalProjects` and `customSections.publications.items`, causing a Pydantic validation crash.

### Contributing Factors

**Factor 1: markitdown PDF Extraction**

markitdown 0.1.4 uses pdfminer.six for PDF text extraction. LinkedIn PDFs have specific characteristics:
- **Multi-column layout**: LinkedIn PDFs sometimes use side-by-side columns. pdfminer extracts text in stream order, which may interleave columns, producing garbled markdown where dates from one entry end up associated with a different entry.
- **Custom fonts**: LinkedIn uses custom embedded fonts. pdfminer logs warnings about these (suppressed in the fork). Some glyphs may not be extracted correctly.
- **Section separators**: LinkedIn uses thin horizontal lines as section dividers. These may be extracted as decorative characters or dropped entirely, causing section boundary confusion.

**Factor 2: Prompt Schema Example**

The schema example shows `years` with real values but never shows `years: ""` or documents that `years` must be a string, never null. The prompt says `"null for optional fields"` — and a project without explicit dates may look "optional" to the LLM.

**Factor 3: Model-Specific Behavior**

Non-OpenAI models (especially reasoning models and Novita AI) are more likely to interpret missing data as `null` rather than `""`. This is a difference in training data distribution — GPT-4o tends to follow the schema example more literally.

**Factor 4: Custom Sections**

`customSections` (like "publications") are mapped by the LLM into `CustomSectionItem` objects. The LLM has less context about the expected format for custom sections because the schema example only shows one publication example. If publication dates aren't obvious in the markdown, the LLM may return `null`.

### Failure Chain

```
LinkedIn PDF
  → markitdown: garbled/incomplete markdown (dates may be misplaced or lost)
    → LLM: interprets missing dates as null ("optional field" per prompt rule)
      → complete_json: extracts valid JSON with null years ✅
        → ResumeData.model_validate(): REJECTS null for str field ❌
          → Background task catches exception, sets status="failed"
```

---

## 10. Likely Root Causes (Composite)

### Root Cause #1: Incomplete None-Coercion (CRITICAL)

The `PersonalInfo` model has a `coerce_none_to_empty_string` validator for 5 fields. This pattern was **not extended** to the other 10+ `str` fields across `Experience`, `Education`, `Project`, and `CustomSectionItem`.

- **Evidence**: `PersonalInfo` validator is a fork-only addition; it was clearly added to fix a real problem.
- **Gap**: The same problem exists on every other `str = ""` field.
- **Impact**: Any `null` value on `years`, `title`, `company`, `institution`, `degree`, `name`, or `role` crashes the entire pipeline.

### Root Cause #2: Prompt Ambiguity (MODERATE)

The instruction `"Use "" for missing text fields, [] for missing arrays, null for optional fields"` creates a judgment call that different models resolve differently. `years` is sometimes empty (text field → `""`) and sometimes absent (optional → `null`).

- **Evidence**: The same resume parses successfully with GPT-4o (prefers `""`) and fails with Novita AI (prefers `null`).
- **Impact**: Model-dependent reliability.

### Root Cause #3: No Pre-Validation Sanitization (MODERATE)

Between `complete_json()` returning a dict and `ResumeData.model_validate()` receiving it, there is zero sanitization. A simple recursive `null → ""` sweep on string-typed fields would prevent all `None` crashes.

- **Evidence**: The codebase already has `_coerce_text()`, `_coerce_string_list()`, and `_coerce_optional_text()` validators on some fields but not others.
- **Impact**: The fix surface is small but critical.

### Root Cause #4: markitdown Quality on LinkedIn PDFs (LOW-MODERATE)

LinkedIn PDFs are a specific failure case because markitdown's pdfminer-based extraction struggles with their layout. However, even with poor markdown, the LLM should be able to extract dates if they're present in any form.

- **Evidence**: The markdown from LinkedIn PDFs often contains dates, but they may be separated from their associated entries by layout artifacts.
- **Impact**: Contributes to LLM confusion about which dates belong where.

---

## 11. Risk Areas in the Current Architecture

### Critical Risks

| # | Risk | Location | Severity |
|---|------|----------|----------|
| 1 | `years: null` crashes validation | All 6 `model_validate()` sites | **Critical** |
| 2 | Any `str = ""` field receiving `null` crashes | `Experience`, `Education`, `Project`, `CustomSectionItem` | **Critical** |
| 3 | Retry uses identical input that already failed | `retry-processing` endpoint | High |
| 4 | Original file bytes not preserved | `parse_document()` in upload | High |

### High Risks

| # | Risk | Location | Severity |
|---|------|----------|----------|
| 5 | LLM token truncation produces partial JSON that passes extraction but fails validation | `complete_json()` → `_appears_truncated()` (non-blocking) | High |
| 6 | SSE auth uses cookie-based JWT separately from main auth | `resume_status_stream()` | Medium-High |
| 7 | TinyDB JSON file as production database (no transactions, no indexes) | `database.py` | High (at scale) |
| 8 | Refinement LLM call failure is silently swallowed | `refine_resume()` in tailor flow | Medium |

### Medium Risks

| # | Risk | Location | Severity |
|---|------|----------|----------|
| 9 | Prompt injection sanitization is regex-based (can be bypassed) | `_sanitize_user_input()` | Medium |
| 10 | No rate limiting on LLM-calling endpoints specifically | Tailor/preview endpoints | Medium |
| 11 | `resumes.py` is 1879 lines — maintenance risk | Monolithic router | Medium |
| 12 | Three separate `model_validate()` calls per tailor (redundant) | Tailor flow | Low-Medium |
| 13 | Diff calculation doesn't handle custom sections | `calculate_resume_diff()` | Low |

### Low Risks

| # | Risk | Location | Severity |
|---|------|----------|----------|
| 14 | master_resume_lock is per-process (doesn't work with multiple workers) | `database.py` | Low (single-worker deployment) |
| 15 | Config loaded from filesystem on every request (no caching) | `_load_config()` | Low |
| 16 | `has_content` check after LLM parse is heuristic | `_process_resume_background()` | Low |

---

## 12. Overall System Health Assessment

### Strengths

1. **Well-structured error handling**: The fork adds comprehensive error classification (`_raise_improve_error`) with LiteLLM exception type mapping and fallback string matching. Users get actionable error messages.

2. **Personal info protection**: `_preserve_personal_info()` deep-copies original contact details into the tailored result, preventing AI hallucination in critical fields.

3. **Multi-pass refinement**: The refiner pipeline (keyword injection → AI phrase removal → alignment check) adds a quality layer that catches many AI overreaches.

4. **Startup sweep**: Orphaned processing tasks from server restarts are correctly identified and marked as failed.

5. **Preview/Confirm pattern**: The two-phase tailor flow with hash validation prevents stale or tampered data from being persisted.

6. **Prompt injection defense**: Job descriptions are sanitized before inclusion in prompts.

7. **Provider flexibility**: The LiteLLM abstraction with per-user config routing provides genuine multi-provider support.

### Weaknesses

1. **Critical**: The `years: null` validation gap is a latent bug that exists in both upstream and fork. The fork partially addressed it on `PersonalInfo` but not elsewhere.

2. **Architectural**: No data sanitization layer between LLM output and Pydantic validation. This is the single most impactful missing component.

3. **Data loss**: Original file bytes are discarded after markdown conversion. If markitdown produced bad output, the original is unrecoverable.

4. **Scale limitations**: TinyDB is a JSON file — no concurrent write safety (beyond Python's GIL), no indexes, no migrations. Fine for single-user but risky at scale.

5. **Monolith router**: `resumes.py` at 1879 lines handles upload, fetch, list, tailor, preview, confirm, update, delete, PDF, SSE, cover letter, outreach, retry, and job context retrieval. This is a maintenance burden.

### Health Score

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Correctness** | 6/10 | The `null` coercion bug is the primary deduction. When it doesn't trigger, the system works well. |
| **Reliability** | 7/10 | Retry logic, startup sweeps, and error handling are solid. Deduction for no pre-validation sanitization. |
| **Security** | 7/10 | JWT auth, input sanitization, no credential leaking. Deduction for regex-only injection defense. |
| **Maintainability** | 5/10 | Good code comments and documentation. Deduction for monolithic router and duplicated logic. |
| **Scalability** | 4/10 | TinyDB, file-based config, single-process locks. Works for current use case. |
| **Overall** | 6/10 | A functional system with one critical bug (`null` coercion) and some architectural debt. The bug is fixable with a small, targeted change. |

### Priority Recommendations (No Code)

1. **P0**: Add `None → ""` coercion to all `str = ""` fields on `Experience`, `Education`, `Project`, and `CustomSectionItem` — matching the existing `PersonalInfo` pattern.
2. **P1**: Add a pre-validation sanitization step in `parser.py` and `improver.py` that recursively coerces `null` to `""` for known string fields before calling `model_validate()`.
3. **P1**: Clarify the prompt rule — replace `"null for optional fields"` with `"null ONLY for: website, linkedin, github, location (when truly unknown). Use "" for all other missing text fields."`.
4. **P2**: Store original file bytes alongside markdown for re-parsing capability.
5. **P2**: Split `resumes.py` into sub-modules (upload, tailor, content-generation, pdf).
6. **P3**: Make `_appears_truncated()` a hard failure + retry rather than a warning.
7. **P3**: Add a circuit breaker for repeated retry failures with identical inputs.

---

*End of audit report.*
