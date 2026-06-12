## Goal
Closed private-lesson sessions/days for an instructor should not appear anywhere in the public booking flow, and they must be impossible to book even if someone submits a stale/direct request.

## Implementation Plan

1. **Public booking display**
   - Keep using `is_blackout = true` as the meaning of “closed.”
   - Ensure the public booking slot generator removes any slot that overlaps a blackout block for the same instructor/date/time.
   - Confirm closed Jaclyn-style slots are absent from the public picker rather than shown as unavailable.

2. **Final booking enforcement**
   - Update the final lesson occurrence guard so any new or rescheduled private lesson that overlaps an instructor blackout is rejected at the database level.
   - This protects against stale browser state, direct API calls, or checkout attempts that bypass the visible picker.

3. **Public booking edge function validation**
   - Add an explicit blackout check inside `create-private-booking-setup` before it creates the card-on-file checkout/booking.
   - Return a clean “slot closed” response instead of allowing the booking to proceed and fail later.

4. **Admin calendar open-slot list**
   - Update the admin calendar’s computed “open private slots” so it also subtracts blackout rows.
   - This keeps admin-visible availability consistent with public booking.

5. **Verification**
   - Test Jaclyn’s Sat 2026-06-13 example: 10:30, 11:00, 11:30, 12:00, and 12:30 should not appear publicly and should be rejected if submitted directly.
   - Confirm a valid open slot, like 10:00, still appears and remains bookable.

## Technical Notes

- No new tables are needed.
- The fix uses the existing `instructor_booking_blocks.is_blackout` records.
- The key backend change is extending `prevent_lesson_occurrence_double_book()` to reject blackout overlaps, not just lesson-vs-lesson overlaps.