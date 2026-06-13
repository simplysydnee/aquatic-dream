# Fix: admin private bookings disappearing when card-on-file isn't completed

## What happened to Kiaan Bansal

- Admin booked Kiaan with Grace for 6/13 11:00–11:30 at 23:36 on 6/10.
- The booking + occurrence were inserted up front with `status = pending_card` (admin checkout flow saves a card on file via Stripe Embedded Checkout in setup mode, then flips status on completion).
- The Stripe setup checkout was never completed — no `stripe_payment_method_id` was saved, status stayed `pending_card`.
- `useCalendarData.ts` (and `PrivateLessonsAdmin.tsx`) hide any `pending_card` occurrence older than 30 minutes as "abandoned admin checkout", so ~30 min after creation it vanished from the day calendar.

## Part 1 — Recover Kiaan now

- Update booking `95be6665-a982-46b5-a4d9-ac177f3037fe`: set `status = 'confirmed'`, `booking_source = 'admin_manual'` (already), keep customer + customer_id intact.
- Update its occurrence `9ddaaf09-…`: set `status = 'confirmed'`, leave `payment_status = card_on_file` and `auto_charge_status = pending` so admin knows to attach a card.
- Result: Kiaan reappears on Saturday 6/13 at 11:00 with Grace, flagged "card on file pending."

## Part 2 — Stop this from happening again

Goal: admin-created bookings should always hold the slot on the calendar, even if the Stripe setup flow is abandoned. The slot becomes the source of truth; the missing card becomes an admin to-do, not a disappearing booking.

### Calendar visibility

- `src/hooks/useCalendarData.ts`: stop hiding admin-source `pending_card` rows after 30 min. Only hide stale `pending_card` rows whose `booking_source` is a self-serve flow (e.g. `public_booking`, null). Admin rows stay visible indefinitely with the existing "⚠ Card on file pending" badge (already wired in `CalendarDayView.tsx:312`).
- `src/pages/admin/PrivateLessonsAdmin.tsx`: same change — keep admin `pending_card` slots in the day view and grid.

### Confirm slot immediately on admin booking

- `supabase/functions/admin-create-private-booking/index.ts`: when booking row is created from the admin manual flow, write `status = 'confirmed'` for both `lesson_bookings` and the `lesson_booking_occurrences` rows. Use a separate `payment_status` (`card_on_file_pending` or keep `card_on_file` + `auto_charge_status = 'pending'`) to represent "card not saved yet." This way the booking is committed even if the admin closes the setup dialog.
- `admin-create-private-booking-setup` / the follow-up confirm endpoint just attaches `stripe_payment_method_id` and flips `auto_charge_status = 'ready'` — no status change needed.

### Surface the "card pending" state to admins

- Add a small badge on `PrivateLessonsPanel` / `CalendarDayView` private-lesson cards when `auto_charge_status = 'pending'` and `stripe_payment_method_id` is null, with a "Collect card" action that re-opens `admin-card-on-file-link` for that parent.

## Part 3 — Verify

- Re-check 6/13 day view: Kiaan shows at 11:00 with the warning badge.
- Create a fresh admin booking, close the Stripe setup dialog without completing it, refresh: booking remains visible with the badge.
- Complete the Stripe setup on another booking: badge clears, `stripe_payment_method_id` is set.

## Files touched

- `src/hooks/useCalendarData.ts` — filter logic
- `src/pages/admin/PrivateLessonsAdmin.tsx` — filter logic + badge
- `src/components/admin/calendar/PrivateLessonsPanel.tsx` — badge / action
- `src/components/admin/calendar/CalendarDayView.tsx` — already has the warning text, may add action
- `supabase/functions/admin-create-private-booking/index.ts` — insert as `confirmed`
- One data update via the insert tool to recover Kiaan's existing rows.

No schema migration is required (we already have `auto_charge_status` and `stripe_payment_method_id`).
