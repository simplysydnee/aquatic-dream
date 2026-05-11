# Fix: closed/deleted classes still showing as open

## Root cause

The public **Swim Lessons** schedule (`src/pages/SwimLessons.tsx` → `ScheduleSection`) queries `swim_sessions` filtered only on `is_active = true`. It does **not** filter on `registration_status`, so any class an admin "Closes" in Sessions Admin (which sets `registration_status = 'closed'`) still renders as a colored, available slot with "spots left".

Verified for contrast:
- `src/components/swim-enrollment/SessionPicker.tsx` (the actual enrollment step) already filters `is_active = true` AND `registration_status = 'open'`, so the enrollment form is mostly correct — but it doesn't hide periods whose `end_date` is in the past.
- `SessionsAdmin` toggle writes `registration_status` open/closed and never deletes `swim_sessions` rows; "delete" only removes empty `session_periods`. So closed classes remain in the DB and leak through any query that doesn't filter status.

Also: a session whose `session_period_id` points to an inactive or already-ended period can still appear if the query joins on `is_active` only.

## Fix

### 1. `src/pages/SwimLessons.tsx` — ScheduleSection
- Add `.eq("registration_status", "open")` to the `swim_sessions` query.
- Filter `session_periods` to only those with `end_date >= today` (hide finished sessions on the marketing page).
- After loading, drop any time-slot row where every class is full/closed so the row collapses cleanly.
- If a period ends up with zero visible classes after filtering, skip rendering that period card.

### 2. `src/components/swim-enrollment/SessionPicker.tsx`
- Add an `end_date >= today` filter on `session_periods` so the enrollment picker can't offer a past session.
- Keep existing `is_active` + `registration_status = 'open'` filters.

### 3. `src/hooks/useAvailableSlots.ts` (private-lesson booking)
- No change to swim-class logic; this hook is for private-lesson instructor availability and is unrelated. Leave as-is.

### 4. Admin clarity (small UX, no behavior change to data)
- In `SessionsAdmin`, when a class is `closed`, keep showing it in the admin list (already does) but no DB change needed. Confirms admins can still re-open.

## Verification

After changes, on a 390px viewport:
1. In Sessions Admin, close a class slot → reload `/swim-lessons` and confirm it no longer appears.
2. Start the enrollment flow for that level/age → confirm the closed slot is not offered.
3. Set a `session_period` `end_date` to yesterday → confirm it disappears from both `/swim-lessons` and the enrollment SessionPicker.
4. Re-open the class → confirm it reappears in both places.

## Files to edit

- `src/pages/SwimLessons.tsx`
- `src/components/swim-enrollment/SessionPicker.tsx`
