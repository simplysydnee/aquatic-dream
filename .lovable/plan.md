
## Goal
Send a Session 1 welcome email to enrolled families, where the "Complete Tuition Payment" CTA links to a Stripe Payment Link unique to that enrollment. Reuse the link if one already exists. On successful payment, the existing webhook flips `session_fee_status` to `paid`.

Scope is strictly **Session 1** — the admin send UI and the underlying edge function both filter by Session 1 enrollments.

## What's already in place (reused, not rebuilt)
- `swim_enrollments.session_fee_status` (`due_day_1` / `paid` / `comp`) and `session_fee_paid_at`.
- `payments-webhook` already handles `metadata.type === "session_fee"` and marks the enrollment paid.
- `send-transactional-email` edge function + template registry pattern.
- `_shared/stripe.ts` `createStripeClient(env)`.

## Changes

### 1. Migration — store the reusable link on the enrollment
Add two nullable columns to `public.swim_enrollments`:
- `session_fee_payment_link_id text` — Stripe Payment Link id (e.g. `plink_...`)
- `session_fee_payment_link_url text` — the hosted URL the email button points to

These let us reuse the link instead of creating a duplicate on every send.

### 2. New edge function `get-or-create-session-payment-link`
Input: `{ enrollmentId }`. Behavior:
- Load enrollment + joined session.
- If `session_fee_status` is `paid` or `comp`, return an error (no link needed).
- If `session_fee_payment_link_url` is already set, return it (reuse).
- Otherwise call `stripe.paymentLinks.create({...})` with:
  - `line_items`: existing `swim_session_fee` Stripe price (lookup_key), qty 1.
  - `metadata: { enrollmentId, type: 'session_fee' }` (so the webhook routes correctly).
  - `after_completion`: redirect to `https://aquaticdreamsswim.com/swim-enrollment?step=done`.
- Persist `session_fee_payment_link_id` + `session_fee_payment_link_url` on the enrollment, then return the URL.

Note: Stripe Payment Links don't support `customer_email` pre-fill (that's a Checkout Sessions feature). The customer enters their email at the link — that's the documented trade-off for a reusable, never-expiring URL. The metadata + webhook still tie the payment back to the right enrollment.

### 3. New email template `session-welcome.tsx`
React Email port of the HTML you pasted, wired into `registry.ts` as `session-welcome`. Props:
`familyName`, `swimmerName`, `className`, `classDays`, `classTime`, `sessionDates`, `totalClasses`, `paymentLink`, `paymentCtaLabel` (e.g. "Complete Tuition Payment — $240"), `unsubscribeUrl` (auto-appended by infra footer).

The CTA button's `href` is the Stripe Payment Link returned by step 2.

### 4. New edge function `send-session-welcome-email`
Input: `{ enrollmentId }` OR `{ sessionId, dryRun? }` (batch path for "send to all Session 1 families").
For each Session 1 enrollment with `status IN ('confirmed','enrolled','pending_payment')`:
1. Call `get-or-create-session-payment-link` (skip if `session_fee_status='paid'` — those families still get the welcome but with no CTA / a "Paid" badge instead).
2. Invoke `send-transactional-email` with `templateName: 'session-welcome'`, idempotency key `session-welcome-${enrollmentId}`.
3. Log result.

**Session 1 guard:** the batch path looks up the Session 1 swim_session id (we'll ask you to pick it in the admin UI rather than hardcoding) and only iterates enrollments where `session_id` matches.

### 5. Admin trigger UI (minimal)
On `SwimEnrollmentsAdmin`, add:
- A per-row "Send welcome + payment link" button (uses single-enrollment path).
- A "Send Session 1 welcome batch" button on the Session 1 tab/section that confirms count first and then calls the batch path.

No changes to existing public enrollment flow, webhook, or other email templates.

## Files
- `supabase/migrations/<ts>_swim_enrollments_payment_link.sql` — add 2 columns
- `supabase/functions/get-or-create-session-payment-link/index.ts` — new
- `supabase/functions/send-session-welcome-email/index.ts` — new
- `supabase/functions/_shared/transactional-email-templates/session-welcome.tsx` — new
- `supabase/functions/_shared/transactional-email-templates/registry.ts` — register template
- `src/pages/admin/SwimEnrollmentsAdmin.tsx` — add the two send buttons

## Out of scope
- Other sessions (2, 3, …). Same machinery will work later by changing the session filter, but we won't wire UI for them now.
- Marketing/bulk re-engagement emails.
- Replacing the existing `session-payment-link` email (kept as the reminder template).
