## Goal

Make admin private-lesson booking failures explainable, stop swept-abandoned rows from blocking slots, and make the picker's date windows match the server guard. Targeted fixes only; this path retires after Aug 17.

## Change 1 — Surface the real server error

`src/components/admin/booking/BookingWizard.tsx`
- Add one local helper, e.g. `invokeErrorMessage(error)`: if `error.context` exists, `await error.context.json()` inside try/catch and return `body.error` when present; otherwise fall back to `error.message`. Handles non-JSON gateway 502s.
- Apply at all four invoke sites: `lookup-parent-card-on-file` (line ~1767), `admin-create-enrollment` (~1811), `admin-create-private-booking` (~1887), `admin-create-private-booking-setup` (~1919).

`supabase/functions/_shared/availability.ts`
- `formatAvailabilityError`: include the time window per failure, e.g. `Instructor has no availability on 2026-08-10 at 19:30-20:00` and `Instructor is closed on 2026-08-10 at 19:30-20:00`. Message string only; `validateOccurrencesAgainstBlocks` is untouched.

## Change 2 — Abandoned rows must not count as conflicts

- `supabase/functions/admin-create-private-booking/index.ts`, conflict check (~line 353): replace `.neq("status","cancelled")` with `.not("status","in","(cancelled,abandoned)")`. Statuses are inlined here because edge functions cannot import from `src/`. The other two `.neq` calls in that file (confirmation-email occurrence list, prior-card lookup) are out of scope and stay as-is.
- `BookingWizard.tsx` `OneTimeChooser` `occRes` (~line 1351): `.not("status","in",DEAD_STATUS_FILTER)`.
- `src/hooks/useAvailableBlockSlots.ts` (~line 63): same.
- `src/components/admin/calendar/PrintDayScheduleDialog.tsx` (~line 74): same, and change the parent-booking skip at line 96 from `b.status === "cancelled"` to a `DEAD_STATUSES` membership check.
- `useCalendarData.ts` and `PrintDaySchedule.tsx` are left untouched.

## Change 3 — Picker date windows match the server

`BookingWizard.tsx`
- `OneTimeChooser` (~line 1399): remove the "intentionally NOT filtering by start_date / end_date" bypass and skip blocks where `dateStr < b.start_date` or `dateStr > b.end_date`, mirroring `applies()` in `useAvailableBlockSlots.ts`.
- `RecurringSlotChooser`: persist the chosen block's `start_date` / `end_date` on the SlotDraft in `selectBlock` (line ~1138), then pass them to `generateRecurringDates` at the two sites currently passing `null, null` — the week-count `onValueChange` (~1243) and the checkbox grid render (~1258).
- The "Use a custom time (off-schedule booking)" fallback is unchanged; it still hits the guard, now with a readable toast.

## Change 4 — Stale-hold constant

In the edge function's conflict loop: use 15 minutes (matching `STALE_PENDING_MS`) instead of `30 * 60 * 1000`, and only skip a stale `pending_card` row when its parent booking's `booking_source` is not `admin` / `admin_manual`. This requires adding `booking_source, status` to the joined `lesson_bookings!inner(...)` select in that query.

## Change 5 — Client search excludes dead rows

`ClientStep` `lesson_bookings` query (~line 366): add `.not("status","in",DEAD_STATUS_FILTER)` so abandoned rows stop appearing as separate results, and the `cardEmails` set (~line 387) is built only from the filtered rows.

## Out of scope

No changes to the availability guard logic, `instructor_booking_blocks`, `get_public_booking_blocks`, the public booking flow, membership code, Stripe/card-on-file logic, RLS, or schema. No new override flag.

## Verification

Typecheck, then: book a date outside a block window and confirm the toast names instructor/date/time; confirm that date is gone from the one-time picker; switch a recurring series from 8 to 12 weeks and confirm no dates past `end_date`; confirm a slot blocked only by an abandoned occurrence is bookable; load the public private-lesson page and confirm slots still render.
