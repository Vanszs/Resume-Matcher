## Plan: Multi Master Resume Migration (DRAFT)

This plan follows your selected direction: Hybrid storage, Soft default, Soft delete, and strict API requirement for explicit masterResumeId. Current production behavior confirms resumes are stored in TinyDB (not Prisma), with singleton-master logic via is_master in [apps/backend/app/database.py](apps/backend/app/database.py#L92-L224), while Prisma currently only contains auth/config models in [prisma/schema.prisma](prisma/schema.prisma). The safest rollout is to implement multi-master behavior in TinyDB/API/UI first, then add Prisma models and a compatibility bridge for future persistence consolidation without breaking existing data.

### 1) Schema Analysis
- Current limitation: resume domain is outside Prisma; only Role/User/LLMConfig exist in [prisma/schema.prisma](prisma/schema.prisma).
- Master modeling today: boolean is_master on resume records in TinyDB, plus singleton access patterns via get_master_resume/set_master_resume in [apps/backend/app/database.py](apps/backend/app/database.py#L145-L224).
- Flow coupling: dashboard and tailor assume one master via localStorage master_resume_id in [apps/frontend/app/(default)/dashboard/page.tsx](apps/frontend/app/(default)/dashboard/page.tsx#L92-L210) and [apps/frontend/app/(default)/tailor/page.tsx](apps/frontend/app/(default)/tailor/page.tsx#L61-L67).
- Risky behavior: refinement path still pulls global master (not selected source) in [apps/backend/app/routers/resumes.py](apps/backend/app/routers/resumes.py#L700-L709) and [apps/backend/app/routers/resumes.py](apps/backend/app/routers/resumes.py#L1014-L1023).

### 2) Prisma Schema Update Proposal
- Add new Prisma resume-domain models (non-destructive addition):
  - MasterResume: id, userId FK->User, roleTitle, parsedData JSON/string, source metadata, soft-delete fields deletedAt/isArchived, createdAt/updatedAt.
  - GeneratedResume: id, userId FK->User, masterResumeId FK->MasterResume, jobId(optional FK), content/diff payload, status fields, createdAt/updatedAt.
  - UserMasterPreference (or fields on User): lastActiveMasterResumeId nullable FK for soft default.
- Relation mapping:
  - User 1:N MasterResume.
  - MasterResume 1:N GeneratedResume.
  - User 1:N GeneratedResume (direct ownership guard + query efficiency).
  - User 0..1 lastActiveMasterResumeId pointer for default selection.
- Index strategy:
  - MasterResume: index(userId, updatedAt desc), index(userId, deletedAt), unique(userId, id).
  - GeneratedResume: index(userId, masterResumeId, createdAt desc), index(masterResumeId), index(userId, createdAt desc).
  - Preference pointer: index(lastActiveMasterResumeId).
- Migration-safe notes:
  - No table drops/renames in first migration.
  - Keep TinyDB runtime source-of-truth initially; Prisma tables introduced in parallel for hybrid path.
  - Add nullable FK fields first; enforce stricter constraints only after backfill parity.

### 3) Backend Refactor Tasks
- Database layer updates in [apps/backend/app/database.py](apps/backend/app/database.py):
  - Replace singleton-oriented methods with list/query methods: list_master_resumes(user_id), get_master_by_id(user_id, master_id), set_last_active_master(user_id, master_id).
  - Keep legacy methods as wrappers (temporary) to preserve compatibility.
  - Implement soft delete for masters; do not hard-remove linked generated resumes.
- API contract updates in [apps/backend/app/routers/resumes.py](apps/backend/app/routers/resumes.py):
  - Require explicit masterResumeId on preview/improve/confirm endpoints.
  - Validate ownership for masterResumeId before generation.
  - Remove global get_master_resume fallback logic.
  - Add endpoints: list masters, create master, set active master, soft delete master.
- Jobs/router alignment in [apps/backend/app/routers/jobs.py](apps/backend/app/routers/jobs.py):
  - Ensure job upload + generation path always carries selected masterResumeId.
- Schema DTO updates in [apps/backend/app/schemas/models.py](apps/backend/app/schemas/models.py):
  - Add master-focused request/response models and strict validation.
- Health/status compatibility in [apps/backend/app/routers/health.py](apps/backend/app/routers/health.py):
  - Expand has_master_resume to include master_count and last_active_master_resume_id (without removing legacy field initially).

### 4) Frontend Refactor Tasks
- Dashboard changes in [apps/frontend/app/(default)/dashboard/page.tsx](apps/frontend/app/(default)/dashboard/page.tsx):
  - Add two actions: Create Resume and Add Another Master Resume.
  - Render multiple master cards using existing card styling/token system.
  - Master cards display label Master Resume and extracted roleTitle.
- Tailor page changes in [apps/frontend/app/(default)/tailor/page.tsx](apps/frontend/app/(default)/tailor/page.tsx):
  - Add reusable dropdown selection for master resume using existing UI primitives from [apps/frontend/components/ui](apps/frontend/components/ui).
  - Initialize soft default from last active master; update local state on selection change.
  - Generate action must send selected masterResumeId; block submit if not selected.
- API client changes in [apps/frontend/lib/api/resume.ts](apps/frontend/lib/api/resume.ts):
  - Introduce dedicated master-resume APIs and typed payloads requiring masterResumeId.
- Shared state updates in [apps/frontend/lib/context/status-cache.tsx](apps/frontend/lib/context/status-cache.tsx):
  - Track master list/count + last active master for app-wide consistency.
- i18n updates in [apps/frontend/messages/en.json](apps/frontend/messages/en.json) and locale peers:
  - Add strings for dropdown label, empty-state, validation, add-master action.

### 5) Data Flow Explanation
- Dashboard -> Tailor:
  - Dashboard loads master list -> user picks/creates master -> stores last active master id (soft default) -> navigate to tailor.
- Tailor -> Generate API:
  - Tailor dropdown always binds selected master -> generate call includes explicit masterResumeId.
- API -> Database:
  - Backend validates user ownership of masterResumeId -> creates generated resume linked by masterResumeId -> response returns linkage metadata for UI card grouping.

### 6) Migration Strategy
- Phase 0 (preflight):
  - Add new Prisma models/tables only (no destructive operations), keep TinyDB operational.
- Phase 1 (runtime compatibility):
  - Backend accepts/returns masterResumeId in all generation endpoints while still reading existing TinyDB resumes.
  - Backfill script: each user with existing singleton master becomes first master record; preserve resume_id mapping.
- Phase 2 (soft default enablement):
  - Populate last active master pointer from existing localStorage usage and first API selection.
- Phase 3 (stabilization):
  - Keep legacy fields/endpoints for one release window; log usage.
- Phase 4 (cleanup):
  - Remove singleton fallback branches once telemetry confirms no legacy clients.

### 7) Edge Case Analysis
- No master resume exists:
  - Dashboard shows add-master CTA; Tailor blocks generation and routes to create/import flow.
- User deletes active master:
  - Soft delete record; auto-select newest non-deleted master or require explicit reselection if none.
- Concurrent generation:
  - Accept independent jobs, but each request must lock on validated masterResumeId at request time.
- Invalid masterResumeId:
  - Return 404/400 with ownership-safe message; no fallback.
- Authorization failure:
  - Return 403 for foreign master ids; audit log attempted access.
- Legacy client payload missing masterResumeId:
  - During compatibility window return validation error with actionable message; do not infer implicitly.

### 8) Risk Assessment
- Data inconsistency risk:
  - Mitigate with dual-read validation during hybrid phase and migration id mapping table/log.
- UI complexity risk:
  - Mitigate by reusing existing card/grid/dropdown components and current token system only.
- Migration risk:
  - Mitigate with additive schema changes, no drops, staged rollout, and rollback via feature flag.
- Performance risk:
  - Mitigate with user-scoped composite indexes and paginated master/generated listings.

**Steps**
1. Finalize API contract and data model deltas across [apps/backend/app/routers/resumes.py](apps/backend/app/routers/resumes.py), [apps/frontend/lib/api/resume.ts](apps/frontend/lib/api/resume.ts), and [prisma/schema.prisma](prisma/schema.prisma).
2. Implement backend ownership/validation and remove singleton fallback paths in resume generation.
3. Implement frontend multi-master UI (dashboard actions/cards + tailor dropdown + strict submit guard).
4. Add migration/backfill script for existing singleton-master users and compatibility response fields.
5. Add backend/frontend tests for selection, ownership, deletion, and invalid-id paths.
6. Run staged verification and release with telemetry gate before cleanup.

**Verification**
- Backend: endpoint tests for list/create/select/delete master and improve/preview requiring masterResumeId under [apps/backend/tests](apps/backend/tests).
- Frontend: dashboard/tailor selection and submit-guard tests under [apps/frontend/tests](apps/frontend/tests).
- Manual: create 2+ masters, switch dropdown, generate from each, verify linkage and card rendering.
- Regression: confirm old singleton users are migrated to first master without data loss.

**Decisions**
- Storage scope: Hybrid (TinyDB runtime now + Prisma models introduced safely).
- Default behavior: Soft default (last active master), but API still requires explicit masterResumeId.
- Delete policy: Soft delete master.
- Generation strictness: Reject requests without masterResumeId.
