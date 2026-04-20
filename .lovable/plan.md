
The "Aquatic Dreams — 64 groups" header is misleading: it counts every recurring class **template** that matches today's day-of-week, even if zero lessons are actually happening, no instructors are assigned, and no swimmers are enrolled. Compare to the ICS header which correctly shows "0 instructors today" when empty.

## Root cause

In `CalendarDayView.tsx` line 384, the count is `todaySessions.length + adEvents.length` where `todaySessions` is filtered only by `day_of_week`. It doesn't check:
- Whether the session period is active on this date
- Whether there's an actual lesson date scheduled (`session_lesson_dates`)
- Whether anyone is enrolled
- Whether any pool events exist

So an empty Monday in April still shows "64 groups" because 64 weekly templates *exist* for Mondays.

## Fix — make the header reflect reality

Replace the single misleading number with **state-aware** content for the AD header. Three states:

**State 1 — Truly empty day** (no active sessions, no events, no enrollments)
> Aquatic Dreams — No groups today
> *(muted text, no column grid rendered for AD — just a "Add a class or event" CTA button)*

**State 2 — Classes scheduled but no enrollments yet**
> Aquatic Dreams — 5 classes scheduled · 0 swimmers
> *(shows the empty grid so admin can still add walk-ins / events)*

**State 3 — Active day**
> Aquatic Dreams — 5 classes · 12 swimmers · 2 events
> *(today's reality: classes with at least one enrollment + walk-ins + private/semi-private events)*

## How "today's classes" gets calculated correctly

Filter `todaySessions` further before counting:
1. Cross-reference `session_lesson_dates` for the selected date — only include classes that have a lesson scheduled today and aren't `is_cancelled`
2. Exclude classes whose `session_period` ends before / starts after today
3. Count enrolled swimmers from `swim_enrollments` where `session_id IN (today's class ids)` and `status='confirmed'`
4. `adEvents.length` stays as-is (those are already date-specific)

`useCalendarData` already loads `swim_sessions` and `pool_events`; add a fetch for `session_lesson_dates` for the visible date range and a count query for enrollments per session_id.

## UI/UX improvements bundled

1. **Three-line header pill** instead of one cramped line:
   - Line 1: "Aquatic Dreams" (bolder)
   - Line 2: counts as chips — `5 classes` · `12 swimmers` · `2 events`
   - Empty state: muted "No groups today" + small "+ Add" button inline

2. **Hide empty AD column entirely** when state 1 (no classes, no events). Today the grid still shows 5 colored level columns even when nothing's happening — that's visual noise. If state 1, collapse AD section so ICS or Dive can take the full width.

3. **Tooltip on the count chips** explaining what they mean (e.g., hover "12 swimmers" → "Confirmed enrollments across today's classes").

4. **Match ICS pattern**: ICS already shows "0 instructors today" gracefully. Apply the same "show 0 / show empty state" pattern to AD.

## Files touched

- `src/components/admin/calendar/CalendarDayView.tsx` — replace header count logic, add state-aware rendering, conditionally collapse empty AD column group
- `src/hooks/useCalendarData.ts` — add fetch for `session_lesson_dates` for the visible week + enrollment counts per session_id
- (No DB migration. No backend changes.)

## Not doing

- ❌ No changes to the underlying class/session schema
- ❌ No changes to ICS or Dive header logic (already correct)
- ❌ No changes to the calendar week view (separate component, separate decision)
