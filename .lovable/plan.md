## Goal

Until Lovable support fixes the broken sandbox connector gateway, route **every** Stripe-touching feature through the manually-added live `STRIPE_API_KEY`, in both preview and the published site. This will get checkout, payment-link emails, refunds, phone checkout, and lesson occurrence checkout fully working — at the cost of real charges on the live Stripe account.

## Changes

### 1. `supabase/functions/_shared/stripe.ts`
- If `STRIPE_API_KEY` is set and starts with `sk_` / `rk_`, **return it for both `sandbox` and `live`** with no env/prefix gating. Single source of truth.
- Keep the existing gateway path only as a fallback for when `STRIPE_API_KEY` is unset.
- For webhook verification, if `PAYMENTS_SANDBOX_WEBHOOK_SECRET` is missing, fall back to `PAYMENTS_LIVE_WEBHOOK_SECRET` (and vice-versa).

### 2. Frontend (`src/lib/stripe.ts`)
- Hard-code `environment = "live"` so edge function calls always request the live key.
- Update `.env.development` so `VITE_PAYMENTS_CLIENT_TOKEN` is the **live publishable key** (`pk_live_…`). A test publishable + live secret combo breaks the embedded form.
- `PaymentTestModeBanner` stays in code; with a live publishable key it simply won't render.

### 3. No code changes needed in the individual edge functions
All of these already use `createStripeClient(env)` and will inherit the fix:
- `create-checkout`, `create-admin-phone-checkout`, `create-lesson-occurrence-checkout`
- `send-registration-fee-payment-link`, `send-session-payment-link`
- `admin-create-enrollment`, `admin-issue-refund`, `cancel-enrollment-refund`
- `create-pending-enrollment`, `get-stripe-price`, `payments-webhook`

### 4. Webhook in Stripe dashboard
Confirm a **live** webhook endpoint exists in Stripe pointing at:
`https://jilrijklnehbfuulykty.supabase.co/functions/v1/payments-webhook?env=live`
using the signing secret stored in `PAYMENTS_LIVE_WEBHOOK_SECRET`. If only a sandbox webhook is configured, I'll flag it after deploy so you can add one.

### 5. Verification
After deploy:
1. `curl` `create-checkout` → expect `clientSecret: cs_live_…`
2. `curl` `create-admin-phone-checkout` and `create-lesson-occurrence-checkout` → same
3. Trigger `send-session-payment-link` → confirm the email contains a live Stripe URL
4. Optional: run a real small charge in preview and confirm the webhook flips the enrollment to `paid`

## Risk

- **Every preview payment is a real charge** on the live Stripe account.
- The orange "test mode" banner disappears.
- Easy to revert later once Lovable fixes the sandbox gateway: change `src/lib/stripe.ts` back to deriving env from the publishable key, restore `.env.development` to `pk_test_…`, and remove the `STRIPE_API_KEY` override in `_shared/stripe.ts`.