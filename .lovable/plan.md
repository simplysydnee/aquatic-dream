
## Final Plan: Webhook-only enrollment creation

No row in `swim_enrollments` exists until Stripe fires `checkout.session.completed`. Abandonment = no data.

### 1. Audit `$45` registration fee
Search & fix any hardcoded `65` / `$65` in enrollment UI, edge functions, and email templates. DB default is already `45`.

### 2. New `pending_enrollments` staging table
```sql
create table pending_enrollments (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  customer_email text not null,
  created_at timestamptz default now()
);
-- RLS: service role only.
```

### 3. Auto-cleanup via pg_cron (24h)
Enable `pg_cron`, schedule hourly purge:
```sql
select cron.schedule('cleanup-pending-enrollments', '0 * * * *',
  $$ delete from pending_enrollments where created_at < now() - interval '24 hours' $$);
```
Runs regardless of webhook outcome — guarantees no ghost-data accumulation.

### 4. Frontend: `SwimEnrollment.tsx`
- Remove all writes to `swim_enrollments` and `enrollment_agreements` from `handleLegalSubmit`.
- Keep capacity check; verify it filters `status='confirmed'` (pending rows never count).
- Build full payload `{ children, agreement, parent }` and pass via React state to `EnrollmentCheckout`.

### 5. `EnrollmentCheckout.tsx`
- Accept payload prop instead of `enrollmentIds`.
- Pass payload to `create-checkout` edge function.

### 6. Edge function: `create-checkout`
- Accept full payload (no more `enrollmentIds`).
- Re-validate capacity server-side (`status='confirmed'` only).
- Build line items from payload truth: first-time → `registration_fee` ($45); returning → `swim_session_fee` per child.
- **Right before** `stripe.checkout.sessions.create`, insert one row into `pending_enrollments`, capture UUID (minimizes temp-data lifetime).
- Stripe metadata: `{ pendingEnrollmentId: <uuid> }`.

### 7. Edge function: `payments-webhook` → `checkout.session.completed`
- **Idempotency first**: `select id from swim_enrollments where stripe_payment_id = session.id limit 1`. If exists → return 200, do nothing. (Stripe can fire the same event multiple times.)
- Read `pendingEnrollmentId` from metadata, fetch payload from `pending_enrollments`.
- **Atomic multi-swimmer insert**: build the full array of `swim_enrollments` rows + matching `enrollment_agreements` rows. Insert enrollments via single `.insert([...])` call (Postgres treats it atomically — all rows commit or none). On failure: throw, return non-2xx so Stripe retries. Use `session.id` as `stripe_payment_id` for every row in the family.
- On success: send confirmation emails (existing logic), delete the `pending_enrollments` row.

### 8. Existing abandoned rows — leave in place
- Do NOT delete Erwin / Merchant / DeLeon. The bug was ours, not theirs.
- For Erwin: handled manually outside this change — admin will create a one-time Stripe payment link for $90 in the Stripe dashboard and send it to Jessica. No code, no edge function.
- Merchant + DeLeon: leave as-is, admin discretion.

### Files touched
- `supabase/migrations/` — `pending_enrollments` table + RLS + pg_cron schedule.
- `src/pages/SwimEnrollment.tsx` — remove DB writes, pass payload via state.
- `src/components/swim-enrollment/EnrollmentCheckout.tsx` — accept payload prop.
- `supabase/functions/create-checkout/index.ts` — stage payload, build line items from payload.
- `supabase/functions/payments-webhook/index.ts` — idempotency + atomic insert + agreements + cleanup.
- `$65 → $45` audit pass across the codebase.

### Tradeoff acknowledged
Brief race window between checkout-start and payment-complete where no row holds the seat. For 3-seat classes the webhook re-checks; if a class became full in that window, log a warning and still create the row (admin manually resolves) — never lose a customer's payment.

### Out of scope
- Backfill or cleanup of existing data.
- Capacity-hold mechanism during the brief checkout window.
- Auto-emailing abandoned-checkout parents.
