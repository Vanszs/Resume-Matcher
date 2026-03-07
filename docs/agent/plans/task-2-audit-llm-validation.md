# Task 2: Audit Report — LLM Validation & Refiner Errors

> **Date**: 2026-03-08
> **Models tested**: `openai/gpt-oss-120b`, `gemini/gemini-3-flash-preview`, `openrouter/moonshotai/mimo-7b-rl` (Xiaomi MiMo)

---

## Issue A: `sectionType: 'keyValue'` Validation Error (gpt-oss)

### Symptom

```
WARNING:app.services.improver:ResumeData validation failed in improver (1 error(s)).
ERROR:app.routers.resumes:Tailor task failed: 1 validation error for ResumeData
sectionMeta.4.sectionType
  Input should be 'personalInfo', 'text', 'itemList' or 'stringList'
  [type=enum, input_value='keyValue', input_type=str]
```

### Root Cause

The LLM returns `sectionType: "keyValue"` in the `sectionMeta` array, but the Pydantic enum `SectionType` only accepts 4 values:

**File**: `apps/backend/app/schemas/models.py` (line 114-119)
```python
class SectionType(str, Enum):
    PERSONAL_INFO = "personalInfo"
    TEXT = "text"
    ITEM_LIST = "itemList"
    STRING_LIST = "stringList"
```

The sanitizer in `apps/backend/app/services/improver.py` (`_sanitize_resume_dict`, line 48-61) handles raw lists in `customSections` but does **not** coerce unknown `sectionType` values.

### Fix (MEDIUM priority)

Add a coercion step in `_sanitize_resume_dict()` that maps unknown `sectionType` values to known ones:

```python
# In _sanitize_resume_dict(), add after the customSections handling:
if "sectionMeta" in data and isinstance(data.get("sectionMeta"), list):
    VALID_TYPES = {"personalInfo", "text", "itemList", "stringList"}
    FALLBACK_MAP = {"keyValue": "itemList", "bulletList": "stringList"}
    for meta in data["sectionMeta"]:
        if isinstance(meta, dict) and meta.get("sectionType") not in VALID_TYPES:
            original = meta["sectionType"]
            meta["sectionType"] = FALLBACK_MAP.get(original, "text")
            logger.warning("Coerced unknown sectionType '%s' → '%s'", original, meta["sectionType"])
```

---

## Issue B: Truncation Warnings (Both models)

### Symptom

```
WARNING:root:Possible truncation detected: missing required section 'personalInfo'
WARNING:root:Parsed JSON appears truncated, but proceeding with result
```

### Root Cause

The LLM JSON output doesn't include a top-level `personalInfo` key. This happens because:
- The LLM was only asked to generate tailored content (skills, summary, experience), not the full resume structure
- The `personalInfo` section is preserved from the master resume and merged in later

### Assessment

**Not a bug** — this is a warning that fires before the merge step. The warning text is misleading since `personalInfo` is intentionally excluded from the tailored output. Could reduce log noise by:
- Suppressing this specific warning, OR
- Only warning about truly required fields in the tailored response

**LOW priority** — cosmetic log noise only.

> **Update (2026-03-08)**: MiMo (Xiaomi) also produces this same warning. Confirmed cross-model — this is by design, not a model-specific issue.

---

## Issue C: Refiner Alignment Violations (Gemini Flash)

### Symptom

```
WARNING:app.services.refiner:Alignment violations found: 8 total, 8 critical
ERROR:app.services.refiner:Critical alignment violations detected - blocking resume:
  ['presentations', 'it service management', 'reporting', 'uat/sit support',
   'spreadsheets', 'it project management', 'documentation', 'word processing']
```

### Root Cause

**File**: `apps/backend/app/services/refiner.py` (line 242-340, `validate_master_alignment()`)

The refiner checks whether skills in the tailored resume exist in the master resume. A skill is flagged as **"critical"** if it appears in the tailored output but **not anywhere** in the master resume text (not just the skills list — the entire markdown content).

Skills like "presentations", "it service management", "documentation" etc. were added by the LLM to match the JD (IT Project Manager Intern) but **don't appear anywhere** in the master resume.

**File**: `apps/backend/app/services/refiner.py` (line 460-506, `fix_alignment_violations()`)

The fix action is to **strip these skills from the output** (not reject the resume entirely). The word "blocking" in the log is misleading — it means "blocking those specific skills from appearing", not blocking the entire resume.

### Assessment

**Working as designed** — this is the anti-fabrication guard (LLM-008). Skills that the candidate doesn't actually have get removed. The UX impact is that the final tailored resume has fewer skills than what the LLM suggested.

**No code fix needed.** If users want those skills, they should add them to their master resume first.

---

## Issue D: Confirm & Save Fails on First Click (Gemini Flash)

### Symptom

Screenshot shows "Failed to confirm resume. Please try again." — but second click succeeds.

### Analysis

From logs:
```
POST /api/v1/resumes/improve/confirm HTTP/1.1" 200 OK
```

The confirm request succeeds on the backend (200 OK). The first-click failure is likely a **frontend race condition**:

1. User clicks "Confirm & Save"
2. Frontend sends confirm + immediately tries to navigate or fetch the new resume
3. The new resume isn't fully written to DB yet on the first attempt
4. Second click: DB write has completed, fetch succeeds

**Or** a timing issue with the refiner stripping skills → the confirm response data doesn't match what the diff modal expected (stale state).

### Fix (MEDIUM priority)

Need to check the confirm handler in `tailor/page.tsx` for:
- Race conditions between confirm API call and post-confirm actions
- Whether the confirm handler awaits properly before navigating
- Error handling specifics (what exactly fails on first click)

---

## Issue E: gpt-oss Master Resume Parse Quality

### Symptom

> "gpt oss saya coba selalu error, bahkan hasil parse master resume jelek"

### Root Cause

`gpt-oss-120b` is a reasoning model that tends to:
1. Prepend reasoning/thinking text before JSON output
2. Use non-standard field names like `keyValue` instead of the documented `itemList`
3. Truncate long JSON outputs due to reasoning tokens consuming the context window

The `reasoning_effort: "low"` setting (via `_get_reasoning_effort()` in `llm.py`) should reduce this, and `litellm.drop_params = True` prevents the `UnsupportedParamsError`, but the model's JSON conformance is fundamentally weaker than Gemini Flash for structured output tasks.

### Recommendation

- **Use Gemini Flash or GPT-4o** for best results with this app's JSON schema requirements
- **If using gpt-oss**: The `sectionType` coercion fix (Issue A) will catch most validation failures
- Consider adding a model-specific instruction in the prompt to warn against inventing field names

---

## Summary

| Issue | Severity | Status | Fix Needed |
|-------|----------|--------|------------|
| A: `keyValue` sectionType | MEDIUM | Fixable | Coerce unknown types in sanitizer |
| B: Truncation warning | LOW | By design | Optional: reduce log noise |
| C: Alignment violations | INFO | By design | No fix — anti-fabrication guard |
| D: First-click confirm fail | MEDIUM | Needs debug | Check race condition |
| E: gpt-oss quality | INFO | Model limitation | Use better model or add coercion |
