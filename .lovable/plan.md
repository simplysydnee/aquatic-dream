## Goal
Let admins add an optional break inside an instructor booking block. When set, slot generation skips the break window and the next slot starts after it ends.

Example: block 1:00–4:00 PM with 30-min slots and a 2:00–2:15 break → slots at 1:00, 1:30, 2:15, 2:45, 3:15, 3:45.

## Changes

### 1. Database
Add two nullable columns to `instructor_booking_blocks`:
- `break_start_time` (time)
- `break_end_time` (time)

Both optional. If both null → no break. Validation trigger to ensure either both set or both null, and that the break falls inside the block window.

### 2. Block creator UI — `src/pages/admin/PrivateLessonsAdmin.tsx`
- Add an optional "Add break" toggle in the block draft form.
- When enabled, show two time inputs (Break start / Break end) with helper text: "Slots will resume after the break ends."
- Persist `break_start_time` / `break_end_time` on insert.
- Show break info on existing block cards (e.g. "Break: 2:00 – 2:15 PM").

### 3. Slot generation — `src/lib/privateBooking.ts`
In `fetchOpenSlots`, when iterating slot start times within a block:
- If a break is set and the slot overlaps `[break_start, break_end)`, advance `t` to `break_end` (snapped to the block's start-time grid) instead of emitting that slot.
- Continue generating slots from the new cursor until `t + slot_minutes > end_time`.

### 4. Available slots hook — `src/hooks/useAvailableSlots.ts`
Same break-skip logic applied to shift-based slot generation so admin manual scheduling also respects breaks (optional — only if blocks/breaks should affect this hook; otherwise scope to private booking flow only).

### Out of scope
- Multiple breaks per block (single optional break only for now).
- Breaks on group `swim_sessions` or `shifts`.

## Technical notes
- Use a Postgres CHECK-equivalent via trigger (not CHECK constraint) so future timezone tweaks don't fail restoration.
- Slot grid after a break does NOT realign to the original step; it restarts exactly at `break_end_time`, then increments by `slot_minutes` (matches your "2:00–2:15 → next at 2:15" example).