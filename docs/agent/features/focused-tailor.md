# Implementation Plan: "Focused Tailor" — New Tailoring Intensity Level

## 1. Product Definition

### 1.1 Level Hierarchy (Updated)

| ID | Label | Existing? | Behavior |
|----|-------|-----------|----------|
| `nudge` | Light nudge | Existing | Rephrase only where clear match exists. No additions. |
| `keywords` | Keyword enhance | Existing (default) | Weave in JD keywords; may rephrase bullets. |
| `full` | Full tailor | Existing | Comprehensive rewrite; may add bullets expanding on existing work. |
| **`focused`** | **Focused tailor** | **NEW** | **Remove irrelevant experience/project entries entirely, then apply full-tailor rules to remaining entries.** |

### 1.2 Core Behavior Contract

The `focused` level operates in two distinct phases:

**Phase 1 — Relevance Filtering:**
- Evaluate each `workExperience` entry against the JD and extracted keywords
- Evaluate each `personalProjects` entry against the JD and extracted keywords
- Remove entries that have no meaningful relevance to the target role
- Retain entries that are relevant, transferable, or demonstrate adjacent value

**Phase 2 — Tailored Rewriting (identical to `full` rules):**
- Rephrase retained content to highlight relevant experience
- DO NOT invent new information
- Use action verbs and quantifiable achievements
- Keep proper nouns unchanged
- Preserve the structure of any customSections
- Preserve original date ranges exactly

### 1.3 What is NOT Filtered
- `personalInfo` — always preserved
- `summary` — rewritten, never removed
- `education` — always preserved (filtered separately only if explicitly requested in future)
- `additional` (skills, languages, certs, awards) — rephrased/reordered but not removed
- `customSections` — structure preserved, content rephrased

---

## 2. User Flow (Step by Step)

### Step 1: User opens `/tailor` page
- Page loads with existing layout: Back button, title, master resume dropdown, tailoring intensity dropdown, JD textarea, Generate button.
- State: idle. All dropdowns enabled.

### Step 2: User selects Master Resume
- Existing behavior. No change.

### Step 3: User selects Tailoring Intensity
- The **Dropdown** component renders four options (previously three).
- The new `focused` option appears **last** in the list (after "Full tailor").
- Each option displays a `label` and `description` as today.
- New option:
  - **Label:** "Focused tailor"
  - **Description:** "Remove irrelevant experiences and projects, then tailor the rest."

### Step 4: User selects "Focused tailor"
- `selectedPromptId` state changes to `"focused"`.
- An **inline warning banner** appears directly below the dropdown (animated slide-down, same style as the LLM-not-configured warning — amber border, `AlertTriangle` icon).
  - **Text:** "Focused tailoring will remove work experiences and projects that are not relevant to the job description. Only matching entries will be kept and rewritten."
  - This banner is purely informational — no action needed. It disappears if the user selects a different intensity.

### Step 5: User pastes Job Description
- Existing behavior. No change.

### Step 6: User clicks "Generate Tailored Resume"
- Existing validation runs (JD min 50 chars, master resume selected, LLM configured).
- `isLoading` → `true`. Button shows spinner + "Processing…"
- API call: `previewImproveResume(resumeId, jobId, "focused")`

### Step 7: Backend processes (described in Section 5)
- Backend performs two-phase processing and returns the preview result, same response shape as today.

### Step 8: Diff Preview Modal opens
- **For `focused` mode, the modal gains an additional section** at the top (before the existing stat cards):

  **"Removed Entries" panel** — a collapsible section with orange/amber styling:
  - Header: "Entries Removed" with count badge (e.g., "3 removed")
  - Lists each removed entry with:
    - Type icon (briefcase for experience, folder for project)
    - Entry label: "Title | Company | Years" or "Project Name | Role | Years"
    - One-line reason: e.g., "Not relevant to Community Manager role"
  - This section is **expanded by default**

- The remaining diff sections (Summary Changes, Skill Changes, Experience Changes, etc.) show only the *retained and modified* entries — same as today.

- The stat cards row adds one new stat: **"Entries removed"** (variant: `warning`).

### Step 9: User reviews and decides

**Path A — User confirms:**
- Clicks "Accept & Save" (green button).
- `confirmAndNavigate()` runs, persisting the tailored resume.
- Redirect to `/resumes/{id}`.

**Path B — User rejects:**
- Clicks "Reject Changes" (outline button).
- Diff modal closes.
- Regenerate dialog appears: "This will discard the current preview and request a new AI tailoring result."
  - "Regenerate" — re-runs `runGenerate` with the same settings.
  - "Cancel" — returns to the tailor page with the JD still filled in.

**Path C — User closes modal (X or backdrop):**
- Same as reject path — modal closes, regenerate dialog appears.

---

## 3. Interaction Paths (Exhaustive)

| # | User Action | Trigger | System Response |
|---|-------------|---------|-----------------|
| 1 | Select "Focused tailor" from dropdown | `onChange` | Set `selectedPromptId = "focused"`, show inline warning banner |
| 2 | Switch away from "Focused tailor" | `onChange` | Hide inline warning banner, update `selectedPromptId` |
| 3 | Click "Generate Tailored Resume" | `onClick` | Validate → show loading → call API with `prompt_id = "focused"` |
| 4 | API returns with diff data | API response | Show Diff Preview Modal with "Removed Entries" panel |
| 5 | API returns without diff data | API response | Show Missing Diff Dialog (existing behavior) |
| 6 | Click "Accept & Save" in diff modal | `onConfirm` | Persist → navigate to resume page |
| 7 | Click "Reject Changes" in diff modal | `onReject` | Close modal → show Regenerate dialog |
| 8 | Click "Regenerate" in Regenerate dialog | `onConfirm` | Re-run generation with same prompt_id |
| 9 | Click "Cancel" in Regenerate dialog | `onCancel` | Close dialog, return to idle state |
| 10 | Close diff modal via X or backdrop | `onClose` | Same as Reject path |
| 11 | Double-click "Accept & Save" | `onClick` | Guarded by `confirmInFlight` ref — second click ignored |
| 12 | Keyboard Escape while modal open | `onOpenChange` | If not submitting, close modal |

---

## 4. UI States

### 4.1 Tailor Page States

| State | Dropdown | Warning Banner | JD Textarea | Generate Button |
|-------|----------|---------------|-------------|-----------------|
| Idle (non-focused) | Enabled, value = nudge/keywords/full | Hidden | Enabled | Enabled (if valid) |
| Idle (focused selected) | Enabled, value = focused | **Visible** (amber) | Enabled | Enabled (if valid) |
| Loading | Disabled | Frozen (visible if focused) | Disabled | Disabled, spinner + "Processing…" |
| Error | Enabled | Visible if focused | Enabled | Enabled |
| LLM not configured | Enabled | Visible if focused | Enabled | Disabled, text = "Configure API Key First" |

### 4.2 Diff Preview Modal States

| State | "Removed Entries" Panel | Stat Cards | Change Sections | Buttons |
|-------|------------------------|------------|-----------------|---------|
| Open (focused mode) | Visible, expanded | Includes "entries_removed" stat | Shows only retained entries | Accept (green) + Reject (outline) |
| Open (non-focused mode) | **Hidden** | Standard 5 stats | Full changes | Accept + Reject |
| Submitting | Visible | Visible | Visible | Accept shows spinner, both disabled |

### 4.3 Removed Entries Panel States

| State | Display |
|-------|---------|
| Entries removed > 0 | Panel visible, expanded by default, lists each entry with reason |
| Entries removed = 0 | Panel visible but shows: "All experiences and projects were relevant — nothing removed." (success styling, green) |
| Data missing | Panel hidden (falls through to Missing Diff Dialog) |

---

## 5. Processing Logic (Backend)

### 5.1 Prompt Architecture

The `focused` prompt operates as a **single LLM call** with a two-part instruction:

**Part 1 — Filtering instructions embedded in the prompt:**
- "First, evaluate each work experience and project against the job description and keywords."
- "Remove entries that have no meaningful relevance. An entry is relevant if it demonstrates skills, responsibilities, or domain knowledge that directly or transferably applies to the target role."
- "In the output JSON, include ONLY the entries you determine are relevant."
- "For each removed entry, add it to a separate `removed_entries` array with the entry label and a one-sentence relevance reason."

**Part 2 — Rewriting instructions (same as full):**
- Rephrase content to highlight relevant experience
- DO NOT invent new information
- Use action verbs and quantifiable achievements
- etc.

### 5.2 Response Shape Extension

The `focused` prompt asks the LLM to return an additional top-level field alongside the standard resume JSON:

```json
"removed_entries": [
  {"type": "workExperience", "label": "Cashier | McDonald's | 2015-2016", "reason": "No relevance to Community Manager role"},
  {"type": "personalProjects", "label": "Calculator App | Solo | 2014", "reason": "Basic app unrelated to community management"}
]
```

Backend extracts `removed_entries` before Pydantic validation (since `ResumeData` does not include it), passes it through the response to the frontend in the existing `metadata` or a new response field.

### 5.3 Truthfulness Rules for `focused`

Same core 8 rules, with rule 7 customized:
- **Rule 7:** "You may remove work experience and project entries that are clearly irrelevant to the target job. You may expand remaining bullet points or add new ones that elaborate on existing work, but DO NOT invent entirely new responsibilities."

### 5.4 Diff Computation

After the LLM returns:
1. Standard diff computation runs on the retained entries (same as `full` mode).
2. Additionally, the diff summary gains a new field: `entries_removed: int` (count of removed entries).
3. The `detailed_changes` array gains entries with `field_type = "removed_entry"` and `change_type = "removed"` for each filtered-out experience/project.

### 5.5 Refinement Pass

The existing refinement step (keyword match alignment validation) runs on the **post-filtering** data only. It does not re-add removed entries.

---

## 6. Dialogs / Modals (Complete Inventory)

### 6.1 Inline Warning Banner (not a modal)

| Property | Value |
|----------|-------|
| **When** | User selects "Focused tailor" from dropdown |
| **Trigger** | `selectedPromptId === "focused"` |
| **Content** | "Focused tailoring will remove work experiences and projects that are not relevant to the job description. Only matching entries will be kept and rewritten." |
| **Buttons** | None (informational) |
| **Dismiss** | Automatic when user selects different intensity |

### 6.2 Diff Preview Modal (Extended)

| Property | Value |
|----------|-------|
| **When** | API returns preview result with diff data |
| **Trigger** | `result.data.diff_summary && result.data.detailed_changes` |
| **New section** | "Removed Entries" panel (only visible when `prompt_id === "focused"`) |
| **Buttons** | "Reject Changes" (outline) · "Accept & Save" (green) |
| **On Accept** | Persist tailored resume → navigate to `/resumes/{id}` |
| **On Reject** | Close → open Regenerate dialog |

### 6.3 Missing Diff Dialog (No change)

Existing behavior. Appears when diff data is missing from response.

### 6.4 Regenerate Dialog (No change)

Existing behavior. Appears after user rejects diff preview.

### 6.5 All Entries Removed Dialog (New)

| Property | Value |
|----------|-------|
| **When** | Backend determines ALL work experiences AND all projects were removed (nothing to tailor) |
| **Trigger** | API returns a specific error or the preview result has zero retained entries |
| **Content** | Title: "No Relevant Experience Found" · Body: "The AI determined that none of your work experiences or projects are relevant to this job description. This may happen if the job is very different from your background. Try a different Tailoring Intensity level, or update your master resume with more relevant experience." |
| **Buttons** | "Try Keyword Enhance" (primary, switches to `keywords` and re-runs) · "Close" (outline, returns to idle) |
| **On "Try Keyword Enhance"** | Sets `selectedPromptId = "keywords"`, auto-triggers `runGenerate` |
| **On "Close"** | Returns to tailor page, all state reset except JD text |

---

## 7. Edge Cases

### 7.1 All Experiences AND Projects Removed

- **Detection:** Backend checks if post-filtering `workExperience` is empty AND `personalProjects` is empty.
- **Behavior:** Return error response (HTTP 422 or a flagged preview) indicating no content to tailor.
- **Frontend:** Shows "All Entries Removed" dialog (6.5 above).
- **Rationale:** A resume with zero experience and zero projects is useless; force user to reconsider.

### 7.2 All Experiences Removed, Some Projects Remain (or vice versa)

- **Behavior:** Proceed normally. The tailored resume will only contain the remaining section(s).
- **Diff modal:** Shows removed entries in the "Removed Entries" panel.
- **No special dialog.** The user can see what was removed and decide.

### 7.3 Only One Experience Remains

- **Behavior:** Proceed normally. One experience is valid.
- **Diff modal:** Shows clearly that N-1 entries were removed, 1 retained and rewritten.

### 7.4 Job Description is Vague

- **Behavior:** The LLM will likely retain most entries (because it can't determine irrelevance with certainty).
- **This is correct behavior.** When in doubt, keep.
- **Prompt instruction:** "When relevance is ambiguous or the job description is vague, err on the side of keeping the entry."

### 7.5 LLM Relevance Scoring Fails / Returns Garbage

- **Detection:** Backend validates that the returned JSON still has the standard `ResumeData` shape.
- **Fallback:** If the result fails validation, retry once with lower temperature (existing retry logic in `complete_json`).
- **If retry also fails:** Return standard 500 error → frontend shows error banner.

### 7.6 LLM Removes Education or Custom Sections

- **Prevention:** The prompt explicitly states: "DO NOT remove education entries, customSections, additional info, or personalInfo. Only workExperience and personalProjects entries may be removed."
- **Backend validation:** After LLM returns, verify that `education` count matches original. If reduced, log warning and restore original education entries.

### 7.7 User Switches Intensity After Generation Started

- **Existing guard:** Button is disabled during `isLoading`. Dropdown is disabled during `isLoading`. No race condition possible.

---

## 8. System States & Transitions

```
                ┌──────────┐
                │   IDLE   │
                └────┬─────┘
                     │ User clicks "Generate"
                     ▼
              ┌──────────────┐
              │  VALIDATING  │  (check JD length, master resume, LLM config)
              └──────┬───────┘
                     │ valid
                     ▼
              ┌──────────────┐
              │  UPLOADING   │  (upload JD → get job_id)
              │    JOB       │
              └──────┬───────┘
                     │ success
                     ▼
         ┌───────────────────────┐
         │  PROCESSING (PREVIEW) │  (call previewImproveResume)
         │                       │
         │  For "focused" mode:  │
         │  ┌─────────────────┐  │
         │  │ Phase 1: Filter │  │  ← LLM evaluates relevance
         │  │ Phase 2: Rewrite│  │  ← LLM tailors remaining
         │  └─────────────────┘  │
         └───────────┬───────────┘
                     │
            ┌────────┴────────┐
            │                 │
     has diff data      no diff data
            │                 │
            ▼                 ▼
   ┌────────────────┐  ┌───────────────────┐
   │  DIFF PREVIEW  │  │ MISSING DIFF DIALOG│
   │    (MODAL)     │  │                   │
   └───┬────┬───────┘  └────────┬──────────┘
       │    │                   │
   Accept  Reject          Confirm anyway
       │    │                   │
       ▼    ▼                   ▼
┌──────────┐ ┌────────────┐ ┌──────────┐
│CONFIRMING│ │ REGENERATE │ │CONFIRMING│
│          │ │  DIALOG    │ │          │
└─────┬────┘ └──┬────┬────┘ └─────┬────┘
      │         │    │            │
      ▼      Regen  Cancel       ▼
┌──────────┐    │    │     ┌──────────┐
│NAVIGATING│    │    │     │NAVIGATING│
│ (done)   │    │    │     │ (done)   │
└──────────┘    │    │     └──────────┘
                ▼    ▼
          PROCESSING  IDLE
          (restart)

Special for "focused":
   After PROCESSING, if all entries removed:
              │
              ▼
   ┌──────────────────────────┐
   │ ALL ENTRIES REMOVED      │
   │ DIALOG                   │
   │                          │
   │ [Try Keyword Enhance]    │──→ Set promptId="keywords" → PROCESSING
   │ [Close]                  │──→ IDLE
   └──────────────────────────┘
```

---

## 9. Data Flow Summary

| Step | Direction | Data |
|------|-----------|------|
| 1 | Frontend → Backend | `POST /resumes/improve/preview` with `prompt_id = "focused"` |
| 2 | Backend → LLM | Single prompt with filtering + rewriting instructions, resume JSON, JD, keywords |
| 3 | LLM → Backend | Resume JSON (filtered) + `removed_entries` array |
| 4 | Backend | Extract `removed_entries`, validate remaining data with `ResumeData`, compute diff against original |
| 5 | Backend → Frontend | Standard `ImproveResumeResponse` with: `resume_preview`, `diff_summary` (+ `entries_removed`), `detailed_changes` (+ `removed_entry` type changes), `removed_entries` metadata |
| 6 | Frontend | Render Diff Preview Modal with "Removed Entries" panel |
| 7 | Frontend → Backend | `POST /resumes/improve/confirm` with accepted preview data (same as today) |

---

## 10. i18n Keys Required

```
tailor.promptOptions.focused.label        → "Focused tailor"
tailor.promptOptions.focused.description  → "Remove irrelevant experiences and projects, then tailor the rest."
tailor.focusedWarning                     → "Focused tailoring will remove work experiences and projects that are not relevant to the job description. Only matching entries will be kept and rewritten."
tailor.diffModal.entriesRemoved           → "Entries removed"
tailor.diffModal.removedEntriesTitle      → "Removed Entries"
tailor.diffModal.removedReason            → "Reason"
tailor.diffModal.allRelevant              → "All experiences and projects were relevant — nothing removed."
tailor.allRemovedDialog.title             → "No Relevant Experience Found"
tailor.allRemovedDialog.description       → "The AI determined that none of your work experiences or projects are relevant to this job description. Try a different intensity level or update your master resume."
tailor.allRemovedDialog.tryKeywords       → "Try Keyword Enhance"
```

(Repeat for `es.json`, `zh.json`, `ja.json`, `id.json`, `pt-BR.json`)

---

## 11. Settings Integration

The Settings page already has a "Default tailoring prompt" dropdown. The new `focused` option must appear there as well:
- Backend `IMPROVE_PROMPT_OPTIONS` list gains a 4th entry.
- Frontend `fetchPromptConfig()` already dynamically renders whatever the backend returns — no frontend change needed in Settings.

---

## 12. Implementation Order (Suggested)

1. **Backend prompt + truthfulness rules** — add `IMPROVE_RESUME_PROMPT_FOCUSED` and corresponding truthfulness rules
2. **Backend `improve_resume` service** — handle `removed_entries` extraction post-LLM, add to diff computation
3. **Backend response schema** — extend `ResumeDiffSummary` with `entries_removed`, extend `ResumeFieldDiff` with `removed_entry` type
4. **Backend edge case: all-removed guard** — detect and return appropriate error/flag
5. **Frontend i18n strings** — add all new keys across all locales
6. **Frontend tailor page** — add inline warning banner conditional on `focused`
7. **Frontend Diff Preview Modal** — add "Removed Entries" panel, new stat card
8. **Frontend "All Entries Removed" dialog** — new dialog with "Try Keyword Enhance" fallback
9. **Testing** — upload a multi-role CV, tailor to a specific role, verify filtering + rewrite
