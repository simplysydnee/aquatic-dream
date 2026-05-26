## Issue

The preview is still showing the "Reserve seat — email me the payment link" screen because `.env.development` (which Vite uses in preview/dev) still has `VITE_CHECKOUT_FALLBACK=1`. I only updated `.env.production` last turn.

## Change

Set `VITE_CHECKOUT_FALLBACK=0` in `.env.development` so the embedded Stripe checkout form mounts in the preview again. (`.env.production` already updated.)

After that, test a booking in preview — it should render the Stripe card form. If the gateway still returns "Credential not found" we'll know the rotation didn't fully resolve it and we'll need to look at the connector reconnection.
