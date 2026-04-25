## Problem

When a first-time client signs up for **two sessions in one checkout** (e.g. Giana Bansal today), the webhook creates two enrollment rows and charges the $45 registration fee correctly only once. But the second row is mislabeled:

| Row | registration_fee | payment_status | session_fee_status |
|-----|------------------|----------------|--------------------|
| Session 1 | $45 | `paid` ✓ | `due_day_1` ✓ |
| Session 2 | $0 | `unpaid` ✗ | `due_day_1` ✓ |

`payment_status: 'unpaid'` on row 2 makes it look like a $0 reg fee is owed. It should be `not_required` (the same status returning swimmers get, since the reg fee is a one-time charge already collected on row 1).

Session fees on both rows correctly stay as `due_day_1` — collected on day 1 of each session, exactly as you described.

## Fix

### 1. Webhook: stop labeling row 2+ as "unpaid"

In `supabase/functions/payments-webhook/index.ts` (line 164), change:

```ts
// before
const rowPaymentStatus = isReturning ? "not_required" : (chargeRegFee ? "paid" : "unpaid");

// after
const rowPaymentStatus = isReturning ? "not_required" : (chargeRegFee ? "paid" : "not_required");
```

Resulting reg-fee statuses:
- First-timer, session 1 → `paid` ($45 charged)
- First-timer, session 2+ → `not_required` (already collected on row 1)
- Returning swimmer, any session → `not_required` (waived for returners)

Session fee tracking (`session_fee_status`) is not touched — still `due_day_1` for first-timers, collected on day 1 of each individual session.

### 2. Backfill Giana Bansal's row

Update the existing second-session row (id `eec4bf57-e625-438c-90bb-e2642abe7418`) from `payment_status: 'unpaid'` → `'not_required'`.

### 3. Verify dashboard treats `not_required` correctly

Quick check of `SwimEnrollmentsAdmin.tsx` to confirm `'not_required'` is grouped with paid/waived/comp (no outstanding-balance flag, not counted as revenue). If not, add it.

## What is NOT changing

- Checkout flow, Stripe charges, prices — untouched
- Single-session enrollments — identical behavior
- Returning swimmers — identical behavior
- Session fee day-1 collection logic — untouched
- Webhook reconciliation — untouched
