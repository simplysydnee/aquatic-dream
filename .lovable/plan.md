## Goal
Make individual private lesson slots reliably actionable from `/admin/private-lessons`: booked lessons can be cancelled/deleted, and open spots can be closed/reopened.

## Root causes found
- The slot grid matches bookings by `instructor_id`, but several existing admin-created private bookings have `instructor_id: null` and only store `instructor_name` (for example Sutton Lucas). Those booked slots do not attach to the slot tile, so the UI treats them as open.
- Closing a slot only inserts a blackout, but the UI does not strongly protect against duplicate/overlapping blackout inserts or show a clear failure path if the insert fails.
- Cancelling a slot uses a direct table update instead of the admin backend function, so it is less reliable for owner/manager workflows and does not centralize admin checks/audit behavior.

## Implementation plan
1. **Fix booking-to-slot matching**
   - Build an instructor name → id lookup from the active instructors list.
   - When a booking has no `instructor_id`, derive it from `instructor_name` so admin-created bookings still appear as `Booked` in the slot grid.
   - Keep matching by date + start time, but normalize times consistently.

2. **Make “Cancel/Delete this lesson” reliable**
   - Update the slot action dialog for booked slots to show a clear destructive action for the single occurrence.
   - Route single-occurrence cancellation through the existing admin backend function pattern, extending `admin-manage-private-booking` if needed with a `cancel_occurrence` action.
   - The action will update only that occurrence to `cancelled`, set `cancelled_at`, `cancelled_by`, `cancel_reason`, and skip future auto-charge.
   - After success, refresh the grid so the time immediately becomes available/open unless separately blocked.

3. **Make “Close this spot” reliable**
   - Before inserting a blackout, check whether an overlapping blackout already exists for that instructor/date/time.
   - If one exists, treat the slot as already blocked instead of failing silently or duplicating rows.
   - Insert a one-time blackout with exact date/time and inherited pool area/slot length.
   - Refresh the grid so it immediately shows `Blocked`.

4. **Make reopening reliable**
   - Ensure blocked tiles carry the exact blackout block id.
   - Unblock deletes only that one-time blackout row and refreshes the grid.

5. **Improve feedback and validation**
   - Surface failed cancel/block/unblock responses with specific toast messages.
   - Add missing dialog descriptions to remove the current accessibility warnings.
   - Keep existing block edit/delete controls unchanged.

## Files to change
- `src/pages/admin/PrivateLessonsAdmin.tsx`
- `supabase/functions/admin-manage-private-booking/index.ts` only if adding the centralized `cancel_occurrence` action is required.

## Out of scope
- No changes to public booking flow.
- No schema changes.
- No changes to email templates or payment/refund behavior unless already handled by existing admin cancellation logic.