## Goal
Extend the swimmer drawer's Payments tab so it lists each individual private / semi-private lesson (date, time, instructor, price, payment status) with the same actions admins use on the calendar — mark paid (cash/check/comp), charge card in person (embedded checkout), and email a payment link. All data is read from existing tables so it stays in sync with the calendar.

## Data source (already in DB)
- `lesson_bookings` — already on `Swimmer.bookings` via `useSwimmers`.
- `lesson_booking_occurrences` — one row per scheduled lesson date for a booking. Carries `occurrence_date`, `payment_status`, `paid_at`, `payment_method`, `payment_reference`, `stripe_session_id`, `stripe_checkout_url`, `status`, `cancelled_at`. Joined back to its `lesson_bookings` parent for `start_time`, `end_time`, `instructor_name`, `price_per_session`, `lesson_type`.

No schema changes. No edge function changes. Purely a Payments-tab additive UI fed by existing data and existing endpoints.

## What changes in `PaymentsTab.tsx`
1. After the existing session-fee section, fetch occurrences for this swimmer:
   ```ts
   supabase
     .from("lesson_booking_occurrences")
     .select("*, lesson_bookings!inner(start_time, end_time, instructor_name, price_per_session, lesson_type, child_name, parent_email)")
     .in("booking_id", swimmer.bookings.map(b => b.id))
     .order("occurrence_date", { ascending: true })
   ```
   Skip entirely if `swimmer.bookings.length === 0`.

2. Render a new "Private / semi-private lessons" group. One card per occurrence:
   - Header: `Mon, May 11 · 4:00–4:30 PM · Private lesson` (use `format` from date-fns)
   - Sub-line: instructor name + `$price_per_session`
   - Status badge using existing `formatPaymentStatus` / `paymentStatusBadgeClass` (already supports `paid`/`unpaid`/`comp`/`refunded`). For `cancelled_at != null`, show a muted "Cancelled" badge and hide actions.
   - When paid/comp: show `via {payment_method}{ · reference}` and `paid_at`, with Stripe link if `stripe_session_id` present (`https://dashboard.stripe.com/payments/{stripe_session_id}`), matching `PaymentRow`.
   - When unpaid: action buttons:
     - **Mark paid (cash/check)** → reuse the existing `Dialog` flow but write to `lesson_booking_occurrences` instead of `swim_enrollments`. Update sets `payment_status` (`paid` or `comp`), `paid_at`, `payment_method`, `payment_reference`. Mirrors `CalendarBlockDetail.handleMarkPaidConfirm`.
     - **Charge card** → opens `<LessonOccurrenceCheckoutDialog occurrenceId=... />` (already exists, hits `create-lesson-occurrence-checkout`).
     - **Email payment link** → `supabase.functions.invoke("send-lesson-booking-confirmation", { body: { occurrenceId, environment: getStripeEnvironment(), siteUrl: window.location.origin } })`. Same call CalendarBlockDetail uses.

3. Outstanding-balance tile: add unpaid (not comp/refunded/cancelled) occurrence prices to the existing total so the number at the top matches reality.

4. After any action, refresh both the swimmer (existing `onChanged?.()`) and the local occurrences fetch (re-run the query).

## Where it lives
Single file: `src/components/admin/swimmer/tabs/PaymentsTab.tsx`. Extract a small `LessonOccurrenceRow` component within the same file to keep it readable. Reuses:
- `PaymentRow` styling conventions (or a sibling component with the same look).
- Existing mark-paid `Dialog` (generalize the `markTarget` type to accept `{ kind: "enrollment" | "occurrence", id, label, amount, field? }`).
- `LessonOccurrenceCheckoutDialog`, `formatPaymentStatus`, `paymentStatusBadgeClass`, `getStripeEnvironment`.

## Out of scope
- No changes to edge functions, no schema, no calendar UI, no waiver tab.
- Group-class session-fee rows stay exactly as today.
- Refund flow is not added here (calendar doesn't expose it from this surface either).

## Verification
- Open Zane's swimmer drawer → Payments tab. Confirm both Monday and the following Monday occurrences appear with correct date/time/instructor/$price and current `payment_status`.
- Mark one cash → row flips to "Paid · via cash · {ref}", balance drops by that amount, calendar block for the same lesson shows the same status.
- Click Charge card → embedded Stripe checkout opens with the right amount; on test-card success the row + calendar both show paid + Stripe link.
- Click Email payment link → toast success and `payment_link_sent_at` updates (visible on next refresh; calendar block shows the same).
