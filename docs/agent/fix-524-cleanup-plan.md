# Fix Plan: 524 Timeout Cleanup — All Remaining Bugs

> Post-audit cleanup for the async tailor task implementation.
> **Priority**: MEDIUM-1 thru MEDIUM-4 first, then LOW-1 thru LOW-5.

---

## MEDIUM-1: `requestTimeout` leaks into `fetch()` options

**File**: `apps/frontend/lib/api/client.ts`
**Line**: ~69

**Bug**: `...options` spreads the custom `requestTimeout` property into `fetch()`. Browsers silently ignore unknown keys today, but this is technically incorrect and could break in future runtimes.

**Fix**: Destructure `requestTimeout` out before spreading:

```typescript
const { requestTimeout, ...fetchOptions } = options ?? {};
const timeoutMs = requestTimeout ?? 95_000;
// ...
response = await fetch(url, {
  ...fetchOptions,
  headers: buildHeaders(fetchOptions?.headers),
  signal: controller.signal,
});
```

---

## MEDIUM-2: `update_tailor_task()` missing `user_id` scoping

**File**: `apps/backend/app/database.py`
**Line**: ~493

**Bug**: Updates by `task_id` only. All other write methods (`update_resume`, `update_job`) scope by both ID and `user_id`. Breaks authorization pattern.

**Fix**: Add `user_id` parameter and include it in the TinyDB query:

```python
def update_tailor_task(self, task_id: str, updates: dict[str, Any], user_id: str | None = None) -> None:
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    Task = Query()
    condition = Task.task_id == task_id
    if user_id:
        condition = condition & (Task.user_id == user_id)
    self.tailor_tasks.update(updates, condition)
```

`user_id` is optional (`None`) so `_run_tailor_task` (background, no request context) and `cleanup_stale_tailor_tasks` can still call it without `user_id`. The endpoint `get_tailor_task_status` already scopes reads by `user_id`.

**Callers to update**:
- `_run_tailor_task()` in `resumes.py` — pass `user_id=user_id` to all `db.update_tailor_task()` calls (it already has `user_id` in scope)

---

## MEDIUM-3: Duplicated polling loop — extract shared utility

**File**: `apps/frontend/app/(default)/tailor/page.tsx`
**Lines**: ~215-253 (`runGenerate`) and ~436-462 (`handleAllRemovedTryKeywords`)

**Bug**: Near-identical `while(true)` polling loops. They also **differ in subtle bug-prone ways**:

| Behavior | `runGenerate` | `handleAllRemovedTryKeywords` |
|----------|---------------|------------------------------|
| Reset `abortRef` at start | Yes | **No** |
| Reset progress state at start | Yes | **No** |
| Abort check between upload and startTask | Yes | **No** |
| Error thrown with `errorType` on failure | Yes (`Object.assign`) | **No** (plain `Error`) |
| Error handler classifies error types | Yes (timeout, auth, rate_limit, etc.) | **No** (generic `failedToPreview`) |
| `console.warn` on missing diff | Yes | No |

**Fix**: Extract a shared polling function:

```typescript
async function pollTailorTask(
  taskId: string,
  abortRef: React.MutableRefObject<boolean>,
  onProgress: (progress: number, stage: string) => void,
): Promise<ImprovedResult> {
  while (true) {
    if (abortRef.current) throw new DOMException('Aborted', 'AbortError');
    await new Promise((r) => setTimeout(r, 2000));
    if (abortRef.current) throw new DOMException('Aborted', 'AbortError');

    const status = await getTailorTaskStatus(taskId);
    if (abortRef.current) throw new DOMException('Aborted', 'AbortError');

    onProgress(status.progress, status.stage);

    if (status.status === 'completed' && status.result) {
      return { data: status.result as ImprovedResult['data'] };
    }
    if (status.status === 'failed') {
      const msg = status.error ?? 'Failed to preview resume. Please try again.';
      throw Object.assign(new Error(msg), { errorType: status.error_type });
    }
  }
}
```

Both `runGenerate` and `handleAllRemovedTryKeywords` call this, followed by the same diff-check + modal logic. The error handler in `handleAllRemovedTryKeywords` should also classify errors the same way as `runGenerate` (timeout, auth, rate_limit, etc.) instead of always using the generic string.

Also: both callers should reset `abortRef.current = false` and reset progress state (`setTailorProgress(0)`, `setTailorStage('queued')`) at the top.

---

## MEDIUM-4: No max-poll safety guard

**File**: `apps/frontend/app/(default)/tailor/page.tsx`
**Lines**: ~215, ~436

**Bug**: `while (true)` loops with no maximum iteration count. If the backend task status gets stuck on `processing` forever (e.g., `_run_tailor_task` crashes in a way that doesn't update the DB, or DB write fails), the frontend polls indefinitely — draining battery, network, and giving the user no feedback.

**Fix**: Add a max-poll counter inside the shared `pollTailorTask` utility:

```typescript
const MAX_POLLS = 90; // 90 × 2s = 3 minutes max
let polls = 0;
while (true) {
  if (++polls > MAX_POLLS) {
    throw Object.assign(
      new Error('Task is taking too long. Please try again.'),
      { errorType: 'timeout' },
    );
  }
  // ...existing loop body...
}
```

3 minutes (90 polls × 2s) is generous — the backend's 90s timeout + refinement should complete well within that. If it doesn't, something is wrong.

---

## LOW-1: `previewImproveResume()` is dead code + **broken**

**Files**:
- `apps/frontend/lib/api/resume.ts` line ~173
- `apps/frontend/lib/api/index.ts` line ~23

**Bug**: `previewImproveResume()` calls `postImprove('/resumes/improve/preview', ...)` which parses the response as `ImprovedResult`. But the endpoint now returns `TailorTaskStartResponse` (`{ task_id, status }`), not `ImproveResumeData`. Calling this function **crashes at runtime** — silent trap for future developers.

**Fix**:
1. Delete `previewImproveResume()` from `resume.ts`
2. Remove it from `index.ts` re-exports

---

## LOW-2: `improveResume()` is also dead code

**Files**:
- `apps/frontend/lib/api/resume.ts` line ~160
- `apps/frontend/lib/api/index.ts` line ~22

**Bug**: `improveResume()` calls `POST /improve` (the synchronous endpoint). While the backend endpoint still works, **nothing in the frontend imports or calls it** (verified via grep). It's leftover from the old flow.

**Fix**:
1. Delete `improveResume()` from `resume.ts`
2. Remove it from `index.ts` re-exports
3. If `postImprove()` helper has no remaining callers after this, delete it too (check: `confirmImproveResume` still uses it — keep `postImprove`)

---

## LOW-3: `tailor-progress.tsx` stage labels not internationalized

**File**: `apps/frontend/components/tailor/tailor-progress.tsx`

**Bug**: 7 hardcoded English strings:
- `STAGE_LABELS`: `'Queued…'`, `'Analyzing job description…'`, `'Tailoring resume…'`, `'Refining and validating…'`, `'Finalizing…'`, `'Done'`
- Fallback: `'Processing…'`
- `aria-label="Cancel"`

**Fix**:
1. Add `useTranslations()` hook to the component
2. Add i18n keys to all 6 locale files under `tailor.progress`:

```json
"progress": {
  "queued": "Queued…",
  "extractKeywords": "Analyzing job description…",
  "improveResume": "Tailoring resume…",
  "refineResume": "Refining and validating…",
  "finalize": "Finalizing…",
  "done": "Done",
  "processing": "Processing…",
  "cancel": "Cancel"
}
```

3. Replace `STAGE_LABELS` with `t()` calls mapping stage keys to i18n keys
4. Replace `aria-label="Cancel"` with `aria-label={t('tailor.progress.cancel')}`
5. Translate all 6 locale files (en, es, zh, ja, id, pt-BR)

---

## LOW-4: `_hash_job_content()` duplicated across two files

**Files**:
- `apps/backend/app/routers/resumes.py` line ~99: `hashlib.sha256(content.encode("utf-8")).hexdigest()`
- `apps/backend/app/routers/jobs.py` line ~17: `hashlib.sha256(content.encode()).hexdigest()`

**Bug**: Same function defined twice with slightly different encoding (`"utf-8"` vs default — functionally identical, but a maintenance split). If one is updated, the other won't be.

**Fix**:
1. Move `_hash_job_content` to a shared location — `app/services/improver.py` or a new `app/utils.py` (prefer `improver.py` since it's related to job keyword extraction)
2. Import from the shared location in both `resumes.py` and `jobs.py`
3. Use consistent encoding: `content.encode("utf-8")`

---

## LOW-5: `handleAllRemovedTryKeywords` error handler is degraded

**File**: `apps/frontend/app/(default)/tailor/page.tsx` line ~465-470

**Bug**: On failure, this handler only shows `t('tailor.errors.failedToPreview')` — it does NOT classify errors into timeout/auth/rate_limit/serviceUnavailable like `runGenerate` does. If the retried keywords-mode tailor task fails due to a rate limit or auth error, the user sees a generic "Failed to preview" instead of the specific, actionable message.

**Fix**: This is automatically solved by MEDIUM-3 (shared polling utility + shared error handler). After extraction, both paths use the same error classification logic.

---

## Execution Order

```
1. MEDIUM-3 + MEDIUM-4 + LOW-5  (extract shared polling utility with max-poll guard — solves 3 issues at once)
2. MEDIUM-1                      (destructure requestTimeout from fetch options)
3. MEDIUM-2                      (add user_id to update_tailor_task)
4. LOW-1 + LOW-2                 (remove dead code: previewImproveResume + improveResume)
5. LOW-3                         (internationalize tailor-progress stage labels — 7 files)
6. LOW-4                         (deduplicate _hash_job_content)
```

---

## Files Modified (Summary)

| # | File | Changes |
|---|------|---------|
| 1 | `apps/frontend/app/(default)/tailor/page.tsx` | Extract polling utility, add max-poll guard, unify error handling |
| 2 | `apps/frontend/lib/api/client.ts` | Destructure `requestTimeout` from options |
| 3 | `apps/backend/app/database.py` | Add `user_id` param to `update_tailor_task` |
| 4 | `apps/backend/app/routers/resumes.py` | Pass `user_id` to `update_tailor_task` calls, remove `_hash_job_content` (import from shared) |
| 5 | `apps/frontend/lib/api/resume.ts` | Delete `previewImproveResume`, `improveResume` |
| 6 | `apps/frontend/lib/api/index.ts` | Remove dead re-exports |
| 7 | `apps/frontend/components/tailor/tailor-progress.tsx` | Add `useTranslations()`, replace hardcoded strings |
| 8 | `apps/frontend/messages/en.json` | Add `tailor.progress.*` keys |
| 9 | `apps/frontend/messages/es.json` | Add `tailor.progress.*` keys |
| 10 | `apps/frontend/messages/zh.json` | Add `tailor.progress.*` keys |
| 11 | `apps/frontend/messages/ja.json` | Add `tailor.progress.*` keys |
| 12 | `apps/frontend/messages/id.json` | Add `tailor.progress.*` keys |
| 13 | `apps/frontend/messages/pt-BR.json` | Add `tailor.progress.*` keys |
| 14 | `apps/backend/app/routers/jobs.py` | Remove `_hash_job_content` (import from shared) |
| 15 | `apps/backend/app/services/improver.py` (or `app/utils.py`) | Add shared `hash_job_content()` |
