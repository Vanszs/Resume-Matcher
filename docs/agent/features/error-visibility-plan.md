# Error Visibility & Reliability Plan

> **Status:** PLAN ONLY — belum coding. Tunggu approval sebelum implementasi.

---

## Daftar Error dari Backend Log

| # | Error | Root Cause | Severity | Status |
|---|-------|-----------|----------|--------|
| E1 | **Cloudflare HTML Block** — OpenAI API returns CAPTCHA HTML instead of JSON | VPS IP di-block Cloudflare. `error_code: "html_response"` sudah di-generate tapi TIDAK dikirim ke frontend | Critical | ⚠️ Perlu plan |
| E2 | **Health check `max_tokens: 16` too small** — reasoning models (o1, o3-mini) gagal respond dalam 16 tokens | `max_tokens` terlalu kecil untuk reasoning models yang butuh "thinking" tokens | High | ✅ Sudah fix → `max_tokens: 1000` |
| E3 | **SSE `/status-stream` 401 Unauthorized** — `EventSource` tidak kirim cookies | `EventSource` default tidak kirim credentials cross-origin | Critical | ✅ Sudah fix → `{ withCredentials: true }` |
| E4 | **LLM returns reasoning text instead of JSON** — "1. Analyze the Request..." | Model tertentu (reasoning models) return pemikiran dulu, bukan langsung JSON | High | ⚠️ Perlu plan |
| E5 | **pdfminer FontBBox warnings** — "Could not get FontBBox from font descriptor" | PDF font metadata tidak lengkap | Low | 🔇 Cosmetic, no action |
| E6 | **Resume stuck `processing` after server restart** | Background task mati saat server restart, status tidak pernah di-update | High | ✅ Sudah fix → startup sweep reset ke `failed` |

---

## Plan A: Surface LLM Error ke Dashboard User

### Problem

Backend generate `error_code` dari health check (`html_response`, `api_key_missing`, `duplicate_v1_path`, `not_found_404`, `empty_content`, `health_check_failed`) tapi TIDAK PERNAH sampai ke frontend. User hanya lihat "configured" vs "not configured" — tidak tahu **kenapa** LLM gagal.

### Gap Analysis

| # | Gap | Lokasi | Impact |
|---|-----|--------|--------|
| G1 | `StatusResponse` tidak punya field `error_code` | `schemas/models.py` | error_code hilang di API response |
| G2 | Dashboard hanya cek `llm_configured`, abaikan `llm_healthy` | `dashboard/page.tsx:567` | User dengan key valid tapi IP blocked = no warning |
| G3 | Initial `/status` call pakai fast-path (skip LLM test) | `status-cache.tsx:208` | `llm_healthy` selalu `true` kalau key ada |

### Existing Components yang Akan di-Reuse

| Component | File | Reuse |
|-----------|------|-------|
| **Amber warning banner** | `dashboard/page.tsx:567-589` | Extend condition: `!configured` → `!configured \|\| (configured && !healthy)` |
| **`getHealthCheckMessage()`** | `settings/page.tsx:93-104` | Extract ke shared util, reuse di dashboard |
| **`healthErrors` i18n keys** | `messages/*.json` → `settings.llmConfiguration.healthErrors.*` | Reuse langsung — sudah ada untuk semua error_code |
| **`useStatusCache()` hook** | `status-cache.tsx` | Sudah dipakai dashboard. Tinggal expose `llm_error_code` |
| **`AlertTriangle` icon** | Sudah imported di dashboard | Reuse as-is |
| **Settings link CTA** | Sudah ada di banner | Keep same pattern |

### Perubahan yang Dibutuhkan

#### Layer 1: Backend — Tambah `llm_error_code` ke StatusResponse

**File:** `apps/backend/app/schemas/models.py`
```python
class StatusResponse(BaseModel):
    status: str
    llm_configured: bool
    llm_healthy: bool
    llm_error_code: str | None = None  # NEW
    has_master_resume: bool
    database_stats: dict[str, Any]
```

**File:** `apps/backend/app/routers/health.py`
```python
# Di dalam get_status(), saat include_llm_health=True:
if include_llm_health:
    llm_status = await check_llm_health(config)
    llm_healthy = llm_status["healthy"]
    llm_error_code = llm_status.get("error_code")  # NEW
else:
    llm_healthy = is_configured
    llm_error_code = None  # NEW

return StatusResponse(
    ...,
    llm_error_code=llm_error_code,  # NEW
)
```

#### Layer 2: Frontend Type — Accept `llm_error_code`

**File:** `apps/frontend/lib/api/config.ts`
```typescript
export interface SystemStatus {
  status: 'ready' | 'setup_required';
  llm_configured: boolean;
  llm_healthy: boolean;
  llm_error_code?: string;  // NEW
  has_master_resume: boolean;
  database_stats: DatabaseStats;
}
```

#### Layer 3: StatusCacheProvider — Full check on first mount

**File:** `apps/frontend/lib/context/status-cache.tsx`
```typescript
// Line 208: Change dari:
refreshStatus();
// Ke:
refreshStatus(true);  // Full LLM health check on first mount
```

Subsequent periodic refresh (setiap 30 menit) sudah pakai `refreshLlmHealth()` → `fetchSystemStatus(true)`. Tidak perlu ubah.

#### Layer 4: Extract `getHealthCheckMessage` ke shared util

**File baru:** `apps/frontend/lib/utils/health-messages.ts`
```typescript
// Pindah dari settings/page.tsx
export const getHealthCheckMessage = (
  t: (key: string) => string,
  baseKey: string,
  code?: string,
  fallback?: string
): string | null => {
  if (code) {
    const key = `${baseKey}.${code}`;
    const localized = t(key);
    return localized !== key ? localized : (fallback ?? code);
  }
  return fallback ?? null;
};
```

- Import di `settings/page.tsx` (replace existing)
- Import di `dashboard/page.tsx` (new usage)

#### Layer 5: Dashboard — Extend warning banner

**File:** `apps/frontend/app/(default)/dashboard/page.tsx`

```typescript
// Tambah variable:
const isLlmHealthy = !statusLoading && systemStatus?.llm_healthy !== false;

// Extend banner condition dari:
{masterResumeId && !isLlmConfigured && !statusLoading && (

// Ke:
{masterResumeId && (!isLlmConfigured || (isLlmConfigured && !isLlmHealthy)) && !statusLoading && (
```

Di dalam banner, conditional rendering:
- `!isLlmConfigured` → tampilkan existing `llmNotConfiguredTitle` / `llmNotConfiguredMessage`
- `isLlmConfigured && !isLlmHealthy` → tampilkan `llmUnhealthyTitle` + mapped error message dari `getHealthCheckMessage()`

#### Layer 6: i18n — Tambah 2 key baru (minimal)

**Semua 6 locale files** (`en.json`, `es.json`, `id.json`, `ja.json`, `pt-BR.json`, `zh.json`):

```json
{
  "dashboard": {
    "llmUnhealthyTitle": "[ LLM CONNECTION ISSUE ]",
    "llmUnhealthyMessage": "> Your API key is configured but the LLM is unreachable. Check Settings for details."
  }
}
```

Error reason spesifik (e.g. "HTML response", "404 Not Found") diambil dari **existing** `settings.llmConfiguration.healthErrors.*` keys — **tidak perlu duplikasi**.

### Yang TIDAK Dibutuhkan

- ❌ Dialog baru — amber banner cukup (non-blocking)
- ❌ Component baru — reuse existing banner, icon, button, link
- ❌ API endpoint baru — extend existing `/status`
- ❌ Health check logic baru — `check_llm_health()` sudah generate semua
- ❌ Duplikasi i18n — reuse `healthErrors.*` untuk specific error codes

### Flow Diagram

```
check_llm_health()            → { healthy: false, error_code: "html_response" }
         ↓
StatusResponse                → llm_error_code: "html_response"  (NEW field)
         ↓
fetchSystemStatus(true)       → SystemStatus.llm_error_code      (NEW field)
         ↓
StatusCacheProvider            → status.llm_error_code
         ↓
Dashboard                     → Amber banner: "[ LLM CONNECTION ISSUE ]"
                                + "Health check failed. The Base URL returned HTML..."
                                + [Settings] button
```

---

## Plan B: Fix LLM JSON Extraction Failure (Reasoning Models)

### Problem

Reasoning models (Gemini `gemini-2.5-flash`, OpenAI `o1`, `o3-mini`) sering return "thinking text" sebelum JSON:

```
1.  **Analyze the Request:**
    *   **Goal:** Parse a resume into a specific JSON format.
    *   **Input:** A text-based resume for "Bevantyo Satria Pinandhita".
    *   **Output:** Valid JSON only.
```

`_extract_json()` gagal karena tidak ada JSON object di response. Retry mechanism sudah ada (3 attempts) tapi hint yang ditambahkan kurang kuat untuk reasoning models.

### Root Cause

1. `_extract_json()` mencari `{` di response — kalau tidak ada, langsung raise `ValueError`
2. Reasoning models butuh "think first" sebelum output — kadang lupa output JSON-nya
3. Retry hint hanya menambah `\n\nIMPORTANT: Output ONLY a valid JSON object...` — kurang efektif

### Proposed Fix

#### B1: Backend — Improve `_extract_json()` robustness

**File:** `apps/backend/app/llm.py`

Enhance `_extract_json()` untuk handle markdown code blocks:
```python
# Sebelum mencari raw {, coba extract dari ```json ... ``` blocks
# Juga handle case dimana LLM wraps JSON dalam backticks
```

#### B2: Backend — Stronger retry prompt for reasoning models

**File:** `apps/backend/app/llm.py` → `call_llm_json()`

Detect jika response mengandung reasoning pattern (`"1. "`, `"**Analyze"`, `"*   **Goal"`) dan tambahkan hint yang lebih agresif:
```python
# Pada retry, jika previous response terdeteksi reasoning:
messages[-1]["content"] = (
    prompt
    + "\n\nCRITICAL: You MUST output ONLY raw JSON. "
    + "Do NOT include any analysis, thinking, or explanation. "
    + "Start your response with { and end with }. Nothing else."
)
```

#### B3: Backend — Tambah `error_code` baru: `json_extraction_failed`

**File:** `apps/backend/app/llm.py`

Saat parsing gagal setelah semua retry, set error message yang informatif:
```
"LLM returned text instead of JSON after 3 attempts. This usually happens with reasoning models. Try switching to a different model."
```

Ini sudah ter-handle oleh existing error path — `error_message` disimpan di resume record dan ditampilkan di dashboard.

#### B4: Frontend — User-friendly message untuk JSON parse failure

**Existing mechanism sudah cukup:**
- `error_message` disimpan via `db.update_resume()` saat background processing fails
- Dashboard sudah show error message untuk failed resumes

**Yang perlu diperbaiki:** Error message yang ditampilkan terlalu teknikal. Wrap menjadi user-friendly:
```
"Processing failed: The AI model didn't return structured data. This can happen with reasoning-focused models. Try re-processing or switch to a standard model in Settings."
```

### Prioritas

| Step | Effort | Impact |
|------|--------|--------|
| B1: Improve `_extract_json()` | Low | High — banyak kasus bisa di-handle tanpa retry |
| B2: Stronger retry prompt | Low | Medium — reduce retry failures |
| B3: Better error message | Low | Medium — user tahu apa yang salah |

---

## Plan C: SSE 401 — Root Cause & Remaining Risk

### Current State

`withCredentials: true` sudah ditambahkan ke `new EventSource()`. Ini SEHARUSNYA fix masalah karena browser sekarang kirim cookie `auth_token` ke SSE endpoint.

### Remaining Risks

| # | Risk | Cause | Fix |
|---|------|-------|-----|
| C1 | Cookie `SameSite=Lax` tanpa `Secure` flag | Cookie di-set tanpa `Secure` — browser modern mungkin block pada HTTPS | Tambah `Secure` flag saat set cookie di login |
| C2 | SSE reconnect setelah cookie expire | EventSource auto-reconnect tapi cookie sudah expire | Fallback: tutup SSE dan switch ke polling saat 401 |
| C3 | Deploy belum jalan | `deploy.sh` exit code 1 → production masih pakai code lama | Manual deployment fix |

### Proposed Fix

#### C1: Tambah `Secure` flag pada cookie

**File:** `apps/frontend/app/login/page.tsx`
```typescript
// Dari:
document.cookie = `auth_token=${data.access_token}; path=/; max-age=${maxAge}; SameSite=Lax`;
// Ke:
document.cookie = `auth_token=${data.access_token}; path=/; max-age=${maxAge}; SameSite=Lax; Secure`;
```

Juga di semua tempat clear cookie:
```typescript
document.cookie = 'auth_token=; path=/; max-age=0; SameSite=Lax; Secure';
```

#### C2: SSE graceful fallback on 401

**File:** `apps/frontend/app/(default)/dashboard/page.tsx`

Pada `es.onerror`, detect 401 dan switch ke polling:
```typescript
es.onerror = () => {
  // Jika SSE gagal connect (401), fallback ke interval polling
  // Gunakan existing checkResumeStatus() sebagai fallback
};
```

> **Note:** `EventSource` API tidak expose HTTP status code di `onerror`. Untuk detect 401, perlu mempertimbangkan approach lain (e.g., test fetch dulu sebelum buka SSE, atau wrap SSE dalam try-catch timeout).

---

## Plan D: Suppress pdfminer FontBBox Warnings

### Problem

```
WARNING:pdfminer.pdffont:Could not get FontBBox from font descriptor because None cannot be parsed as 4 floats
```

Spam log dengan warnings yang tidak actionable.

### Proposed Fix

**File:** `apps/backend/app/main.py` atau `app/services/parser.py`

```python
import logging
logging.getLogger("pdfminer").setLevel(logging.ERROR)
```

Effort: trivial, 1 line.

---

## Implementation Priority

| Priority | Plan | Effort | Impact | Dependencies |
|----------|------|--------|--------|-------------|
| 🔴 P0 | **Plan A** — Surface LLM errors ke dashboard | Medium (6 files) | Critical — user harus tahu kenapa LLM gagal | None |
| 🟠 P1 | **Plan C1** — Secure cookie flag | Low (1 file) | High — SSE auth reliability | None |
| 🟡 P2 | **Plan B1-B2** — Improve JSON extraction + retry | Low (1 file) | High — reduce processing failures | None |
| 🟢 P3 | **Plan B3** — Better error messages | Low (1 file) | Medium — UX improvement | After B1-B2 |
| 🟢 P3 | **Plan C2** — SSE fallback polling | Medium (1 file) | Medium — edge case handling | After C1 |
| ⚪ P4 | **Plan D** — Suppress pdfminer warnings | Trivial | Low — log cleanliness | None |

---

## Risk Assessment

| Concern | Mitigation |
|---------|------------|
| First-mount full LLM check adds ~2-3s latency | Dashboard sudah show loading state; banner muncul setelah load |
| Fast-path callers tidak dapat `error_code` | Mereka dapat `llm_error_code: null` — dashboard sudah handle. Full check hanya saat mount + setiap 30 min |
| New field breaks older frontend | `llm_error_code` optional (`None`/`undefined`) — backward compatible |
| `Secure` flag blokir cookie di dev (HTTP) | Hanya tambah `Secure` kalau production (check `location.protocol === 'https:'`) |
| SSE fallback polling tambah complexity | Bisa di-defer ke P3 — withCredentials + Secure sudah cukup untuk mayoritas kasus |
