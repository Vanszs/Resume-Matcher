# Task 1: Resumable Tailor Tasks — Implementation Plan

> **Goal**: If the user navigates away while a tailor task is in progress, they can return to the tailor page and resume watching the result.

---

## Problem

When a user starts a tailor task and navigates away (e.g., goes to dashboard), the backend `asyncio` task **continues running** and eventually writes the result to TinyDB. However:

1. The frontend `task_id` lives only in React state → **lost on navigation**
2. When the user returns to `/tailor`, the page mounts fresh with no memory of the in-flight task
3. The completed result sits in TinyDB forever, invisible to the user

---

## Implementation Plan

### Phase 1: Frontend — Persist task in `localStorage`

**File**: `apps/frontend/app/(default)/tailor/page.tsx`

#### 1.1 Define storage key and shape

```typescript
const TAILOR_TASK_STORAGE_KEY = 'tailor_active_task';

interface TailorTaskState {
  taskId: string;
  resumeId: string;       // master resume used
  jobDescription: string; // for display context
  startedAt: number;      // Date.now() — for staleness check
}
```

#### 1.2 Save task to localStorage on creation

In `runGenerate()`, after `startTailorTask()` returns a `task_id`:

```typescript
localStorage.setItem(TAILOR_TASK_STORAGE_KEY, JSON.stringify({
  taskId: data.task_id,
  resumeId: selectedResume,
  jobDescription: jdText.substring(0, 200), // truncated for storage
  startedAt: Date.now(),
}));
```

#### 1.3 Clear task from localStorage on completion/failure/cancel

- In `handlePollResult()` (success): `localStorage.removeItem(TAILOR_TASK_STORAGE_KEY)`
- In `handleTailorError()` (failure): `localStorage.removeItem(TAILOR_TASK_STORAGE_KEY)`
- On abort/cancel: `localStorage.removeItem(TAILOR_TASK_STORAGE_KEY)`

#### 1.4 On mount — check for active task and resume polling

```typescript
useEffect(() => {
  const saved = localStorage.getItem(TAILOR_TASK_STORAGE_KEY);
  if (!saved) return;

  const task: TailorTaskState = JSON.parse(saved);

  // Staleness check: ignore tasks older than 5 minutes
  if (Date.now() - task.startedAt > 5 * 60 * 1000) {
    localStorage.removeItem(TAILOR_TASK_STORAGE_KEY);
    return;
  }

  // Resume polling
  resumeExistingTask(task);
}, []);
```

#### 1.5 `resumeExistingTask()` function

1. Set loading state + show progress UI
2. Check task status via `getTailorTaskStatus(task.taskId)` once:
   - If `completed` → immediately show diff modal with the result
   - If `failed` → show error, clear localStorage
   - If `pending`/`processing` → start `pollTailorTask()` loop
3. On completion → same flow as normal: show diff modal

### Phase 2: Backend — No changes needed

The backend already:
- Persists tailor task status in TinyDB (`pending` → `processing` → `completed`/`failed`)
- Serves `GET /api/v1/resumes/improve/status/{task_id}` regardless of when it's called
- Cleans up old tasks >24h at startup

### Phase 3: Edge cases

| Scenario | Behavior |
|----------|----------|
| Navigate away, come back in <3 min | Resume polling |
| Navigate away, come back after 5 min | Treat as stale, clear, start fresh |
| Task completed while away | Single status check returns result directly |
| Task failed while away | Show error toast, clear storage |
| Open tailor in 2 tabs | Both poll same task_id — second tab shows result too |
| Server restart while task processing | Backend startup sweep marks it `failed`, poll picks it up |

### Phase 4: UX Polish

- Show a subtle banner: "Resuming previous tailoring task..." when auto-resuming
- Pre-fill the JD textarea with saved (truncated) context so user knows which task

---

## Files to modify

| File | Changes |
|------|---------|
| `apps/frontend/app/(default)/tailor/page.tsx` | localStorage save/restore, `resumeExistingTask()`, mount effect |

## Estimated scope

- **~80 lines** of new code, all in one file
- **No backend changes**
- **No schema changes**
- **No new dependencies**

---

## Testing

1. Start tailor → navigate to dashboard → return to tailor → should auto-resume
2. Start tailor → wait for completion → navigate away → return → should NOT resume (completed)
3. Start tailor → wait 6 min → return → should NOT resume (stale)
4. Start tailor → server restart → return → should show "failed" and clear
