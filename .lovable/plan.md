

## Findings: Scenario A confirmed

Both Madeline rows were inserted in the **same transaction** (identical `created_at` to the microsecond). The parent enrolled her in both Session 1 (June 8) and Session 2 (July 13) in one submission, self-reporting "returning swimmer" — so no reg fee was charged.

A simple `BEFORE INSERT` trigger that queries existing rows wouldn't catch this either, because at trigger-fire time for row A, row B hasn't been inserted yet (and vice versa) — but both are equally "new". The trigger would correctly force `is_first_time = true` on both, which is the right outcome.

## Plan: Postgres trigger to enforce true first-time detection

### Single migration

Create `BEFORE INSERT` trigger on `swim_enrollments` that:

1. Looks up prior **committed** enrollments matching `lower(parent_email)` AND `lower(trim(child_name))` with `created_at < now()` (excludes same-batch siblings).
2. If **zero** prior records exist → force `NEW.is_first_time = true` and `NEW.registration_fee = 45` (overrides whatever client sent).
3. If prior records exist → leave client values alone (parent legitimately is returning).

### Why this works for Madeline's case
- Both rows insert in same transaction → both find zero prior history → both forced to `is_first_time = true` with `registration_fee = 45`.
- Then `create-checkout` (already server-authoritative since yesterday) reads `is_first_time = true` from DB and adds the registration_fee Stripe line item.
- Net charge for Madeline's scenario going forward: $45 reg fee + $0 session (deferred) = $45 collected at checkout, sessions paid on first lesson day. Matches the documented payment flow.

### Edge cases handled
- **Multi-child families** (different `child_name`, same `parent_email`) → each child evaluated independently, correct.
- **Returning swimmer adding a new session** → prior row exists, trigger leaves `is_first_time = false` alone, correct.
- **Admin manual entry** → same trigger applies, prevents admin mistakes too.

### Files changed
- New migration: create `enforce_first_time_swimmer()` function + `BEFORE INSERT` trigger on `swim_enrollments`.

### Not changed (already correct since yesterday)
- `create-checkout/index.ts` — already reads `is_first_time` and `registration_fee` from DB.
- `SwimEnrollment.tsx` — client can still send whatever; trigger overrides.

### Out of scope
- Backfilling Madeline's record (per your direction — won't make her pay).
- Admin warning UI for conflicting self-reports — can add later if desired.

