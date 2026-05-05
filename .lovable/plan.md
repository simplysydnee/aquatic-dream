## Goal

For private and semi-private lesson bookings, give the front desk an option to **charge the entire series upfront in one Stripe transaction** (instead of one payment link per occurrence). Editing the day/time of a paid lesson must **never** trigger a new charge.

---

## 1. New "Bill series upfront" toggle (UI)

`src/components/admin/calendar/LessonBookingFields.tsx`

- Add field `billSeriesUpfront: boolean` to `LessonBookingFieldsData` (default `true` when `recurring` is on, irrelevant when off — single lesson is always one charge).
- Render a checkbox under the recurring block: **"Charge entire series in one payment (recommended)"** with helper text: *"Parent pays $X total = $Y/lesson × N lessons. Otherwise a payment link is emailed before each lesson."*
- Live total preview: `pricePerSession × occurrenceCount`.

`src/components/admin/calendar/AddPoolEventDialog.tsx`

- Default `billSeriesUpfront: true` in `defaultLessonBookingData`.
- Pass through to save handler.

## 2. New edge function: `send-lesson-series-confirmation`

Creates **one** Stripe checkout session covering the whole series and sends a single confirmation email with the full schedule + calendar links.

`supabase/functions/send-lesson-series-confirmation/index.ts`
- Input: `{ bookingId, environment, siteUrl }`.
- Loads booking + all unpaid occurrences (ordered by date).
- Creates one `stripe.checkout.sessions.create` with:
  - `unit_amount = price_per_session * 100`, `quantity = occurrences.length`
  - `metadata: { type: 'lesson_booking_series', bookingId, occurrenceIds: csv }`
  - product name: `"Private Lesson Series — N lessons"` with first/last date in description.
- On success, stamps every occurrence with `stripe_checkout_url`, `stripe_session_id`, `payment_link_sent_at`.
- Sends the existing `lesson-booking-confirmation` email with new template props: `seriesMode: true`, `totalAmountDue`, `scheduleList[]` (date + time per lesson), `paymentLink`.

## 3. Email template update

`supabase/functions/_shared/transactional-email-templates/lesson-booking-confirmation.tsx`
- New optional props: `seriesMode`, `totalAmountDue`, `scheduleList: { date: string; time: string }[]`.
- When `seriesMode`:
  - Replace single date/time block with a "Schedule (N lessons)" list.
  - CTA changes to **"Pay for full series — $TOTAL"**.
  - Adjust the "first of N" copy to: *"One payment covers all N lessons. You'll get a calendar reminder before each one."*

## 4. Calendar-links helper

`supabase/functions/_shared/calendar-links.ts`
- Reuse `buildSessionCalendarLinks` (already exists, takes a date array) for the series email so parents can add **all** lessons to their calendar with one .ics — same pattern as group enrollments.

## 5. Webhook: mark whole series paid

`supabase/functions/payments-webhook/index.ts`
- New branch in `checkout.session.completed`:
  - `if (metadata.type === 'lesson_booking_series')` → `handleLessonSeriesPaid(obj)`
  - Updates **all** `lesson_booking_occurrences WHERE booking_id = ?` to `payment_status='paid'`, sets `paid_at = now()`, stamps `stripe_session_id` (the parent checkout session id) on each.
- Existing per-occurrence handler stays unchanged for the legacy "pay per lesson" mode.

## 6. AddPoolEventDialog save handler

`handleLessonBookingSave`:
- After inserting occurrences, branch:
  - `billSeriesUpfront && sendPaymentLink` → invoke `send-lesson-series-confirmation` (instead of `send-lesson-booking-confirmation` for the first occurrence only).
  - Otherwise keep existing per-occurrence behavior.

## 7. Per-occurrence reminders skip paid ones

`supabase/functions/send-lesson-occurrence-reminders/index.ts`
- Already keys off `payment_status <> 'paid'` for sending a payment link; verify and ensure reminders for paid (series-billed) occurrences send a **calendar reminder only**, no payment CTA.

## 8. **Editing day/time never recharges** (the "doesn't recharge them" requirement)

This is mostly already true (edits only touch `pool_events` rows, not Stripe), but tighten it:

`src/components/admin/calendar/AddPoolEventDialog.tsx` (edit branch — `handleRegularSave` when `editEvent` is a private/semi lesson):
- Only update the `pool_events` row fields (`event_date`, `start_time`, `end_time`, `pool_area`, `instructor_name`, `notes`).
- **Also** sync the matching `lesson_booking_occurrences.occurrence_date` (when the date moves) and `lesson_bookings.start_time/end_time` (when time moves on a non-recurring single booking) so reminder/calendar emails reflect the new schedule.
- Never touch `payment_status`, `stripe_session_id`, `stripe_checkout_url`, or `paid_at`.

`src/components/admin/calendar/CalendarBlockDetail.tsx`:
- Hide "Resend Payment Link" / "Charge Card" / "Mark Paid" buttons when `lessonOcc.payment_status === 'paid'` (verify they're already hidden — currently only the markPaid block at line 551 is gated).

`supabase/functions/payments-webhook/index.ts`:
- Idempotency guard already in place (`stripe_payment_id` lookup); add the same for series — skip if any occurrence with this `stripe_session_id` is already `paid`.

## 9. Optional follow-up: rescheduling triggers a new ICS, not a new charge

When date/time changes on a paid occurrence, fire (silently) a "lesson rescheduled" email with updated calendar links. Out of scope for this pass unless you want it included — flag as TODO.

---

## Files touched

- `src/components/admin/calendar/LessonBookingFields.tsx`
- `src/components/admin/calendar/AddPoolEventDialog.tsx`
- `src/components/admin/calendar/CalendarBlockDetail.tsx`
- `supabase/functions/send-lesson-series-confirmation/index.ts` (new)
- `supabase/functions/payments-webhook/index.ts`
- `supabase/functions/_shared/transactional-email-templates/lesson-booking-confirmation.tsx`
- `supabase/functions/send-lesson-occurrence-reminders/index.ts` (verify-only)

No DB schema changes needed — `lesson_booking_occurrences` already supports per-row `payment_status='paid'` + `stripe_session_id`, which is enough to mark a series-paid set of occurrences.
