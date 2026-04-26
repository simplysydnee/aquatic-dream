## Goal
When adding a Private or Semi-Private lesson on the calendar, capture client + price, support recurring schedules, and automatically email the parent a confirmation + Stripe payment link for one session at a time. For recurring series, send the next session's link 24 hours before each subsequent lesson.

## What changes

### 1. New `lesson_bookings` table (groups individual occurrences)
A series-level record that owns the per-occurrence `pool_events` + per-occurrence payment rows.

```text
lesson_bookings
- id, lesson_type ('private' | 'semi-private')
- parent_name, parent_email, parent_phone, child_name (optional notes)
- price_per_session (numeric, defaults: $65 private, $45 semi-private — admin-editable)
- instructor_name, pool_area, start_time, end_time
- recurring (bool), frequency ('weekly'|'biweekly'), recur_days (text[]), series_start, series_end
- status ('active'|'cancelled'), created_at

lesson_booking_occurrences
- id, booking_id (FK), pool_event_id (FK), occurrence_date
- payment_status ('unpaid'|'paid'|'comp'|'refunded'|'flagged_no_pay')
- stripe_checkout_url, stripe_session_id, paid_at
- payment_link_sent_at, reminder_attempted_at
```

RLS: admins manage all; service role inserts/updates from edge functions.

### 2. AddPoolEventDialog — new fields for Private/Semi-Private
When `eventType` is `private-lesson` or `semi-private-lesson`, replace current single "Client name" input with a richer block:

- **Client picker** — searchable combobox. Pulls distinct `(parent_email, parent_name, parent_phone, child_name)` rows from `swim_enrollments`. Selecting auto-fills the four fields. "+ New client" clears the form for manual entry.
- **Parent name, parent email, parent phone, child name** (text inputs)
- **Price per session** — numeric, prefilled $65 (private) / $45 (semi-private), editable
- **Recurring** checkbox — when on, show frequency (weekly/biweekly), days-of-week chips, and end date (reuses the same generator already used for swim lessons)
- **"Send confirmation + payment link to parent" toggle** — default ON

### 3. Save flow
On save:
1. Generate occurrence dates (single date OR series via existing `generateOccurrences`).
2. Insert `lesson_bookings` row (series-level).
3. Insert one `pool_events` row per occurrence (existing behavior, preserves calendar rendering).
4. Insert one `lesson_booking_occurrences` row per occurrence linking to its `pool_event_id`.
5. Invoke new `send-lesson-booking-confirmation` edge function for the **first** occurrence only — it creates a Stripe checkout session for `price_per_session × 1`, emails parent the confirmation + pay link, and stamps `payment_link_sent_at` + `stripe_checkout_url`.

### 4. New edge function: `send-lesson-booking-confirmation`
Inputs: `occurrenceId`, `environment`.
- Loads occurrence + parent booking.
- Skips if `payment_status` is `paid` or `comp`.
- Creates Stripe checkout (one-time payment, dynamic `price_data` so admin-set price works) with `metadata: { type: 'lesson_booking_occurrence', occurrenceId, bookingId }`.
- Saves `stripe_checkout_url` + `stripe_session_id` on the occurrence.
- Sends `lesson-booking-confirmation` transactional email with parent name, child, lesson type, date/time, instructor, amount, pay link.
- Stamps `payment_link_sent_at`.

### 5. payments-webhook update
Extend `checkout.session.completed` handler: when `metadata.type === 'lesson_booking_occurrence'`, mark that occurrence `payment_status = 'paid'`, set `paid_at` and `stripe_session_id`.

### 6. Cron-based 24h reminder
- New edge function `send-lesson-occurrence-reminders` (verify_jwt = true, invoked by cron):
  - Selects `lesson_booking_occurrences` where `occurrence_date = tomorrow (PT)`, `payment_status='unpaid'`, `payment_link_sent_at IS NULL`.
  - For each, calls `send-lesson-booking-confirmation` (same email template/flow).
  - Also: for occurrences where `occurrence_date = today`, `payment_status='unpaid'`, and `payment_link_sent_at` is older than ~22h → set `payment_status='flagged_no_pay'` so admin sees it (per your "flag for admin review" choice). The lesson is NOT auto-cancelled; the calendar block gets a red "Unpaid — review" badge.
- pg_cron job runs hourly via `net.http_post` (uses anon key + project URL — inserted via insert tool, not migration).

### 7. Calendar block detail (`CalendarBlockDetail.tsx`)
For private/semi-private events tied to a `lesson_booking_occurrence`, show:
- Parent / child / phone / email
- Price, payment status badge (Paid / Unpaid / Flagged)
- Buttons: "Resend payment link", "Mark paid (cash/check)" (with reference field), "Mark comp"
- For recurring: "Part of series — N occurrences" link

### 8. Email template: `lesson-booking-confirmation`
New React Email template + registry entry. Content:
- "Your [Private / Semi-Private] swim lesson is booked"
- Date, time, instructor, location
- Amount due ($X) for THIS session
- "Pay now" button → Stripe checkout URL
- For recurring series: footer note "This is the first of N lessons. You'll receive a separate payment link 24 hours before each upcoming lesson."

## Defaults & rules confirmed
- Default price: $65 private, $45 semi-private (editable per booking)
- Saved clients pulled from `swim_enrollments`
- Recurring billing: 24h before each lesson via cron
- Unpaid at lesson time → flagged for admin review (no auto-cancel)

## Out of scope
- No new dedicated `clients` table (using enrollments as the source)
- No automatic charging — every payment goes through a hosted Stripe checkout link the parent clicks
- No SMS reminders
- No changes to the existing group `swim-lesson` flow

## Files

**New**
- `supabase/migrations/<timestamp>_lesson_bookings.sql`
- `supabase/functions/send-lesson-booking-confirmation/index.ts`
- `supabase/functions/send-lesson-occurrence-reminders/index.ts`
- `supabase/functions/_shared/transactional-email-templates/lesson-booking-confirmation.tsx`
- `src/components/admin/calendar/LessonBookingFields.tsx` (client picker + recurring + price)

**Edited**
- `src/components/admin/calendar/AddPoolEventDialog.tsx` — branch into the new fields for private/semi-private and call new save flow
- `src/components/admin/calendar/CalendarBlockDetail.tsx` — show booking + payment controls
- `supabase/functions/payments-webhook/index.ts` — handle `lesson_booking_occurrence` metadata
- `supabase/functions/_shared/transactional-email-templates/registry.ts` — register new template
- `supabase/config.toml` — `verify_jwt = false` for `send-lesson-booking-confirmation`, `verify_jwt = true` for the cron reminder
- pg_cron schedule (inserted via insert tool, not migration)
