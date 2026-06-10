## Goal
Manually book Kiaan Bansal (age 2) into Grace Cavanaugh's existing Saturday booking block on **Sat, June 13, 2026, 11:00–11:30 AM**, under existing parent **Sandeep Kaur** (`ohhsipayy@gmail.com`). Charge **$50** (June private-lesson rate) on lesson day. Email Sandeep a secure link to save a card on file.

## Confirmed from DB
- Parent already in system: SANDEEP KAUR · ohhsipayy@gmail.com (Giana Bansal's parent).
- Instructor: Grace Cavanaugh (`6701866e-971b-42fb-9014-0a07badedc6c`).
- Grace's existing weekly Saturday booking block covers 10:00–13:00 starting 6/13 — the 11:00 slot is inside that block, so we're filling an existing opening, not creating a new shift.

## Steps

1. **Insert one `lesson_bookings` row** (data tool):
   - `lesson_type: private`, `status: pending_card`, `booking_source: admin_manual`
   - Parent: SANDEEP KAUR / ohhsipayy@gmail.com (no phone on file)
   - Child: Kiaan Bansal, age 2
   - Instructor: Grace Cavanaugh (id above), `pool_area: shallow`
   - `series_start = series_end = 2026-06-13`, `start_time 11:00`, `end_time 11:30`
   - `price_per_session: 50`, `cancellation_policy_hours: 24`
   - Fresh `waiver_token` (Bansal waiver from Giana auto-links via existing trigger).
2. **Insert one `lesson_booking_occurrences` row** for 2026-06-13: `status: pending_card`, `payment_status: card_on_file`, `auto_charge_status: pending`, fresh `cancel_token`.
3. **Create a Stripe sandbox setup-mode Checkout Session** for Sandeep's customer (lookup-or-create by email), with `metadata.booking_id` so `payments-webhook` flips the booking to `confirmed` once the card is saved. Stash the URL on the booking row.
4. **Send Sandeep the confirmation email** via `send-transactional-email` (template `lesson-booking-confirmation`) with the Stripe setup URL as the CTA ("Save card on file"). Idempotency key `private-booking-${booking_id}`.

No schema changes, no new booking block — just data inserts + one Stripe call + one email send.

## Out of scope
- No charge today; $50 auto-charges on 6/13 via existing `charge-private-lesson-occurrence` cron once card is saved.
- No 2nd swimmer (private, not semi-private).
- No SMS (no phone on file).
