

User's rule: **No Stripe = no enrollment row.** Period.
- First-time: must pay $45 reg fee at checkout. Session fee due day 1 (tracked, not charged at checkout).
- Returning: must pay full session fee at checkout.
- If Stripe doesn't confirm, no row gets created. Admin dashboard = source of truth, always matches Stripe.

## Root cause of the current mess

1. **Public RLS allows anyone to INSERT into `swim_enrollments` directly** — bypassing Stripe entirely. The enrollment form, walk-in dialog, and any client code can create rows with arbitrary `payment_status`. This is how the false "paid" rows got there.
2. **Webhook stores expected amount, not actual amount** — `payment_amount = registration_fee + session_price` instead of `session.amount_total`. That's why DeLeon shows $285 paid when Stripe only got $45.
3. **No DB constraint** ties an enrollment to a real Stripe payment.

## Fix — lock it down at the database level

### 1. Revoke public INSERT on `swim_enrollments`
- Drop policy `Anyone can submit swim enrollment`.
- Only the **service role** (used by `payments-webhook` after Stripe confirms) can insert enrollment rows.
- Keep public SELECT for capacity counts (anonymized).

### 2. Refactor enrollment flow to "Stripe-first"
- Public form collects data → posts to `create-checkout` → row goes into `pending_enrollments` only.
- No `swim_enrollments` row exists until `payments-webhook` receives `checkout.session.completed` from Stripe.
- If user abandons checkout: pending row expires (cleanup job, 24h), nothing in enrollments, seat freed.

### 3. Walk-in / admin manual enrollment path (separate, explicit)
- Admin-only edge function `admin-create-enrollment` (requires authenticated admin role) for legitimate offline cases (cash, walk-ins, comps).
- Required fields: `payment_method` ∈ `{stripe, cash, check, comp, walk_in}` and `payment_reference` (Stripe charge ID OR free-text note like "cash 4/20 receipt #123").
- Stored on the row so every "paid" enrollment is traceable.
- Update `AddSwimmerDialog.tsx` to call this function instead of inserting directly.

### 4. Webhook fixes (`supabase/functions/payments-webhook/index.ts`)
- Use `session.amount_total / 100` for the actual `payment_amount`, split per-row by what was billed.
- For first-time swimmers: insert row with `payment_status='paid'` (reg fee paid), `payment_amount=45`, plus a flag indicating the session fee is still due day 1.
- Add a derived field shown in admin: **Day-1 amount due**.

### 5. New schema additions (migration)
On `swim_enrollments`:
- `payment_method text` (default `'stripe'`)
- `payment_reference text` (Stripe charge ID or manual note — required, not null going forward)
- Drop the public INSERT policy. Add service-role INSERT policy.

### 6. Clean up the 3 known bad rows
Run targeted UPDATEs you approve first:
- Lizz Mejia (×2): `payment_status='unpaid'`, `payment_amount=NULL` — never paid in Stripe
- Yvonne DeLeon: `payment_amount=45` — only reg fee was actually paid; session fee due day 1
- Sarah Danhoff: no change

### 7. Admin dashboard truth-telling (`SwimEnrollmentsAdmin.tsx`)
- Balance math: `expected = (is_first_time ? 0 : session_price) + (is_first_time ? 0 : 0); day1_due = is_first_time ? session_price : 0`
- Per-row badges: `Owes $X` (returning unpaid — should never happen now, flag in red), `Day-1: $240` (first-time)
- "Paid" cards reflect only what Stripe (or explicit manual entry) confirms.
- Show `payment_method` + `payment_reference` columns so you can audit any row in 1 second.

### 8. Update pricing (carry-over)
Migration to set `swim_sessions`: `session_price=240`, `price_per_lesson=30`, `total_lessons=8`. Update memory.

## Files touched

- New migration: schema changes + RLS lockdown + pricing update
- 3 targeted UPDATEs (data cleanup, you approve SQL first)
- `supabase/functions/payments-webhook/index.ts` — actual amount, per-row split
- `supabase/functions/create-checkout/index.ts` — first-time gets reg fee only line item; session fee tracked but not charged
- New: `supabase/functions/admin-create-enrollment/index.ts` — gated to admin role
- `src/components/admin/calendar/AddSwimmerDialog.tsx` — call admin function instead of direct insert
- `src/components/swim-enrollment/EnrollmentForm.tsx` — no DB writes, only checkout
- `src/pages/admin/SwimEnrollmentsAdmin.tsx` — accurate cards + payment_method column
- Memory: pricing update, payment-flow rule

## Not doing

- ❌ No auto-refunds (you handle in Stripe)
- ❌ No charging session fee at checkout for first-timers (your rule: due day 1)
- ❌ No silent data fixes — every UPDATE shown to you first

