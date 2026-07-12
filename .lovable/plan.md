
## Goal

Add a one-click "Text pay link" button that SMS's a Stripe payment link (payable in the browser) for a specific enrollment's session fee ($240 or the session's actual price). The existing "Send email" registration/payment link flow stays as-is; this is a new SMS-only path that lives next to it.

## Where the button appears

1. **Row action on `SwimEnrollmentsAdmin`** — new "Text pay link" button next to the existing "Send payment link" (email) action on each enrollment row.
2. **Calendar → session enrollment cards (`SessionEnrollmentCards.tsx`)** — same button on each swimmer card when a session is opened from the calendar/enrollments view.

Both places already have `enrollmentId` and `parent_phone` in scope.

## New edge function: `text-session-payment-link`

Server-side, so we never expose Stripe secrets or SMS creds to the browser. Roughly 60 lines. `verify_jwt = false` in `config.toml` (matches existing payment-link functions).

Steps inside the function:
1. Validate `{ enrollmentId, environment }` from body.
2. Load enrollment (id, `parent_phone`, `parent_first_name`, `child_first_name`, `session_fee_status`, `swim_sessions.session_price`).
3. Reject if `session_fee_status` is `paid` or `comp`, or if `parent_phone` is missing.
4. Reuse `get-or-create-session-payment-link` logic to fetch-or-create the enrollment's Stripe Payment Link (idempotent via `session_fee_payment_link_url` on the row). Extract the pure link-creation into `_shared/session-payment-link.ts` so both functions share it — no duplicate Stripe product/price creation.
5. Compose SMS body:
   `Hi {parentFirst}, here's the secure payment link for {childFirst}'s session fee (${amount}): {link} — Aquatic Dreams. Reply STOP to opt out.`
6. Send via existing `_shared/textmagic.ts` `sendSms` helper (same one `send-sms-message` uses).
7. Log to `reminder_logs` with `reminder_kind = 'session_payment_link_sms'` (channel `sms`, status `sent`/`failed`, TextMagic message id in `provider_message_id`, enrollment id).
8. Return `{ success: true, link, phone }`.

## Frontend wiring

- New tiny component `TextPayLinkButton.tsx` (`{ enrollmentId, parentPhone, disabled }`) — button + confirm toast + `supabase.functions.invoke("text-session-payment-link", ...)`. Handles loading, success ("Texted to (209) …"), and error toasts. Disabled when `!parentPhone` or `session_fee_status` is paid/comp — pass those in as props.
- Mount in:
  - `src/pages/admin/SwimEnrollmentsAdmin.tsx` — next to the existing email "Send payment link" button in each row.
  - `src/components/admin/SessionEnrollmentCards.tsx` — under each swimmer card.

No changes to the existing `SendPaymentLinkDialog` (email flow) or to `send-session-payment-link`.

## Data & guarantees

- The SMS link is the **same** Stripe Payment Link the email flow generates, so paying via SMS runs through the existing `payments-webhook` path (`metadata.type='session_fee'`), which already flips `session_fee_status='paid'` and stamps `session_fee_stripe_id`. No new webhook or reconciliation code needed.
- Idempotent: repeated clicks reuse `session_fee_payment_link_url` on the row instead of creating new Stripe objects.
- Respects the enrollment payment rules (returning grace, comp, already paid) via the pre-flight status check.

## Files touched

New:
- `supabase/functions/text-session-payment-link/index.ts`
- `supabase/functions/_shared/session-payment-link.ts` (extracted shared helper)
- `src/components/admin/TextPayLinkButton.tsx`

Edited:
- `supabase/functions/get-or-create-session-payment-link/index.ts` — switch to the shared helper.
- `supabase/config.toml` — register the new function with `verify_jwt = false`.
- `src/pages/admin/SwimEnrollmentsAdmin.tsx` — mount the button in the row actions.
- `src/components/admin/SessionEnrollmentCards.tsx` — mount the button on each card.

## Out of scope

- No email changes.
- No SMS opt-in/consent screen changes (using existing TextMagic pipeline and STOP language).
- No bulk "text all" action — this is per-enrollment only for now.
