## Goals
Fix the four issues reported on the check-in kiosk (`/checkin` and `/admin/checkin`):
1. False "waiver missing" — must accept ANY waiver type for that swimmer.
2. Dropped / non-active enrollments appearing.
3. Duplicate enrollment rows in the same session.
4. Missing private lessons + wrong sort order.

## Changes

### 1. Universal waiver lookup (new RPC)
Add a SECURITY DEFINER function `public.enrollments_waiver_status(_ids uuid[])` returning `(enrollment_id uuid, has_waiver bool)`. For each enrollment id it returns TRUE if ANY of these exist for that child:
- `swim_enrollments.waiver_signed_at` is not null, OR
- a row in `enrollment_agreements` for that enrollment with `signed_at` not null, OR
- a `lesson_bookings` row with same `child_first_name`+`child_last_name`+`child_dob` and `waiver_signed_at` not null, OR
- a `visitor_waivers` row signed in the last 12 months whose `swimmers` jsonb contains a matching first/last/dob (reuse logic from existing `swimmer_has_waiver_on_file`).

Both kiosk pages call this RPC instead of the current half-check.

For private lesson rows in the kiosk, waiver status comes from `lesson_bookings.waiver_signed_at` OR the same visitor-waiver lookup against the booking's child name/dob.

### 2. Filter sessions to today's active window
In both `KioskCheckIn.tsx` and `CheckInAdmin.tsx`, add to the `swim_sessions` query:
```
.lte("session_start_date", today).gte("session_end_date", today)
```
This drops past / future session-period rows that share the same `day_of_week`.

### 3. Tighten enrollment status filter + dedupe
- Change `.in("status", ["pending","confirmed","enrolled"])` to `.in("status", ["confirmed","enrolled"])` on both pages. (Per DB: only `confirmed` and `cancelled` exist today; `pending` shouldn't be checked in anyway.)
- After grouping, dedupe by `enrollment.id` within each session, and also dedupe by `(session_id, lower(child_name))` so accidental duplicate rows from imports don't double-list a child.

### 4. Add private lessons to the kiosk
Fetch today's `lesson_booking_occurrences` joined to `lesson_bookings` where:
- `occurrence_date = today`
- `status NOT IN ('cancelled','pending_card')`
- booking `status = 'active'`

Render each as its own card with:
- Time (start_time)
- Badge: "Private" or "Semi-private"
- Instructor name
- Child name + parent name
- Waiver-missing badge using the universal check (matched on the booking's child name/dob)

Check-in writes to `attendance` using `enrollment_id = occurrence.id` are NOT correct (different table). Instead use a separate local-only "checked-in" toggle stored in a new column `lesson_booking_occurrences.checked_in_at timestamptz` (added via migration, nullable, default null) updated directly. No new attendance row needed.

### 5. Sort order
Within both pages, sort cards by:
1. `session.start_time` ascending
2. then `instructor_name` (join `instructors` for group sessions; lesson_bookings already has `instructor_name`)
3. then swim_level / lesson_type

For group sessions, extend the `swim_sessions` select to include `instructors(name)` so we have the instructor for sorting + display.

### 6. UI tweaks
- Show instructor name on each session card header (group + private).
- "Waiver missing" badge wording unchanged; tooltip clarifies it checks all waiver types.
- Keep existing search box; extend it to also match private-lesson child/parent names.

## Technical notes
- New migration: `enrollments_waiver_status` RPC + add `checked_in_at` (+ optional `checked_in_by`) to `lesson_booking_occurrences` with GRANTs to `authenticated` and `service_role`.
- Reuse `LEVEL_DISPLAY` for group level badges; new lightweight badge for private/semi-private.
- No edge-function changes.
- `KioskCheckIn.tsx` and `CheckInAdmin.tsx` get the same data-loading helper extracted to `src/hooks/useTodayCheckInData.ts` to keep them in sync.

## Out of scope
- Real attendance history for private lessons (we're only tracking same-day checked_in_at).
- Changing how waivers are signed.
