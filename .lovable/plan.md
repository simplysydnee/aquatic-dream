## Goal

Add two payment options to the admin "Add Swimmer → Enroll in Session" flow:

1. **Take card over phone** — admin opens an embedded Stripe checkout inline in the dialog, types the parent's card while on the call, charges immediately.
2. **Email payment link** — generalize the existing reg-fee-only link so it auto-sends the right amount: $45 reg fee for first-time swimmers, $240 session fee for returning swimmers.

Both options auto-pick the amount but admin can override with a custom $ value.

No changes to walk-in flow, public enrollment, or existing cash/check/comp/stripe-manual paths.

## UX in `AddSwimmerDialog`

Payment Method dropdown becomes:
- Cash
- Check
- Stripe (manual entry of existing receipt #) — unchanged
- **Stripe — take card over phone (charge now)** — new
- **Stripe — email payment link to parent** — renamed from "send link to parent"
- Comp / Free

When either Stripe option is selected, show a small "Charge" block:
- Auto-detected amount label: "Reg fee $45" (first-time) or "Session fee $240" (returning)
- Optional **Override amount** field (defaults blank = use auto)

### Take card over phone flow

1. Admin fills swimmer/parent fields, picks "take card over phone", clicks **Enroll & Charge Card**.
2. Dialog calls `admin-create-enrollment` with `paymentMethod='stripe_phone'`, `paymentStatus='unpaid'`, `paymentReference='pending_phone_checkout'`. Row is created.
3. Dialog calls new `create-admin-phone-checkout` edge function → returns `clientSecret`.
4. Dialog swaps the form for `<EmbeddedCheckoutProvider>` + `<EmbeddedCheckout>` mounted inline (same dialog body). Admin reads card #, exp, CVC from parent and enters them.
5. On `return_url`, the `payments-webhook` `checkout.session.completed` handler reads `metadata.type='admin_phone_checkout'` + `metadata.enrollmentId` and flips `payment_status='paid'`, stores `payment_intent`. Same pattern as existing reg-fee-link branch.
6. Dialog polls enrollment row for `payment_status='paid'` (or shows success on Stripe's return), then closes.

### Email payment link flow (extended)

1. Admin picks "email payment link", clicks **Enroll & Email Link**.
2. `admin-create-enrollment` creates row as today (`payment_method='stripe_link'`, `payment_status='unpaid'`).
3. Dispatch logic in `admin-create-enrollment`:
   - If `isFirstTime` → invoke existing `send-registration-fee-payment-link` ($45).
   - Else → invoke existing `send-session-payment-link` ($240).
   - If admin entered override amount → pass it through; both edge functions accept an optional `amountOverride` (new param) that uses inline `price_data` instead of the lookup_key price.
4. Webhook flips `payment_status='paid'` on parent completion (already wired for both metadata types; verify session-fee branch also stamps `enrollmentId`).

## Files

**New**
- `supabase/functions/create-admin-phone-checkout/index.ts` — accepts `{ enrollmentId, amountCents, parentEmail, environment, returnUrl }`, creates Stripe Customer with `metadata.parentEmail`, creates Checkout Session `ui_mode='embedded_page'`, `metadata={ type:'admin_phone_checkout', enrollmentId }`. Returns `{ clientSecret }`. Uses shared `createStripeClient`. Add `[functions.create-admin-phone-checkout] verify_jwt = false` to `supabase/config.toml`.
- `src/components/admin/calendar/PhoneCheckoutPanel.tsx` — wraps `EmbeddedCheckoutProvider`/`EmbeddedCheckout`, takes `clientSecret`, fires `onComplete` callback.

**Modified**
- `src/components/admin/calendar/AddSwimmerDialog.tsx` — add `stripe_phone` to `PaymentMethod`, add charge-amount block with override, swap form ↔ phone checkout panel inline, add `Enroll & Charge Card` / `Enroll & Email Link` buttons. Validation: stripe_phone requires email.
- `supabase/functions/admin-create-enrollment/index.ts` — accept `paymentMethod='stripe_phone'` (no auto-invoke; client invokes phone-checkout function after row insert and reads back enrollmentId). For `stripe_link`, branch by `is_first_time` to call session-fee vs reg-fee link function. Pass through optional `linkAmountOverrideCents`.
- `supabase/functions/send-session-payment-link/index.ts` — accept optional `amountOverrideCents`; when present, build session with inline `price_data` instead of looking up `swim_session_fee` price. Stamp `metadata.enrollmentId`.
- `supabase/functions/send-registration-fee-payment-link/index.ts` — accept optional `amountOverrideCents` (same pattern).
- `supabase/functions/payments-webhook/index.ts` — add `case 'admin_phone_checkout'` in the `checkout.session.completed` handler, mirroring the existing `registration_fee` branch (update enrollment row by `metadata.enrollmentId` → `payment_status='paid'`, `payment_reference=payment_intent_id`, `stripe_payment_id=payment_intent_id`).

**No schema changes.** `payment_method` is free-text; existing columns cover the audit fields.

## Out of scope

- Public enrollment flow (untouched).
- Walk-in tab (still cash/check/comp only).
- Existing manual Stripe receipt entry option (unchanged).
- Refunds for phone-checkout sessions (use existing `admin-issue-refund` flow — works because `stripe_payment_id` is stored).

## Risk / breaking-change check

- `admin-create-enrollment`: only adds new branches; default behavior for cash/check/comp/stripe/stripe_link unchanged.
- `payments-webhook`: only adds a new `metadata.type` case; existing `registration_fee` and other branches untouched.
- `send-*-payment-link` functions: `amountOverrideCents` is optional; current callers (no override) keep using lookup_key prices.
- Reg-fee dedup guard in `admin-create-enrollment` continues to apply — phone checkout for a child whose family already paid the reg fee will charge $0 reg fee + session fee.
