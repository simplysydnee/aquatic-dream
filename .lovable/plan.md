## Revenue Calculation Fix

Fix the "Revenue Collected" stat on `/admin/enrollments` to match Stripe ($415).

### Changes

**1. `src/pages/admin/SwimEnrollmentsAdmin.tsx`** — replace the revenue calculation (lines ~209-216) to:
- Sum actual `payment_amount` from the DB instead of multiplying by hardcoded constants
- Exclude rows where `payment_status = 'refunded'` or `session_fee_status = 'refunded'`
- Fall back to constants only when `payment_amount` is null

```typescript
const revenueCollected = activeEnrollments.reduce((sum, e) => {
  if (e.payment_status === "refunded" || e.session_fee_status === "refunded") return sum;
  let amt = 0;
  if (e.payment_status === "paid") {
    amt += Number(e.payment_amount ?? (e.is_first_time ? REG_FEE : SESSION_FEE));
  }
  if (e.session_fee_status === "paid" && e.payment_status !== "paid") {
    amt += SESSION_FEE;
  }
  return sum + amt;
}, 0);
```

**2. Data correction** — update Sarah Danhoff's enrollment `payment_amount` from `240` → `280` to match Stripe's actual charge.

**3. UI note** — add small "matches Stripe net" hint under the Revenue Collected card.

### Safety

- Touches ONLY display logic on the admin enrollments page
- Does NOT modify checkout, Stripe webhooks, enrollment creation, payment processing, or any other flow
- Data update is a single UPDATE on one row's `payment_amount` field
