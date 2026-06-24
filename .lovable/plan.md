## Goal
Replace the single-instructor dropdown in the Print Daily Schedule dialog with a multi-select that auto-defaults to all instructors scheduled on the chosen date.

## Changes

### 1. `src/components/admin/calendar/PrintDayScheduleDialog.tsx`
- Replace the `Select` (single value `instructorId`) with a multi-select using a `Popover` + `Command` checklist (same pattern as `InstructorPicker.tsx`), showing each instructor with a checkbox.
- New state: `selectedIds: Set<string>` (instructor IDs).
- When the dialog opens or the date changes, query who is scheduled that day and pre-check them:
  - Group sessions: `swim_sessions` where `is_active=true`, `day_of_week` matches the selected date's day name, AND there is a non-cancelled `session_lesson_dates` row for that date → take `instructor_id`.
  - Private/semi-private: `lesson_booking_occurrences` for that `occurrence_date` not cancelled, joined to `lesson_bookings` → take `instructor_override_id || instructor_id`.
  - Union those IDs, intersect with the active instructor list, and set as the default selection.
- Trigger label shows "All scheduled (N)", "X instructors", or the single name.
- Add "Select all" / "Clear" / "Reset to scheduled" quick actions at the top of the popover.
- Submit: if all active instructors are selected, pass `instructor=all`; otherwise pass `instructor=<id1>,<id2>,...` (comma-separated) in the URL. Disable the Open Print View button when zero are selected.

### 2. `src/pages/admin/PrintDaySchedule.tsx`
- Parse the `instructor` query param: `"all"` keeps current behavior; otherwise split on `,` into a `Set<string>` of allowed instructor IDs.
- Update the two filters that currently compare `s.instructor_id === instructorId` / `p.instructor_id === instructorId` to instead check `allowedIds.has(id)` when not in "all" mode.
- No layout / styling changes. Per-instructor page break behavior is unchanged.

## Out of scope
- No DB, RLS, edge function, or print layout changes.
- No change to how the calendar page launches the dialog.
