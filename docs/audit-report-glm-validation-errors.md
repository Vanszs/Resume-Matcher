# Audit Report: Resume Matcher — Validation, Rendering & UX Errors

> **Date**: March 2026 (updated March 5, 2026)  
> **Models**: GLM-4-7 Flash (30B), gpt-oss-120b (120B) — both via Novita provider  
> **Status**: Errors 1–3, 5, 7–9 **FIXED**. Errors 4 and 6 open (low/medium priority).

| Error | Description | Status |
|-------|-------------|--------|
| 1 | `customSections: []` Pydantic crash | ✅ Fixed |
| 2 | `sectionMeta` wrong field names | ✅ Fixed |
| 3 | `customSections` raw list values | ✅ Fixed |
| 4 | Cloudflare 524 timeout | ⏳ Open |
| 5 | JSON envelope wrapping `{"final{"` | ✅ Fixed |
| 6 | Keyword injection truncation | ⏳ Open |
| 7 | False-positive alignment violations | ✅ Fixed |
| 8 | PDF download 503 (wrong port) | ✅ Fixed |
| 9 | Dead download button (no error feedback) | ✅ Fixed |

---

## Summary

Resume preview fails or produces degraded output with smaller/medium models via Novita provider. Two classes of errors observed:

1. **Pydantic validation errors** (GLM-4-7 Flash) — model too small to follow complex JSON schema
2. **JSON truncation + false-positive alignment blocking** (gpt-oss-120b) — model wraps output in unexpected keys, and the refiner's alignment checker incorrectly flags skills extracted from work experience as "fabricated"
3. **PDF download 503** — `FRONTEND_BASE_URL` misconfiguration causes Playwright to timeout waiting for `.resume-print` selector
4. **Dead download button** — preview page silently swallows download errors with no user feedback

The same code works cleanly with GPT-5 Nano (upstream default) because that model produces correctly-shaped, complete JSON.

---

## Errors Identified

### Error 1: `customSections` — `[]` instead of `{}` ✅ FIXED

- **Pydantic error**: `Input should be a valid dictionary [type=dict_type]`
- **Location**: `ResumeData.customSections: dict[str, CustomSection]`
- **What happens**: GLM returns `"customSections": []` (empty list) instead of `"customSections": {}` (empty dict)
- **File**: `apps/backend/app/schemas/models.py` — `ResumeData` class
- **Fix applied** (`schemas/models.py`): Added `_normalize_custom_sections` `field_validator(mode='before')` on `ResumeData.customSections` — coerces `[]` or `None` → `{}`, discards non-empty non-dict with warning.

### Error 2: `sectionMeta` — Wrong field names ✅ FIXED

- **Pydantic error**: `Field required [type=missing]` for `id`, `key`, `displayName`, `sectionType`
- **Location**: `ResumeData.sectionMeta: list[SectionMeta]`
- **What happens**: GLM returns `{"title": "...", "type": "..."}` instead of `{"id": "...", "key": "...", "displayName": "...", "sectionType": "..."}`
- **Root cause**: `RESUME_SCHEMA_EXAMPLE` in `prompts/templates.py` did NOT include any `sectionMeta` example
- **Fix applied**:
  1. (`prompts/templates.py`): Added `sectionMeta` array with 2 example items to `RESUME_SCHEMA_EXAMPLE` showing exact field names (`id`, `key`, `displayName`, `sectionType`, `isDefault`, `isVisible`, `order`). Alias `RESUME_SCHEMA = RESUME_SCHEMA_EXAMPLE` means all improve prompts pick it up automatically.
  2. (`schemas/models.py`): Added `_normalize_section_meta` `field_validator(mode='before')` on `ResumeData.sectionMeta`. Remaps known aliases (`title→displayName`, `type→sectionType`) then derives `id`/`key` from `displayName` if absent. Items still missing required fields are dropped with a warning log.

### Error 3: `customSections.Publications` — List instead of CustomSection ✅ FIXED

- **Pydantic error**: `Input should be a valid dictionary or instance of CustomSection [type=model_type]`
- **Location**: `ResumeData.customSections['Publications']`
- **What happens**: GLM returns `"Publications": ["paper1", "paper2"]` (raw list) instead of `"Publications": {"sectionType": "stringList", "strings": ["paper1", "paper2"]}`
- **Fix applied** (`services/improver.py` `_sanitize_resume_dict()`): Added structural coercion block that runs before the recursive null-coercion loop. For each `customSections` value that is a raw list: if first element is a dict → wraps as `{"sectionType": "itemList", "items": [...]}`, otherwise → wraps as `{"sectionType": "stringList", "strings": [...]}`. Acts as defense-in-depth alongside the Pydantic validator in Error 1.

### Error 4: Cloudflare 524 Timeout

- **Error**: HTTP 524 from Cloudflare
- **Location**: Frontend → Backend (via Cloudflare proxy)
- **What happens**: Chained LLM calls in `improve_resume_preview_endpoint()` (extract_keywords → improve_resume → refine_resume) exceed Cloudflare's 100s timeout
- **File**: `apps/backend/app/routers/resumes.py` — `improve_resume_preview_endpoint()` (line 752)
- **Fix needed**: Optimize LLM call chain or increase Cloudflare timeout

### Error 5: JSON truncation — `{"final{"` (gpt-oss-120b) ✅ FIXED

- **Error**: `No JSON found in response: {"final{"`
- **Location**: `llm.py` → `_extract_json()` → `complete_json()` retry loop
- **What happens**: gpt-oss-120b wraps its JSON output in an unexpected key (e.g. `"final_resume": {...}`) and the response gets truncated mid-stream, producing malformed `{"final{"`.
- **Fix applied** (`llm.py`): Added `_unwrap_json_envelope(data)` function, called inside `complete_json()` after `json.loads()` but before `_appears_truncated()`. Unwraps only when: (1) exactly 1 top-level key, (2) key is in a known envelope allowlist (`final`, `final_resume`, `resume`, `result`, `output`, `response`, `json`, `data`, `content`, `answer`), AND (3) the value dict contains `personalInfo` — preventing false positives on legitimate resume structures. Logged at INFO level when triggered. The brace-matching parser in `_extract_json()` detects `depth=1` (unbalanced) and raises `ValueError`.
- **Log sequence**:
  ```
  WARNING: JSON extraction found unbalanced braces (depth=1), possible truncation
  ERROR: Could not extract JSON from response format. Content preview: {"final{"
  WARNING: JSON parse failed (attempt 1): No JSON found in response: {"final{"
  ```
- **Recovery**: The retry mechanism in `complete_json()` appends a hint (`"IMPORTANT: Output ONLY a valid JSON object"`) and retries with higher temperature. Second attempt succeeds.
- **Root cause**: Model wraps output in a non-schema key + possible `max_tokens` truncation. The 8192 `max_tokens` in `improve_resume()` may be insufficient for large resumes with this model.
- **File**: `apps/backend/app/llm.py` — `_extract_json()` (line ~648), `complete_json()` (line ~680)
- **Upstream parity**: Same code in both fork and upstream. Upstream unaffected because GPT-5 Nano doesn't wrap output.
- **Fix needed**: 
  1. Add unwrapping logic in `_extract_json()` for common wrapper keys (`final`, `final_resume`, `resume`, `result`)
  2. Consider increasing `max_tokens` for Novita models

### Error 6: Keyword injection truncation — Missing `personalInfo`

- **Error**: `Possible truncation detected: missing required section 'personalInfo'`
- **Location**: `llm.py` → `_appears_truncated()` inside `complete_json()`, called during **keyword injection** step in `refine_resume()`
- **What happens**: The keyword injection LLM call (`inject_keywords()` in `refiner.py`) sends the full resume + master + JD as prompt. gpt-oss-120b returns truncated JSON missing the `personalInfo` key. `_appears_truncated()` logs a warning but `complete_json()` **proceeds anyway** (it only warns, does not raise).
- **Log sequence**:
  ```
  WARNING: Possible truncation detected: missing required section 'personalInfo'
  WARNING: Parsed JSON appears truncated, but proceeding with result
  ```
- **Impact**: The truncated result passes to `_validate_resume_structure()` in `inject_keywords()`, which catches the missing `personalInfo` and falls back to the un-injected resume. **No data loss**, but keyword injection is silently skipped.
- **Root cause**: The keyword injection prompt is very large (current resume + master resume + JD). Combined with 8192 `max_tokens`, smaller models run out of output space.
- **File**: `apps/backend/app/services/refiner.py` — `inject_keywords()` (line ~375)
- **Upstream parity**: Same code in both fork and upstream.
- **Fix needed**: 
  1. `_appears_truncated()` should return the result but add a flag so callers can decide severity
  2. Consider reducing prompt size for keyword injection (only send relevant sections, not full resumes)

### Error 7: False-positive alignment violations — Skills blocked as "fabricated" ✅ FIXED

- **Error**: `Critical alignment violations detected - blocking resume: ['typescript', 'javascript']`
- **Location**: `refiner.py` → `validate_master_alignment()` → `fix_alignment_violations()`
- **What happens**: LLM promotes skills from work experience descriptions to `technicalSkills`. Old checker only compared skills list-to-list → flagged them `critical` → removed from output.
- **Fix applied** (`services/refiner.py` `validate_master_alignment()`): Now calls `_extract_all_text(master)` (already existing in the same file) once at the top of the function. For each skill not in the master `technicalSkills` list, calls `_keyword_in_text(skill, master_full_text)` (also already existing). If found → severity `"warning"` (logged at DEBUG). If truly absent from all master text → severity `"critical"`. `fix_alignment_violations()` only acts on `severity == "critical"`, so warning-severity false positives are preserved. Company fabrication check is unchanged (companies are always critical).
- **Log sequence**:
  ```
  WARNING: Alignment violations found: 2 total, 2 critical
  ERROR: Critical alignment violations detected - blocking resume: ['typescript', 'javascript']
  ```
- **Impact**: Legitimate, resume-supported skills are removed from the tailored output. The resume still returns 200 OK, but is **degraded** — missing skills that the user actually has.
- **Root cause**: `validate_master_alignment()` (line ~245 in `refiner.py`) compares ONLY `additional.technicalSkills` arrays. It does NOT check whether the skill appears anywhere else in the master resume (work experience descriptions, project descriptions, summary, custom sections). This causes false positives when the LLM correctly extracts skills from descriptions and promotes them to the skills list.
- **Code**:
  ```python
  # refiner.py line ~261-270 — ONLY checks technicalSkills list
  tailored_skills = set(
      s.lower() for s in tailored.get("additional", {}).get("technicalSkills", [])
  )
  master_skills = set(
      s.lower() for s in master.get("additional", {}).get("technicalSkills", [])
  )
  for skill in tailored_skills - master_skills:  # Flags as fabricated!
      violations.append(AlignmentViolation(..., severity="critical"))
  ```
- **File**: `apps/backend/app/services/refiner.py` — `validate_master_alignment()` (line ~245)
- **Upstream parity**: **Same bug in upstream.** Upstream is unaffected in practice because GPT-5 Nano rarely promotes skills from descriptions to the skills list.
- **Fix needed**:
  1. Check skills against **full master resume text** (not just `technicalSkills` array) before flagging as fabricated
  2. Downgrade severity from `critical` to `warning` if the skill appears in master resume descriptions
  3. Alternative: add a `_extract_all_text(master)` check — if skill is found anywhere in master text, it's NOT fabricated

### Error 8: PDF download 503 — `FRONTEND_BASE_URL` port mismatch ✅ FIXED

- **Error**: `Failed to download resume (status 503): {"detail":"PDF rendering failed: Page.wait_for_selector: Timeout 30000ms exceeded..."}`
- **Root cause**: `FRONTEND_BASE_URL` defaulted to port 3000; production frontend runs on port 3002.
- **Fix applied**:
  1. (`apps/backend/.env`): `FRONTEND_BASE_URL=http://localhost:3002` set explicitly.
  2. (`apps/backend/app/config.py` line 142): Default changed from `"http://localhost:3000"` → `"http://localhost:3002"` so a missing `.env` no longer silently breaks PDF.
  3. (`apps/backend/.env` `CORS_ORIGINS`): Removed `:3000` entries — now only `["http://localhost:3002","http://127.0.0.1:3002"]`.
- **Location**: Backend `pdf.py` → `_render_page_to_pdf()` → `page.wait_for_selector(".resume-print")`
- **What happens**: When user clicks "Download Resume" (from edit mode or preview page), the backend builds a print URL using `FRONTEND_BASE_URL` (default `http://localhost:3000`) and tells Playwright to visit it. Playwright navigates to the URL, waits up to 30s for a `.resume-print` CSS selector to appear, but it never does — resulting in a timeout and 503 error.
- **Root cause**: **`FRONTEND_BASE_URL` points to the wrong port.** 
  - The production Next.js frontend runs on port **3002** (confirmed: `127.0.0.1:3002` via `ss -tlnp`, nginx proxies to it)
  - `FRONTEND_BASE_URL` defaults to `http://localhost:3000` (no `.env` override set)
  - Port 3000 hosts a **different service** — it returns HTTP 404 for `/print/resumes/...`
  - Playwright loads the 404 page, which has no `.resume-print` element, and times out
- **Verification**:
  ```
  curl http://localhost:3000/print/resumes/test  → 404 (wrong service)
  curl http://localhost:3002/print/resumes/test  → 307 (correct Next.js, redirects to login)
  ```
- **PDF rendering flow**:
  1. Frontend calls `GET /api/v1/resumes/{id}/pdf` with JWT
  2. Backend extracts JWT, builds URL: `{FRONTEND_BASE_URL}/print/resumes/{id}?...&token={jwt}`
  3. Playwright visits URL → Next.js server component fetches resume data from backend → renders `.resume-print` div
  4. Playwright waits for `.resume-print`, generates PDF, returns bytes
  5. **Step 3 fails** because `FRONTEND_BASE_URL` points to wrong port
- **Files**:
  - `apps/backend/app/config.py` (line 142) — `frontend_base_url: str = "http://localhost:3000"`
  - `apps/backend/app/routers/resumes.py` (line ~1453) — `url = f"{settings.frontend_base_url}/print/resumes/{resume_id}?{params}"`
  - `apps/backend/app/pdf.py` (line ~143) — `await page.wait_for_selector(selector)` — 30s default timeout
- **Upstream parity**: Upstream has same default (`http://localhost:3000`). Works for upstream because upstream runs frontend on default port 3000. This is a **deployment-specific** issue — the fork runs on port 3002. Not a code bug per se, but a missing `.env` configuration.
- **Fix needed**:
  1. **Immediate**: Set `FRONTEND_BASE_URL=http://localhost:3002` in `apps/backend/.env`
  2. **Defensive**: Add a startup health check that verifies `FRONTEND_BASE_URL` is reachable
  3. **Better error**: Add a more descriptive error message when `.resume-print` selector times out (currently returns raw Playwright error)

### Error 9: "Dead" Download button on preview page — no error feedback ✅ FIXED

- **Error**: Button appears to do nothing when clicked (silent failure)
- **Location**: `apps/frontend/app/(default)/resumes/[id]/page.tsx` — `handleDownload()`
- **Fix applied** (`app/(default)/resumes/[id]/page.tsx`):
  1. Added `isDownloading` and `downloadError` state variables (pattern matching `isRetrying`/`deleteError` already in the same file).
  2. `handleDownload` now: calls `setIsDownloading(true)` at entry; adds `finally { setIsDownloading(false) }`; on HTTP errors (503 etc.) sets `downloadError` message instead of silently swallowing.
  3. Download button gets `disabled={isDownloading}` and shows `<Loader2 animate-spin>` + `t('common.loading')` while in-flight.
  4. Error is displayed via a `<ConfirmDialog variant="danger">` (same component and pattern used for `deleteError` in the same file — no new components).
- **What happens**: When the PDF download fails (e.g., with Error 8's 503), the `handleDownload` function on the resume preview page catches the error but **only logs it to console** — no toast, no alert, no visible feedback to the user. The button appears "dead" or unresponsive.
- **Code**:
  ```tsx
  // resumes/[id]/page.tsx — preview page handleDownload
  const handleDownload = async () => {
    try {
      const blob = await downloadResumePdf(resumeId, undefined, uiLanguage);
      // ... success path
    } catch (err) {
      console.error('Failed to download resume:', err);  // Only logs!
      if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
        // ... network fallback (TypeError only)
        return;
      }
      // HTTP errors (503, 500, etc.) fall through here — NO user notification!
    }
  };
  ```
- **Comparison with builder page**: The builder's `handleDownload` (`components/builder/resume-builder.tsx` line ~432) has proper error handling:
  - Shows `showNotification(errorMessage, 'danger')` for all errors
  - Has `isDownloading` state for loading indicator
  - Has `finally { setIsDownloading(false) }` cleanup
- **Upstream parity**: **Same bug in upstream.** The preview page's `handleDownload` is identical in upstream — no error notification for HTTP errors.
- **Fix needed**:
  1. Add error notification (toast/alert) for non-network errors (e.g., `alert(err.message)` or use a notification system)
  2. Add loading state (`isDownloading`) so button shows visual feedback during download
  3. Add `finally` block to reset loading state

---

## Root Cause Analysis

### Why GLM-4-7 Flash fails but GPT-5 Nano works

| Factor | GLM-4-7 Flash | GPT-5 Nano |
|--------|---------------|------------|
| Model size | 7B parameters | Larger |
| JSON schema adherence | Poor — guesses field names | Good — follows schema |
| JSON mode support | Not in `_supports_json_mode()` list | Supported via OpenAI provider |
| Provider | Novita (OpenAI-compatible proxy) | OpenAI native |

### Why gpt-oss-120b partially fails

| Factor | gpt-oss-120b | GPT-5 Nano |
|--------|-------------|------------|
| Model size | 120B parameters | Larger/smarter |
| JSON output | Wraps in `{"final...` key, truncates | Clean direct JSON |
| Schema adherence | Good on retry, but adds skills from descriptions | Strict — only uses existing skills list |
| Keyword injection | Truncated output (missing personalInfo) | Complete output |
| Provider | Novita (OpenAI-compatible proxy) | OpenAI native |

**gpt-oss-120b is a "partial success" model**: it produces valid resume JSON on retry, but triggers two downstream issues — keyword injection truncation (silently skipped) and false-positive alignment violations (skills incorrectly removed).

### Contributing Code Issues

1. **Missing prompt example**: `RESUME_SCHEMA_EXAMPLE` in `prompts/templates.py` omits `sectionMeta` entirely — even good models would guess the field structure
2. **No defensive coercion**: `_sanitize_resume_dict()` in `services/improver.py` only handles null→"" for strings, not structural type mismatches
3. **No field validators**: `ResumeData` model lacks `field_validator` for `customSections` and `sectionMeta` to coerce common LLM mistakes
4. **JSON mode gap**: `_supports_json_mode()` in `llm.py` doesn't include GLM/Zhipu provider
5. **Alignment checker too narrow** (NEW): `validate_master_alignment()` only compares `technicalSkills` arrays, not full resume text — causes false positives when LLM promotes skills from work experience descriptions
6. **No JSON unwrapping** (NEW): `_extract_json()` doesn't handle models that wrap output in unexpected keys like `"final"`, `"result"`, etc.
7. **Keyword injection prompt too large** (NEW): `inject_keywords()` sends full resume + master + JD, exceeding smaller models' effective output window

### Bug exists in BOTH codebases

The fork is actually AHEAD of upstream (has `_sanitize_resume_dict()`, `coerce_none_to_empty_string` validators, reasoning model retry, Novita provider support, etc.), and is now further ahead with the fixes listed above:
- ✅ Structural coercion for `customSections` and `sectionMeta` (upstream still missing)
- ✅ Full-text alignment checking (upstream still list-to-list only)
- ✅ JSON unwrapping for non-schema wrapper keys (upstream still missing)
- ✅ Preview page download error feedback (upstream still silent)

Upstream works only because GPT-5 Nano is smart enough to produce correct JSON and doesn't promote skills from descriptions. PDF download works in upstream because default port 3000 is correct there.

### PDF download & UX issues

| Issue | Fork | Upstream |
|-------|------|----------|
| `FRONTEND_BASE_URL` wrong port | ✅ Fixed — `.env` + `config.py` default updated to 3002 | Works — port 3000 matches default |
| `CORS_ORIGINS` included port 3000 | ✅ Fixed — removed `:3000` entries | N/A |
| Preview `handleDownload` silent failure | ✅ Fixed — `ConfirmDialog` error + `isDownloading` state | Still broken |
| Builder `handleDownload` error handling | Proper — has `showNotification` | Proper — has `showNotification` |

---

## Recommended Fixes (Priority Order)

### Critical (Errors 8, 9 — PDF download completely broken)

1. ✅ **Set `FRONTEND_BASE_URL=http://localhost:3002`** in `apps/backend/.env` *(Error 8)*
2. ✅ **Add error notification to preview page `handleDownload`** *(Error 9)*

### High Priority (Errors 5, 7 — data loss / degraded output)

3. ✅ **Fix alignment checker false positives** — full-text check, downgrade to `warning` if in master descriptions *(Error 7)*
4. ✅ **Add JSON unwrapping for wrapper keys** — `_unwrap_json_envelope()` in `complete_json()` *(Error 5)*

### Medium Priority (Errors 1–3, 6 — validation failures)

5. ✅ **Add `sectionMeta` example to `RESUME_SCHEMA_EXAMPLE`** *(Error 2)*
6. ✅ **Add `field_validator` on `ResumeData.customSections`** *(Error 1)*
7. ✅ **Add `field_validator` on `ResumeData.sectionMeta`** *(Error 2)*
8. ✅ **Add structural coercion in `_sanitize_resume_dict()`** *(Error 3)*
9. ⏳ **Reduce keyword injection prompt size** — send only relevant resume sections instead of full documents *(Error 6)*

### Low Priority (Nice to have)

10. ⏳ **Consider adding GLM to `_supports_json_mode()`** — if Novita supports it *(Error 1-3)*
11. ⏳ **Increase `max_tokens` for Novita models** — reduce truncation likelihood *(Error 5, 6)*
12. ⏳ **Optimize LLM call chain for Cloudflare timeout** *(Error 4)*
13. ⏳ **Add startup health check for `FRONTEND_BASE_URL`** *(Error 8)*

---

## Files Affected

| File | Change | Status |
|------|--------|--------|
| `apps/backend/.env` | Added `FRONTEND_BASE_URL=http://localhost:3002`; removed `:3000` from `CORS_ORIGINS` | ✅ Fixed |
| `apps/backend/app/config.py` | Default `frontend_base_url` changed `3000` → `3002` | ✅ Fixed |
| `apps/backend/app/llm.py` | Added `_unwrap_json_envelope()` + `_JSON_ENVELOPE_KEYS`; called in `complete_json()` after `json.loads()` | ✅ Fixed |
| `apps/backend/app/schemas/models.py` | Added `logging` import; added `_normalize_custom_sections` and `_normalize_section_meta` `field_validator`s to `ResumeData` | ✅ Fixed |
| `apps/backend/app/services/refiner.py` | `validate_master_alignment()`: added `_extract_all_text(master)` full-text check; skills/certs found in master text downgraded to `"warning"` | ✅ Fixed |
| `apps/backend/app/services/improver.py` | `_sanitize_resume_dict()`: added structural coercion block for raw `customSections` list values | ✅ Fixed |
| `apps/backend/app/prompts/templates.py` | Added `sectionMeta` array example to `RESUME_SCHEMA_EXAMPLE` | ✅ Fixed |
| `apps/frontend/app/(default)/resumes/[id]/page.tsx` | Added `isDownloading`/`downloadError` state; `handleDownload` with `finally` + `ConfirmDialog` error; button `disabled` + spinner | ✅ Fixed |
| `apps/backend/app/services/refiner.py` | `inject_keywords()` prompt size — still sends full resumes | ⏳ Open |
| `apps/backend/app/llm.py` | `_supports_json_mode()` — GLM not in list | ⏳ Open |
| `apps/backend/app/routers/resumes.py` | `improve_resume_preview_endpoint()` — chained LLM calls / Cloudflare timeout | ⏳ Open |

---

## Observed Scenarios

### Scenario A: GLM-4-7 Flash (7B) — Full failure
- Pydantic validation crashes on malformed JSON structure
- Errors 1-4 apply

### Scenario B: gpt-oss-120b (120B) — First attempt fails, retry succeeds with degraded output
- **Attempt 1**: Model wraps JSON in `{"final{"` → truncated → retry
- **Attempt 2**: Valid JSON produced, but keyword injection truncated (silently skipped)
- **Alignment check**: Skills like `typescript`, `javascript` removed as "fabricated" (false positive)
- **Result**: 200 OK but resume is degraded (missing injected keywords + incorrectly removed skills)
- Errors 5-7 apply

### Scenario C: GPT-5 Nano — Clean success
- All steps complete without warnings
- No alignment violations (model doesn't promote skills from descriptions)
- Upstream default, no issues

### Scenario D: PDF download — 503 from any model
- User clicks "Download Resume" on edit mode or preview page
- Backend builds print URL with `FRONTEND_BASE_URL=http://localhost:3000`
- Playwright visits wrong port → 404 page → no `.resume-print` → 30s timeout → 503
- **Preview page**: Button appears dead (no error shown to user) — Error 9
- **Builder page**: Shows error notification (proper handling)
- Errors 8-9 apply
- **Not model-dependent** — happens regardless of LLM provider
