## Goal
Tighten payment marking so a lesson occurrence is **only** marked paid when we have a verified Stripe confirmation, fix the legacy "expired session ID" pattern that creates the discrepancy you're seeing, and add a reconciliation tool that uses the Stripe API to audit every "paid" row.

## Findings on Holden Hamby
Verified via Stripe API (`STRIPE_LIVE_API_KEY`):
- May 4 — Paid ($40, `pi_3TSJjp...`, succeeded) ✅
- May 5 — Expired checkout session (`cs_live_...`, **never paid**), DB correctly shows `flagged_no_pay` ✅
- May 6 — Paid ($40, `pi_3TTipG...`, succeeded) ✅

The two real payments match Stripe exactly. The May 5 row holds a `cs_live_...` ID from a payment link the parent never completed. That's the "extra" you're seeing — it looks like a Stripe ID but it's an expired session, not a charge.

## Changes

### 1. Lock down the "Mark paid" button (CalendarBlockDetail.tsx)
Today the cash/manual button writes `payment_status: 'paid'` with no reference number. Change it to require either:
- A Stripe Payment Intent ID (`pi_...`), OR
- A non-empty `payment_method` + `payment_reference` (e.g. "Cash — receipt #123", "Check #4412", "Comp")

Replace the single "Mark paid (cash / other)" button with a small dialog that asks for method + reference, and store both on the row. No reference = button stays disabled. This matches the rule already enforced for swim enrollments.

### 2. Stop storing un-paid `cs_live_...` IDs as if they were confirmations
In `send-lesson-booking-confirmation` and the payment-link flow, the checkout **session** ID is being written to `stripe_session_id` at link-send time. That's why expired sessions look like proof of payment. Move that ID to a new column `stripe_checkout_session_id` (link tracking only) and reserve `stripe_session_id` exclusively for the **payment intent** written by the webhook on `checkout.session.completed`. Migrate existing rows: any `payment_status != 'paid'` row whose `stripe_session_id` starts with `cs_` gets that value moved to the new column and `stripe_session_id` cleared.

### 3. Webhook: verify before marking paid
In `payments-webhook` `handleLessonBookingPaid` / `handleLessonSeriesPaid`, only flip to `paid` when:
- `checkoutSession.payment_status === 'paid'`, AND
- a real `payment_intent` is present (write that, never the `cs_` ID)

Today it accepts the session ID as a fallback — that's how the bad pattern leaks in.

### 4. Add a DB constraint
`CHECK (payment_status <> 'paid' OR stripe_session_id LIKE 'pi_%' OR (payment_method IS NOT NULL AND payment_reference IS NOT NULL))`
Prevents any future code path from marking a row paid without proof.

### 5. New reconciliation edge function: `reconcile-lesson-payments`
Admin-triggered (button on Calendar admin → "Reconcile Stripe"). For every occurrence with `payment_status='paid'` over a chosen date range:
- If `stripe_session_id` starts with `pi_`, fetch the Payment Intent via Stripe API and confirm `status='succeeded'` and amount matches `price_per_session * 100`.
- If it doesn't (or the ID is a `cs_` that didn't complete), flag the row as `payment_status='discrepancy'` and surface it in a results panel listing: child, date, expected amount, Stripe status, link to Stripe.
- Manual cash/check rows (no `pi_`) are listed separately as "manual — not auto-verifiable" so you can spot-check them.

Output is a downloadable CSV plus an on-screen list. Read-only by default; "Apply fixes" button to write the `discrepancy` flag.

### 6. UI: badge clarity
- Replace the green "Paid" badge with "Paid (Stripe)" when `pi_` present, "Paid (cash)"/"Paid (check)" etc. when manual.
- Show a small red "Unverified" pill on any paid row that still has a `cs_` ID after migration (should be zero post-migration but defensive).

## Files touched
- `src/components/admin/calendar/CalendarBlockDetail.tsx` — Mark-paid dialog, badge variants
- `src/pages/admin/CalendarAdmin.tsx` — "Reconcile Stripe" button + results modal
- `supabase/functions/payments-webhook/index.ts` — Stricter paid logic
- `supabase/functions/send-lesson-booking-confirmation/index.ts` — Write to new `stripe_checkout_session_id` column
- `supabase/functions/reconcile-lesson-payments/index.ts` — **new**
- `supabase/config.toml` — register new function (`verify_jwt = true`, admin-only)
- DB migration — add `payment_method`, `payment_reference`, `stripe_checkout_session_id` columns (if missing); backfill; add CHECK constraint; data-clean existing `cs_` IDs on non-paid rows.

## Out of scope
- No change to Holden's actual data needed — it already matches Stripe. Reconciliation will confirm that on first run.

Approve and I'll implement.