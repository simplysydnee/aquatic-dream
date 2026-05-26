## Two issues on the swimmer detail → Payments tab

### 1. Button label says "reg fee + waiver" even when the waiver is already signed

In `src/components/admin/swimmer/tabs/PaymentsTab.tsx` (line 320), the registration-fee row hardcodes the send label to `"Email reg fee + waiver"` / `"Resend reg fee + waiver email"`. The email template already conditionally hides the waiver section when `waiverSigned: true`, so the button copy is misleading.

**Fix:** Use `e.waiver_signed_at` to pick the label:
- waiver signed → `"Email payment link"` / `"Resend payment link"`
- waiver not signed → keep `"Email reg fee + waiver"` / `"Resend reg fee + waiver email"`

No other behavior changes — same edge function call.

### 2. Email goes out without a payment link

`supabase/functions/send-registration-fee-payment-link/index.ts` wraps the Stripe checkout creation in a `try/catch` that **swallows** the error, then sends the email anyway with `paymentLink: undefined`. The template falls back to the "Your secure payment link will arrive in a follow-up email shortly. Your seat is reserved." block — which is wrong here because this is an admin-initiated resend (the seat is already reserved and no follow-up is coming).

The Stripe failure is almost certainly the live-key swap from the earlier session (gateway returns nothing, or the manual `STRIPE_API_KEY` isn't reaching this function).

**Fix (two parts):**

a. **Stop sending broken emails.** If Stripe checkout creation fails or returns no URL, do **not** queue the email. Return a 502 with the Stripe error message so the admin sees a toast and can retry. Same change in `send-session-payment-link/index.ts` for consistency (it has the identical silent-fallback bug).

b. **Surface the real Stripe error in the function response** (currently only `console.error`) so logs + the admin toast point at the actual cause (missing key, bad key, gateway 500, etc.). Once we see the message, we know whether it's a missing-secret config issue or something else.

The fallback "no link, reassuring copy" path in the email template stays — it's still used by `create-pending-enrollment` during public self-serve enrollment (where the seat genuinely *is* reserved and a follow-up *is* coming from admin). We just stop hitting it from the admin resend buttons.

### Files touched

- `src/components/admin/swimmer/tabs/PaymentsTab.tsx` — conditional `sendLabel`
- `supabase/functions/send-registration-fee-payment-link/index.ts` — fail-fast on Stripe error
- `supabase/functions/send-session-payment-link/index.ts` — same fail-fast treatment

### Verification

After implementing:
1. On a swimmer whose waiver is signed, the reg-fee row button reads "Email payment link".
2. Click it. If Stripe is healthy → email arrives with a working `cs_live_...` button. If Stripe is broken → no email is sent and the admin sees a toast with the Stripe error message (which tells us what to fix next on the key/connector side).
