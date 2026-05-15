# Reg Fee Fix + Send Payment Link Flow

Forward-looking only. Sophia's existing rows are untouched (owner already collected her $45 in Stripe directly).

## Guardrails (no breaking changes)

- No schema changes to existing columns. Only **add** new nullable columns.
- No changes to the public `create-checkout` flow — it already correctly charges reg fee once per child.
- No changes to existing webhook branches (`session_fee`, full enrollment). New branch is additive.
- All new admin UI options are **additions** to existing dropdowns; defaults unchanged.
- `payment_status` transitions remain the same; the new flow only adds a **webhook-driven** path to flip a single row from `unpaid` → `paid`.

## 1. Prevent duplicate reg fees in `admin-create-enrollment`

Before insert, query `swim_enrollments` for any prior row matching the same child (`lower(parent_email)` + `lower(trim(child_name))`) with `registration_fee > 0`. If found:
- Force `registration_fee = 0`
- Force `is_first_time = false`
- Append a note: `"Reg fee suppressed — already charged on enrollment {id}"`

Mirrors the dedup the public webhook already does. Non-breaking — only zeros a fee that would have been a duplicate.

## 2. New "Send Stripe registration fee link" admin flow

### a. New payment method option in `AddSwimmerDialog`
Add option **"Stripe — send payment link to parent"** alongside existing Cash/Check/Comp/Walk-in. Selecting it:
- Creates the enrollment row with `payment_method='stripe_link'`, `payment_reference='pending_stripe_link'`, `payment_status='unpaid'`
- Triggers the new edge function below to email the parent

Existing payment methods unchanged.

### b. New edge function `send-registration-fee-payment-link`
- Looks up enrollment, creates a Stripe Checkout Session for $45 via the shared gateway (`createStripeClient`)
- Metadata: `{ type: 'registration_fee', enrollmentId }`
- Sends new transactional email template `registration-fee-payment-link` (clone of `session-payment-link`) with the checkout URL
- Stores `payment_link_sent_at` (new column) on the enrollment row

### c. New "Send Reg Fee Payment Link" button in `PaymentsTab`
Visible only on first-time, unpaid rows. Re-invokes the function above. Shows "Link sent {date}" indicator after send.

## 3. Webhook-driven paid status (the key requirement)

In `payments-webhook/index.ts`, add `handleRegistrationFeePaid()` triggered when `checkout.session.completed` arrives with `metadata.type === 'registration_fee'`:
- Update the matching enrollment: `payment_status='paid'`, `payment_reference={payment_intent_id}` (the `pi_…` Stripe authorization #), `stripe_payment_id={payment_intent_id}`

**`payment_status` flips ONLY when Stripe confirms payment.** Sending the link does not mark anything paid. If the parent never pays, the row stays `unpaid` indefinitely.

## Files touched

**New:**
- `supabase/functions/send-registration-fee-payment-link/index.ts`
- `supabase/functions/_shared/transactional-email-templates/registration-fee-payment-link.tsx`

**Modified (additive only):**
- `supabase/functions/admin-create-enrollment/index.ts` — dedup guard + new `stripe_link` payment method branch
- `supabase/functions/payments-webhook/index.ts` — new `handleRegistrationFeePaid` branch (existing branches untouched)
- `src/components/admin/calendar/AddSwimmerDialog.tsx` — append "Stripe — send link" option
- `src/components/admin/swimmer/tabs/PaymentsTab.tsx` — append "Send Reg Fee Link" button + sent-indicator

**Migration (additive):**
- `ALTER TABLE swim_enrollments ADD COLUMN payment_link_sent_at TIMESTAMPTZ` (nullable, no default — won't affect existing rows or queries)

**Stripe:**
- One-time create `swim_registration_fee` price ($45) via `payments--create_price` if not present.

## Out of scope
- Sophia's existing enrollments (no data fix)
- Public enrollment flow (already correct)
- Existing session-fee payment link flow (untouched)