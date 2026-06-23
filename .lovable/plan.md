## Goal
Extend the daily print schedule to include private and semi-private lesson occurrences for the selected day, formatted identically to the existing group schedule.

## Scope
- File: `src/pages/admin/PrintDaySchedule.tsx` (only)
- No DB, RLS, edge function, or other UI changes
- The "Print Schedule" dialog already passes `date` and `instructor`; no dialog changes needed

## What to add
1. Fetch private/semi-private occurrences for the selected date:
   - `lesson_booking_occurrences` joined to `lesson_bookings` where `occurrence_date = date`, `status != 'cancelled'`
   - Honor instructor filter using occurrence `instructor_override_id` if present, else `lesson_bookings.instructor_id`
   - Honor time overrides (`start_time_override`/`end_time_override`) when present
2. Merge each occurrence into the existing per-instructor grouping (so an instructor's page shows their group classes plus their private/semi-private lessons in one chronological table).
3. Render each private/semi-private as a row in the same `table.sched`:
   - Time: occurrence start/end, with a capacity pill showing `1/1` (private) or `n/2` (semi-private)
   - Class: "Private lesson" or "Semi-private lesson" + pool area as the sub line; no age-group line
   - Swimmer: `child_name (age)`
   - Parent: first name + phone
   - Emergency: dash (not collected for private bookings) — render as "—"
   - Notes: `lesson_bookings.notes` (shown in red only if it looks medical? keep neutral — display as plain notes)
   - Left border stripe color: distinct tokens already used elsewhere — `#26215C` for private, `#4B1528` for semi-private (matches calendar legend)
4. Sort each instructor's combined rows by start time. Update the header subtitle counts ("X classes · Y swimmers") to include private/semi-private occurrences and their swimmers.
5. Instructors who only have private/semi-private lessons (no group classes) should now also get a printed page — they're currently filtered out.

## Out of scope
- No new "lesson type" column; type is shown in the Class cell to keep column layout identical to group prints
- No changes to PrintDayScheduleDialog (instructor list already includes all active instructors)
- No changes to group-lesson rendering logic
