# LinkedIn PDF Import Fix — Implementation Plan

> **Date**: 2026-03-05  
> **Status**: Plan only — no code  
> **Related**: [pipeline-audit.md](../architecture/pipeline-audit.md), [error-visibility-plan.md](error-visibility-plan.md)

---

## Problem Statement

All standard PDFs and DOCX files import correctly. **LinkedIn-exported PDFs** (`Profile.pdf` / `Profile (X).pdf`) consistently fail with:

```
3 validation errors for ResumeData
customSections.publications.items.0.years
  Input should be a valid string [type=string_type, input_value=None, input_type=NoneType]
customSections.publications.items.1.years
  Input should be a valid string [type=string_type, input_value=None, input_type=NoneType]
customSections.publications.items.2.years
  Input should be a valid string [type=string_type, input_value=None, input_type=NoneType]
```

Additionally, a DOCX with similar layout issues also fails:
```
6 validation errors for ResumeData
personalProjects.0.years → None
personalProjects.1.years → None
personalProjects.2.years → None
...
```

---

## Root Cause Analysis (from database evidence)

### What we found in the stored markdown

**LinkedIn PDF (`Profile (2).pdf`)** — markitdown output:

```
Publications                          ← sidebar, no dates

Food Optimizing for Patients with
Kidney Failure Using Evolution
Strategies Algorithm

Optimizing Chicken Feed Using
Evolution strategies (ES) algorithm
```

LinkedIn's PDF export places Publications in the **sidebar column** with **zero date information**. markitdown extracts sidebar and body interleaved, producing a garbled layout where publications appear between the Summary paragraphs and Technical Skills.

**DOCX (`Kt0LVuZ.docx`)** — markitdown output:

```
Aug 2025 – Present        ← dates appear ABOVE the heading
July 2025 - Aug 2025
Jan 2025 – July 2025

# **Projects**            ← heading comes after, disconnected from dates

Autonomous Drone Solo Programmer...
Autonomous Ship Team President...
```

Dates are physically present but disconnected from their entries — the LLM can't confidently pair them, so it returns `null`.

### Why it crashes

Pydantic v2 behavior: `years: str = ""` **rejects** explicit `None`:
- Omitting `years` → uses default `""` ✅
- Sending `years: null` → `ValidationError` ❌

The LLM returns `null` because the prompt says `"null for optional fields"` and the LLM interprets missing dates as "optional absence."

### Why only LinkedIn PDFs (and some DOCX) fail

| Input type | Date extraction | LLM behavior | Result |
|------------|----------------|--------------|--------|
| Standard PDF/DOCX | Dates inline with entries | LLM returns `"2020 - Present"` | ✅ works |
| LinkedIn PDF | Publications have **no dates at all** in sidebar | LLM returns `null` | ❌ crash |
| LinkedIn PDF | Work experience has dates | LLM returns dates correctly | ✅ works |
| DOCX with disconnected dates | Dates on separate lines above heading | LLM can't associate → `null` | ❌ crash |

---

## Implementation Plan

### Fix A: Null Coercion on All `str = ""` Fields (P0 — Critical)

**Defense-in-depth at the schema layer. Applies to ALL uploads, not just LinkedIn.**

**Files**: `apps/backend/app/schemas/models.py`

**What**: Add a `coerce_none_to_empty_string` validator to `Experience`, `Education`, `Project`, and `CustomSectionItem` — matching the existing pattern on `PersonalInfo`.

**Fields to protect** (all `str = ""` defaults without validators):

| Model | Fields |
|-------|--------|
| `Experience` | `title`, `company`, `years` |
| `Education` | `institution`, `degree`, `years` |
| `Project` | `name`, `role`, `years` |
| `CustomSectionItem` | `title`, `years` |

**Implementation detail**:

```python
# On each model, add:
@field_validator("title", "company", "years", mode="before")
@classmethod
def coerce_none_to_empty_string(cls, v: str | None) -> str:
    """LLM may return null for missing fields; coerce to empty string."""
    return v if v is not None else ""
```

**Why this alone fixes 100% of the observed crashes**: Every single error in the database is `years → None`. With this validator, `None` silently becomes `""`, and the resume processes successfully. The user sees an empty years field in the builder, which they can fill in manually if needed.

**Risk**: Zero — this is additive (new validator), uses an established pattern already in the codebase (`PersonalInfo`), and doesn't change any external behavior. `""` is already the default for missing fields.

---

### Fix B: Pre-Validation Sanitization Sweep (P1 — Safety Net)

**Belt-and-suspenders: catch `null` on ANY string field, even ones we didn't think of.**

**Files**: `apps/backend/app/services/parser.py`, `apps/backend/app/services/improver.py`

**What**: Add a recursive sanitization function that walks the raw LLM dict and coerces `null` → `""` on known string-typed fields before calling `model_validate()`.

**Target insertion points** (both places where raw LLM output hits Pydantic):
1. `parser.py:64` — after `complete_json()`, before `ResumeData.model_validate(result)`
2. `improver.py:178` — after `complete_json()`, before `ResumeData.model_validate(result)`

**Implementation approach**:

```python
def sanitize_resume_dict(data: dict) -> dict:
    """Coerce null → "" on all known str-typed fields before Pydantic validation.
    
    This is a safety net: even if we forget to add a field_validator, 
    the LLM returning null won't crash the pipeline.
    """
    STRING_FIELDS = {"title", "company", "years", "institution", "degree", 
                     "name", "role", "subtitle", "summary"}
    
    def _walk(obj):
        if isinstance(obj, dict):
            for key, val in obj.items():
                if key in STRING_FIELDS and val is None:
                    obj[key] = ""
                elif isinstance(val, (dict, list)):
                    _walk(val)
        elif isinstance(obj, list):
            for item in obj:
                if isinstance(item, (dict, list)):
                    _walk(item)
    
    _walk(data)
    return data
```

**Why needed alongside Fix A**: Fix A catches `None` at the Pydantic validator level. Fix B catches it earlier, before validation even runs. Together they form a defense-in-depth where:
- Fix B handles unknown future fields the LLM might populate as `null`
- Fix A is the authoritative schema-level guarantee

---

### Fix C: Prompt Clarification for `null` vs `""` (P1 — Root Cause)

**Reduce the frequency of the LLM returning `null` in the first place.**

**Files**: `apps/backend/app/prompts/templates.py`

**What**: Replace the ambiguous rule in `PARSE_RESUME_PROMPT`:

**Current** (line ~131 of templates.py):
```
- Use "" for missing text fields, [] for missing arrays, null for optional fields
```

**Proposed**:
```
- Use "" for ALL missing text fields (including years, title, company, name, role, institution, degree)
- Use [] for missing arrays
- null is ONLY allowed for: website, linkedin, github, location, subtitle, description (when truly unknown)
- NEVER use null for: years, title, company, name, role, institution, degree — use "" instead
```

**Why**: The current wording asks the LLM to decide which fields are "optional." LinkedIn Publications have no dates, so the LLM classifies `years` as "optional" → `null`. By explicitly listing the fields where `null` is never valid, we remove the ambiguity.

**Risk**: Low — this changes prompt text only. The schema example already shows `years` with string values. We're just making the rule explicit.

---

### Fix D: LinkedIn PDF Layout Awareness in Prompt (P2 — LinkedIn-Specific)

**Help the LLM understand that LinkedIn PDFs have specific layout issues.**

**Files**: `apps/backend/app/prompts/templates.py`

**What**: Add a LinkedIn-awareness hint to `PARSE_RESUME_PROMPT`:

```
- LinkedIn PDF exports may have sidebar content (certifications, publications, skills) 
  interleaved with body text. Treat these as separate sections, not part of the summary.
- If a section (like Publications) has no dates, use "" for the years field — do NOT use null.
- Dates sometimes appear on separate lines before or after their associated entry. 
  Associate dates with the nearest entry by context.
```

**Why**: The LLM receives the garbled markdown and must reconstruct sections. This hint gives it the context that the messy layout is a known pattern, not random corruption.

**Risk**: Very low — additional prompt context. May slightly increase token usage (~50 tokens).

---

### Fix E: Observability — Log LLM Output Before Validation (P2 — Debugging)

**Make future failures easy to diagnose.**

**Files**: `apps/backend/app/services/parser.py`, `apps/backend/app/services/improver.py`

**What**: Before calling `model_validate()`, log the raw LLM output at DEBUG level. On validation failure, log it at WARNING level with the specific fields that failed.

**Implementation approach**:

```python
# In parser.py, around line 64:
try:
    validated = ResumeData.model_validate(result)
    return validated.model_dump()
except ValidationError as e:
    logger.warning(
        "ResumeData validation failed. Errors: %s. Raw LLM keys: %s",
        e.error_count(),
        list(result.keys()) if isinstance(result, dict) else type(result).__name__,
    )
    raise
```

**Why**: Currently, the only evidence of what went wrong is the Pydantic error message stored in `error_message`. We don't see what the LLM actually returned. Logging the raw output (or at least its structure) makes diagnosis instant.

---

## Implementation Order

```
Fix A  ──→  Fix B  ──→  Fix C  ──→  Fix D  ──→  Fix E
 P0          P1          P1          P2          P2
 schema      safety      prompt      prompt      logging
 layer       net         clarity     linkedin    debug
 
 Fixes the    Catches     Reduces     Prevents    Makes future
 crash        edge        LLM null    layout      failures
 100%         cases       frequency   confusion   diagnosable
```

### Estimated Effort

| Fix | Lines changed | Files | Risk | Effort |
|-----|--------------|-------|------|--------|
| A | ~16 lines | 1 | Zero | 5 min |
| B | ~25 lines | 2 | Very low | 10 min |
| C | ~6 lines | 1 | Low | 5 min |
| D | ~5 lines | 1 | Very low | 5 min |
| E | ~12 lines | 2 | Zero | 5 min |
| **Total** | **~64 lines** | **3 files** | **Very low** | **~30 min** |

---

## Validation Strategy

After implementing all fixes:

1. **Retry the failed LinkedIn PDFs**: Hit `POST /resumes/{id}/retry-processing` for the 4 failed `Profile (2).pdf` resumes and the DOCX. They should succeed.
2. **Upload a fresh LinkedIn PDF**: Verify it processes to "ready" without errors.
3. **Upload a standard PDF/DOCX**: Confirm no regressions.
4. **Spot-check processed_data**: Verify `years` fields are `""` (not `null`) for entries without dates.
5. **Run `npm run lint`**: Verify no frontend regressions (no frontend changes expected).

---

## What This Does NOT Change

- **No markitdown changes**: We're not modifying the PDF extraction library. The garbled interleaving is accepted as-is — the fixes work at the LLM and validation layers.
- **No frontend changes**: The frontend already handles `years?: string` (optional string). An empty `""` renders as blank in the builder.
- **No database migration**: Existing successful resumes are unaffected. Failed resumes can be retried.
- **No behavior change for working PDFs**: Standard PDFs that already work will continue working identically.

---

## Summary

The LinkedIn PDF failure is caused by a **chain of three factors**:

1. LinkedIn PDFs have Publications with **no dates** + multi-column layout → garbled markdown
2. The LLM interprets missing dates as "optional" per the ambiguous prompt → returns `null`
3. Pydantic v2 rejects `null` for `str = ""` fields → `ValidationError`

The fix is **defense-in-depth**: Fix A (Pydantic validators) eliminates the crash, Fix B (pre-validation sweep) catches edge cases, Fix C+D (prompt changes) reduce `null` frequency at the source, and Fix E (logging) prevents future blind spots.

Fix A alone solves 100% of the observed failures. Fixes B–E are safety layers.
