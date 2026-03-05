# Implementation Plan: User Detail Modal with Activity Chart

> **Status**: Planning  
> **Scope**: Admin Panel → User Management → View User Detail  
> **Approach**: Minimal backend additions; reuse existing patterns

---

## Table of Contents

1. [Overview](#1-overview)  
2. [A — UI Integration (Eye Button)](#2-a--ui-integration-eye-button)  
3. [B — Modal / Popup Structure](#3-b--modal--popup-structure)  
4. [C — User Interaction Flow](#4-c--user-interaction-flow)  
5. [D — Backend Data Requirements](#5-d--backend-data-requirements)  
6. [E — Data Flow](#6-e--data-flow)  
7. [F — Chart Behavior](#7-f--chart-behavior)  
8. [G — UI States](#8-g--ui-states)  
9. [H — Edge Cases](#9-h--edge-cases)  
10. [I — Performance Considerations](#10-i--performance-considerations)  
11. [J — Security Considerations](#11-j--security-considerations)  

---

## 1. Overview

Add a **"View User Detail" eye icon button** to each row in the User Management table on the existing Admin Panel page (`apps/frontend/app/(default)/admin/page.tsx`). Clicking the button opens a modal displaying:

- **Section A**: Basic user profile information  
- **Section B**: Activity overview with a line chart showing user actions over time  

### Key Constraints

- Follow the **Swiss International Style** design system already used in the admin panel  
- Reuse the existing `Dialog` component (`components/ui/dialog.tsx`) and `Button` component (`components/ui/button.tsx`)  
- Backend data comes from two stores: **Prisma (SQLite)** for user info, **TinyDB** for resume/activity data  
- Requires **one new backend endpoint**: `GET /admin/users/{user_id}/detail`  
- Frontend requires **one new dependency**: `recharts` (lightweight, React-native charting library)

---

## 2. A — UI Integration (Eye Button)

### 2.1 Button Placement

The eye button is added to the **Actions column** (`<td>` with `text-right`) of each user row in the existing users table. It is placed **before** the existing toggle-active and delete buttons, making it the first action in the row.

**Current action order per row:**
1. Toggle Active (ToggleRight / ToggleLeft)  
2. Delete (Trash2)  

**New action order per row:**
1. **View Detail (Eye)** ← NEW  
2. Toggle Active (ToggleRight / ToggleLeft)  
3. Delete (Trash2)  

### 2.2 Icon Usage

- Use the `Eye` icon from `lucide-react` (already a project dependency)  
- Import: `import { Eye } from 'lucide-react'`  
- Icon size: `w-4 h-4` (consistent with existing action icons)

### 2.3 Button Implementation

Use the existing `Button` component with `variant="ghost"` and `size="icon"` — identical to the pattern already used for toggle-active and delete buttons in the same table row.

```
Pattern reference (existing):
<Button variant="ghost" size="icon" onClick={...} title="..." disabled={...}>
  <ToggleRight className="w-4 h-4 text-green-600" />
</Button>
```

The eye button follows this exact pattern:
- `variant="ghost"` — no background, subtle hover  
- `size="icon"` — square (h-9 w-9)  
- Icon color: `text-blue-700` (Hyper Blue) to signal an informational/view action, distinct from the existing green (toggle) and red (delete) color coding  
- Hover state: inherits the ghost button's hover from the design system (slightly translucent background on hover)

### 2.4 Hover States

- Default: No background, `text-blue-700` icon  
- Hover: `hover:bg-blue-50` — light blue background (add as className override, consistent with the `hover:bg-red-100` used on the delete button)  
- Active/pressed: inherits from ghost variant  
- Focus: Blue ring via the global `focus-visible:ring-2 focus-visible:ring-blue-700` from the Button component  

### 2.5 Disabled States

- The eye button should **never be disabled** — every user row (including the current admin's own row) can be viewed  
- However, the button should show a `Loader2` spinner when this specific user's detail is currently being fetched (track via state `detailLoadingUserId`)
- While a detail fetch is in progress for a different user, the button remains enabled (non-blocking)

### 2.6 Tooltip / Title

- `title="View user details"` attribute on the button for native browser tooltip  
- Consistent with existing `title` attributes on toggle and delete buttons

### 2.7 Permission Considerations

- The entire admin page is already guarded by the `get_current_admin` dependency  
- The eye button inherits this guard — no additional permission check needed at the button level  
- Backend reinforces this by requiring admin authentication on the new endpoint

---

## 3. B — Modal / Popup Structure

### 3.1 Component Choice

Use the existing **`Dialog` component** from `components/ui/dialog.tsx`. This component already implements:
- Portal rendering (`createPortal`)  
- Black overlay backdrop (`bg-black/50`)  
- Escape key to close  
- Body scroll lock  
- Swiss style: `rounded-none`, `border border-black`, `bg-[#F0F0E8]`, `shadow-[8px_8px_0px_0px_rgba(0,0,0,0.2)]`  

However, the admin page currently uses **inline modal markup** (see the Maintenance Warning modal at the bottom of admin/page.tsx) rather than the Dialog component. For consistency with the existing admin page pattern, the User Detail modal should follow either approach. **Recommendation**: use the `Dialog` component for cleaner code, since it provides identical Swiss styling.

### 3.2 Modal Width

- `max-w-2xl` (42rem / 672px) — wider than the maintenance modal (`max-w-[32rem]`) to accommodate the chart  
- On mobile (`< 640px`): full-width minus `p-4` padding from the Dialog container

### 3.3 Layout Structure

```
┌─────────────────────────────────────────────────────┐
│  MODAL HEADER                                        │
│  ┌────────────────────────────────────────────┐  [X] │
│  │ "User Detail"              (font-serif)    │      │
│  │ // user@email.com          (font-mono)     │      │
│  └────────────────────────────────────────────┘      │
├─────────────────────────────────────────────────────┤
│  SECTION A: BASIC INFO                               │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Grid (2 cols on md+, 1 col on mobile)           │ │
│  │                                                  │ │
│  │  User ID        │  Role                         │ │
│  │  xxxxxxx-xxxx   │  ADMIN                        │ │
│  │                  │                                │ │
│  │  Username        │  Account Status               │ │
│  │  john_doe        │  ● Active                     │ │
│  │                  │                                │ │
│  │  Email           │  Email Verified               │ │
│  │  user@email.com  │  ✓ Verified                   │ │
│  │                  │                                │ │
│  │  Created At      │  Last Login                   │ │
│  │  2024-01-15      │  2024-03-05 14:30             │ │
│  └─────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────┤
│  SECTION B: ACTIVITY OVERVIEW                        │
│  ┌─────────────────────────────────────────────────┐ │
│  │  Stats Row (3 cards inline)                      │ │
│  │  [ Total Resumes: 12 ] [ Tailored: 8 ] [ ...]   │ │
│  └─────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────┐ │
│  │                                                  │ │
│  │  LINE CHART  (height: 240px)                     │ │
│  │  Y: Actions count (numeric)                      │ │
│  │  X: Date labels (daily/weekly)                   │ │
│  │                                                  │ │
│  └─────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────┤
│  MODAL FOOTER                                        │
│  ┌───────────────────────────────────[Close]────────┐ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 3.4 Section Details

**Header**
- Title: `"User Detail"` — `font-serif text-xl font-bold uppercase tracking-tight`  
- Subtitle: user email — `font-mono text-xs text-gray-500 uppercase mt-1`  
- Close button (X): absolute positioned top-right per Dialog component defaults  
- Separator: `border-b border-black` below header

**Section A — Basic Info**
- Section heading: `font-mono text-sm font-bold uppercase tracking-wider` with small icon (e.g. `Users` from lucide)  
- Content: 2-column grid (`grid-cols-2` on `md+`, `grid-cols-1` on mobile)  
- Each field is a label-value pair:
  - Label: `font-mono text-xs uppercase tracking-widest text-gray-500`  
  - Value: `font-mono text-sm font-medium`  
- Separator: `border-b border-black/10` below Section A

**Section B — Activity Overview**
- Section heading: Same style as Section A heading, with `BarChart3` or `Activity` icon  
- Stats row: 3 mini stat cards in a row (`grid grid-cols-3 gap-3`), each card with `border border-black bg-white p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]`:
  - Total Resumes  
  - Tailored Resumes  
  - Total Actions (all-time)  
- Chart: Placed below stats row, inside a `border border-black bg-white p-4` container  
- Chart height: `240px` (fixed, via container div)

**Footer**
- Single `Close` button (`variant="outline"`) right-aligned  
- Same pattern as the maintenance modal footer

### 3.5 Responsive Behavior

| Breakpoint | Behavior |
|------------|----------|
| `< 640px` (mobile) | Modal full-width minus p-4. Info grid stacks to 1 column. Stats cards stack vertically. Chart maintains aspect ratio but shrinks horizontally. |
| `640px – 768px` (tablet) | Modal at `max-w-2xl`. Info grid 2 columns. Stats cards 3 across. Chart at full width within container. |
| `≥ 768px` (desktop) | Same as tablet. Centered in viewport. |

### 3.6 Scrolling

- Modal body (`p-5 space-y-6`) gets `max-h-[70vh] overflow-y-auto` to handle cases where content exceeds viewport height (small screens)
- Header and footer remain fixed within the modal (not part of scrollable area)

---

## 4. C — User Interaction Flow

### 4.1 Primary Happy Path

```
1. Admin is on Admin Panel page with User Management table visible
2. Admin locates target user row in the table
3. Admin clicks the Eye icon button in that row
4. Frontend sets state:
   - detailLoadingUserId = user.id
   - selectedUserDetail = null
   - detailError = null
5. Eye icon replaces with Loader2 spinner (for this specific row only)
6. Frontend calls: GET /api/v1/admin/users/{user_id}/detail
7. Backend returns UserDetailResponse (user info + activity data)
8. Frontend sets state:
   - detailLoadingUserId = null
   - selectedUserDetail = response data
   - showUserDetailModal = true
9. Modal opens with smooth fade-in animation (from Dialog component)
10. Admin reviews user information and activity chart
11. Admin clicks "Close" button, X button, overlay backdrop, or presses Escape
12. Modal closes:
    - showUserDetailModal = false
    - selectedUserDetail = null (optional: keep cached for re-open)
```

### 4.2 Error Path

```
1. Admin clicks Eye icon
2. Spinner shows on button
3. Fetch call to backend fails (network error, 500, 404, etc.)
4. Frontend sets state:
   - detailLoadingUserId = null
   - detailError = "Failed to load user details"
5. Feedback banner (existing feedback system) shows error message:
   - Red border, red bg, XCircle icon
   - Message: "Failed to load user details" or specific error from backend
6. Modal does NOT open
7. Admin can retry by clicking the Eye icon again
```

### 4.3 Modal Close Paths

| Trigger | Behavior |
|---------|----------|
| Click "Close" button | `showUserDetailModal = false` |
| Click X (top-right) | `showUserDetailModal = false` |
| Click backdrop overlay | `showUserDetailModal = false` |
| Press Escape key | `showUserDetailModal = false` (handled by Dialog component) |
| Browser back | No special handling (modal is not route-based) |

### 4.4 Re-open / Reload

- Clicking the eye icon on the same or different user always triggers a fresh API call (no client-side caching)  
- Rationale: Admin should always see the most current data. Simplifies implementation.  
- Future optimization: add a `staleTime` cache, but not in initial implementation.

### 4.5 Concurrent Actions

- While the detail modal is open, the admin should NOT be able to interact with the table behind it (Dialog overlay blocks interaction — already built into the Dialog component)  
- If the admin closes the modal and immediately clicks another user's eye icon, the previous request (if still pending) is ignored via state check (`detailLoadingUserId` changes)

---

## 5. D — Backend Data Requirements

### 5.1 Existing Endpoints (Reusable)

| Endpoint | What it provides | Reuse? |
|----------|------------------|--------|
| `GET /admin/users` | List of users with id, email, username, is_active, is_verified, role_name, created_at | **Partial** — basic info already fetched in the table. But we need additional fields (last_login, resume counts, activity timeline) not available here. |
| `GET /admin/me` | Current admin's profile | Not needed for this feature |

**Conclusion**: No existing endpoint provides the detailed view with activity data. A new endpoint is required.

### 5.2 New Endpoint

**`GET /admin/users/{user_id}/detail`**

- Router: `apps/backend/app/routers/admin.py`  
- Dependencies: `Depends(get_current_admin)` (same as all other admin endpoints)  
- Path parameter: `user_id: str`  

### 5.3 Response Schema

```
UserDetailResponse:
  # Basic Info (from Prisma User table)
  id: str
  email: str
  username: str
  role_name: str
  is_active: bool
  is_verified: bool
  created_at: str (ISO 8601)
  last_login: str | None (ISO 8601, nullable)

  # Activity Summary (aggregated)
  total_resumes: int
  total_tailored_resumes: int
  total_master_resumes: int

  # Activity Timeline (for line chart)
  activity_timeline: list[ActivityDataPoint]

ActivityDataPoint:
  date: str (YYYY-MM-DD)
  actions: int
```

### 5.4 Data Sources

| Field | Source | Method |
|-------|--------|--------|
| `id`, `email`, `username`, `role_name`, `is_active`, `is_verified`, `created_at` | Prisma `User` table | `prisma.user.find_unique(where={"id": user_id}, include={"role": True})` |
| `last_login` | **Not currently tracked** — requires a new field OR approximate from JWT token data. See Section 5.5. |
| `total_resumes` | TinyDB `resumes` table | Count all resumes where `user_id == target_user_id` and not soft-deleted |
| `total_tailored_resumes` | TinyDB `resumes` table | Count resumes where `user_id == target_user_id` and `is_master == False` and not deleted |
| `total_master_resumes` | TinyDB `resumes` table | Count resumes where `user_id == target_user_id` and `is_master == True` and not deleted |
| `activity_timeline` | TinyDB `resumes` table | Group by `created_at` date, count per day, for last 30 days |

### 5.5 Last Login Tracking

The current schema has **no `lastLoginAt` field** on the User model. Two options:

**Option A (Recommended — Minimal)**: Add a `lastLoginAt DateTime?` field to the Prisma `User` model. Update it in the `POST /auth/login` endpoint after successful authentication. This is a minimal schema change (one field, one migration) and the most accurate approach.

**Option B (No schema change)**: Omit the "Last Login" field from the modal and display "N/A" or remove it. Use `updatedAt` as a rough proxy. Less informative but zero migration needed.

**Recommendation**: Option A. The migration is trivial (`ALTER TABLE User ADD COLUMN lastLoginAt DATETIME`) and login tracking is standard.

### 5.6 Activity Data Aggregation

The backend builds the `activity_timeline` by:

1. Query all resumes from TinyDB where `user_id == target_user_id` (include both active and soft-deleted — they still represent activity)
2. Parse each resume's `created_at` field (ISO 8601 string)
3. Group by calendar date (YYYY-MM-DD)
4. Count resumes created per day
5. Fill gaps with `actions: 0` for days with no activity
6. Return the last 30 days of data points (always 30 items, even if all zeros)

**Why 30 days?** Provides a meaningful trend window without overwhelming the chart. Consistent X-axis length regardless of user age.

### 5.7 Database Query Methods (New)

Add these methods to the `Database` class in `apps/backend/app/database.py`:

1. **`count_resumes_for_user(user_id: str) -> int`** — Count all non-deleted resumes for a user  
2. **`count_tailored_resumes_for_user(user_id: str) -> int`** — Count non-deleted, non-master resumes  
3. **`count_master_resumes_for_user(user_id: str) -> int`** — Count non-deleted master resumes  
4. **`get_resume_dates_for_user(user_id: str) -> list[str]`** — Return list of `created_at` strings for all resumes (active + soft-deleted) for aggregation  

All methods follow the existing query patterns already used in the Database class (using `tinydb.Query`).

---

## 6. E — Data Flow

### 6.1 Step-by-Step Flow

```
Step 1: ADMIN UI
  Admin clicks Eye button on user row (user_id = "abc-123")

Step 2: FRONTEND → API CALL
  apiFetch('/admin/users/abc-123/detail')
  - Method: GET
  - Authorization: Bearer <admin_jwt_token>
  - No request body

Step 3: BACKEND RECEIVES REQUEST
  FastAPI router: GET /admin/users/{user_id}/detail
  - Dependency injection: get_current_admin validates JWT, confirms admin role
  - Extracts user_id from path

Step 4: BACKEND → PRISMA (User Info)
  prisma.user.find_unique(where={"id": "abc-123"}, include={"role": True})
  Returns: User record with role relation
  If not found: return 404

Step 5: BACKEND → TINYDB (Resume Activity)
  db.count_resumes_for_user("abc-123") → total_resumes
  db.count_tailored_resumes_for_user("abc-123") → total_tailored
  db.count_master_resumes_for_user("abc-123") → total_master
  db.get_resume_dates_for_user("abc-123") → list of created_at dates

Step 6: BACKEND AGGREGATION
  - Group resume dates by calendar day
  - Build 30-day timeline array with date + count
  - Fill zero-activity days

Step 7: BACKEND → FRONTEND (Response)
  Return UserDetailResponse JSON:
  {
    "id": "abc-123",
    "email": "user@example.com",
    "username": "john_doe",
    "role_name": "user",
    "is_active": true,
    "is_verified": true,
    "created_at": "2024-01-15T10:30:00Z",
    "last_login": "2024-03-05T14:30:00Z",
    "total_resumes": 12,
    "total_tailored_resumes": 8,
    "total_master_resumes": 4,
    "activity_timeline": [
      {"date": "2024-02-04", "actions": 0},
      {"date": "2024-02-05", "actions": 2},
      ...
      {"date": "2024-03-05", "actions": 1}
    ]
  }

Step 8: FRONTEND STATE UPDATE
  selectedUserDetail = response data
  showUserDetailModal = true

Step 9: MODAL RENDER
  Dialog component renders with:
  - Section A: Populate info grid from selectedUserDetail
  - Section B: Pass activity_timeline to Recharts LineChart
  - Stats cards: Show total_resumes, total_tailored_resumes, total_master_resumes

Step 10: CHART RENDERING
  Recharts <LineChart> renders:
  - data = activity_timeline
  - XAxis dataKey="date" with formatted tick labels
  - YAxis with integer ticks
  - Line stroke="#1D4ED8" (Hyper Blue)
  - Tooltip with date + action count
```

### 6.2 Data Flow Diagram (ASCII)

```
┌──────────────┐     GET /admin/users/:id/detail     ┌──────────────┐
│              │ ──────────────────────────────────→   │              │
│   Admin UI   │                                      │   FastAPI    │
│  (Next.js)   │   ←──────────────────────────────    │   Backend    │
│              │     UserDetailResponse (JSON)        │              │
└──────────────┘                                      └──────┬───────┘
       │                                                     │
       │                                              ┌──────┴───────┐
       ▼                                              │              │
┌──────────────┐                               ┌──────┴────┐  ┌──────┴────┐
│  Recharts    │                               │  Prisma   │  │  TinyDB   │
│  LineChart   │                               │  (SQLite) │  │  (JSON)   │
│              │                               │           │  │           │
│  Renders     │                               │ User info │  │ Resumes   │
│  activity    │                               │ Role      │  │ Dates     │
│  timeline    │                               │ Last login│  │ Counts    │
└──────────────┘                               └───────────┘  └───────────┘
```

---

## 7. F — Chart Behavior

### 7.1 Chart Library

**Recharts** (`recharts`) — a React-native charting library built on D3.

**Why Recharts:**
- Declarative React components — fits the project's component model  
- Lightweight (~150KB gzipped) compared to full D3  
- No jQuery or DOM manipulation required  
- Well-maintained, widely adopted  
- Easy to style to match Swiss International Style (custom colors, fonts)  
- The project has no existing chart library, so this is a new dependency  

**Installation**: `npm install recharts` (in `apps/frontend/`)

### 7.2 Chart Type

**`<LineChart>`** — single line showing total actions per day over the last 30 days.

### 7.3 Data Point Structure

Each data point passed to the chart:

```
{
  date: "2024-02-15",    // YYYY-MM-DD string
  actions: 3             // integer, number of resume-related actions
}
```

Array length: always 30 items (30 most recent days, gaps filled with `actions: 0`).

### 7.4 X-Axis Configuration

- `dataKey="date"`  
- Tick formatter: Display as `MM/DD` (e.g., `02/15`) to save horizontal space  
- Show every 5th tick label to prevent overlap (set `interval` prop or use `tickCount`)  
- Tick font: `font-mono`, `text-xs`, black  
- Axis line: `stroke="#000000"`, `strokeWidth={1}`  
- Numeric values visible: Date labels on ticks as described  

### 7.5 Y-Axis Configuration

- `dataKey="actions"`  
- Integer-only ticks (no decimals): `allowDecimals={false}`  
- Minimum domain: `[0, 'auto']` — Y starts at 0, auto-scales max  
- If max value is 0 (no activity), set domain to `[0, 5]` to avoid a flat axis  
- Tick font: `font-mono`, `text-xs`, black  
- Axis line: `stroke="#000000"`, `strokeWidth={1}`  
- Width: `40px` (enough for 2-3 digit numbers)  
- Numeric values visible: Integer action counts on ticks

### 7.6 Line Styling

- Stroke color: `#1D4ED8` (Hyper Blue — primary brand color)  
- Stroke width: `2px`  
- Dot: `fill="#1D4ED8"`, `r={3}` (small dots on data points)  
- Active dot (on hover): `r={5}`, `fill="#1D4ED8"`, `stroke="#000000"`, `strokeWidth={1}`  
- Line type: `monotone` (smooth curve, not jagged)  

### 7.7 Tooltip Behavior

- Custom tooltip styled to match Swiss design:
  - Background: `bg-white`  
  - Border: `border border-black`  
  - Shadow: `shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]`  
  - No rounded corners (`rounded-none`)  
  - Content: `font-mono text-xs`  
  - Format: `"Feb 15: 3 actions"` (full month abbreviation + day + count)  

- Triggered by: hover/touch on data point or along the chart X position  
- Cursor line: vertical dashed line at hover position, `stroke="#000000"`, `strokeDasharray="3 3"`  

### 7.8 Grid Lines

- Horizontal grid lines only (for Y-axis reference values)  
- `stroke="#E5E5E0"` (Panel Grey — subtle)  
- `strokeDasharray="3 3"` (dashed, not solid)  
- No vertical grid lines (keep clean)  

### 7.9 Chart Container

- Wrapped in `<ResponsiveContainer width="100%" height={240}>`  
- Parent div: `border border-black bg-white p-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]`  
- Chart title inside container: `font-mono text-xs font-bold uppercase tracking-wider mb-3` — "Activity — Last 30 Days"  

### 7.10 Empty State

If all 30 data points have `actions: 0`:
- Still render the chart with the flat line at Y=0  
- Overlay a centered text: `font-mono text-sm text-gray-400 uppercase` — "No activity in the last 30 days"  
- Chart remains visible (not hidden) to maintain layout consistency  

---

## 8. G — UI States

### 8.1 State Definitions

| State | Trigger | Visual |
|-------|---------|--------|
| **Idle** | Default table state | Eye button visible with blue icon, no loading |
| **Loading** | Eye button clicked, API call in progress | Eye icon replaced with `<Loader2 className="w-4 h-4 animate-spin" />` on that specific row. Modal not yet open. |
| **Modal Open — Data Loaded** | API returned successfully | Modal visible with all sections populated. Chart rendered. |
| **Modal Open — Empty Activity** | API returned but `activity_timeline` is all zeros and `total_resumes == 0` | Section A shows user info normally. Section B shows stats (all "0") and chart with empty state overlay text. |
| **Modal Open — Partial Data** | API returned but some fields are null (e.g., `last_login` is null) | Null fields display "—" (em dash) as placeholder text (font-mono text-gray-400). Chart renders with whatever data is available. |
| **Error — Fetch Failed** | API call threw error or returned non-200 | Modal does NOT open. Feedback banner (existing `feedback` state) shows error message. Eye button returns to idle state. |
| **Modal Closed** | Admin dismisses modal | Modal hidden. State reset: `showUserDetailModal = false`. Eye buttons all return to idle. |

### 8.2 State Variables (New Frontend State)

| Variable | Type | Default | Purpose |
|----------|------|---------|---------|
| `showUserDetailModal` | `boolean` | `false` | Controls modal visibility |
| `selectedUserDetail` | `UserDetailData \| null` | `null` | Holds the fetched detail response |
| `detailLoadingUserId` | `string \| null` | `null` | Tracks which user's detail is being loaded (for per-row spinner) |

### 8.3 Loading Skeleton (Optional Enhancement)

For a polished UX, the modal could open immediately showing a skeleton/loading state inside:
- Section A: Gray placeholder blocks where text would be
- Section B: Gray rectangle where chart would be

**However**, given the existing admin page pattern (maintenance modal only opens after data is ready, feedback banner for errors), the simpler approach is: **don't open the modal until data arrives, show a spinner on the button instead**. This is consistent with the existing UX.

---

## 9. H — Edge Cases

### 9.1 User Has No Activity

- `total_resumes: 0`, `total_tailored_resumes: 0`, `total_master_resumes: 0`  
- `activity_timeline`: 30 data points all with `actions: 0`  
- **Handling**: Stats cards show "0". Chart renders with flat line at Y=0 and "No activity in the last 30 days" overlay.

### 9.2 Backend Returns Partial Activity

- Some days in the 30-day window have data, others don't  
- **Handling**: Backend always returns exactly 30 data points (gap-filled with 0). Frontend renders normally — the line dips to 0 on inactive days.

### 9.3 Network Failure

- Fetch call fails entirely (network timeout, DNS failure, CORS error)  
- **Handling**: Catch block sets `feedback` state with error message. Modal stays closed. Admin can retry.

### 9.4 Backend Returns 404 (User Not Found)

- User was deleted between table load and detail click  
- **Handling**: Backend returns `404 "User not found"`. Frontend shows error in feedback banner. Suggestion: reload the user list (`await loadData()`) to sync the table.

### 9.5 Backend Returns 403 (Permission Denied)

- Shouldn't happen since the entire page requires admin access, but could occur if JWT expired between page load and click  
- **Handling**: Frontend shows error. If 401/403, trigger logout flow (existing `logout()` function).

### 9.6 Very Large Activity History

- User has been active for years with hundreds of resumes  
- **Handling**: Backend only aggregates the last 30 days. TinyDB query scans all resumes but date filtering happens in Python. For users with <1000 resumes per user (expected scale), this is fast (<50ms).

### 9.7 User Clicks Eye Icon Rapidly

- Multiple clicks before the first request completes  
- **Handling**: `detailLoadingUserId` check — if already loading for this user, ignore subsequent clicks. The button is effectively debounced by the loading state.

### 9.8 Admin Views Their Own Account

- Admin clicks eye icon on their own row  
- **Handling**: Fully allowed. No restrictions. Shows the same detail modal.

### 9.9 User Account Deleted While Modal Is Open

- Another admin deletes the user while current admin has the detail modal open  
- **Handling**: No real-time sync needed. The data is already loaded. When modal closes, the table will reflect stale data until next `loadData()` call. Acceptable behavior for an admin panel.

### 9.10 TinyDB User ID Mismatch

- Prisma stores user IDs as UUIDs. TinyDB resume records store `user_id` as a string.  
- **Handling**: Both use the same UUID string. No type conversion needed. Already consistent in existing code.

---

## 10. I — Performance Considerations

### 10.1 Database Query Performance

**Prisma (User lookup):**
- Single `findUnique` by primary key — O(1) via index. Negligible.

**TinyDB (Resume aggregation):**
- TinyDB is a JSON file database. It performs full table scans.  
- For the expected scale (10s–100s of resumes per user, <10K total resumes), scan time is <100ms.  
- **Optimization**: Filter by `user_id` first (reduces scan set), then aggregate dates in Python.  
- **Not recommended yet**: Adding a secondary index or moving to SQLite for resumes. Premature for current scale.

### 10.2 Backend Response Time

- Expected: <200ms for the entire endpoint  
- Target: <500ms worst case  
- No LLM calls, no external APIs, no file I/O beyond TinyDB read  

### 10.3 Chart Rendering Performance

- Recharts `<LineChart>` with 30 data points renders in <16ms (single frame)  
- `<ResponsiveContainer>` handles resize events via ResizeObserver — debounced internally  
- No performance concern for this data set size  

### 10.4 Bundle Size Impact

- Recharts adds ~45KB gzipped to the client bundle  
- Mitigate with **dynamic import**: `const { LineChart, ... } = await import('recharts')` or Next.js dynamic import with `ssr: false`  
- Since this chart is only used in the admin panel (low-traffic page), the bundle impact is acceptable  
- Alternatively, use `next/dynamic` to lazy-load the entire UserDetailModal component  

### 10.5 No Client-Side Caching

- Each eye icon click fetches fresh data  
- Acceptable for admin panel usage patterns (low frequency, data freshness matters)  
- If future profiling shows redundant calls, add a 60-second `staleTime` cache  

### 10.6 Pagination Does Not Affect Performance

- The table already paginates users (10 per page)  
- Eye icon only exists for visible rows — no issue with rendering 100s of buttons  

---

## 11. J — Security Considerations

### 11.1 Authentication Guard

- The new endpoint `GET /admin/users/{user_id}/detail` uses `Depends(get_current_admin)` — identical to all existing admin endpoints  
- This validates:
  1. JWT token is present and valid  
  2. Token is not expired  
  3. User exists and is active  
  4. User has the "admin" role  

### 11.2 Authorization Scope

- Any admin can view any user's details (including other admins)  
- This is consistent with existing admin capabilities (admins can already toggle, delete, and change roles for any user)  
- No row-level permission needed  

### 11.3 Data Exposure

- The endpoint exposes: user ID, email, username, role, status, dates, resume counts, and daily action counts  
- It does NOT expose:
  - Password hashes  
  - JWT tokens  
  - API keys (LLM configs)  
  - Resume content  
  - Resume processed data  
- This is appropriate for an admin context  

### 11.4 Path Traversal / Injection

- `user_id` is a UUID string. Prisma's `findUnique(where={"id": user_id})` is parameterized — no SQL injection risk.  
- TinyDB queries use Python equality checks — no injection vector.  

### 11.5 Rate Limiting

- No specific rate limiting on the admin endpoint. The admin role is trusted.  
- The existing server-level rate limiting (if any) applies globally.  

### 11.6 Audit Logging

- Add an `logger.info("Admin %s viewed details for user %s", admin.email, user_id)` log line in the endpoint  
- Consistent with existing admin action logging (e.g., `"Admin %s created user %s"`)  

### 11.7 Frontend Token Handling

- The `apiFetch` utility (from `lib/api/client.ts`) automatically attaches the JWT `Authorization: Bearer` header  
- No additional token handling needed in the frontend  
- If the token is expired, the backend returns 401, and the frontend should redirect to login (existing behavior)  

---

## Appendix: Implementation Checklist

### Backend Changes

1. [ ] **Prisma schema**: Add `lastLoginAt DateTime?` to `User` model  
2. [ ] **Prisma migration**: Run `prisma migrate dev` to create migration  
3. [ ] **Auth router** (`routers/auth.py`): Update login endpoint to set `lastLoginAt = now()` after successful auth  
4. [ ] **Database class** (`database.py`): Add 4 new query methods for resume counts and date retrieval  
5. [ ] **Admin router** (`routers/admin.py`):  
   - Add `UserDetailResponse` and `ActivityDataPoint` Pydantic schemas  
   - Add `GET /admin/users/{user_id}/detail` endpoint  
   - Implement 30-day timeline aggregation logic  
6. [ ] **Tests**: Add test case for the new admin endpoint  

### Frontend Changes

7. [ ] **Install recharts**: `npm install recharts` in `apps/frontend/`  
8. [ ] **Admin page** (`app/(default)/admin/page.tsx`):  
   - Import `Eye` from lucide-react  
   - Add state variables: `showUserDetailModal`, `selectedUserDetail`, `detailLoadingUserId`  
   - Add `handleViewUser(userId)` async function  
   - Add Eye button to each table row in Actions column  
9. [ ] **UserDetailModal component** (new file: `components/admin/user-detail-modal.tsx`):  
   - Use `Dialog` component from `components/ui/dialog.tsx`  
   - Section A: Info grid  
   - Section B: Stats cards + Recharts LineChart  
   - Custom tooltip component for chart  
   - Empty state handling  
10. [ ] **Type definition** (new or in admin page): `UserDetailData` TypeScript type matching backend response  
11. [ ] **Lint & format**: `npm run lint` and `npm run format`  

### Files Modified

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `lastLoginAt` field |
| `apps/backend/app/routers/auth.py` | Update login to set `lastLoginAt` |
| `apps/backend/app/database.py` | Add 4 resume query methods |
| `apps/backend/app/routers/admin.py` | Add detail endpoint + schemas |
| `apps/frontend/package.json` | Add `recharts` dependency |
| `apps/frontend/app/(default)/admin/page.tsx` | Add eye button + state + handler |
| `apps/frontend/components/admin/user-detail-modal.tsx` | **New file** — modal component |

### Files Not Modified

- No changes to `components/ui/dialog.tsx` (reused as-is)  
- No changes to `components/ui/button.tsx` (reused as-is)  
- No changes to API client (`lib/api/client.ts`)  
- No changes to CI/CD or Docker configuration  
