## Goal
Add a way to **close** (hide from public signup) and **delete** an underperforming group class directly from the Swim Enrollments admin page, so parents can no longer book it.

## Where it goes
On `/admin/enrollments` → **Sessions** tab, each session card in `SessionEnrollmentCards.tsx` gets a small actions menu (kebab `⋯` in the card header) with two actions:

1. **Close registration** (toggle: "Close" / "Reopen")
   - Sets `swim_sessions.registration_status` to `closed` / `open`.
   - Public `SessionPicker` already filters on `registration_status = 'open'`, so closed classes immediately disappear from the parent signup flow.
   - Existing enrollments remain intact; card shows a "Closed" badge.

2. **Delete class** (destructive, with confirm dialog)
   - Hard-deletes the `swim_sessions` row + its `session_lesson_dates`.
   - **Guardrail:** If the session has any non-cancelled enrollments, the delete button is disabled and the confirm dialog instead instructs the admin to cancel/move enrollments first (we will not silently drop paying customers). Tooltip: "Cancel or move enrolled swimmers before deleting."
   - If zero enrollments → confirm modal "Delete this class? This cannot be undone." → deletes and refreshes.

## UI details
- Card header gets a `DropdownMenu` trigger (`MoreVertical` icon) next to the level badge.
- Menu items: `Close registration` / `Reopen registration`, and `Delete class` (red, with `AlertDialog` confirmation).
- Closed cards render with reduced opacity + a `Closed` outline badge so admins can see them at a glance.
- Toast on success/failure; refresh data via existing parent fetch (lift a `onChanged` callback from `SessionEnrollmentCards` → `SwimEnrollmentsAdmin.fetchData`).

## Technical notes
- Files touched:
  - `src/components/admin/SessionEnrollmentCards.tsx` — add `registration_status` to `SessionInfo`, render menu + dialogs, accept `onChanged` prop.
  - `src/pages/admin/SwimEnrollmentsAdmin.tsx` — include `registration_status` in the `swim_sessions` select, pass `onChanged={fetchData}`.
- DB ops (client-side, admin-authenticated, allowed by existing RLS `Authenticated users can manage sessions`):
  - Close/reopen: `update swim_sessions set registration_status=...`
  - Delete: `delete from session_lesson_dates where session_id=?` then `delete from swim_sessions where id=?`
- No schema changes, no migration needed.
- No edge function needed.

## Out of scope
- Bulk close/delete across multiple time slots (can be added later if useful).
- Auto-refunding enrollments on delete — deletion is blocked while enrollments exist, so admin must use existing cancel-enrollment-refund flow first.