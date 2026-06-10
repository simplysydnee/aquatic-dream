## The bug

When you reassign a group class for a specific day from Jaclyn to Sutton, the change is saved correctly to the database — but the calendar day view never reads it back, so it keeps showing Jaclyn.

### What the reassign actually does

`performReassign` (in `src/lib/lessonCancel.ts`) writes the new instructor to `session_lesson_dates.instructor_override_id` for just the selected dates. This is the right place — it leaves the rest of the recurring series on the original instructor.

`InstructorDayModal.tsx` already reads this column correctly (line 91: `effectiveInstructorId = d.instructor_override_id || sess.instructor_id`), which is why the reassign *looks* like it worked from that drawer.

### Why the main calendar doesn't update

Two places drop the override on the floor:

1. **`src/hooks/useCalendarData.ts` line 185-188** — selects `session_lesson_dates` but only pulls `id, session_id, lesson_date, is_cancelled`. The `instructor_override_id` and any override `instructor_name` are never fetched.
2. **`src/components/admin/calendar/CalendarDayView.tsx`** — when it renders group-class blocks it uses `swim_sessions.instructors.name` directly (e.g. line 1054, line 455). It never consults the per-date override, so the column placement, the block subtitle ("Coach …"), and the tooltip all show the base instructor.

The "Today's Instructors" column header list at the top of the day view (line 720+) has the same issue: it builds the list from `swim_sessions.instructors.name`, so Sutton won't even get a column for today unless she already teaches another base session that day.

## The fix

1. **Fetch the override.** In `useCalendarData.ts`, expand the `session_lesson_dates` select to include `instructor_override_id`, and join the instructor name:
   ```ts
   .select("id, session_id, lesson_date, is_cancelled, instructor_override_id, instructor_override:instructors!session_lesson_dates_instructor_override_id_fkey(name)")
   ```
   Update the `LessonDate` type accordingly so consumers can read `override_instructor_id` / `override_instructor_name`.

2. **Apply the override in the day view.** In `CalendarDayView.tsx`, build a lookup `Map<sessionId, { id, name }>` from today's `lessonDates` overrides. Then everywhere a group-class block resolves its instructor, prefer the override:
   - The "Today's Instructors" column list (around line 720).
   - The column-filter in the grid render (line 915 — `(s.instructor_name || "Instructor") === col.label` should compare against the *effective* name).
   - The tooltip/subtitle that prints "Coach …" (line 455, 1054).

3. **Refresh trigger.** `ReassignDialog` already calls `onDone?.()` and the existing `onRefetch` chain re-runs `useCalendarData`, so once the select includes the override the UI will update on the next refetch with no other plumbing.

4. **Out of scope (note only).** Reassigning private/semi-private lessons is currently disabled in `InstructorDayModal` (`hasUnreassignable` blocks the button) and `performReassign` has no path for `lesson_booking_occurrences`. If you also tried to reassign a private lesson, that's a separate missing feature — not part of this fix.

## Files to change

- `src/hooks/useCalendarData.ts` — extend the `session_lesson_dates` query + `LessonDate` type.
- `src/components/admin/calendar/CalendarDayView.tsx` — apply the override when computing the instructor for group classes (columns list, column filter, subtitle, tooltip).

No DB migration, no edge-function changes.