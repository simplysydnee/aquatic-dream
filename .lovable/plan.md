## Goal
Make the session-fee payment link always reflect the enrollment's `session_price` from our DB ($240), instead of depending on a Stripe lookup_key that may resolve to a stale/wrong-environment price.

## Root cause
`get-or-create-session-payment-link` resolves the price via `stripe.prices.list({ lookup_keys: ['swim_session_fee_240'] })`. The new $240 price was created in Stripe **test** mode only (the `create_product` tool syncs to live only on publish). When called with `environment: 'live'`, Stripe returned a different/old price object → the link shows $280.

## Fix
Stop using a hard-coded lookup_key. Instead, on each call where no link is cached yet:

1. Read the enrollment's `swim_sessions.session_price` (already selected in the query).
2. Find-or-create a Stripe **Product** named "Swim Session Fee" (cached by lookup via `lookup_key` on a one-time price, or by storing the product id in a small `app_settings` row keyed by env).
3. Call `stripe.prices.create({ unit_amount: session_price * 100, currency: 'usd', product, tax_behavior: 'inclusive' })` to mint a one-shot price for this enrollment.
4. Create the Payment Link with that price id (existing logic).
5. Cache the link URL/id on the enrollment as today.

This guarantees the amount = `session_price` from our DB, regardless of which Stripe env or what lookup_keys exist.

## Cleanup of the broken test link
- Clear `session_fee_payment_link_id` / `session_fee_payment_link_url` on enrollment `efd9d55c-5b35-48d2-b595-e71dcebe6b0c` so the next call regenerates with the correct $240 amount.
- Optionally deactivate the wrong Payment Link in Stripe (not required — we just stop referencing it).

## Verification
- Re-invoke `get-or-create-session-payment-link` for the test enrollment in both `sandbox` and `live`.
- Open the returned URL and confirm Stripe checkout shows **$240.00**.
- Spot-check a second Session 1 enrollment to confirm the same behavior.

## Files touched
- `supabase/functions/get-or-create-session-payment-link/index.ts` — replace lookup_key path with dynamic product/price creation from `session_price`.
- One-row DB update to clear the stale cached link on the test enrollment.

## Out of scope
- No schema changes.
- No UI changes.
- No changes to the welcome email send flow.
