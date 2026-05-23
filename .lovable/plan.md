## Goal
Stop losing enrollments while the Stripe embedded checkout is broken. Let families complete the form now and pay via a link emailed to them, without weakening the "no Stripe = no enrollment" rule once checkout is fixed.

## The workaround (feature-flagged "Reserve seat, pay by link")

On the public `/swim-enrollment` flow, replace the embedded Stripe step with a single button: **"Reserve seat — we'll email your payment link"**. The reservation creates the enrollment row in a `pending_payment` state and immediately fires the existing hosted-link email (which we already confirmed works after the `ui_mode: 'hosted'` fix). The family pays from the email; the webhook flips the row to `paid` exactly like today.

Why this is safe:
- Hosted payment links (`send-registration-fee-payment-link` / `send-session-payment-link`) go through a different code path than embedded checkout and are currently working.
- The webhook is still the only writer for `payment_status='paid'` / `session_fee_status='paid'`. No rule change.
- A new `pending_payment` status means "seat is soft-held, not yet earned" — admin can see and clean up unpaid rows after N hours.

```text
Family submits form
   │
   ▼
create-pending-enrollment edge fn
   │   ├─ inserts swim_enrollments row, status='pending_payment'
   │   └─ invokes send-registration-fee-payment-link (or session link)
   ▼
Family receives email → clicks hosted Stripe link → pays
   ▼
payments-webhook → status='confirmed', payment_status='paid'
```

## What changes

1. **New edge function `create-pending-enrollment`** (verify_jwt=false). Same payload as `create-checkout`. Inserts the row, then invokes the right hosted-link function. Returns `{ ok: true, enrollmentId }`.
2. **`EnrollmentCheckout.tsx`**: behind a flag `VITE_CHECKOUT_FALLBACK=1`, render the "Reserve seat" panel instead of `EmbeddedCheckoutProvider`. Same back button, same summary copy, just no iframe.
3. **DB**: add `'pending_payment'` to allowed `status` values on `swim_enrollments` (or use existing string column if it's free-text — needs a 1-line check). No new columns.
4. **Admin visibility**: `SwimEnrollmentsAdmin.tsx` and the calendar already render `status`. Add a "Pending payment" badge + filter chip so owner can chase or delete stale reservations.
5. **Auto-expire (optional, low risk)**: nightly cron deletes `pending_payment` rows older than 72h with no payment. Skip in v1 if you want to manually triage.

## What stays the same
- Webhook logic, payment_status math, dashboard totals.
- Admin manual enrollment path (`admin-create-enrollment`) — unchanged.
- All emails (waiver, reg fee, session fee) — already working via hosted links.
- Once embedded checkout is fixed, flip `VITE_CHECKOUT_FALLBACK` off and the public flow returns to instant in-page payment with zero code revert.

## Out of scope
- Fixing the underlying gateway / `STRIPE_*_SECRET_KEY` issue (separate track; real fix).
- Changing the returning-swimmer $240-at-checkout rule. They'll just receive a $240 link instead of paying in the iframe — same money, one extra click.
- Any change to `payments-webhook`, refunds, or `session_fee_status` semantics.

## Open question for you
Do you want pending reservations to **auto-delete after 72h** if unpaid, or stay forever until an admin clears them? Default in the plan is "stay forever, admin triages" — safer for v1.
