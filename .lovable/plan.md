## Bug

Reet was rescheduled from 10:00 → 10:30 on Sat Jun 13. The database reflects this correctly via the occurrence overrides:

- `lesson_booking_occurrences.start_time_override = 10:30:00`
- `lesson_booking_occurrences.end_time_override   = 11:00:00`

…but the `/admin` calendar and the Private Lessons page still show reet at 10:00 with Grace.

## Root cause

`src/hooks/useCalendarData.ts` selects private lesson occurrences without the override columns and maps `start_time`, `end_time`, and `instructor_name` straight from the parent `lesson_bookings` row. It never applies the per-occurrence overrides, so any rescheduled occurrence renders at its original time/instructor.

```text
lesson_bookings (base)           ──►   uses start_time / end_time / instructor
lesson_booking_occurrences (per-date overrides) ──► IGNORED
```

That hook feeds:
- `CalendarDayView` (synthetic grid events for private lessons)
- `PrivateLessonsPanel` (Open Private Slots calculations)

## Fix

### 1. Fetch override columns
In `useCalendarData.ts`, extend the `lesson_booking_occurrences` select to include:
- `start_time_override`
- `end_time_override`
- `instructor_override_id`
- `instructor_override_name`

### 2. Apply overrides in the mapping
When building each `PrivateLessonBooking`, prefer the occurrence override over the booking base:
- `start_time = (o.start_time_override || b.start_time).slice(0,5)`
- `end_time   = (o.end_time_override   || b.end_time).slice(0,5)`
- `instructor_id   = o.instructor_override_id   || b.instructor_id`
- `instructor_name = o.instructor_override_name || b.instructor_name`

This automatically fixes:
- The calendar grid card (correct row + instructor column)
- Open Private Slots math (the original 10:00 slot reappears as open, 10:30 shows as taken)
- The "Booked Lessons" badges on Private Lessons Admin that depend on the calendar data hook

### 3. Verify Private Lessons Admin slot map
`PrivateLessonsAdmin.tsx` already keys taken slots by `o.start_time_override || base` (line 297), so its slot grid should now also match — confirm reet renders in the 10:30 slot, not 10:00, after the hook fix.

## Files

- `src/hooks/useCalendarData.ts` — select + mapping update (only file required)

## Out of scope

- No schema changes.
- No edits to the reschedule dialog (it already writes overrides correctly).
- Group-class one-time moves (already working via `enrollment_date_moves`) are not affected.

## Validation

1. Reload `/admin` on Sat Jun 13, 2026 — reet should appear in the 10:30 row under Grace, the 10:00 cell empty.
2. `/admin/private-lessons` Schedule tab — 10:00 Grace slot shows as open, 10:30 shows reet.
3. Slots and booking cards for non-rescheduled occurrences remain unchanged.
