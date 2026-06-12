# Fix: closed private-lesson spots still bookable

## Root cause

Admin "Close" actions create rows in `instructor_booking_blocks` with `is_blackout = true` (e.g., Jaclyn has 5 blackout rows for Sat 6/13 from 10:30–13:00). But the entire public booking pipeline silently drops them:

1. The `get_public_booking_blocks` RPC has `WHERE is_blackout = false`, so the client never sees blackouts.
2. `src/lib/privateBooking.ts` and `src/hooks/useAvailableBlockSlots.ts` only build slots from non-blackout rows — there is no second pass that subtracts blackouts.
3. The server-side `enforce_slot_hold_limits` trigger checks "does a non-blackout block cover this slot?" but never checks "does a blackout also cover it?" — so even if the UI were patched, a crafted request could still hold the slot.
4. `prevent_lesson_occurrence_double_book` never consults blackouts either.

Net effect: Jaclyn's 10:30, 11:00, 11:30, 12:00, 12:30 slots on Sat 6/13 are still bookable.

## Plan

### 1. DB migration — expose + enforce blackouts

- Update `public.get_public_booking_blocks` to return **all** rows (both availability and blackout), since blackouts contain no PII (just instructor_id, date, time). The client needs them to subtract.
- Update the `enforce_slot_hold_limits` trigger to additionally `RAISE EXCEPTION` if any matching blackout row covers (or overlaps) the requested `(instructor_id, slot_date, [start_time, end_time))`. Match logic must mirror the availability lookup: `weekly` with `day_of_week` + `start_date`/`end_date` window, OR `date_range` with date window.
- Update `prevent_lesson_occurrence_double_book` to also reject inserts/updates whose effective `(instructor_id, occurrence_date, time range)` overlaps a blackout block. This is the last line of defense if anything bypasses the hold step.

### 2. Client subtraction in `src/lib/privateBooking.ts`

In `fetchOpenSlots`:
- Split the returned blocks into `availability` (`is_blackout=false`) and `blackouts` (`is_blackout=true`).
- After generating candidate slots from availability + breaks + existing bookings + holds, drop any slot where for the same `instructor_id` + `date`, a blackout block matches (same weekly/date_range matching as the trigger) AND overlaps the slot's `[start, end)`.
- Apply the same to break-window comparison so blackouts behave like additional break windows.

### 3. Client subtraction in `src/hooks/useAvailableBlockSlots.ts`

Same treatment: feed blackouts into the slot generator and skip any slot overlapped by a blackout. Remove the dead `if (b.is_blackout) return false` guard and replace with a real subtraction step.

### 4. Sanity: time-off requests (optional, deferred)

`time_off_requests` is not currently used by the public flow. We will NOT wire it up in this fix — the admin "Close" action already writes blackout rows, which is the source of truth. (Noting for follow-up if the admin expects approved time-off to auto-hide slots too.)

### 5. Verify

- After deploy, hit `/book-private-lesson` for Jaclyn / Sat 6/13 and confirm 10:30, 11:00, 11:30, 12:00, 12:30 no longer appear.
- Confirm a remaining open slot (e.g., 10:00) still books successfully.
- Confirm an admin-side `slot_holds` insert for a blacked-out slot fails with the trigger's new error.

## Technical notes

- `get_public_booking_blocks` already runs as `SECURITY DEFINER`; widening to include blackouts is safe — blackout rows expose nothing more sensitive than the availability rows themselves.
- Overlap predicate (mirroring existing trigger style): `NEW.start_time < b.end_time AND NEW.end_time > b.start_time`.
- The `enforce_slot_hold_limits` block-matching CTE is duplicated almost verbatim for the blackout check; will keep them as a single subquery with `is_blackout` filtered per branch to minimize drift.
- No schema changes (no new columns). No data migration. Existing blackouts will start being honored immediately on deploy.

## Out of scope

- Drag-to-move on the calendar (still deferred).
- Wiring `time_off_requests` into public availability.
- Any UI changes to how admins create blackouts (the existing "Close from slot grid" flow already writes the right rows).
