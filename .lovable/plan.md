
User clarification: each first-time child pays their own $45 registration fee (not one per family).

## Plan: Fix registration fee bypass — server-authoritative pricing

### Root cause
`getCheckoutPriceIds()` in `SwimEnrollment.tsx` builds Stripe line items from client state independently of DB amounts. When any child is first-time, it sends ONLY `registration_fee` to Stripe — skipping session fees for returning siblings.

### Pricing rules (corrected)
- **Each first-time child**: $45 registration fee per child (session fee deferred to first lesson)
- **Each returning child**: full session fee per session enrolled, upfront
- Mixed family: sum of both

### Fix
Make `create-checkout` the source of truth. Frontend passes `enrollmentIds`; server queries DB and builds line items.

1. **`supabase/functions/create-checkout/index.ts`**
   - Accept `enrollmentIds: string[]` (instead of `priceIds`)
   - Query `swim_enrollments` (service role) for those IDs
   - For each enrollment:
     - `is_first_time = true` → 1× `registration_fee` line item
     - `is_first_time = false` → 1× `swim_session_fee` line item per enrollment row
   - Set `metadata.enrollmentIds` (comma-separated) so webhook can mark all paid

2. **Update DB row generation in `SwimEnrollment.tsx` `handleLegalSubmit`**
   - Remove the "only first child gets reg fee" logic
   - Each first-time child's enrollment row gets `registration_fee = 45`
   - `payment_amount` for first-time = $45 only (session deferred); for returning = session_price

3. **`src/components/swim-enrollment/EnrollmentCheckout.tsx`**
   - Replace `priceIds` prop with `enrollmentIds: string[]`
   - Pass `enrollmentIds` to edge function

4. **`src/pages/SwimEnrollment.tsx`**
   - Remove `getCheckoutPriceIds()`
   - Pass `enrollmentIds={enrollmentIds}` to `<EnrollmentCheckout>`

5. **`supabase/functions/payments-webhook/index.ts`**
   - Verify it reads `metadata.enrollmentIds` (array/CSV) and updates all matching rows to `payment_status = 'paid'`. Update if it currently handles only a single ID.

### Test scenarios
| Scenario | Expected charge |
|---|---|
| 1 first-time child | $45 |
| 1 returning child (1 session) | $280 |
| 2 first-time children | $90 ($45 × 2) |
| 1 first-time + 1 returning | $45 + $280 = $325 |
| 2 returning children | $560 |

### Files changed
- `supabase/functions/create-checkout/index.ts`
- `supabase/functions/payments-webhook/index.ts` (verify/update)
- `src/components/swim-enrollment/EnrollmentCheckout.tsx`
- `src/pages/SwimEnrollment.tsx`
