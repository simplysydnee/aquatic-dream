
You're right — I drifted. Reverting to the **original, correct rule** that's already documented in memory:

## The rule (unchanged, restated)

- **First-time:** $45 reg fee at Stripe checkout. $240 session fee due day 1 (cash/check at door).
- **Returning:** $240 full session fee at Stripe checkout. Nothing owed day 1.
- **No Stripe = no enrollment row.** (Already enforced at DB level last round.)

Current `create-checkout` already does this correctly. **No backend changes needed.**

## The 5 grace rows (one-time cleanup)

These were created before the lockdown and never paid through Stripe properly:

- **Kade Erwin, Fallon Erwin, Destiny Godinez (unpaid row)** — first-timers, never paid the $45 reg fee. Waive the reg fee (one-time grace), still owe **$240 day 1** per the standard rule.
- **Madeline Mejia (×2)** — returning swimmer (prior to current ownership). Per rule, she should have paid $240 at checkout but didn't. One-time grace: collect **$240 day 1**.

```sql
-- 3 first-timers: waive reg fee, $240 still due day 1 (standard first-time rule)
UPDATE swim_enrollments SET
  payment_status = 'waived',
  payment_method = 'comp',
  payment_reference = 'Reg fee waived 2026-04-20 — rollout grace',
  registration_fee = 0,
  notes = COALESCE(notes || E'\n', '') || 'Reg fee waived 2026-04-20. $240 due day 1 per standard first-time rule.'
WHERE id IN (<Kade>, <Fallon>, <Destiny-unpaid>);

-- Mejia ×2: returning, $240 due day 1 (one-time grace; normally would pay at checkout)
UPDATE swim_enrollments SET
  is_first_time = false,
  registration_fee = 0,
  payment_method = 'cash',
  payment_reference = 'Pending — day 1 collection (rollout grace)',
  notes = COALESCE(notes || E'\n', '') || 'Returning (prior ownership). $240 due day 1, 2026-04-20 — one-time grace; future returning swimmers must pay at checkout.'
WHERE id IN (<Mejia-1>, <Mejia-2>);
```

## Dashboard math fix (`SwimEnrollmentsAdmin.tsx`)

Replace the broken Outstanding/Capacity cards. **No backend changes.**

**Owed Now** (overdue, should never grow going forward):
- Returning + unpaid → `+ $240`
- First-time + reg fee unpaid (not waived) → `+ $45`
- After cleanup: **$0**

**Day-1 Collection** (cash/check at first lesson — normal for first-timers):
- Every active first-timer → `+ $240` (whether reg paid, unpaid, or waived)
- Plus the 2 Mejia grace rows
- After cleanup: **$1,200** (5 swimmers × $240)
- Subtitle: "3 first-timers (standard) + 2 returning (one-time grace)"

**Capacity Used** — replace 7/192 nonsense:
- "**7 / 64 classes started**" (classes with ≥1 enrollment)
- Subtitle: "11% of classes started · avg 1.0 of 3 seats per filled class"
- Respects period/age filters

Add `'waived'` option to the per-row payment status dropdown.

## Files touched

- New migration: 5-row UPDATE only
- `src/pages/admin/SwimEnrollmentsAdmin.tsx` — fix Outstanding + Capacity cards, add Day-1 Collection card, expose `'waived'` in dropdown
- `mem://features/payment-flow` — add note: "2026-04-20 grace rows are one-time exception. Going forward: first-time = $45 at checkout + $240 day 1; returning = $240 at checkout, $0 day 1."

## Not doing

- ❌ No changes to `create-checkout` (already correct)
- ❌ No changes to `payments-webhook` (already correct)
- ❌ No refunds
- ❌ No changes to Aniya (fully paid) or paid Destiny reg row
