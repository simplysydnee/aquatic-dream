## What's broken

Stripe's `swim_session_fee` price (lookup key used by `create-checkout`) is set to **$280** in live mode, but our app and emails treat the session fee as **$240** (`swim_sessions.session_price`).

Every returning swimmer who checked out via the public flow was actually charged **$280** at Stripe while the database recorded only **$240**. Two confirmed victims so far:

| Swimmer | Parent email | Stripe charge ID | Date | Over by |
|---|---|---|---|---|
| Aniya Danhoff | sarah.danhoff@yahoo.com | `pi_3TMw742HpbBBx5ls1PSIXps8` | 2026-04-16 | $40 |
| Micah Gonzales | gabriela.gonzales4623@gmail.com | `pi_3TUYPC2HpbBBx5ls0IvX31hL` | 2026-05-07 | $40 |

The reconciliation alert subsystem caught Micah's overcharge (row exists in `payment_reconciliation_alerts`), but no one acted on it and the underlying price was never corrected. Aniya was charged before alerts existed.

## Plan

### 1. Refund the $40 to both families (one-shot script)

Run a one-time Edge Function call against Stripe (live env) using the existing `_shared/stripe.ts` gateway client to issue two partial refunds of $40.00:
- Refund $40 against `pi_3TMw742HpbBBx5ls1PSIXps8` (Danhoff)
- Refund $40 against `pi_3TUYPC2HpbBBx5ls0IvX31hL` (Gonzales)

After Stripe confirms each refund, mark the matching `payment_reconciliation_alerts` row as resolved with a note, and email each parent a short apology + refund confirmation using the existing `admin-freeform` transactional template.

### 2. Eliminate the price-drift class of bug for good

Root cause: `create-checkout/index.ts` uses Stripe `lookup_keys` (`swim_session_fee`, `registration_fee`). The DB has its own truth (`swim_sessions.session_price`, `swim_enrollments.registration_fee` default 45). When the two diverge, customers get charged the Stripe number while the DB / receipts show ours.

Switch `create-checkout` to **inline `price_data`** (the same pattern already used for donations / lesson occurrence checkout). Server reads `session.session_price` and `45` (or per-row registration_fee), and builds line items with `price_data.unit_amount = sessionPrice * 100`. No more `lookup_keys`. The DB becomes the single source of truth and Stripe can never drift.

Keep the existing `payments-webhook` reconciliation logic as a safety net but it should now always pass.

### 3. First-time checkout UX: choose pay-now vs pay-day-1 for the $240

Current first-timer flow: only $45 reg fee at checkout, $240 always due day 1.
New flow on the public Swim Enrollment "Review & Pay" step:

- Returning swimmer → unchanged: $240 charged at checkout.
- First-time swimmer → new toggle on the review step:
  - **"Pay registration only ($45)"** *(default)* — current behavior. $240 due day 1.
  - **"Pay registration + first session ($45 + $240 = $285)"** — adds the session-fee line item to the same Stripe checkout. Webhook stamps `session_fee_status='paid'` for that row, no day-1 collection needed.

Implementation:
- Add `payAhead: boolean` per child in the `EnrollmentForm` payload.
- `create-checkout` adds the session-fee `price_data` line when `payAhead && isFirstTime`.
- `payments-webhook` reads `payAhead` from the staged `pending_enrollments.payload` and sets `session_fee_status='paid'` + `session_fee_stripe_id` on rows where it's true.
- Confirmation email already has a `totalPaid` branch — extend the template-data shaping so first-timers who paid ahead see one combined "Total paid" line instead of "due day 1".

### 4. Admin defensive guard

Add a server-side sanity check in `create-checkout` and `send-session-payment-link`: if any computed Stripe `unit_amount` differs from `session.session_price * 100`, log loudly and refuse to create the checkout. This prevents future regressions if anyone re-introduces lookup keys.

## Out of scope

- Touching the "send $240 payment link" admin flow's UI — only its server-side amount calculation.
- Changing prices for anyone already enrolled.
- Refactoring the swimmer modal Payments tab (already correct after the prior fix).

## Files changed

- `supabase/functions/create-checkout/index.ts` — switch to inline `price_data`, support `payAhead` for first-timers, defensive amount check.
- `supabase/functions/payments-webhook/index.ts` — when `payAhead` is true on a first-timer row, set `session_fee_status='paid'` + stamp the Stripe id; adjust `payment_amount` accounting.
- `supabase/functions/send-session-payment-link/index.ts` — same defensive check; ensure it always uses `session.session_price` directly.
- `src/components/swim-enrollment/EnrollmentForm.tsx` (and review step) — add per-child "Pay session fee now?" toggle for first-timers.
- `src/components/swim-enrollment/types.ts` — add `payAhead` to payload type.
- New one-shot Edge Function `supabase/functions/admin-issue-refund/index.ts` (admin-only) used to run the two $40 refunds; reusable later for any reconciliation alert. Deletable after run if you prefer.

## Verification

- After step 1, both `payment_reconciliation_alerts` rows show `resolved_at` and the Stripe dashboard shows `amount_refunded: 40.00` on each PI.
- After step 2, run a sandbox checkout for a returning swimmer and confirm `amount_total` on the Stripe session = $24000 cents and the new reconciliation alert table has zero new rows.
- After step 3, run sandbox first-timer checkouts both ways: with toggle off (charged $45, row `session_fee_status='due_day_1'`) and toggle on (charged $285, row `session_fee_status='paid'`).
