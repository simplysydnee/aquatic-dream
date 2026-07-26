
# Fix abandoned-cart bookings polluting the schedule and billing

## What is actually wrong

Verified against live data:

- 111 lesson bookings sit in `status = 'pending_card'` and **not one of them has a saved card**. These are self-serve carts where a parent picked a time slot but never finished entering their card. 63 lesson dates hang off them, spanning 6/1 through 8/6.
- Those lesson dates were stamped `payment_status = 'card_on_file'`, which is wrong and is why they show up as real unbilled lessons in audits.
- Nothing ever retires them. They live forever.
- The admin calendar already hides them after 30 minutes, but the **print schedule does not** — it only filters out cancelled lessons, so every abandoned cart prints as a real lesson.

Adrian Chacon on 6/16 is exactly this. Three rows exist: 3:30pm and 4:30pm created at 3:15pm and 3:18pm with no card (abandoned), and 4:00pm created at 3:24pm, paid and charged. **The 4:00pm is the real lesson.** The other two are dead carts.

The billing audit I gave you earlier inherited the same flaw, so part of that outstanding list is not real.

## The fix

### 1. Add an "abandoned" state

New status value on bookings and lesson dates. Nothing is deleted. An abandoned row keeps its full history but is excluded from every schedule, roster, billing, capacity, and audit view.

Also clear the misleading `card_on_file` payment status on those rows so they can never be counted as owed money again.

### 2. Retire the 111 existing carts

One data update marks every self-serve booking that has no saved card and never completed checkout as abandoned, along with its lesson dates. Admin-created bookings are untouched.

### 3. Auto-retire new carts after 15 minutes

A scheduled job runs every few minutes and marks any self-serve booking as abandoned when it has no saved card and was created more than 15 minutes ago. This matches the 15-minute window and frees the slot for other families.

Admin-created bookings are **never** auto-retired.

### 4. One source of truth for "is this a real lesson"

Right now the calendar filters carts in the front end while the print view, rosters, and billing queries each do their own thing. That inconsistency is the underlying bug. All of them will read from a single shared filter, so the calendar, print schedule, check-in, rosters, and billing can never disagree again.

### 5. Admin-placed holds become a clear front-desk action

Admin bookings with no card on file are real, confirmed lessons — they just need a card collected in person. On the calendar and print schedule they will show as booked, with a clear amber "Card needed at desk" marker instead of today's vague warning. Opening the lesson gives the front desk a one-tap way to collect and save the card to Stripe, using the card capture flow that already exists.

### 6. Regenerate the billing audit

After cleanup I re-run the unpaid private and semi-private lesson audit so the outstanding list only contains lessons that genuinely happened.

## Technical details

- Migration: extend the status check constraints on `lesson_bookings.status` and `lesson_booking_occurrences.status` to allow `abandoned`; add a partial index on `(status, created_at)` for the sweeper.
- Data update (insert tool, no deletes): set `status = 'abandoned'` on `lesson_bookings` where `status = 'pending_card'`, `booking_source` is self-serve, and `stripe_payment_method_id IS NULL`; cascade to their occurrences and reset `payment_status` to `unpaid`, `charge_status` to `skipped`.
- New edge function `sweep-abandoned-bookings` on a pg_cron schedule, applying the same predicate with a 15-minute age cutoff.
- Shared helper for the "real booking" predicate used by `useCalendarData.ts`, `PrintDaySchedule.tsx` (line 124 currently only excludes cancelled), `CalendarDayView.tsx`, check-in, and the billing queries.
- `PrivateLessonDetailDialog.tsx` already wires `admin-setup-card-for-booking`; surface that action directly from the calendar block and print row for admin holds without a card.
- `get_public_taken_occurrences` already ignores stale pending_card for double-booking; update it to also ignore `abandoned` so freed slots become bookable.
