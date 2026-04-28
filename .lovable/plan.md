# Fix Monica Prieto Overcharge — Option A

## What happened (confirmed from data)

Monica Prieto (`mprieto20042000@yahoo.com`) enrolled child **John Poses** in **two** Reef Explorers sessions:
- Row 1: `is_first_time=true`, session `64287fc1...` (Jun 8 – Jul 2), DB `session_price=$240`
- Row 2: `is_first_time=false`, session `7650a624...` (Jul 13 – Aug 6), DB `session_price=$240`

Both rows share the **same Stripe checkout** `cs_live_b1xyOr74R9PdpjlSAKrIocC8SXqV1CXbq7cWTtJorrZXGoL7WZC6DL7VAO`. Both have `payment_status=not_required` and `session_fee_status=paid`.

**Expected charge**: $45 reg fee (first-time) + $240 (first session) + $240 (second session) = **$525**, OR if the first-time rule applied (reg fee only at checkout, $240 day-1), then $45 + $240 = **$285**.

**Actual Stripe charge**: $560 — consistent with **$280 × 2 sessions** and no $45 reg fee billed (the first-time rule appears to have been bypassed because both rows ended up `payment_status=not_required`; this is a second bug).

## Root cause

`create-checkout` resolves line items by Stripe `lookup_key='swim_session_fee'`. Whatever amount lives on that Stripe price is what the customer pays — the DB `swim_sessions.session_price` ($240) is ignored. The Stripe price for this lookup key is currently **$280**, so each returning-session line item charged $280.

The `payments-webhook` reconciler only flags **undercharges** (Stripe < DB sum), so the +$80 overcharge passed silently.

## The fix (Option A)

### 1. Issue $80 refund to Monica

Partial refund on `cs_live_b1xyOr74R9PdpjlSAKrIocC8SXqV1CXbq7cWTtJorrZXGoL7WZC6DL7VAO` for $80.00 via a one-off admin script (edge function invocation using `createStripeClient('live')` → `stripe.refunds.create({ payment_intent, amount: 8000, reason: 'requested_by_customer' })`). Log the refund ID on both enrollment rows in a new `session_fee_refund_stripe_id` column (added in step 3).

### 2. Sync Stripe `swim_session_fee` price to $240

Use `payments--create_price` to create a new price with `id='swim_session_fee'`, `amount=24000`, `currency='usd'`, `quantity_min=1`, `quantity_max=1`. Stripe transfers the `lookup_key` to the new price automatically; old $280 price is archived. Future checkouts immediately use $240.

### 3. Strict two-way reconciliation in `payments-webhook`

In the `checkout.session.completed` handler, after computing the expected total from the DB rows being inserted (registration_fee sum + session_price sum for returning rows), compare to `session.amount_total`:
- If `stripe_total < expected`: log `RECONCILIATION_UNDERCHARGE` (existing behavior).
- If `stripe_total > expected`: log `RECONCILIATION_OVERCHARGE` with the delta, the session ID, and the enrollment IDs, and insert a row into a new `payment_reconciliation_alerts` table so admins see it on the dashboard.
- If equal: proceed silently.

Do NOT block the enrollment insert in either case — the customer already paid; we just need visibility.

### 4. Audit other affected customers

Run a one-off SQL audit:
```sql
-- Pseudocode — actual query joins swim_enrollments to grouped Stripe session totals
SELECT session_fee_stripe_id, COUNT(*), SUM(...)
FROM swim_enrollments
WHERE session_fee_status='paid' AND session_fee_stripe_id LIKE 'cs_live_%'
GROUP BY session_fee_stripe_id;
```
Then for each `cs_live_*`, fetch the actual Stripe `amount_total` and compare to the expected $240 × returning-row-count + $45 × first-time-row-count. List any other customer who paid $280/session and queue refunds.

### 5. Schema additions

```sql
ALTER TABLE swim_enrollments
  ADD COLUMN session_fee_refund_stripe_id text,
  ADD COLUMN session_fee_refund_amount numeric,
  ADD COLUMN session_fee_refund_at timestamptz;

CREATE TABLE payment_reconciliation_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_checkout_session_id text NOT NULL,
  expected_amount numeric NOT NULL,
  actual_amount numeric NOT NULL,
  delta numeric NOT NULL,
  direction text NOT NULL CHECK (direction IN ('overcharge','undercharge')),
  enrollment_ids uuid[],
  resolved_at timestamptz,
  resolved_by uuid,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE payment_reconciliation_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage alerts" ON payment_reconciliation_alerts
  FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'));
```

## Files to change

- **New migration**: schema additions above
- **`supabase/functions/payments-webhook/index.ts`**: add two-way reconciliation + alert insert
- **New edge function `admin-refund-session-fee`**: takes `enrollmentId` + `amountCents`, creates Stripe refund, writes refund fields back to row (used both for Monica now and any future overcharge resolution)
- **Stripe price sync** via `payments--create_price` (no code change, tool call)
- **Audit script** (one-off): list all live `cs_*` checkouts where Stripe total > expected DB sum

## Out of scope (flag for follow-up)

- The `payment_status=not_required` on Monica's first-time row suggests the first-time/$45-reg-fee branching also misfired for her — worth a separate investigation, but **not** part of this fix. (May simply be that admin reclassified, or the multi-child first-time path collapsed both into "returning". I'll need to re-read `create-checkout` line-item logic and webhook insert path to confirm before touching it.)
- Architectural Option B (DB-driven `price_data`) is deferred — Option A keeps the lookup-key contract intact and is the minimum change to stop the bleeding.
