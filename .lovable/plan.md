## Goal

Bring booked private lessons back into the panel below the calendar (alongside Open Private Slots), and make it one click to change a swimmer's time or instructor — both from the panel and from the calendar grid.

## Current state

- Calendar grid: private lessons render as cards (good).
- Below grid (`PrivateLessonsPanel`): only "Open slots" listed; booked lessons only show as a counter badge.
- Reschedule UI: a full `ReschedulePrivateLessonDialog` already exists with date/time/instructor change + slot picker. It is wired in `PrivateLessonsAdmin` but NOT reachable from `/admin` calendar at all.

## Changes

### 1. PrivateLessonsPanel — show Booked + Open side by side
File: `src/components/admin/calendar/PrivateLessonsPanel.tsx`

- Add a "Booked Lessons" section above "Open Slots":
  - One row per `todays[i]`, sorted by time.
  - Row content: time, child name, instructor, payment badge.
  - Row click → opens existing `PrivateLessonDetailDialog`.
  - Row "Reschedule" button → opens `ReschedulePrivateLessonDialog` for that occurrence (one-date mode).
  - Inline instructor swap shortcut: a small instructor dropdown on each row that, on change, writes `instructor_override_id` / `instructor_override_name` to `lesson_booking_occurrences` for that occurrence only and refetches. (Fast path; full reschedule dialog still available for time changes.)
- Keep current "Open Slots" UI unchanged.
- Update header badges to reflect both counts.

### 2. Reschedule entry point from the calendar grid
File: `src/components/admin/calendar/PrivateLessonDetailDialog.tsx`

- Add a "Reschedule" button in the footer.
- On click, mount `ReschedulePrivateLessonDialog` with a `BookingLite` synthesized from `PrivateLessonBooking` (`booking_id`, `instructor_id`, `instructor_name`, base `start_time`/`end_time` from the booking row, single-occurrence array containing the current occurrence + its overrides).
- We need the base booking times (not the overridden display times). Fetch `lesson_bookings` (`start_time`, `end_time`) and `lesson_booking_occurrences` (the overrides) on demand when Reschedule is clicked, then open the dialog. Closes both on success and calls `onChanged()`.

### 3. Pass instructors list to the panel for inline swap
File: `src/pages/admin/CalendarAdmin.tsx`

- Pass `instructors` (already fetched via `useCalendarData`) into `PrivateLessonsPanel` so the inline instructor dropdown can render without a new query.

## Behavior summary

| Need | Where | UI |
|------|-------|-----|
| See booked lessons listed | Panel below grid | New "Booked" list |
| See open slots | Panel below grid | Existing list |
| Quick instructor swap | Panel row | Inline dropdown (writes occurrence override) |
| Full reschedule (date + time + instructor) | Panel row "Reschedule" button OR grid card → detail → "Reschedule" | `ReschedulePrivateLessonDialog` (one-date mode) |
| See booked on the grid | Calendar grid | Existing cards (already render with overrides after prior fix) |

## Out of scope

- Permanent series-wide moves (existing dialog already supports "remaining" mode — surfaced only inside the reschedule dialog tab, not as a top-level shortcut).
- Group-class moves (handled by `enrollment_date_moves`).
- Schema changes (the override columns we need already exist).

## Files touched

- `src/components/admin/calendar/PrivateLessonsPanel.tsx` — add Booked list + inline instructor swap + Reschedule button
- `src/components/admin/calendar/PrivateLessonDetailDialog.tsx` — add Reschedule button + fetch booking on demand
- `src/pages/admin/CalendarAdmin.tsx` — pass `instructors` prop to the panel
