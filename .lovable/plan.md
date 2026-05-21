
## What's broken

When Olive's owner clicked "Send Reg Fee + Waiver Email" from the admin panel, parents received the email — they could sign the waiver, but **the "Pay Registration Fee" button and the Stripe link line were completely missing** from the email body.

## Root cause (confirmed from data, not guessed)

I pulled the actual HTML of the last three sent emails (Stamy, Ghuman x2) from `email_send_log`. Each rendered:

```
STEP 2 of 2 — Pay $45.00 registration fee
One-time charge per family — you won't be charged it again for future sessions.
```

…and then **nothing** — no button, no "Payment link:" line.

The template only renders the button/link when `paymentLink` is truthy:

```tsx
{paymentLink && (<Button href={paymentLink}>Pay Registration Fee…</Button>)}
```

So `paymentLink` was falsy when the email rendered. `paymentLink` is set from:

```ts
const paymentLink = checkoutSession.url   // returned from stripe.checkout.sessions.create
```

Stripe's Checkout Sessions API returns `url` only when the session is created in the default **hosted** UI mode. With newer pinned API versions (the project's `_shared/stripe.ts` does not pin `apiVersion`, so it follows the account default — currently the `2026-03-25.dahlia` family), `session.url` is no longer guaranteed unless `ui_mode: 'hosted'` is set explicitly. That is exactly what's happening: `checkout.sessions.create({...})` succeeds, but `url` comes back `null`, the function still fires the email, and parents get a button-less email.

This is **not** a Stripe credentials/key problem (live charges through other flows still work, and the function reached the point of issuing the session). It's a missing `ui_mode` parameter in two edge functions.

## Fix

### 1. `supabase/functions/send-registration-fee-payment-link/index.ts`
Add `ui_mode: 'hosted'` to the `checkout.sessions.create({ ... })` call so Stripe returns the redirect URL.

### 2. `supabase/functions/send-session-payment-link/index.ts`
Same change — `ui_mode: 'hosted'`. This function has the identical bug; it just hasn't bitten yet because most returning families pay through the embedded enrollment flow.

### 3. Hard guard before sending the email (defense in depth)

In both functions, right after creating the session:

```ts
if (!checkoutSession.url) {
  return json({ error: 'Stripe did not return a checkout URL' }, 500)
}
```

This guarantees that if Stripe ever changes behavior again, the admin gets an explicit error in the toast instead of parents receiving a half-broken email — and `reg_fee_link_sent_at` does not get stamped on a failed send.

### 4. Pin the Stripe API version in `_shared/stripe.ts`

Add `apiVersion: '2026-03-25.dahlia'` (or whichever is current) to `new Stripe(...)` so behavior is deterministic across the three checkout-creating functions (`create-checkout`, `send-registration-fee-payment-link`, `send-session-payment-link`, `create-admin-phone-checkout`, `create-lesson-occurrence-checkout`). This prevents the same class of silent-default-change from biting again.

## Out of scope (intentionally)

- No DB schema change.
- No template changes — the template is correct; it just needs a real URL.
- No new admin UI — the existing "Send Reg Fee + Waiver Email" button stays as-is.

## Verification after deploy

1. Re-trigger "Send Reg Fee + Waiver Email" for a test enrollment.
2. Check `email_send_log.metadata.html` for the new send — confirm it contains `https://checkout.stripe.com/c/pay/...`.
3. Click the link and confirm the hosted Stripe Checkout page loads.
4. Repeat for "Send Session Fee Payment Link" on a returning-family enrollment.
