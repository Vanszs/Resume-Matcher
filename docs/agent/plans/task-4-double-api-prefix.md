# Task 4: Double `/api/v1/api/v1/` in PDF Download URL — Root Cause & Fix

---

## Symptom

```
Request URL: http://localhost:3000/api/v1/api/v1/resumes/{id}/pdf?...
Status: 404 Not Found
Error: "Failed to download resume (status 404): {"detail":"Not Found"}"
```

Backend log confirms:
```
GET /api/v1/api/v1/resumes/8ed87805-.../pdf?... HTTP/1.1" 404 Not Found
```

---

## Root Cause

The `/api/v1` prefix is added **twice** — once by `getResumePdfUrl()` and again by `apiFetch()`.

### Step-by-step trace

**1. `API_BASE` definition** (`apps/frontend/lib/api/client.ts`, line 8-9):
```typescript
export const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? '' : 'http://127.0.0.1:8000');
export const API_BASE = `${API_URL}/api/v1`;
// Browser (NEXT_PUBLIC_API_URL unset): API_URL = '', API_BASE = '/api/v1'
```

**2. `getResumePdfUrl()`** (`apps/frontend/lib/api/resume.ts`, line 269-300):
```typescript
return `${API_BASE}/resumes/${encodeURIComponent(normalizedId)}/pdf?${params.toString()}`;
// Returns: '/api/v1/resumes/{id}/pdf?...'  ← already has /api/v1
```

**3. `downloadResumePdf()`** (`apps/frontend/lib/api/resume.ts`, line 302-313):
```typescript
const url = getResumePdfUrl(resumeId, settings, locale);
const res = await apiFetch(url);  // ← passes full URL to apiFetch
```

**4. `apiFetch()` prepends again** (`apps/frontend/lib/api/client.ts`, line 63):
```typescript
const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
// endpoint = '/api/v1/resumes/{id}/pdf?...' (starts with '/', not 'http')
// Result:    '/api/v1' + '/api/v1/resumes/{id}/pdf?...'
//          = '/api/v1/api/v1/resumes/{id}/pdf?...'  ← DOUBLE!
```

### Why it worked in production before

In production, `NEXT_PUBLIC_API_URL = 'https://resume.bevansatria.my.id'`, so:
- `API_BASE` = `'https://resume.bevansatria.my.id/api/v1'`
- `getResumePdfUrl()` returns `'https://resume.bevansatria.my.id/api/v1/resumes/{id}/pdf'`
- `apiFetch()` sees it starts with `'http'` → uses as-is (no double prefix)

In local dev (WSL2), `NEXT_PUBLIC_API_URL = ''`, so:
- `API_BASE` = `'/api/v1'`
- `getResumePdfUrl()` returns `'/api/v1/resumes/{id}/pdf'`
- `apiFetch()` sees it starts with `'/'` → prepends `'/api/v1'` again → **DOUBLE**

---

## Fix

**Option A (Recommended)**: `downloadResumePdf()` should pass a **relative endpoint** to `apiFetch()` instead of a URL that already includes `API_BASE`:

```typescript
// In downloadResumePdf():
export async function downloadResumePdf(resumeId, settings, locale) {
  const url = getResumePdfUrl(resumeId, settings, locale);
  // apiFetch already prepends API_BASE, but getResumePdfUrl also uses it.
  // Use fetch() directly since url is already fully constructed.
  const res = await fetch(url, {
    headers: buildHeaders(),
  });
  ...
}
```

**OR** change `getResumePdfUrl()` to return a relative path without `API_BASE`:

```typescript
// In getResumePdfUrl():
return `/resumes/${encodeURIComponent(normalizedId)}/pdf?${params.toString()}`;
// Then apiFetch() adds API_BASE once: '/api/v1/resumes/{id}/pdf'
```

**Option B**: Make `apiFetch()` detect paths already starting with `/api/v1`:

```typescript
const url = endpoint.startsWith('http') || endpoint.startsWith('/api/v1')
  ? endpoint
  : `${API_BASE}${endpoint}`;
```

### Recommended: Option A — change `getResumePdfUrl()` to return relative path

This is the cleanest fix. `getResumePdfUrl()` is also used by the cover letter PDF URL function, so both get fixed.

---

## Same bug also affects

| Function | File | Line |
|----------|------|------|
| `getCoverLetterPdfUrl()` | `apps/frontend/lib/api/resume.ts` | ~355 |

Both use `${API_BASE}/...` and then pass to `apiFetch()`.

---

## Files to modify

| File | Change |
|------|--------|
| `apps/frontend/lib/api/resume.ts` | `getResumePdfUrl()`: remove `API_BASE` prefix, return `/resumes/...` |
| `apps/frontend/lib/api/resume.ts` | `getCoverLetterPdfUrl()`: same fix |
