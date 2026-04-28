## Goal

1. Delete the one-off `admin-fix-monica-overcharge` edge function (no longer needed).
2. Fix the broken interaction between the `enforce_first_time_swimmer` DB trigger and the `payments-webhook` insert path that produced Monica's confusing row state and risks future financial discrepancies.
3. Correct Monica's two enrollment rows so the data matches what was actually charged.

## Root cause: trigger ↔ webhook conflict

Three things collide today:

- **`create-checkout`** decides what to charge in Stripe based ONLY on the `isFirstTime` flag the client sent. Returning → `swim_session_fee` × N sessions. First-time → one `registration_fee` ($45). It does NOT consult the DB.
- **`payments-webhook`** inserts enrollment rows with `is_first_time` / `registration_fee` / `payment_status` consistent with what was charged.
- **`enforce_first_time_swimmer` trigger** (`BEFORE INSERT`) overrides those values: if no prior committed row exists for `(parent_email, child_name)`, it forces `is_first_time=true` and `registration_fee=45` — even if Stripe never collected $45.

Symptoms confirmed in DB:

- **Monica / John Poses (2 sessions, returning):** Stripe charged 2 × $280 (now refunded $80 → $480 net = 2 × $240). Webhook tried to insert two returning rows. Trigger flipped row 1 to `is_first_time=true, registration_fee=45` because no prior John Poses row existed. Row 2 was inserted second, saw row 1, kept `is_first_time=false`. Net effect: DB claims $45 reg fee was paid that was never charged, and `payment_status='not_required'` on the "first-time" row contradicts `registration_fee=45`.
- **Casey Turk / Giana Bansal (first-time, 2 sessions each):** First row `payment_amount=$45 / paid`, second row `payment_amount=$0 / not_required`. This part is actually correct (one $45 fee per child).
- **General risk:** any returning customer enrolling a child with no prior DB record gets silently flipped to first-time in the DB, creating a permanent $45 phantom receivable.

## Changes

### 1. Delete one-off function

Remove `supabase/functions/admin-fix-monica-overcharge/` and call `supabase--delete_edge_functions` to deprovision it.

### 2. Make the trigger respect the webhook

Rewrite `enforce_first_time_swimmer` so it only sets defaults when the inserter did NOT explicitly stamp `is_first_time` and `registration_fee`. The webhook is the authoritative source because it knows what Stripe actually charged.

New behavior:

- If the row being inserted already has `is_first_time` AND `registration_fee` set (i.e. `IS NOT NULL`), trust them and pass through unchanged. The webhook always sets both, so this is the normal path.
- Only when both are NULL (legacy/manual paths that skip the values) does it auto-detect first-time status from prior rows and stamp $45.
- Keep behavior identical for `admin-create-enrollment` (admin path already supplies these fields explicitly, so it will be unchanged).

This eliminates the silent flip while preserving the safety net for inserts that omit the fields.

### 3. Webhook: enforce one reg fee per child per checkout

In `payments-webhook` `handleCheckoutCompleted`, the current logic already only stamps `registration_fee=45` on `i === 0` for first-time children. Verify and tighten the comment. No functional change expected, but add an explicit assertion: for returning children we set `registration_fee=0` and `payment_status='not_required'` on every row — which combined with the trigger fix above will now persist correctly.

### 4. Reconcile Monica's two rows

One-off SQL migration to reflect what was actually charged ($240 per session, $0 reg fee, no first-time):

- Row `b8985e08…` (currently is_first_time=true, registration_fee=45): set `is_first_time=false`, `registration_fee=0`. Keep `payment_amount=240`, `session_fee_status='paid'`, `session_fee_stripe_id`, `session_fee_paid_at`.
- Row `34c143e2…` (already is_first_time=false): no change needed beyond verification.
- Both rows already carry the $40-each refund record from yesterday's fix.

### 5. Audit query (informational, no change)

Run a SELECT to surface any other rows where `registration_fee=45` but the child's parent has prior committed enrollments — these are likely other victims of the same trigger flip. Report findings to user; do not auto-modify.

## Technical details

**Files modified**
- DELETE: `supabase/functions/admin-fix-monica-overcharge/index.ts`
- NEW migration: rewrite `public.enforce_first_time_swimmer()` function body
- NEW migration: UPDATE statement for Monica's row `b8985e08-0884-4bd3-8dc4-8bea97e86217`
- EDIT: `supabase/functions/payments-webhook/index.ts` — comment clarification + explicit nulling guard for returning rows (defensive)

**Trigger function (new body, sketch)**

```sql
CREATE OR REPLACE FUNCTION public.enforce_first_time_swimmer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE prior_count INTEGER;
BEGIN
  -- If the caller stamped both fields, trust them (webhook + admin path).
  IF NEW.is_first_time IS NOT NULL AND NEW.registration_fee IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO prior_count
  FROM public.swim_enrollments
  WHERE lower(parent_email) = lower(NEW.parent_email)
    AND lower(trim(child_name)) = lower(trim(NEW.child_name))
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF prior_count = 0 THEN
    NEW.is_first_time := COALESCE(NEW.is_first_time, true);
    NEW.registration_fee := COALESCE(NEW.registration_fee, 45);
  ELSE
    NEW.is_first_time := COALESCE(NEW.is_first_time, false);
    NEW.registration_fee := COALESCE(NEW.registration_fee, 0);
  END IF;

  RETURN NEW;
END;
$$;
```

**Out of scope for this fix**

- No change to `create-checkout` line-item logic — current rule (first-time → $45 only; returning → $240 × sessions) matches the stated business rule and is correct.
- No change to Stripe price (already $240 after yesterday).
- Reconciliation alerts table and `payments-webhook` two-way reconciliation stay as-is.

## After approval, expected outcome

- Monica's DB: 2 returning rows, $240 each, no phantom reg fee, refund record intact.
- Future returning customers: trigger no longer overrides webhook values.
- Future first-time customers: still pay $45 at checkout, still get one $45 reg fee row, $240 session fee due day 1 — unchanged.
