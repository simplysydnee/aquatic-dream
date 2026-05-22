## What's actually broken

The Stripe checkout failure is the same gateway-credential issue from earlier, not a new bug in the enrollment UI.

```text
/swim-enrollment  →  create-checkout edge fn  →  Lovable connector gateway
                                              →  401 "Credential not found"
                                              →  no client_secret  →  500
```

The shared Stripe client (`supabase/functions/_shared/stripe.ts`) already has the auto-detect that bypasses the gateway when the configured key is a real Stripe key (`sk_test_...` / `rk_test_...`). It only routes through the gateway when the key looks like a connector key — and that's the path failing.

So either:
1. The deployed `STRIPE_SANDBOX_API_KEY` is still a Lovable-connector key (not a real `sk_test_...`), and the gateway side is broken for that connection (disconnect/reconnect did not fix it), or
2. The most recent `_shared/stripe.ts` change hasn't been redeployed to `create-checkout` and friends, so the bypass isn't running yet.

The "loading times lagging between steps" is most likely the same root cause — when the embedded Stripe iframe can't mount, the checkout step sits spinning while requests fail and retry, which makes the whole flow feel slow.

## Plan

1. **Redeploy** the four functions that import `_shared/stripe.ts` so the direct-key bypass is guaranteed live:
   - `create-checkout`
   - `create-admin-phone-checkout`
   - `create-lesson-occurrence-checkout`
   - `get-stripe-price`

2. **Probe the credential** with a one-shot call to the gateway's `verify_credentials` endpoint inside an edge function. This tells us definitively whether the current `STRIPE_SANDBOX_API_KEY` is a working connector key, a broken connector key, or a real `sk_test_...` key.

3. **Re-test** `create-checkout` directly with a real payload and read the logs. Two outcomes:

   - Gateway returns ok → bypass logic just needed redeployment; checkout works.
   - Gateway still says "Credential not found" → the connector-side credential is bad. In that case the fix is to replace `STRIPE_SANDBOX_API_KEY` (and `STRIPE_LIVE_API_KEY`) with a **real Stripe secret key** from the Stripe dashboard (`sk_test_...` for sandbox, `sk_live_...` for live). The shared client will then call `api.stripe.com` directly and bypass the broken gateway entirely.

4. **Walk the enrollment flow** in preview as a first-time family using test card `4242 4242 4242 4242` and confirm:
   - Each step transitions without long stalls
   - Embedded Stripe form mounts
   - A `swim_enrollments` row is written by the webhook after payment

## Non-changes

- No changes to the React enrollment components — the embedded checkout wiring is already correct.
- No DB / RLS / schema changes.
- Hosted-link functions (`send-registration-fee-payment-link`, `send-session-payment-link`) are out of scope.