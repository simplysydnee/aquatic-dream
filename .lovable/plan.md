## What is actually broken

The issue changed after the last deploy:

- The browser calls `create-checkout` successfully, but the edge function returns 500.
- The deployed function log says Stripe did not return a checkout `client_secret` because the response was:

```text
{"type":"unauthorized","message":"Credential not found","props":{"source":"connectors_gateway"}}
```

That means `STRIPE_LIVE_API_KEY` is not usable in this project right now because the Lovable connector gateway cannot find the linked credential. So yes: this is likely why `STRIPE_API_KEY` was added before.

Since you confirmed `STRIPE_API_KEY` was copied from the same Stripe dashboard/account as the `pk_live_51TLCtt…` publishable key, using it directly is the correct fix for production checkout.

## Plan

1. Restore `supabase/functions/_shared/stripe.ts` so live mode prefers a validated direct `STRIPE_API_KEY` when it starts with `sk_live_` or `rk_live_`.
2. Keep sandbox mode on the Lovable gateway unless there is a test direct key; the enrollment flow is currently forcing `live`, so production checkout will use `STRIPE_API_KEY`.
3. Keep `payment_method_types: ["card"]` in `create-checkout` to remove Link/SMS from the embedded checkout.
4. Improve the error handling in `create-checkout` so if Stripe/gateway returns an error-shaped object again, we return that real message instead of the misleading “Stripe did not return a client_secret”.
5. Deploy `create-checkout` and test the function call again.

## Expected result

`/swim-enrollment` step 5 should get a real embedded Checkout `clientSecret`, so the card form can render instead of showing the generic iframe error.