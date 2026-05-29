## What's broken

The "Save card" step crashes with:

> Invalid value for stripe.confirmSetup(): elements should have a mounted Payment Element or Express Checkout Element.

`PrivateCardSetup.tsx` mounts a custom `<Elements>` + `<PaymentElement>` and calls `stripe.confirmSetup()`. This pattern is fragile (the PaymentElement isn't reliably mounted when submit fires, and it violates the project's Embedded Checkout rule). The fix is to use **Stripe Embedded Checkout in `mode: "setup"`** — same component family already used elsewhere in the app, fully managed by Stripe.

Separately, the cron currently charges the day **after** each lesson. You want it to charge the **day of** the lesson, with no-shows billed in full and a 24-hour cancellation window (already implemented correctly in cancel function — late cancels keep the charge pending, ≥24h cancels are skipped).

## Changes

### 1. Switch card capture to Embedded Checkout (setup mode) — fixes the crash

**`supabase/functions/create-private-booking-setup/index.ts`**
- Replace the raw `stripe.setupIntents.create(...)` with `stripe.checkout.sessions.create({ mode: "setup", ui_mode: "embedded", customer, return_url, payment_method_types: ["card"], metadata: { booking_id } })`.
- Return `{ booking_id, client_secret, session_token }` (Checkout client secret, not SetupIntent's).

**`src/components/private-lessons/PrivateCardSetup.tsx`** — rewrite:
- Remove `Elements` / `PaymentElement` / `useStripe` / `useElements` / `confirmSetup`.
- Render `<EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}><EmbeddedCheckout /></EmbeddedCheckoutProvider>`.
- `return_url` points back to `/swim-enrollment?private_booking_id=…&checkout_session_id={CHECKOUT_SESSION_ID}`.

**`src/pages/SwimEnrollment.tsx`**
- On mount, if `private_booking_id` + `checkout_session_id` are present in the URL, call `confirm-private-booking` with the session id, then jump the flow to the confirmation step and clean the URL.

**`supabase/functions/confirm-private-booking/index.ts`**
- Accept `checkout_session_id` instead of `setup_intent_id`. Retrieve the Checkout Session, read `session.setup_intent`, retrieve that SetupIntent, persist `payment_method_id` + `customer` on the booking, flip occurrences to `scheduled`, send confirmation email.

### 2. Charge on the day of the lesson (no-show = full charge)

**`supabase/functions/charge-private-lesson-occurrence/index.ts`**
- Change the query filter from `.lt("occurrence_date", today)` to `.lte("occurrence_date", today)` so today's lessons are eligible.
- Add a safety guard: only charge an occurrence whose lesson `end_time` has already passed in America/Los_Angeles (so we don't charge mid-class). Past dates always pass this check.
- Update charge `description` to `Private Lesson — {child} — {date} {start_time}`.

Cancellation logic in `cancel-private-lesson-occurrence` already enforces the 24-hour policy correctly (`within window` → keep `auto_charge_status='pending'` so the cron bills; `outside window` → `skipped`). No changes needed there.

### 3. UI copy

In `PrivateCardSetup.tsx` and the "Private lessons" intro paragraph in `SwimEnrollment.tsx`:
- "$65 charged after each lesson" → "$65 charged the day of each lesson".
- "No charge today. We'll charge $65 to your card the day after each lesson." → "No charge today. We'll charge $65 on the day of each lesson. No-shows and cancellations within 24 hours are charged in full."

## Files

**Edited**
- `supabase/functions/create-private-booking-setup/index.ts`
- `supabase/functions/confirm-private-booking/index.ts`
- `supabase/functions/charge-private-lesson-occurrence/index.ts`
- `src/components/private-lessons/PrivateCardSetup.tsx`
- `src/pages/SwimEnrollment.tsx` (return-URL handler + copy)

**No DB migration needed** — existing columns (`stripe_customer_id`, `stripe_payment_method_id`, `auto_charge_status`) cover the new flow.

## Out of scope
- Email reminders the morning of each lesson.
- Failed-charge retry UI for parents (admin can resend a card-update link from the bookings drawer).
- Pre-auth holds (we save card and capture day-of instead).