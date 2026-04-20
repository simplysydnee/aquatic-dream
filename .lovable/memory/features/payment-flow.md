---
name: Payment Flow
description: Two-field payment model (reg fee + session fee), Stripe-only writers, day-1 collection rules
type: feature
---

## The model: two independent fields on `swim_enrollments`

- **`payment_status`** = REGISTRATION FEE ($45) only.
  Values: `paid` | `unpaid` | `refunded` | `waived` | `not_required` (returning swimmers).
- **`session_fee_status`** = SESSION FEE ($240) only.
  Values: `paid` | `due_day_1` | `comp`. Default `'due_day_1'`.
- **`session_fee_stripe_id`** + **`session_fee_paid_at`** capture the Stripe payment intent and timestamp when the $240 is collected via `send-session-payment-link`.

## The hard rules

- **First-time swimmer**: $45 reg fee at Stripe checkout (`payment_status='paid'`); $240 session fee is ALWAYS `session_fee_status='due_day_1'` — never charged at checkout.
- **Returning swimmer**: $240 charged at Stripe checkout → webhook sets `session_fee_status='paid'` with `session_fee_stripe_id`. `payment_status='not_required'`.
- **No Stripe = no enrollment row** (enforced by `payments-webhook` being the only insert path for Stripe-flow rows; admin-create-enrollment requires payment_method + payment_reference).
- **Webhook is the ONLY writer for `session_fee_status='paid'`** on Stripe-flow rows. Admin-recorded "paid" requires payment_method + payment_reference (cash receipt, check #).

## Day-1 collection ($240 session fee)

For first-timers (and grace returning rows), $240 is collected at the first lesson EITHER as:
1. **Stripe link** — admin clicks "Send $240 Payment Link" on the row → `send-session-payment-link` creates a Stripe checkout with `metadata.type='session_fee'`. On `checkout.session.completed`, webhook flips `session_fee_status='paid'` and stamps `session_fee_stripe_id`.
2. **Cash/check at door** — admin manually changes the dropdown to `paid` and records `payment_method` + `payment_reference` (e.g., "Cash receipt #123").

## Dashboard math

- **Owed Now** = (first-time + reg fee unpaid × $45) + (returning + `session_fee_status='due_day_1'` × $240). Shrinks to $0 as Mejia grace pays.
- **Day-1 Collection** = COUNT(`session_fee_status='due_day_1'`) × $240.
- **Revenue Collected** = ($45 × paid reg fees) + ($240 × paid session fees).

## 2026-04-20 grace exception (one-time)

5 rows existed before lockdown:
- Erwins ×2 + Destiny (first-timers): reg fee `waived`, session fee `due_day_1` (standard).
- Mejia ×2 (returning): registration `not_required`, session fee `due_day_1` (one-time grace; future returning swimmers must pay $240 at checkout).

Going forward: no row may exist with `session_fee_status='due_day_1'` for a returning swimmer.
