---
name: Cancellation & Refunds
description: Setting status='cancelled' on a swim enrollment opens a confirm dialog and (optionally) issues Stripe refunds via the cancel-enrollment-refund edge function
type: feature
---

## Flow

When admin changes enrollment `status` to **Cancelled** in `SwimEnrollmentsAdmin.tsx`:
1. UI intercepts the change and opens an AlertDialog (no DB write yet).
2. Dialog previews refundable charges from `payment_status='paid'` + `stripe_payment_id`, and `session_fee_status='paid'` + `session_fee_stripe_id`.
3. Admin checks/unchecks "Issue Stripe refund(s)" and writes a reason.
4. On confirm → calls edge function `cancel-enrollment-refund` (verify_jwt=true, admin role required).

## Edge function: `cancel-enrollment-refund`

- Resolves stored Stripe IDs (cs_/pi_/ch_) → payment_intent → `stripe.refunds.create`.
- Refunds session fee → flips `session_fee_status='refunded'` + stamps `session_fee_refund_stripe_id`, `session_fee_refund_at`, `session_fee_refund_amount`, `session_fee_refund_reason`.
- Refunds initial payment → flips `payment_status='refunded'`.
- Always sets `status='cancelled'` and appends a dated note with the admin's reason.
- Sends parent a cancellation email (best-effort, non-fatal).

## Hard rules

- Only admins (checked via `has_role(_user_id, 'admin')`) can invoke.
- If `refund=false` is passed, the row is cancelled with NO Stripe call.
- Comp / unpaid rows are cancelled without refund (nothing to refund).
- Failed refunds are reported in `refundResults` but the row is still cancelled — admin sees a destructive toast listing failed refund errors.
