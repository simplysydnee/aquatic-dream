## Problem

Two concurrent **Little Fins (3:15 PM Mon/Wed)** swim sessions exist in `swim_sessions`. They share `session_name = "Little Fins"`, so they collapse into a single column in `CalendarDayView`. Inside that column, both class blocks are rendered with `absolute left-1 right-1` at the same `top`, so the second one renders directly on top of the first — only one is visible.

This affects **any case where two AD swim classes of the same level overlap in time**, not just Little Fins.

(DB note: today both 3:15 Little Fins rows are assigned to the same instructor. If they're supposed to have different instructors, that's a separate data fix — but even with the same instructor we still need to show both blocks.)

## Fix

In `src/components/admin/calendar/CalendarDayView.tsx`, inside the AD swim-session rendering branch (around lines 846–955):

1. **Compute lanes per column.** For each AD column, take the filtered list of today's sessions and run a simple sweep-line lane assignment:
   - Sort by `start_time`.
   - Track active lanes (each lane stores its current `endMins`).
   - For each session, place it in the first lane whose `endMins <= startMins`, else open a new lane.
   - Record `lane` and `laneCount` for that overlap group on each session.
2. **Render side-by-side.** Replace `className="absolute left-1 right-1 ..."` with inline `left` / `width` computed from `lane` and `laneCount`:
   - `width = (100% - 8px) / laneCount` (keep ~4px outer padding)
   - `left = 4px + lane * width`
   - Small inner gap (e.g. 2px) between lanes
3. Keep all existing block content. If `laneCount > 1`, truncate the swimmer-name list more aggressively (it already adapts to height/width via `truncate`, so this is mostly automatic — just verify the "x/3" badge and level name stay visible at half width by allowing the badge to shrink with `text-[9px]` when `laneCount > 1`).
4. Tooltip already shows instructor name and roster, so the user can distinguish the two blocks on hover.

No DB changes. No changes to other columns (ICS, dive, pool events).

## Files

- `src/components/admin/calendar/CalendarDayView.tsx` — add a `laneFor(session)` helper memoized per column, swap the inline style for the AD swim block.

## Out of scope

- Reassigning the second 3:15 Little Fins to a different instructor in the database (data entry, not a bug).
- Applying the same lane logic to the week view (`CalendarWeekView.tsx`) — can be a follow-up if needed.
- Pool events overlap handling (already mostly separated by event type).
