# Task 3: Resume Title Shows "IT" — Root Cause Analysis

---

## Symptom

After tailoring a resume for an "IT Project Manager (Intern)" position at Shopee, the tailored resume title on the dashboard and detail page shows only **"IT"** instead of the full job title.

---

## Root Cause

**File**: `apps/backend/app/services/cover_letter.py` (line 137-187)

The title generation flow:

```
1. LLM call with max_tokens=60, reasoning_effort="low"
   → If valid title returned → use it
   → If reasoning text / invalid → fallback
                                      ↓
2. _extract_fallback_title(job_description)
   → Iterates lines, returns first short line that isn't a sentence
```

### The Shopee JD Input

The JD that was pasted starts like:

```
IT Project Manager (Intern)
Inti utama dari pengembangan platform Shopee adalah Tim Software Engineering. Tim yang terdiri dari...
```

BUT the actual input may have been copy-pasted from the Shopee careers page with mixed formatting. Looking at the user's JD screenshot, the first line likely had "IT" as a fragment (e.g., from a breadcrumb or category label like `Departemen > Engineering > IT`).

### `_extract_fallback_title()` Logic (line 51-67)

```python
def _extract_fallback_title(job_description: str, max_len: int = 60) -> str:
    for line in job_description.strip().splitlines():
        cleaned = line.strip().strip("#").strip("*").strip()
        if not cleaned:
            continue
        if len(cleaned) > max_len or ". " in cleaned:
            continue
        return cleaned[:max_len]   # ← Returns FIRST short line!
    return job_description.strip()[:max_len].rstrip()
```

This returns the **first short line** that doesn't look like a sentence. If the JD text starts with a line that is just `"IT"` (e.g., from a department label, metadata, or breadcrumb), the function returns `"IT"` instantly.

### Why the LLM Fallback Was Triggered

With `gpt-oss-120b` (reasoning model) + `max_tokens=60` + `reasoning_effort="low"`:
- The model wastes tokens on thinking (e.g., "Let me extract the title...")
- Only 60 tokens total → reasoning text takes most of the budget
- `_is_valid_title()` rejects multi-line or reasoning-patterned output
- Falls back to `_extract_fallback_title()` which returns "IT"

For Gemini Flash, the LLM likely returned the correct title directly.

---

## Fix

### Option A: Smarter Fallback (Recommended)

Skip very short lines (<5 chars) in `_extract_fallback_title()`:

```python
def _extract_fallback_title(job_description: str, max_len: int = 60) -> str:
    for line in job_description.strip().splitlines():
        cleaned = line.strip().strip("#").strip("*").strip()
        if not cleaned or len(cleaned) < 5:  # ← Skip fragments like "IT"
            continue
        if len(cleaned) > max_len or ". " in cleaned:
            continue
        return cleaned[:max_len]
    return job_description.strip()[:max_len].rstrip()
```

### Option B: Increase max_tokens for title generation

Change `max_tokens=60` → `max_tokens=120` in `generate_resume_title()` to give reasoning models more room.

### Recommended: Both A + B

---

## Update (2026-03-08)

Xiaomi MiMo model correctly generated **"IT Project Manager Intern @ Shopee"** for the same JD.
This confirms the issue is **gpt-oss-specific** — the reasoning model wastes tokens on thinking,
triggers the fallback, and the fallback picks up a short "IT" fragment.

Gemini Flash also succeeded. The fix is still recommended (defensive), but severity is **LOW**
since the issue only affects reasoning models with aggressive `max_tokens` limits.

## File to modify

| File | Change |
|------|--------|
| `apps/backend/app/services/cover_letter.py` | Line 57: add `len(cleaned) < 5` skip, Line 175: bump max_tokens |
