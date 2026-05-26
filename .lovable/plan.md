## Problem recap

The "Something went wrong" error inside the Stripe iframe on `/swim-enrollment` step 5 is caused by a **Stripe account mismatch**:

- **Frontend** loads Stripe.js with publishable key `pk_live_51TLCtt2HpbBBx5ls…` (this is the Lovable-connector key, from Stripe account `51TLCtt…`).
- **Backend** (`create-checkout` edge function) creates the Checkout Session using the manually-set `STRIPE_API_KEY` secret, which belongs to a **different Stripe account**.

Stripe.js asks account `51TLCtt…` for a session that only exists in the other account → generic "Something went wrong" rendered inside the iframe.

The new key you just pasted is the same `51TLCtt…` account, so the `.env` files don't need to change. We need to fix the backend instead.

## Fix (recommended): remove the override so backend uses the connector key

The file `supabase/functions/_shared/stripe.ts` was edited at some point to read from a manual `STRIPE_API_KEY` secret instead of the Lovable-connector-managed `STRIPE_LIVE_API_KEY` / `STRIPE_SANDBOX_API_KEY`. Reverting it makes the backend use the same Stripe account as the frontend.

Steps:

1. Restore `supabase/functions/_shared/stripe.ts` to the canonical version that reads `STRIPE_LIVE_API_KEY` (live) and `STRIPE_SANDBOX_API_KEY` (sandbox) from env, routing through the connector gateway. No code in any edge function needs to change — they all call `createStripeClient(env)`.
2. Delete the orphaned `STRIPE_API_KEY` secret so nothing accidentally reads from it later.
3. Add `payment_method_types: ['card']` to the `stripe.checkout.sessions.create({…})` call in `supabase/functions/create-checkout/index.ts` (bonus polish — hides the Stripe Link panel and skips the "Confirm it's you" SMS prompt that some parents were hitting before).

## Verification

After deploy:

1. Open `/swim-enrollment` in an incognito window with a fresh email.
2. Run through to step 5 — the card form should render immediately, no blank box, no "Something went wrong", no Link/SMS prompt.
3. Use Stripe test card `4242 4242 4242 4242` (only works if you flip to sandbox; for a true production check, run a real $45 charge and immediately refund from the Stripe dashboard).
4. Confirm in your Stripe dashboard (account `51TLCtt…`) that the charge shows up there — proving frontend and backend are on the same account.

## Out of scope

- `create-admin-phone-checkout` (staff-typed cards on calendar) — uses the same shared stripe client, so it benefits automatically.
- `send-registration-fee-payment-link` / `send-session-payment-link` — hosted Stripe Checkout links, unrelated to the embedded iframe issue.
- Frontend code in `EnrollmentCheckout.tsx` — no change needed.
