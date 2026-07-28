## What I found

I read every file named in the request. Nearly all of it is already in place:

- **Change 1** — `invokeErrorMessage(error, fallback)` already exists in `BookingWizard.tsx` (reads `error.context`, clones and parses JSON, uses the `error` field, try/catch fallback to `error.message`). It is applied to `admin-create-private-booking`, `admin-create-private-booking-setup`, and `admin-create-enrollment`. `formatAvailabilityError` in `_shared/availability.ts` already includes the time window ("Instructor has no availability on 2026-08-10 at 19:30-20:00").
- **Change 2** — the edge conflict query already uses `.not("status","in","(cancelled,abandoned)")` and skips rows whose parent booking status is cancelled or abandoned. `BookingWizard` `occRes`, `useAvailableBlockSlots.ts`, and `PrintDayScheduleDialog.tsx` all already use `DEAD_STATUS_FILTER`, and the print dialog also skips parent bookings in `DEAD_STATUSES`.
- **Change 3** — the "intentionally NOT filtering" bypass is gone; `OneTimeChooser` now skips blocks where `dateStr < b.start_date` or `dateStr > b.end_date`. `SlotDraft` carries `blockStartDate` / `blockEndDate`, and both `generateRecurringDates` call sites (the week-count handler and the checkbox grid) pass them.
- **Change 4** — `STALE_MS` is already `15 * 60 * 1000` with a comment tying it to `STALE_PENDING_MS`, and the stale skip now only applies when `booking_source` is not `admin` / `admin_manual`.
- **Change 5** — the `lesson_bookings` search query in `ClientStep` already has `.not("status","in",DEAD_STATUS_FILTER)`, so the `cardEmails` set built from those rows is filtered too.

## The one remaining gap

The fourth invoke, `lookup-parent-card-on-file`, does not use the helper. On any error it silently sets `existingCardHint = { found: false }`, so a real backend failure looks identical to "this parent has no card on file" and the admin gets no signal.

## Proposed change

In `BookingWizard.tsx`, in the card-lookup effect:

- Keep the existing behavior of setting `{ found: false }` so the review step still renders and the admin can proceed with a new card.
- Additionally, when `error` (or `data.error`) is present, resolve the real message via `await invokeErrorMessage(error, "Could not check for a card on file")` and show it as a non-blocking `toast.error`, guarded by the existing `cancelled` flag so an unmounted / superseded lookup stays silent.

No other file changes. No changes to validation, Stripe, RLS, schema, the public booking flow, `useCalendarData.ts`, or `PrintDaySchedule.tsx`.

## Verification

1. Book a date outside an instructor's block window and confirm the toast names the instructor, date, and time window.
2. Confirm that date is absent from the one-time picker.
3. Select a recurring block, change 8 weeks to 12, and confirm no dates past the block's `end_date` are generated.
4. Confirm a slot whose only conflict is an `abandoned` occurrence is bookable.
5. Confirm the public private-lesson page still loads slots and books end to end.
