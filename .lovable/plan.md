
You're right — I conflated two things. Let me reset.

## What you're actually saying

- Stripe shows you only ever received **one** real payment: $280 + $45 from one parent.
- The admin UI is showing many enrollments as "paid" that were never paid in Stripe.
- That's not a duplicate-charge problem. That's a **data integrity bug**: rows are landing in `swim_enrollments` with `payment_status='paid'` without a corresponding Stripe charge.
- You don't want auto-refunds. You want the dashboard to tell the truth, and you want to know **how** these false-positive "paid" rows got created.

## Investigation plan (read-only first, no DB writes, no code changes)

I need to figure out where the bad "paid" rows came from before proposing any fix. Three possible sources:

1. **Admin manual edits** — someone toggled status to "paid" in the admin UI without a Stripe charge. The UPDATE policy on `swim_enrollments` allows any authenticated user to change anything.
2. **Old test/seed data** — rows inserted during development with `payment_status='paid'` hardcoded.
3. **Webhook firing on sandbox/test payments** — the webhook handler doesn't filter by env, so a sandbox `checkout.session.completed` event could insert "paid" rows tied to fake Stripe sessions.
4. **Direct INSERT via the public RLS policy** — `Anyone can submit swim enrollment` allows the public form to insert any value, including `payment_status='paid'`. The form likely doesn't set this, but worth confirming.

### Step 1 — Reconcile DB vs Stripe (no changes)
Query every `swim_enrollments` row, group by `payment_status` and `stripe_payment_id`. Cross-reference each non-null `stripe_payment_id` against the Stripe CSV you uploaded. Output a table:

```text
| Parent | Child | Session | DB status | DB amount | Stripe charge? | Stripe amount |
|--------|-------|---------|-----------|-----------|----------------|---------------|
| ...    | ...   | ...     | paid      | $280      | NO             | —             |
| ...    | ...   | ...     | paid      | $45       | YES            | $45           |
```

This gives you the exact list of rows where the DB lies.

### Step 2 — Trace each false "paid" row's origin
For each lying row, check `created_at` and look for matching `pending_enrollments` history, edge-function logs around that timestamp, and whether it has a `stripe_payment_id` at all (rows with `payment_status='paid'` AND `stripe_payment_id IS NULL` cannot have come from the webhook — they were either manually flipped or hardcoded).

### Step 3 — Identify the bug
Based on what step 2 shows, the fix is one of:
- Tighten the swim_enrollments RLS so the public form can only insert `payment_status='unpaid'`.
- Tighten the webhook so it requires a real Stripe charge object before marking paid.
- Lock down the admin "mark as paid" action behind a confirmation (and log who did it).

### Step 4 — Reconciliation report (one-time cleanup)
Produce a CSV of every false-paid row for your review. **You** decide row-by-row whether to revert it to `unpaid`, leave it, or delete. Nothing gets auto-changed.

## What I am NOT doing
- ❌ Auto-issuing refunds (never)
- ❌ Auto-waiving fees
- ❌ Auto-flipping any payment status
- ❌ Touching the `pending_enrollments` table
- ❌ Changing the $280 → $240 pricing yet (separate decision, was already in the queue)

## What I need from you to proceed

Once you approve, I'll switch out of plan mode and run the read-only DB queries + Stripe CSV cross-reference, then come back with the reconciliation report and the actual root cause. After you see the report we'll decide what to fix in code and what to clean up in the data.
