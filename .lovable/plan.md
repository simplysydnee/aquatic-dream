## The Bug

In the swimmer modal → **Payments tab**, the "Session fee" row shows **$45.00** for first-time swimmers. It should be **$240** (or session-specific price = `total_lessons × price_per_lesson`).

## Root Cause

`src/components/admin/swimmer/tabs/PaymentsTab.tsx` uses the wrong field for the session fee amount:

```ts
// Line 43, 167, 180
amount={Number(e.payment_amount ?? 240)}
```

`swim_enrollments.payment_amount` stores **what Stripe actually charged at checkout**, not the session fee. From `payments-webhook/index.ts` line 173:

```ts
const paymentAmount = isReturning ? sessionPrice : regFee; // first-time = $45
```

So:
- **Returning swimmers**: `payment_amount = 240` → row displays correctly
- **First-time swimmers**: `payment_amount = 45` (the reg fee) → session fee row wrongly shows $45

The $45 is the **registration fee**, not the session fee.

## Correct Source of Truth

Per `swim_sessions` table defaults and the rest of the codebase:

- `swim_sessions.session_price` = $240 (canonical session fee)
- This already equals `total_lessons (8) × price_per_lesson ($30)` = $240
- Edge functions (`send-session-payment-link`, `payments-webhook`, `create-checkout`) all read `session_price` correctly

`useSwimmers` does **not** currently select `session_price`, `total_lessons`, or `price_per_lesson` (line 205 of `src/hooks/useSwimmers.ts`), so the modal has no choice but to fall back to a hardcoded 240 — and worse, it falls back to `payment_amount` first.

## Fix

### 1. `src/hooks/useSwimmers.ts`
Extend the embedded `swim_sessions` select to include pricing fields:
```ts
session:swim_sessions(id, swim_level, day_of_week, start_time, end_time, age_group,
  session_period_id, session_price, total_lessons, price_per_lesson,
  period:session_periods(name, start_date, end_date))
```
Add `session_price`, `total_lessons`, `price_per_lesson` to the `SwimmerEnrollment["session"]` type.

### 2. `src/components/admin/swimmer/tabs/PaymentsTab.tsx`
Add a helper:
```ts
const sessionFeeFor = (e: SwimmerEnrollment) =>
  Number(e.session?.session_price
    ?? (e.session?.total_lessons && e.session?.price_per_lesson
        ? e.session.total_lessons * e.session.price_per_lesson
        : 240));
```

Replace all three `e.payment_amount ?? 240` usages (lines 43, 167, 180) with `sessionFeeFor(e)`. Outstanding balance calc gets fixed at the same time.

Also update the registration fee row to read `e.registration_fee ?? 45` instead of the hardcoded `45`.

### 3. Audit other spots (no change needed, just verifying)

Already correct:
- `payments-webhook/index.ts` — uses `session_price`
- `send-session-payment-link/index.ts` — uses `session_price`
- `cancel-enrollment-refund` — refunds the actual `session_fee_stripe_id` amount

Display-only hardcoded "$240" labels (acceptable, but could be parameterized later):
- `SwimEnrollmentsAdmin.tsx` SelectItem labels ("Due Day 1 ($240)", etc.)
- `EnrollmentDetailDialog.tsx` label "Session Fee ($240)"
- `SwimLessons.tsx` marketing copy

These are static UI labels matching the current price; not affected by the bug. Out of scope unless you also want them dynamic.

## Out of Scope

- Changing how Stripe charges or how the webhook stores data (it's correct).
- Re-doing the database. `payment_amount` is correct — the modal was just reading the wrong column.
- Making the marketing/static "$240" strings dynamic per session.

## Files Changed

- `src/hooks/useSwimmers.ts` — expand session select + type
- `src/components/admin/swimmer/tabs/PaymentsTab.tsx` — use `session.session_price` for session fee row + balance
