# Fix Plan: Cloudflare 524 Timeout on `/improve/preview`

> **Goal**: Eliminate 524 timeouts, ensure every AI model (fast cloud or slow local Ollama) works reliably, and give the user real-time progress feedback.

---

## Table of Contents

- [Problem Summary](#problem-summary)
- [Timeout Budget](#timeout-budget)
- [Phase 1 — Immediate Bug Fixes (no architecture change)](#phase-1--immediate-bug-fixes-no-architecture-change)
- [Phase 2 — Async Task Pattern for Tailoring](#phase-2--async-task-pattern-for-tailoring)
- [Phase 3 — Frontend UX: Progress & Cancellation](#phase-3--frontend-ux-progress--cancellation)
- [Phase 4 — Background Keyword Pre-Extraction](#phase-4--background-keyword-pre-extraction)
- [Phase 5 — Resilience & Edge Cases](#phase-5--resilience--edge-cases)
- [File Change Map](#file-change-map)
- [Migration & Rollback](#migration--rollback)

---

## Problem Summary

The `POST /api/v1/resumes/improve/preview` endpoint runs **3 sequential LLM calls** in a single HTTP request:

```
extract_job_keywords (complete_json, max_tokens=15000)  →  30-120s
improve_resume       (complete_json, max_tokens=8192)   →  30-120s
inject_keywords      (complete_json, max_tokens=8192)   →  30-120s
                                                TOTAL   →  90-360s
```

Cloudflare Free/Pro plans enforce a **100-second hard timeout**. The backend cannot respond in time, so Cloudflare returns a 524 HTML error page. The frontend doesn't recognize this and shows a generic "Failed to preview resume" message.

---

## Timeout Budget

| Layer | Current | Limit | Problem |
|-------|---------|-------|---------|
| Cloudflare edge | — | **100s** (hard, non-configurable on Free/Pro) | Kills connection |
| nginx `proxy_read_timeout` | 300s | — | Too generous; lets backend run for nothing |
| `_calculate_timeout` per LLM call | 360–1318s | — | Absurdly high; backend waits forever |
| `complete_json` retries | 3 attempts | — | Retries on ALL errors including timeouts |
| **Total worst case** | **2758s** (Ollama) | **100s** | 27x over budget |

---

## Phase 1 — Immediate Bug Fixes (no architecture change)

> **Goal**: Reduce blast radius so timeouts are shorter and errors are clearer.
> These fixes are safe to ship independently even before Phase 2.

### 1.1 Cap `_calculate_timeout` at sane maximums

**File**: `apps/backend/app/llm.py` — `_calculate_timeout()`

**Problem**: `token_factor = max(1.0, max_tokens / 4096)` with `max_tokens=15000` yields 3.66x multiplier → 659s per call.

**Fix**: Cap the returned timeout at 90s absolute maximum. No single LLM call should wait longer than what Cloudflare allows for the entire request.

```python
def _calculate_timeout(
    operation: str,
    max_tokens: int = 4096,
    provider: str = "openai",
) -> int:
    base_timeouts = {
        "health_check": LLM_TIMEOUT_HEALTH_CHECK,  # 30
        "completion": LLM_TIMEOUT_COMPLETION,        # 120
        "json": LLM_TIMEOUT_JSON,                    # 180
    }
    base = base_timeouts.get(operation, LLM_TIMEOUT_COMPLETION)

    # Token scaling — cap at 2x to prevent runaway timeouts
    token_factor = min(2.0, max(1.0, max_tokens / 4096))

    # Provider latency adjustments
    provider_factors = {
        "openai": 1.0,
        "anthropic": 1.2,
        "openrouter": 1.5,
        "ollama": 2.0,
    }
    provider_factor = provider_factors.get(provider, 1.0)

    calculated = int(base * token_factor * provider_factor)

    # Hard cap: no single call should exceed 90s (Cloudflare edge is 100s)
    MAX_TIMEOUT = 90
    return min(calculated, MAX_TIMEOUT)
```

**Result per provider** (for `max_tokens=8192`, operation=`json`):

| Provider | Before | After |
|----------|--------|-------|
| openai | 360s | 90s (capped) |
| anthropic | 432s | 90s (capped) |
| openrouter | 540s | 90s (capped) |
| ollama | 720s | 90s (capped) |

### 1.2 Fix `extract_job_keywords` max_tokens

**File**: `apps/backend/app/services/improver.py` — `extract_job_keywords()`

**Problem**: Uses `complete_json()` default `max_tokens=15000`. Keyword extraction output is ~500-2000 tokens.

**Fix**: Pass `max_tokens=4096` explicitly.

```python
async def extract_job_keywords(
    job_description: str,
    user_id: str | None = None,
) -> dict[str, Any]:
    sanitized_jd = _sanitize_user_input(job_description)
    prompt = EXTRACT_KEYWORDS_PROMPT.format(job_description=sanitized_jd)

    return await complete_json(
        prompt=prompt,
        system_prompt="You are an expert job description analyzer.",
        user_id=user_id,
        max_tokens=4096,   # ← was: default 15000
    )
```

### 1.3 Don't retry on timeout/auth errors

**File**: `apps/backend/app/llm.py` — `complete_json()`

**Problem**: The `except Exception` catch retries on ALL errors, including `litellm.Timeout` and `AuthenticationError`. Retrying a timeout triples the total wait time. Retrying auth errors is pointless.

**Fix**: Add an early check for non-retryable exceptions before the retry logic.

```python
        except (json.JSONDecodeError, ValueError) as e:
            # ... existing retry logic (these ARE retryable) ...
            pass

        except Exception as e:
            last_error = e
            logging.warning(f"LLM call failed (attempt {attempt + 1}): {e}")

            # Don't retry non-retryable errors — they'll fail every time
            _non_retryable = (
                litellm.exceptions.AuthenticationError,
                litellm.exceptions.Timeout,
                litellm.exceptions.RateLimitError,
            )
            if isinstance(e, _non_retryable):
                raise  # fail immediately, don't waste time retrying

            if attempt < retries:
                continue
            raise
```

### 1.4 Frontend: add AbortController with timeout

**File**: `apps/frontend/lib/api/client.ts` — `apiFetch()`

**Problem**: No timeout; browser hangs for 100s until Cloudflare returns the HTML error page.

**Fix**: Add a configurable timeout via AbortController. Default 95s (just under Cloudflare's 100s). Pass `requestTimeout` in options for callers that need longer/shorter.

```typescript
export async function apiFetch(
  endpoint: string,
  options?: RequestInit & { requestTimeout?: number }
): Promise<Response> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const timeout = options?.requestTimeout ?? 95_000; // 95s default

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      headers: buildHeaders(options?.headers),
      signal: controller.signal,
    });

    // ... existing 401 handling ...

    return response;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        'Request timed out. The AI model is taking too long. ' +
        'Try a faster model or try again later.'
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
```

### 1.5 Frontend: detect 524 and timeout patterns

**File**: `apps/frontend/app/(default)/tailor/page.tsx` — `runGenerate()` error handling

**Problem**: Error message from a 524 is the full Cloudflare HTML page. None of the pattern checks match.

**Fix**: Add detection for 524, generic timeout, and truncate error messages before checks.

```typescript
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      // Truncate long messages (e.g., full Cloudflare HTML pages)
      const errorMessage = rawMessage.length > 500 ? rawMessage.slice(0, 500) : rawMessage;
      console.error('[tailor] runGenerate failed:', {
        message: errorMessage,
        raw: rawMessage.slice(0, 200),
      });

      if (errorMessage.includes('ALL_ENTRIES_REMOVED')) {
        setShowAllRemovedDialog(true);
        return;
      }

      // Timeout / 524 detection — must come before other checks
      if (
        errorMessage.includes('timed out') ||
        errorMessage.includes('524') ||
        errorMessage.includes('A timeout occurred') ||  // Cloudflare 524 HTML
        errorMessage.includes('AbortError')
      ) {
        setError(t('tailor.errors.timeout'));
        return;
      }

      // ... existing 401, 429, 503 checks ...
    }
```

**New i18n key** (all locale files):

```json
"timeout": "Request timed out — the AI model is taking too long to respond. Try switching to a faster model in Settings, or try again."
```

### 1.6 `postImprove`: truncate error body

**File**: `apps/frontend/lib/api/resume.ts` — `postImprove()`

**Problem**: Logs and throws the full Cloudflare HTML page (~5KB) on 524.

**Fix**: Truncate before logging and before creating the Error.

```typescript
  const text = await response.text();
  if (!response.ok) {
    // Truncate long error bodies (e.g., Cloudflare 524 returns ~5KB HTML)
    const truncated = text.length > 500 ? text.slice(0, 500) + '...' : text;
    console.error(`Improve failed (status ${response.status}):`, truncated);
    throw new Error(`Improve failed with status ${response.status}: ${truncated}`);
  }
```

---

## Phase 2 — Async Task Pattern for Tailoring

> **Goal**: Completely eliminate 524 by making the initial POST return immediately.
> The actual LLM work runs in a background task. Frontend polls for status.
> This mirrors the existing `upload_resume` + `status-stream` pattern.

### 2.1 Overview

```
Current (broken):
  POST /improve/preview  ──(90-360s)──>  JSON response
  ↑ Cloudflare kills at 100s

Proposed:
  POST /improve/preview  ──(<1s)──>  { task_id: "abc" }
  GET  /improve/status/abc  ──(<1s)──>  { status: "processing", stage: "improve_resume", progress: 50 }
  GET  /improve/status/abc  ──(<1s)──>  { status: "completed", data: { ... full result ... } }
  GET  /improve/status/abc  ──(<1s)──>  { status: "failed", error: "...", error_type: "..." }
```

Every request completes in **< 1 second**. The background task can run for as long as the model needs.

### 2.2 Backend: Task storage

**File**: `apps/backend/app/database.py` — add task methods

Add a `tailor_tasks` table in TinyDB to store task state:

```python
# In Database class:

def create_tailor_task(
    self,
    task_id: str,
    user_id: str,
    resume_id: str,
    job_id: str,
    prompt_id: str,
) -> dict[str, Any]:
    """Create a new tailor task record."""
    task = {
        "task_id": task_id,
        "user_id": user_id,
        "resume_id": resume_id,
        "job_id": job_id,
        "prompt_id": prompt_id,
        "status": "pending",          # pending → processing → completed / failed
        "stage": "queued",            # queued → extract_keywords → improve → refine → done
        "progress": 0,               # 0-100
        "result": None,              # Full ImproveResumeResponse data on completion
        "error": None,               # Error message on failure
        "error_type": None,          # Error type classification
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    self._tailor_tasks.insert(task)
    return task

def get_tailor_task(self, task_id: str, user_id: str) -> dict[str, Any] | None:
    """Get a tailor task by ID (scoped to user)."""
    Task = Query()
    result = self._tailor_tasks.get(
        (Task.task_id == task_id) & (Task.user_id == user_id)
    )
    return dict(result) if result else None

def update_tailor_task(self, task_id: str, updates: dict[str, Any]) -> None:
    """Update a tailor task's status/progress/result."""
    Task = Query()
    updates["updated_at"] = _now_iso()
    self._tailor_tasks.update(updates, Task.task_id == task_id)
```

### 2.3 Backend: Refactor `improve_resume_preview_endpoint`

**File**: `apps/backend/app/routers/resumes.py`

Split into two endpoints:

#### 2.3a `POST /improve/preview` — starts task, returns immediately

```python
@router.post("/improve/preview")
async def improve_resume_preview_endpoint(
    request: ImproveResumeRequest,
    background_tasks: BackgroundTasks,
    user=Depends(get_current_user),
) -> dict[str, str]:
    """Start a tailoring task. Returns a task_id for status polling.

    The actual LLM work runs in BackgroundTasks so Cloudflare
    never sees a long-running request.
    """
    # Validate inputs synchronously (fast, <100ms)
    resume = _get_generation_source_resume(request.resume_id, user.id)
    job = db.get_job(request.job_id, user_id=user.id)
    if not job:
        raise HTTPException(status_code=404, detail="Job description not found")

    task_id = str(uuid4())
    language = _get_content_language()
    prompt_id = request.prompt_id or _get_default_prompt_id()

    # Create task record (instant)
    db.create_tailor_task(
        task_id=task_id,
        user_id=user.id,
        resume_id=request.resume_id,
        job_id=request.job_id,
        prompt_id=prompt_id,
    )

    # Kick off LLM work in background
    background_tasks.add_task(
        _run_tailor_task,
        task_id=task_id,
        resume=resume,
        job=job,
        language=language,
        prompt_id=prompt_id,
        user_id=user.id,
    )

    return {"task_id": task_id}
```

#### 2.3b `GET /improve/status/{task_id}` — returns current status

```python
@router.get("/improve/status/{task_id}")
async def improve_task_status(
    task_id: str,
    user=Depends(get_current_user),
) -> dict[str, Any]:
    """Get the status of a tailoring task.

    Returns:
        - status: "pending" | "processing" | "completed" | "failed"
        - stage: current processing stage (for progress display)
        - progress: 0-100 percentage
        - data: full result (only when status == "completed")
        - error: error message (only when status == "failed")
    """
    task = db.get_tailor_task(task_id, user.id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    response: dict[str, Any] = {
        "task_id": task["task_id"],
        "status": task["status"],
        "stage": task["stage"],
        "progress": task["progress"],
    }

    if task["status"] == "completed" and task["result"]:
        response["data"] = task["result"]
    elif task["status"] == "failed":
        response["error"] = task.get("error", "Unknown error")
        response["error_type"] = task.get("error_type", "")

    return response
```

### 2.4 Backend: Background task function

**File**: `apps/backend/app/routers/resumes.py`

Move the current `improve_resume_preview_endpoint` body into a background function that updates task progress at each stage:

```python
async def _run_tailor_task(
    task_id: str,
    resume: dict[str, Any],
    job: dict[str, Any],
    language: str,
    prompt_id: str,
    user_id: str,
) -> None:
    """Background task: run the full tailoring pipeline.

    Updates task status/progress in DB at each stage so the
    frontend can show real-time progress.
    """
    def _update(stage: str, progress: int, status: str = "processing") -> None:
        db.update_tailor_task(task_id, {
            "status": status,
            "stage": stage,
            "progress": progress,
        })

    try:
        _update("extract_keywords", 10)

        # Stage 1: Extract or load cached keywords
        job_keywords = job.get("job_keywords")
        job_keywords_hash = job.get("job_keywords_hash")
        content_hash = _hash_job_content(job["content"])
        if not job_keywords or job_keywords_hash != content_hash:
            job_keywords = await extract_job_keywords(job["content"], user_id=user_id)
            try:
                db.update_job(
                    job["job_id"],
                    {"job_keywords": job_keywords, "job_keywords_hash": content_hash},
                    user_id=user_id,
                )
            except Exception as e:
                logger.warning("Failed to cache keywords for job %s: %s", job["job_id"], e)

        _update("improve_resume", 35)

        # Stage 2: Improve resume
        improved_data, removed_entries = await improve_resume(
            original_resume=resume["content"],
            job_description=job["content"],
            job_keywords=job_keywords,
            language=language,
            prompt_id=prompt_id,
            user_id=user_id,
        )

        # ... focused mode guard, preserve personal info (same as current) ...

        _update("refine_resume", 65)

        # Stage 3: Refine (keyword injection + AI phrase removal + alignment)
        # ... same refinement logic as current ...

        _update("finalize", 90)

        # Stage 4: Build response payload
        # ... diff calculation, improvements generation, response assembly ...
        # (same logic as current, but store result in task)

        result_payload = { ... }  # ImproveResumeResponse serialized to dict

        db.update_tailor_task(task_id, {
            "status": "completed",
            "stage": "done",
            "progress": 100,
            "result": result_payload,
        })

    except HTTPException as e:
        db.update_tailor_task(task_id, {
            "status": "failed",
            "stage": "failed",
            "progress": 0,
            "error": e.detail,
            "error_type": type(e).__name__,
        })
    except Exception as e:
        _raise_info = _classify_error(e)  # extract error_type from exception
        db.update_tailor_task(task_id, {
            "status": "failed",
            "stage": "failed",
            "progress": 0,
            "error": _raise_info["detail"],
            "error_type": _raise_info["error_type"],
        })
```

### 2.5 Backend: Error classification helper

Extract the error-classification logic from `_raise_improve_error` into a reusable function that returns error info instead of raising:

```python
def _classify_error(error: Exception) -> dict[str, str]:
    """Classify an exception into user-facing error info.

    Returns dict with keys: detail, error_type, status_code
    """
    try:
        if isinstance(error, litellm.exceptions.RateLimitError):
            return {"detail": "AI API rate limit reached. Please wait and try again.",
                    "error_type": "rate_limit", "status_code": "429"}
        if isinstance(error, litellm.exceptions.AuthenticationError):
            return {"detail": "AI API authentication failed. Check your API key in Settings.",
                    "error_type": "auth_error", "status_code": "401"}
        if isinstance(error, (litellm.exceptions.ServiceUnavailableError, litellm.exceptions.Timeout)):
            return {"detail": "AI service is temporarily unavailable. Please try again.",
                    "error_type": "timeout", "status_code": "503"}
        if isinstance(error, litellm.exceptions.BadRequestError):
            return {"detail": "Invalid request to AI provider. Check your model configuration.",
                    "error_type": "bad_request", "status_code": "400"}
    except Exception:
        pass

    error_str = str(error).lower()
    if "rate limit" in error_str or "429" in str(error):
        return {"detail": "AI API rate limit reached.", "error_type": "rate_limit", "status_code": "429"}
    if "auth" in error_str or "api key" in error_str:
        return {"detail": "AI API authentication failed.", "error_type": "auth_error", "status_code": "401"}
    if "timeout" in error_str or "timed out" in error_str:
        return {"detail": "AI service timed out.", "error_type": "timeout", "status_code": "503"}

    return {
        "detail": "Failed to tailor resume. Please try again.",
        "error_type": type(error).__name__,
        "status_code": "500",
    }
```

---

## Phase 3 — Frontend UX: Progress & Cancellation

> **Goal**: Replace the spinner-only loading state with a real-time progress bar and stage labels. Support cancel.

### 3.1 New API functions

**File**: `apps/frontend/lib/api/resume.ts`

```typescript
/** Start a tailoring task (returns immediately with task_id) */
export async function startTailorTask(
  resumeId: string,
  jobId: string,
  promptId?: string
): Promise<{ task_id: string }> {
  const res = await apiPost('/resumes/improve/preview', {
    resume_id: resumeId,
    job_id: jobId,
    prompt_id: promptId ?? null,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const truncated = text.length > 500 ? text.slice(0, 500) + '...' : text;
    throw new Error(`Failed to start tailoring (status ${res.status}): ${truncated}`);
  }
  return res.json();
}

/** Poll for tailoring task status */
export async function getTailorTaskStatus(
  taskId: string
): Promise<TailorTaskStatus> {
  const res = await apiFetch(`/resumes/improve/status/${encodeURIComponent(taskId)}`);
  if (!res.ok) {
    throw new Error(`Failed to check task status (status ${res.status})`);
  }
  return res.json();
}

export interface TailorTaskStatus {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  stage: string;
  progress: number;
  data?: ImprovedResult;       // only when completed
  error?: string;              // only when failed
  error_type?: string;
}
```

### 3.2 Tailor page: polling loop with progress

**File**: `apps/frontend/app/(default)/tailor/page.tsx`

Replace the current `runGenerate` function:

```typescript
const [tailorProgress, setTailorProgress] = useState(0);
const [tailorStage, setTailorStage] = useState('');
const abortRef = useRef(false);

const STAGE_LABELS: Record<string, string> = {
  queued: 'Starting...',
  extract_keywords: 'Analyzing job description...',
  improve_resume: 'Tailoring resume...',
  refine_resume: 'Refining & optimizing...',
  finalize: 'Finalizing...',
  done: 'Complete!',
};

const runGenerate = async (resumeId: string, description: string) => {
  abortRef.current = false;
  setTailorProgress(0);
  setTailorStage('Starting...');

  try {
    // Step 1: Upload JD (fast, <1s)
    const jobId = await uploadJobDescriptions([description], resumeId);
    incrementJobs();

    // Step 2: Start async task (fast, <1s)
    const { task_id } = await startTailorTask(resumeId, jobId, selectedPromptId);

    // Step 3: Poll for status
    const POLL_INTERVAL = 2000; // 2 seconds
    const MAX_POLL_TIME = 10 * 60 * 1000; // 10 minutes
    const startTime = Date.now();

    while (true) {
      if (abortRef.current) {
        throw new Error('Cancelled by user.');
      }

      if (Date.now() - startTime > MAX_POLL_TIME) {
        throw new Error('Tailoring timed out after 10 minutes. Please try a faster AI model.');
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL));

      const status = await getTailorTaskStatus(task_id);
      setTailorProgress(status.progress);
      setTailorStage(STAGE_LABELS[status.stage] ?? status.stage);

      if (status.status === 'completed' && status.data) {
        const result = status.data;
        // ... existing diff modal logic ...
        return;
      }

      if (status.status === 'failed') {
        throw new Error(status.error ?? 'Tailoring failed.');
      }
    }
  } catch (err) {
    // ... existing error handling (now includes timeout i18n key) ...
  }
};

const handleCancel = () => {
  abortRef.current = true;
};
```

### 3.3 Progress bar component

**File**: `apps/frontend/components/tailor/tailor-progress.tsx` (new)

A progress bar shown during tailoring, following Swiss International Style:

```tsx
interface TailorProgressProps {
  progress: number;   // 0-100
  stage: string;      // Human-readable stage label
  onCancel: () => void;
}

export function TailorProgress({ progress, stage, onCancel }: TailorProgressProps) {
  return (
    <div className="border border-black bg-white p-6">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-xs uppercase tracking-wider">{stage}</span>
        <button
          onClick={onCancel}
          className="font-mono text-xs uppercase tracking-wider text-red-600 hover:underline"
        >
          Cancel
        </button>
      </div>
      <div className="h-2 bg-gray-200 w-full">
        <div
          className="h-full bg-black transition-all duration-500 ease-out"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
      <p className="font-mono text-xs mt-2 text-gray-500">{progress}%</p>
    </div>
  );
}
```

### 3.4 i18n additions

Add to all locale files (`en.json`, `es.json`, `zh.json`, `ja.json`, `id.json`, `pt-BR.json`):

```json
{
  "tailor": {
    "errors": {
      "timeout": "Request timed out — the AI model is taking too long. Try a faster model in Settings, or try again."
    },
    "progress": {
      "starting": "Starting...",
      "extractingKeywords": "Analyzing job description...",
      "improvingResume": "Tailoring your resume...",
      "refining": "Refining & optimizing...",
      "finalizing": "Finalizing...",
      "complete": "Complete!",
      "cancel": "Cancel"
    }
  }
}
```

---

## Phase 4 — Background Keyword Pre-Extraction

> **Goal**: When a user uploads a job description, extract keywords immediately in the background. By the time they click "Generate", keywords are already cached, eliminating the slowest first LLM call.

### 4.1 Backend: extract keywords at job upload

**File**: `apps/backend/app/routers/jobs.py`

```python
from fastapi import BackgroundTasks

async def _extract_keywords_background(
    job_id: str, content: str, user_id: str
) -> None:
    """Background task: pre-extract keywords for a newly uploaded JD."""
    try:
        keywords = await extract_job_keywords(content, user_id=user_id)
        content_hash = _hash_job_content(content)
        db.update_job(
            job_id,
            {"job_keywords": keywords, "job_keywords_hash": content_hash},
            user_id=user_id,
        )
        logger.info("Pre-extracted keywords for job %s", job_id)
    except Exception as e:
        logger.warning("Background keyword extraction failed for job %s: %s", job_id, e)
        # Non-fatal — the tailor flow will extract on demand if missing

@router.post("/upload", response_model=JobUploadResponse)
async def upload_job_descriptions(
    request: JobUploadRequest,
    background_tasks: BackgroundTasks,
    user=Depends(get_current_user),
) -> JobUploadResponse:
    # ... existing validation & creation ...

    for job_id, jd in zip(job_ids, request.job_descriptions):
        background_tasks.add_task(
            _extract_keywords_background, job_id, jd.strip(), user.id
        )

    return JobUploadResponse(...)
```

**Effect on tailor flow**: When `_run_tailor_task` starts, `job.get("job_keywords")` will already be populated if the background task completed. The `if not job_keywords or hash mismatch` check means it's skipped entirely — saving 30-120s.

### 4.2 Frontend: show keyword extraction status

In the tailor page, after uploading the JD, the user sees the job description being analyzed. If keywords are pre-extracted by the time they click "Generate", stage 1 is skipped and the progress bar starts at 35%.

No frontend change needed — the backend task status naturally starts at higher progress if keywords were pre-cached.

---

## Phase 5 — Resilience & Edge Cases

### 5.1 Stale task cleanup

**File**: `apps/backend/app/main.py` — startup event

Tasks stuck in "processing" for over 15 minutes are likely from crashed workers. Mark them as failed on app startup:

```python
@app.on_event("startup")
async def cleanup_stale_tasks():
    """Mark stale tailor tasks as failed."""
    # Tasks older than 15 minutes still in processing → mark failed
    db.cleanup_stale_tailor_tasks(max_age_minutes=15)
```

### 5.2 `refine_resume` timeout guard

**File**: `apps/backend/app/routers/resumes.py`

The `refine_resume` try/except silently catches timeouts and continues. If the first two stages already consumed the time budget, refinement should be skipped proactively:

```python
# In _run_tailor_task, before calling refine_resume:
import time

elapsed = time.monotonic() - task_start_time
# If we've already spent >120s, skip refinement to return faster
if elapsed > 120:
    logger.info("Skipping refinement — elapsed %.1fs exceeds budget", elapsed)
    response_warnings.append("Refinement skipped to return results faster.")
else:
    # ... existing refinement logic ...
```

### 5.3 Graceful model compatibility

Different AI models have very different latencies. The async task pattern handles this naturally:

| Model | extract_keywords | improve_resume | inject_keywords | Total | User Experience |
|-------|-----------------|----------------|-----------------|-------|-----------------|
| GPT-4o | 5s | 10s | 8s | 23s | Progress bar → done in ~25s |
| Claude 3.5 Sonnet | 8s | 15s | 12s | 35s | Progress bar → done in ~37s |
| Ollama (local 7B) | 30s | 60s | 45s | 135s | Progress bar → done in ~2.5min |
| Ollama (local 70B) | 60s | 120s | 90s | 270s | Progress bar → done in ~5min |

**All models work** because:
- The initial POST returns in <1s (no Cloudflare timeout)
- Each poll request returns in <1s (no Cloudflare timeout)  
- The background task has no proxy timeout — it runs server-side
- The user sees real-time progress the entire time
- A 10-minute max poll timeout catches truly stuck tasks

### 5.4 Race condition: concurrent previews

If a user clicks "Generate" twice rapidly, two tasks are created. This is safe because:
- Each task has a unique `task_id`
- The frontend tracks only the latest `task_id`
- Old tasks expire via stale cleanup (§5.1)
- No shared mutable state between tasks

### 5.5 Network interruption recovery

If the user's browser disconnects during polling:
- The task continues running on the backend (background task is independent)
- When the user returns, they can re-poll the same `task_id` (stored in component state)
- If they start fresh, a new task is created; the old one expires via cleanup

---

## File Change Map

### Phase 1 (immediate fixes)

| File | Action | Changes |
|------|--------|---------|
| `apps/backend/app/llm.py` | Edit | Cap `_calculate_timeout` at 90s |
| `apps/backend/app/llm.py` | Edit | `complete_json`: don't retry timeout/auth/rate-limit |
| `apps/backend/app/services/improver.py` | Edit | `extract_job_keywords`: `max_tokens=4096` |
| `apps/frontend/lib/api/client.ts` | Edit | Add AbortController with 95s timeout |
| `apps/frontend/lib/api/resume.ts` | Edit | `postImprove`: truncate error body |
| `apps/frontend/app/(default)/tailor/page.tsx` | Edit | Detect 524/timeout errors |
| `apps/frontend/messages/*.json` | Edit | Add `timeout` i18n key (6 files) |

### Phase 2 (async task pattern)

| File | Action | Changes |
|------|--------|---------|
| `apps/backend/app/database.py` | Edit | Add `tailor_tasks` table methods |
| `apps/backend/app/routers/resumes.py` | Edit | Split endpoint: POST starts task, GET polls status |
| `apps/backend/app/routers/resumes.py` | Edit | Add `_run_tailor_task` background function |
| `apps/backend/app/routers/resumes.py` | Edit | Add `_classify_error` helper |

### Phase 3 (frontend UX)

| File | Action | Changes |
|------|--------|---------|
| `apps/frontend/lib/api/resume.ts` | Edit | Add `startTailorTask`, `getTailorTaskStatus` |
| `apps/frontend/app/(default)/tailor/page.tsx` | Edit | Replace `runGenerate` with polling loop |
| `apps/frontend/components/tailor/tailor-progress.tsx` | **New** | Progress bar component |
| `apps/frontend/messages/*.json` | Edit | Add progress stage labels (6 files) |

### Phase 4 (keyword pre-extraction)

| File | Action | Changes |
|------|--------|---------|
| `apps/backend/app/routers/jobs.py` | Edit | Pre-extract keywords in background task |

### Phase 5 (resilience)

| File | Action | Changes |
|------|--------|---------|
| `apps/backend/app/database.py` | Edit | Add `cleanup_stale_tailor_tasks` |
| `apps/backend/app/main.py` | Edit | Cleanup stale tasks on startup |
| `apps/backend/app/routers/resumes.py` | Edit | Time-budget guard for refinement |

---

## Migration & Rollback

### Frontend backward compatibility

The frontend changes (Phase 3) must handle **both** the old synchronous response and the new async response during rollout:

```typescript
const response = await apiPost('/resumes/improve/preview', payload);
const data = await response.json();

if ('task_id' in data) {
  // New async path — start polling
  return pollForResult(data.task_id);
} else {
  // Old sync path — response is the full result
  return data as ImprovedResult;
}
```

This ensures zero downtime during deployment even if frontend and backend are updated at different times.

### Rollback

If the async pattern causes issues:
1. Revert the `POST /improve/preview` endpoint to synchronous
2. Phase 1 fixes (timeout cap, max_tokens, retry logic) remain — they're independently valuable
3. Frontend falls back to synchronous path via the compatibility check above

### Task data cleanup

Tailor task records in TinyDB are transient. Add periodic cleanup for completed/failed tasks older than 24 hours to prevent unbounded growth:

```python
def cleanup_old_tailor_tasks(self, max_age_hours: int = 24) -> int:
    """Remove completed/failed tasks older than max_age_hours."""
    cutoff = (datetime.utcnow() - timedelta(hours=max_age_hours)).isoformat()
    Task = Query()
    removed = self._tailor_tasks.remove(
        (Task.status.one_of(["completed", "failed"])) &
        (Task.updated_at < cutoff)
    )
    return len(removed)
```

---

## Implementation Order

```
Phase 1  ← ship first, low risk, immediate improvement
  ↓
Phase 4  ← ship second, invisible to users, reduces future latency
  ↓
Phase 2  ← core architecture change, ship with Phase 3
  +
Phase 3  ← frontend UX tied to Phase 2
  ↓
Phase 5  ← cleanup & resilience, ship last
```

**Phase 1 alone** reduces worst-case per-call timeout from 1318s to 90s and gives the user clear timeout messaging. This buys time while Phase 2-3 are developed.

**Phase 2+3 together** eliminate the 524 entirely for all models, including slow local Ollama.

**Phase 4** is a standalone optimization that makes the common path faster.

**Phase 5** hardens the system against edge cases.
