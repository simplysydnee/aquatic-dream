## Goals

1. Make the "Email payment link", "Resend payment link", and "Email combined link" buttons in Swimmer → Payments reliably send.
2. When admin books a private OR semi-private lesson, automatically email a booking confirmation that includes the waiver link (if no waiver on file for that swimmer — matched by first+last name AND DOB across `enrollment_agreements`, `visitor_waivers`, and prior signed `lesson_bookings`) AND a Stripe payment link **only when no card is on file**.
3. Preserve existing card-on-file auto-charge flow: when admin captures a card during booking, the lesson stays on auto-charge before each lesson via `charge-private-lesson-occurrence` (already wired). No payment link is sent — the email just confirms the booking, dates, and waiver.
4. Schedule the existing 24-hour reminder cron so reminders fire for upcoming unpaid lessons that have no card on file.

## Background

- Recent `lesson_booking_occurrences.payment_link_email_error` rows all read "Edge Function returned a non-2xx status code". A direct invoke of `send-lesson-booking-confirmation` against Cindy Castillo's occurrence now succeeds end-to-end (queued + sent). Past failures correlate with two real bugs:
  - `send-lesson-series-confirmation` writes `stripe_session_id = cs_…` (Checkout Session id) onto every occurrence. That column is reserved for the `pi_…` PaymentIntent written by `payments-webhook`, so the reconciliation path gets confused.
  - Several recent bookings have `lesson_bookings.waiver_token IS NULL` (e.g. Arthur/Michael Sidell, Carson Maldonado). The wrapper skips building a waiver section in that case, but the upstream admin flow that auto-emails on booking creation still triggers — and downstream confusion masks the real error.
- `admin-create-private-booking` already auto-sends `lesson-booking-confirmation`, but it uses the template directly (no Stripe link). For card-on-file bookings (the default), that's correct. For NO-card bookings the parent gets no way to pay.
- `send-lesson-occurrence-reminders` is implemented but not scheduled in pg_cron — no automated 24h reminders go out.
- DB already has `swimmer_has_active_waiver(first, last, dob)` and `get_active_waiver_for_swimmer(first, last, dob)`, but they only check `visitor_waivers`. We'll add a broader function that also scans `enrollment_agreements` and prior signed `lesson_bookings`.

## Card-on-file vs payment-link policy (no behavior change for COF)

| Booking creates with…                       | Email contains                                                  | Charge mechanism                                  |
| ------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------- |
| **Card on file** (`collect_card_on_file=true`, Setup Checkout completes) | Confirmation + waiver link (if needed) + "card will be charged the day of each lesson" note | Existing `charge-private-lesson-occurrence` cron (unchanged) |
| **No card on file** (admin chose not to collect) | Confirmation + waiver link (if needed) + Stripe payment link (single or series-combined) | Parent pays via Stripe Checkout                  |

## Changes

### 1. DB migration — waiver-on-file dedupe + child DOB on bookings

- Add column `lesson_bookings.child_dob date` (nullable) so admin-create paths can populate it and dedupe checks can run.
- Add `public.swimmer_has_waiver_on_file(_first text, _last text, _dob date)` returning true if any of these match (case- and whitespace-insensitive):
  - `visitor_waivers` entry with matching swimmer name + DOB within last 12 months.
  - `enrollment_agreements` with matching `child_first_name`, `child_last_name`, `child_dob`, and `signed_at IS NOT NULL`.
  - `lesson_bookings` with matching `child_first_name`, `child_last_name`, `child_dob`, and `waiver_signed_at IS NOT NULL`.
- Add `public.get_active_waiver_signed_at_for_swimmer(_first, _last, _dob)` returning the most recent `signed_at` timestamp across those three sources, so we can copy it forward onto the new `lesson_bookings.waiver_signed_at`.

### 2. `admin-create-private-booking` (and resend path)

- Accept `child_dob` in `CreateSchema`; persist to the new column.
- After validating input but before inserting the booking:
  - If `child_first_name`, `child_last_name`, `child_dob` are all present, call `swimmer_has_waiver_on_file`. If true, fetch the prior `signed_at` and stamp `waiver_signed_at` on the new booking row at insert time so the email skips the "Sign Waiver" section.
- When `send_confirmation = true`, branch by `collect_card_on_file`:
  - **COF path (default)**: keep current direct `send-transactional-email` invocation with the `cardOnFileNote` (no `paymentLink`). Just add the dedupe-driven `waiverSigned`/`waiverLink` logic above.
  - **No-card path**: replace the direct invoke with the existing wrapper:
    - `dates.length === 1` → `send-lesson-booking-confirmation` with the occurrence id (builds Stripe single-charge link).
    - `dates.length > 1` → `send-lesson-series-confirmation` with the booking id (builds one combined Stripe link for the whole series).
  - The wrappers already include the waiver section when `waiver_signed_at` is null — our dedupe stamps it as needed, so they Do The Right Thing.

### 3. `send-lesson-series-confirmation` hardening

- Remove the `stripe_session_id: checkoutSession.id` write (column is reserved for `pi_…`).
- Before building `waiverLink`, if `booking.waiver_token` is null AND `waiver_signed_at` is null, generate a token and update the row (so the email always renders correctly when a waiver IS needed).
- Surface real send errors (currently `payment_link_email_status='failed'` is written by the background task but the caller already returned success — confirm that's intentional or propagate).

### 4. `send-lesson-booking-confirmation` hardening

- Same waiver_token backfill as above.

### 5. BookFromRequestDialog + AdminBookPrivateLessonDialog

- Pass `child_dob` through (where collected) so dedupe runs.
- When booking 2+ dates with no card on file, switch the auto-send to `send-lesson-series-confirmation` instead of `send-lesson-booking-confirmation` for just the first occurrence.

### 6. Cron — schedule 24h lesson reminders

Insert via `supabase--insert` (not migration — anon key and project URL are project-specific):

```text
SELECT cron.schedule(
  'send-lesson-occurrence-reminders',
  '*/30 * * * *',
  $$ SELECT net.http_post(
       url:='https://jilrijklnehbfuulykty.supabase.co/functions/v1/send-lesson-occurrence-reminders',
       headers:='{"Content-Type":"application/json","apikey":"<anon>"}'::jsonb,
       body:='{}'::jsonb
     ); $$
);
```

The function already filters to "tomorrow's PT unpaid occurrences without a sent link" and is a no-op for card-on-file occurrences (their `payment_status` is `card_on_file`, not `unpaid`). Running every 30 min just gives same-day coverage; it's idempotent.

### 7. Verification

- Click "Email payment link" on Cindy Castillo's Payments tab → `email_send_log` goes pending → sent; `payment_link_email_status='sent'`.
- Click "Email combined link ($120.00)" → one Stripe Checkout URL covers all 4 lessons; email arrives with payment + waiver buttons; `lesson_booking_occurrences.stripe_session_id` is NOT polluted with `cs_…`.
- Admin-create a new test private with card-on-file: parent gets confirmation + waiver only (no pay button); auto-charge cron still triggers day-of.
- Admin-create a new test semi-private WITHOUT card: parent gets confirmation + waiver (if needed) + Stripe pay button. With matching name+DOB on file, waiver section is omitted.
- Verify `cron.job` contains `send-lesson-occurrence-reminders` and a no-card unpaid lesson 24h out receives the reminder.

## Files

- `supabase/migrations/<new>.sql` — add `lesson_bookings.child_dob`, add `swimmer_has_waiver_on_file`, add `get_active_waiver_signed_at_for_swimmer`.
- `supabase/functions/admin-create-private-booking/index.ts` — accept `child_dob`; pre-insert dedupe; branch email path on `collect_card_on_file`.
- `supabase/functions/send-lesson-series-confirmation/index.ts` — drop `stripe_session_id` write; backfill waiver token.
- `supabase/functions/send-lesson-booking-confirmation/index.ts` — backfill waiver token.
- `src/components/admin/calendar/AdminBookPrivateLessonDialog.tsx`, `src/components/admin/BookFromRequestDialog.tsx` — pass `child_first_name`, `child_last_name`, `child_dob`; use series wrapper when 2+ dates and no card.
- Cron job inserted via `supabase--insert`.
