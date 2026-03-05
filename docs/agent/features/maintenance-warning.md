# Maintenance Warning System — Implementation Plan

## Overview

Admin-controlled maintenance notice that surfaces on the user dashboard. Extends the existing `config.json`-based app settings pattern and reuses established Swiss International Style UI components.

---

## A. Admin UI Integration

### Placement

The maintenance control appears inside the **"App Settings"** section of `/admin` page, directly **below** the existing "Public Registration" `ToggleSwitch`.

### Button / Entry Point

1. A new row after the registration toggle:
   - Left-aligned label: **"Maintenance Warning"** (`font-mono text-sm font-bold uppercase tracking-wider`)
   - Right-aligned clickable text: **"Click for Detail →"** (`font-mono text-xs uppercase text-blue-700 underline cursor-pointer`)
2. Container: `border border-black bg-white p-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]`
3. Status indicator dot:
   - **Green** (`bg-[#15803D]`) when maintenance is **enabled**
   - **Gray** (`bg-gray-400`) when **disabled**

### Modal Layout

Clicking "Click for Detail" opens a modal dialog:

- **Backdrop**: Semi-transparent black overlay
- **Container**: `border border-black bg-[#F0F0E8] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]`, max-width `32rem`, centered
- **Header**: `font-serif text-xl font-bold uppercase tracking-tight` — "Maintenance Warning"
- **Subheader**: `font-mono text-xs text-gray-500 uppercase` — "// Configure maintenance notice for all users"

### Form Structure (inside modal)

| Element | Description |
|---------|-------------|
| **Toggle** | `ToggleSwitch` component with label "Enable Maintenance Notice" and description "When enabled, a notice capsule will appear on user dashboards." |
| **Message textarea** | `<textarea>` with `font-mono text-sm`, 6 rows, `border border-black`. Disabled when toggle is off. |
| **"Use Default Template" button** | `variant="outline"` button below textarea. Replaces content with default template. Disabled when toggle is off. |
| **Button row** | Right-aligned. **Cancel** (`variant="outline"`) and **Save** (`variant="default"`, shows `Loader2` while saving). |

---

## B. Admin Interaction Flow

### Step-by-step

1. **Admin opens `/admin`** → `loadData()` calls `GET /admin/app-settings` which now also returns `maintenance_enabled` and `maintenance_message`.

2. **Admin sees App Settings section** → Below "Public Registration", the "Maintenance Warning" row is visible with a status dot.

3. **Admin clicks "Click for Detail"** → Modal opens, pre-populated with current values.

4. **Admin toggles the switch**:
   - **ON**: Textarea becomes editable. If message is empty, auto-populate with default template.
   - **OFF**: Textarea becomes disabled/dimmed. Content preserved but grayed out.

5. **Admin edits the message** → Free-form text. "Use Default Template" resets to hardcoded default.

6. **Admin clicks Save**:
   - Spinner on button, both buttons disabled.
   - `PATCH /admin/app-settings` with `{ maintenance_enabled, maintenance_message }`.
   - Success: modal closes, dot updates, feedback banner.
   - Failure: modal stays open, error banner.

7. **Admin clicks Cancel** → Modal closes, unsaved changes discarded.

### Default Message Template

```
Admin website ini sedang mengembangkan fitur baru.
Anda mungkin akan menemui beberapa error, jadi mohon dimaklumi.

Jika ada pertanyaan silakan hubungi:
me@bevansatria.my.id
```

### Modal State Transitions

| State | Toggle | Textarea | Save | Cancel |
|-------|--------|----------|------|--------|
| Initial (disabled) | OFF | Disabled, dimmed | Enabled | Enabled |
| Initial (enabled) | ON | Editable, has message | Enabled | Enabled |
| Saving | Frozen | Read-only | Spinner + disabled | Disabled |
| Save error | Restored | Restored | Re-enabled | Re-enabled |

---

## C. Backend Configuration Logic

### Storage

Stored in the existing `config.json` (`apps/backend/data/config.json`):

```json
{
  "register_enabled": true,
  "maintenance_enabled": false,
  "maintenance_message": ""
}
```

Uses existing `load_config_file()` / `save_config_file()` from `app/config.py`.

### Schema Changes (`apps/backend/app/routers/admin.py`)

1. **`AppSettingsResponse`** — Add:
   - `maintenance_enabled: bool` (default `False`)
   - `maintenance_message: str` (default `""`)

2. **`AppSettingsUpdate`** — Add (optional for backward compatibility):
   - `maintenance_enabled: bool | None = None`
   - `maintenance_message: str | None = None`

3. **`GET /admin/app-settings`** — Extend response with new fields.

4. **`PATCH /admin/app-settings`** — Persist new fields when present.

### Public Retrieval Endpoint (new)

- **Route**: `GET /api/v1/maintenance-status`
- **Auth**: None required
- **Response**: `{ "maintenance_enabled": bool, "maintenance_message": str }`
- **Location**: `apps/backend/app/routers/health.py`
- **Logic**: Reads `config.json`, returns fields with defaults if missing.

### Why a separate public endpoint?

`GET /admin/app-settings` requires admin auth (`Depends(get_current_admin)`). Regular users cannot call it. A public endpoint keeps separation of concerns clean.

---

## D. Dashboard UI Placement

### Layout Context

The dashboard renders a `<SwissGrid>` component with:
- Header section (title + tagline) — **has empty space on the right**
- Scrollable content grid (5 columns on desktop)
- Footer section (links + admin button)

### Capsule Placement

Inside the **SwissGrid header section**, anchored to the **top-right corner**. Positioned via flexbox or absolute positioning within the existing header `<div>`.

### Capsule Appearance (Collapsed State)

| Property | Value |
|----------|-------|
| Shape | Compact rectangle (`rounded-none` per Swiss style) |
| Size | ~200px wide, auto height |
| Border | `border border-black` |
| Background | `bg-amber-50` |
| Shadow | `shadow-[2px_2px_0px_0px_#000000]` |
| Icon | `AlertTriangle` (lucide-react) |
| Line 1 | `font-mono text-xs font-bold uppercase tracking-wider text-amber-800` — "Maintenance Notice" |
| Line 2 | `font-mono text-[10px] uppercase text-amber-700 underline cursor-pointer` — "Click for Detail" |
| Hover | `hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all` |

### Responsive Behavior

- **Desktop** (≥ md): Top-right of header area
- **Mobile** (< md): Below header title, full-width

---

## E. User Interaction Flow

1. **User opens dashboard** → `DashboardPage` mounts inside `SwissGrid`.

2. **Fetch maintenance status** → `GET /api/v1/maintenance-status` runs in parallel with resume list and status cache — does NOT block rendering.

3. **Response arrives**:
   - `maintenance_enabled === true` + non-empty message → capsule renders
   - Otherwise → nothing renders, no space reserved

4. **User sees capsule** → Compact amber badge in top-right of header.

5. **User clicks capsule** → Popup/dialog opens with full message.

6. **User reads and closes** → Click X, click backdrop, or press Escape. Capsule remains visible.

---

## F. UI States

| # | State | Capsule | Popup | Description |
|---|-------|---------|-------|-------------|
| 1 | Maintenance Disabled | Hidden | Hidden | `maintenance_enabled === false` |
| 2 | Loading | Hidden | Hidden | Fetch in-flight. No capsule during loading. |
| 3 | Fetch Failed | Hidden | Hidden | Graceful degradation — no error shown. |
| 4 | Enabled — Collapsed | Visible | Hidden | Default active state. |
| 5 | Enabled — Popup Open | Behind overlay | Visible | User clicked capsule. |
| 6 | Message Empty | Hidden | Hidden | Enabled but empty message treated as disabled. |

---

## G. Popup / Dialog Behavior

### Layout

- **Type**: Modal dialog (same pattern as `ConfirmDialog`)
- **Backdrop**: `bg-black/50`
- **Container**: Centered, max-width `28rem`, `border border-black bg-[#F0F0E8] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]`
- **Header**: `AlertTriangle` icon + `font-serif text-lg font-bold uppercase` — "Maintenance Notice"
- **Close button**: X icon, top-right corner

### Message Display

- `font-mono text-sm text-black whitespace-pre-wrap break-words`
- Preserves admin's line breaks and formatting
- Scrollable container: `max-h-[60vh] overflow-y-auto`

### Close Behavior

1. Click **X** button
2. Click **backdrop**
3. Press **Escape**

### Interaction Limits

- Read-only — no user actions beyond reading and closing
- No "dismiss/don't-show-again" — capsule reappears every page load while enabled

---

## H. Edge Cases

| Case | Handling |
|------|----------|
| Maintenance toggled while users are online | Users see the change on next navigation/refresh. No real-time push needed. |
| Message is empty when enabled | Frontend treats as disabled. Admin modal can show validation hint but still allows saving. |
| Backend `config.json` missing maintenance keys | Endpoint returns defaults: `{ false, "" }` via `.get()` pattern. |
| Backend unreachable | Fetch fails silently. Capsule not rendered. No error to user. |
| Dashboard loads before fetch completes | Capsule not shown during loading. Renders asynchronously. No layout shift (absolute positioning). |
| Very long message | Popup has `max-h-[60vh] overflow-y-auto` for scrolling. |
| Admin saves from another device | Eventual consistency on next dashboard mount. |

---

## I. Performance Considerations

1. **Non-blocking**: Maintenance fetch fires on mount independently of resume list loading.
2. **Lightweight**: Reads a < 1KB JSON file from disk. Expected < 10ms response.
3. **No caching**: File is tiny; fresh check on every mount ensures accuracy.
4. **No polling**: Fetched once on mount. Changes visible on next navigation.
5. **Parallel fetch**: Runs concurrently with `fetchResumeList()` and `fetchSystemStatus()`.
6. **Bundle impact**: No new dependencies. One new ~80-line component.

---

## J. Security Considerations

### Write Access (Admin Only)

- `PATCH /admin/app-settings` already protected by `Depends(get_current_admin)` at router level.
- No additional auth needed — maintenance fields are part of the same payload.

### Read Access (Public)

- `GET /api/v1/maintenance-status` is intentionally public.
- Only exposes `maintenance_enabled` and `maintenance_message`. No sensitive data.
- Message is admin-authored. React's JSX escaping provides XSS protection.

### Input Validation

- `maintenance_message`: Max 2000 characters via Pydantic `field_validator` or `max_length`.
- `maintenance_enabled`: Strict boolean — Pydantic handles type validation.

---

## Files to Modify

| File | Change |
|------|--------|
| `apps/backend/app/routers/admin.py` | Extend `AppSettingsResponse`/`AppSettingsUpdate` schemas; update GET/PATCH handlers |
| `apps/backend/app/routers/health.py` | Add `GET /maintenance-status` public endpoint |
| `apps/frontend/app/(default)/admin/page.tsx` | Add maintenance row in App Settings; add modal with toggle + textarea |
| `apps/frontend/components/home/swiss-grid.tsx` | Accept maintenance notice prop/slot in header |
| `apps/frontend/app/(default)/dashboard/page.tsx` | Fetch maintenance status on mount; render capsule |
| `apps/frontend/components/dashboard/maintenance-capsule.tsx` | **New file** — Capsule component + popup dialog |
| `apps/frontend/lib/api/client.ts` | *(Optional)* Add `fetchMaintenanceStatus()` helper |

No new backend dependencies. No database migrations. No Prisma schema changes.
