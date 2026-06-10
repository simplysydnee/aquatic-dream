
## Goal

When rescheduling a private lesson:
1. Make the **current occurrence date being moved** visible at the top of the dialog (right now it's buried in a dropdown).
2. Replace the "open slot" source: instead of deriving slots from published `shifts`, derive them from the **instructor private-lesson booking blocks** (`instructor_booking_blocks`) we've already created — only showing windows inside those blocks that aren't already booked.
3. Give the admin an inline escape hatch: if no existing block fits, let them **create a new one-off block or a recurring weekly block** without leaving the dialog, then immediately pick a slot inside the newly-created block.

## UX

`ReschedulePrivateLessonDialog.tsx`

- Add a header summary row showing the occurrence being moved:
  ```
  Currently: Sat, Jun 13 · 10:00–10:30 AM · Coach Jane
  ```
  Rendered above the mode radio group. For "remaining" mode, also show how many lessons will move.

- Slot picker section is restructured into two tabs / segments:
  1. **From existing open blocks** (default). Lists every 15-min start inside an `instructor_booking_blocks` row that
     - matches the chosen date (weekly day-of-week or date_range covering the date),
     - isn't a blackout / break window,
     - has no other booking occurrence overlapping it,
     - has no conflicting `pool_events` in the same pool area.
     Each row: `10:00–10:30 AM · Coach Jane · "Sat AM block"`.
  2. **Create a new block**. Inline mini-form:
     - Instructor (dropdown of active instructors)
     - Kind: One-off (date) | Weekly recurring (day-of-week + start/end date)
     - Time window (start/end, defaults to the lesson length window around the lesson's existing time)
     - Pool area
     On submit: insert into `instructor_booking_blocks`, then immediately offer that as the chosen slot for the reschedule and continue.

- "Change instructor only" mode keeps its current behavior but its instructor list is rebuilt from blocks that cover the existing occurrence window (instead of shifts).

## Data layer

- Add a new hook `useAvailableBlockSlots(date, { lengthMin, stepMin, poolArea })` that:
  - Calls `get_public_booking_blocks` RPC (already exists) to get all non-blackout blocks.
  - Filters blocks active for the given date (weekly vs date_range, dow, start/end dates).
  - Walks each block's `[start_time, end_time]` window in `stepMin` increments, skipping the break window (`break_start_time`/`break_end_time`), removing candidates that overlap an existing `lesson_booking_occurrences` row for that instructor/date, and removing candidates that conflict with `pool_events` in the same area.
  - Returns the same `AvailableSlot[]` shape the existing UI uses, plus `hasAnyBlock` (for the empty state copy: "No private-lesson blocks created for that day — create one below.").

- Keep `useAvailableSlots` (shifts-based) untouched for other callers.

- "Create new block" calls `supabase.from("instructor_booking_blocks").insert(...)` directly (admin RLS already allows it on this table); on success, refetch the hook and auto-select the matching slot.

## Edge function

No change to `reschedule-private-lesson-occurrence` — payload shape is unchanged. We're only changing where the candidate slot came from.

## Files

- `src/hooks/useAvailableBlockSlots.ts` (new)
- `src/components/admin/booking/ReschedulePrivateLessonDialog.tsx` (header summary, swap slot source, add "Create new block" inline form)

No DB migration needed.
